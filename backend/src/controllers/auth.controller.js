'use strict';
const argon2 = require('argon2');
const env = require('../config/env');
const { pool, withContext } = require('../config/database');
const tokens = require('../services/token.service');
const otp = require('../services/otp.service');
const alertes = require('../services/alertes.service');
const { userPublic } = require('../utils/format');
const { chiffrerJson } = require('../utils/crypto');
const { badRequest, unauthorized, forbidden, conflict, notFound, HttpError } = require('../utils/errors');

const hashOptions = () => ({ type: argon2.argon2id, ...env.argon2 });
const hashPassword = (pwd) => argon2.hash(pwd, hashOptions());

const MAX_ECHECS = 5;
const VERROU_MIN = 30;

/** Retrouve un utilisateur par e-mail OU téléphone */
async function findByIdentifier(identifier) {
  const { rows } = await pool.query(
    `SELECT * FROM users
     WHERE (lower(email) = lower($1) OR telephone = $1) AND is_active = true
     LIMIT 1`,
    [identifier.trim()],
  );
  return rows[0] || null;
}

/**
 * Construit la session : rôle effectif + structure active.
 * Parent → PARENT. Professionnel → son rôle dans la structure choisie.
 */
async function buildSession(user, structureIdVoulue) {
  if (user.role_global === 'SUPER_ADMIN') {
    return { id: user.id, role: 'SUPER_ADMIN', structure_id: null, structure_nom: null, structures: [] };
  }
  if (user.role_global === 'PARENT') {
    // Structures qui suivent au moins un enfant du parent (sélecteur de structure)
    const structures = await withContext({ id: user.id, role: 'PARENT' }, async (db) => (await db.query(
      `SELECT DISTINCT s.structure_id, st.nom AS structure_nom, 'PARENT' AS role
       FROM suivis s JOIN structures st ON st.id = s.structure_id
       WHERE s.statut IN ('DEMANDE', 'ACTIF')`,
    )).rows);
    return { id: user.id, role: 'PARENT', structure_id: null, structure_nom: null, structures };
  }
  const { rows } = await pool.query(
    `SELECT m.structure_id, m.role, m.specialite, s.nom AS structure_nom
     FROM membres_structure m JOIN structures s ON s.id = m.structure_id
     WHERE m.user_id = $1 AND m.statut = 'ACTIF' AND s.actif = true
     ORDER BY m.date_affectation ASC`,
    [user.id],
  );
  if (!rows.length) {
    const { rowCount } = await pool.query(
      "SELECT 1 FROM membres_structure WHERE user_id = $1 AND statut = 'EN_ATTENTE'", [user.id]);
    if (rowCount) {
      throw forbidden('Votre inscription est en attente de validation par la structure', 'PENDING_VALIDATION');
    }
    throw forbidden('Aucune structure active associée à ce compte', 'NO_STRUCTURE');
  }
  const choisie = structureIdVoulue ? rows.find((r) => r.structure_id === structureIdVoulue) : rows[0];
  if (!choisie) throw forbidden('Vous n’êtes pas membre de cette structure', 'NOT_A_MEMBER');
  return {
    id: user.id,
    role: choisie.role,
    structure_id: choisie.structure_id,
    structure_nom: choisie.structure_nom,
    specialite: choisie.specialite,
    structures: rows,
  };
}

async function sessionResponse(user, session) {
  await pool.query('UPDATE users SET derniere_connexion = NOW() WHERE id = $1', [user.id]);
  const t = await tokens.issueTokens(session);
  return {
    ...t,
    user: {
      ...userPublic(user),
      role: session.role,
      structure_id: session.structure_id,
      structure_nom: session.structure_nom,
      structure: session.structure_id ? (await pool.query(
        'SELECT code, sigle, nom, logo_url, couleur FROM structures WHERE id = $1', [session.structure_id])).rows[0] || null : null,
      specialite: session.specialite || null,
      structures: session.structures.map((s) => ({
        structure_id: s.structure_id, structure_nom: s.structure_nom, role: s.role,
      })),
    },
  };
}

// ── POST /api/auth/register  (parents) ─────────────────────────────────────
async function register(req, res) {
  const b = req.body;
  if (!b.consentements?.cgu || !b.consentements?.donnees_sante) {
    throw new HttpError(422, 'CONSENT_REQUIRED',
      'Vous devez accepter les conditions d’utilisation et le traitement des données de santé');
  }
  const password_hash = await hashPassword(b.password);

  const user = await withContext(null, async (db) => {
    let u;
    try {
      const { rows } = await db.query(
        `INSERT INTO users (role_global, nom, prenom, email, telephone, password_hash, langue, region,
                            profil_besoins_chiffre, capacite_paiement, famille_vulnerable)
         VALUES ('PARENT', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [b.nom, b.prenom, b.email || null, b.telephone || null, password_hash, b.langue, b.region || null,
          b.profil_besoins ? chiffrerJson(b.profil_besoins) : null,
          b.capacite_paiement ?? null, Boolean(b.famille_vulnerable)],
      );
      u = rows[0];
    } catch (err) {
      if (err.code === '23505') throw conflict('Un compte existe déjà avec ce téléphone ou cet e-mail', 'ACCOUNT_EXISTS');
      throw err;
    }
    // Contexte RLS = le nouvel utilisateur, pour enregistrer SES consentements
    await db.query("SELECT set_config('app.user_id', $1, true), set_config('app.role', 'PARENT', true)", [u.id]);
    const types = [
      ['CGU', true],
      ['DONNEES_SANTE', true],
      ['IA_ANALYSE', Boolean(b.consentements.ia_analyse)],
    ];
    for (const [type, accepte] of types) {
      await db.query(
        'INSERT INTO consentements (parent_id, type, accepte, ip) VALUES ($1, $2, $3, $4)',
        [u.id, type, accepte, req.ip],
      );
    }
    return u;
  });

  const envoi = await otp.envoyerCode('verification', user, b.canal_verification);
  res.status(201).json({
    message: 'Compte créé. Entrez le code reçu pour l’activer.',
    user_id: user.id,
    verification: envoi,
  });
}

// ── POST /api/auth/register-professionnel  (médecin / thérapeute, site vitrine)
// Le compte est créé « EN_ATTENTE » : l'admin de la structure doit le valider.
async function registerProfessionnel(req, res) {
  const b = req.body;
  const { rows: st } = await pool.query(
    'SELECT id, nom, partenaire FROM structures WHERE id = $1 AND actif = true', [b.structure_id]);
  if (!st[0]) throw badRequest('Structure introuvable', 'STRUCTURE_NOT_FOUND');
  if (!st[0].partenaire) {
    throw badRequest('Cette structure n’utilise pas encore SAMA XHEL. Contactez-nous pour l’ajouter.', 'STRUCTURE_NOT_PARTNER');
  }
  const password_hash = await hashPassword(b.password);
  const user = await withContext(null, async (db) => {
    try {
      const { rows } = await db.query(
        `INSERT INTO users (role_global, nom, prenom, email, telephone, password_hash, langue, region,
                            numero_ordre, mode_exercice, langues_parlees, teleconsultation, mfa_enabled)
         VALUES ('PROFESSIONNEL', $1, $2, $3, $4, $5, 'fr', $6, $7, $8, $9, $10, true) RETURNING *`,
        [b.nom, b.prenom, b.email, b.telephone, password_hash, b.region || null,
          b.numero_ordre, b.mode_exercice, b.langues_parlees, b.teleconsultation],
      );
      await db.query(
        `INSERT INTO membres_structure (user_id, structure_id, role, specialite, statut)
         VALUES ($1, $2, $3, $4, 'EN_ATTENTE')`,
        [rows[0].id, b.structure_id, b.role, b.specialite],
      );
      return rows[0];
    } catch (err) {
      if (err.code === '23505') throw conflict('Un compte existe déjà avec ce téléphone ou cet e-mail', 'ACCOUNT_EXISTS');
      throw err;
    }
  });
  const envoi = await otp.envoyerCode('verification', user, 'email');
  // eslint-disable-next-line global-require
  const { creerJetonDepot, PIECES_OBLIGATOIRES } = require('./candidatures.controller');
  res.status(201).json({
    message: `Inscription reçue. Déposez vos pièces justificatives, activez votre compte avec le code reçu, `
      + `puis « ${st[0].nom} » étudiera votre dossier et vous convoquera pour un entretien.`,
    user_id: user.id,
    verification: envoi,
    jeton_depot: await creerJetonDepot(user.id),
    pieces_obligatoires: PIECES_OBLIGATOIRES[b.role],
  });
}

// ── POST /api/auth/verify  { identifier, code } ────────────────────────────
async function verifyAccount(req, res) {
  const user = await findByIdentifier(req.body.identifier);
  if (!user) throw badRequest('Code incorrect ou expiré', 'INVALID_CODE');
  if (user.verifie) throw badRequest('Ce compte est déjà activé', 'ALREADY_VERIFIED');
  const r = await otp.verifierCode('verification', user.id, req.body.code);
  if (!r.ok) throw badRequest(r.raison === 'INVALID_CODE' ? 'Code incorrect' : 'Code expiré, demandez-en un nouveau', r.raison);

  await pool.query('UPDATE users SET verifie = true WHERE id = $1', [user.id]);
  user.verifie = true;
  if (user.role_global === 'PROFESSIONNEL') {
    const { rowCount } = await pool.query(
      "SELECT 1 FROM membres_structure WHERE user_id = $1 AND statut = 'ACTIF'", [user.id]);
    if (!rowCount) {
      return res.json({ message: 'Compte activé. Vous pourrez vous connecter dès que la structure aura validé votre inscription.', en_attente: true });
    }
  }
  const session = await buildSession(user);
  res.json(await sessionResponse(user, session));
}

// ── POST /api/auth/resend-code  { identifier, purpose } ────────────────────
async function resendCode(req, res) {
  const { identifier, purpose, canal } = req.body;
  const user = await findByIdentifier(identifier);
  // Réponse identique que le compte existe ou non (pas d'énumération de comptes)
  const generique = { message: 'Si ce compte existe, un code vient d’être envoyé.' };
  if (!user) return res.json(generique);
  if (purpose === 'verification' && user.verifie) return res.json(generique);
  const envoi = await otp.envoyerCode(purpose, user, canal);
  return res.json({ ...generique, verification: envoi });
}

// ── POST /api/auth/candidature/statut  (site : « Suivre mon dossier ») ───────
// Un soignant pas encore validé n'a pas de session : il voit seulement l'avancement de son dossier.
async function statutCandidature(req, res) {
  const { identifier, password } = req.body;
  const user = await findByIdentifier(identifier);
  const erreur = unauthorized('Identifiant ou mot de passe incorrect', 'INVALID_CREDENTIALS');
  if (!user || !(await argon2.verify(user.password_hash, password).catch(() => false))) throw erreur;
  const { rows: candidatures } = await pool.query(
    `SELECT s.nom AS structure, s.code, m.role, m.specialite, m.statut, m.convocation_date, m.convocation_lieu,
            m.decision_motif, m.date_affectation
       FROM membres_structure m JOIN structures s ON s.id = m.structure_id
      WHERE m.user_id = $1 ORDER BY m.date_affectation`, [user.id]);
  const { rows: pieces } = await pool.query(
    'SELECT type, nom_fichier, statut, created_at FROM pieces_justificatives WHERE user_id = $1 ORDER BY created_at', [user.id]);
  const ETAPES = { EN_ATTENTE: 2, CONVOQUE: 3, ACTIF: 4, REFUSE: 4, SUSPENDU: 4 };
  res.json({
    compte: { prenom: user.prenom, nom: user.nom, email: user.email, telephone: user.telephone, verifie: user.verifie },
    candidatures: candidatures.map((c) => ({ ...c, etape: ETAPES[c.statut] || 1 })),
    pieces,
    etapes: ['Compte créé', 'Pièces vérifiées par l’établissement', 'Entretien avec les originaux', 'Décision'],
  });
}

// ── POST /api/auth/login ───────────────────────────────────────────────────
async function login(req, res) {
  const { identifier, password, portail } = req.body;
  let { structure_id } = req.body;
  // Connexion par le PORTAIL d'un établissement : le compte doit appartenir à CET établissement
  if (portail) {
    const { rows: [st] } = await pool.query("SELECT id FROM structures WHERE code = $1 AND actif AND statut_adhesion = 'PARTENAIRE'", [portail]);
    if (!st) throw notFound('Établissement introuvable', 'PORTAIL_INCONNU');
    structure_id = st.id;
  }
  const user = await findByIdentifier(identifier);
  const erreur = unauthorized('Identifiant ou mot de passe incorrect', 'INVALID_CREDENTIALS');

  if (!user) {
    // Temps de réponse constant : on vérifie quand même un hash factice
    await argon2.verify('$argon2id$v=19$m=19456,t=2,p=1$c2FtYXhoZWxzYWx0$4bTRz7j0B7Y3JmQ5yAq3bRj3o0dXWqvC4Jb0m5P2XGc', password).catch(() => {});
    throw erreur;
  }
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw new HttpError(423, 'ACCOUNT_LOCKED',
      `Compte verrouillé après ${MAX_ECHECS} essais. Réessayez dans ${VERROU_MIN} minutes ou réinitialisez votre mot de passe.`);
  }

  const ok = await argon2.verify(user.password_hash, password);
  if (!ok) {
    const n = user.login_attempts + 1;
    await pool.query(
      'UPDATE users SET login_attempts = $1, locked_until = $2 WHERE id = $3',
      [n >= MAX_ECHECS ? 0 : n, n >= MAX_ECHECS ? new Date(Date.now() + VERROU_MIN * 60000) : null, user.id],
    );
    // Force brute probable : la supervision est prévenue tout de suite (WebSocket + Telegram d'astreinte)
    if (n >= MAX_ECHECS) {
      const { rows: [m] } = await pool.query(
        "SELECT structure_id FROM membres_structure WHERE user_id = $1 AND statut = 'ACTIF' ORDER BY ($2::uuid IS NOT NULL AND structure_id = $2) DESC LIMIT 1",
        [user.id, structure_id || null]);
      alertes.lever({ type: 'COMPTE_VERROUILLE', userId: user.id, structureId: m?.structure_id || null, score: MAX_ECHECS,
        details: { essais: MAX_ECHECS, verrou_minutes: VERROU_MIN, ip: req.ip } }).catch((e) => console.error('[Alertes]', e.message));
    }
    throw erreur;
  }
  await pool.query('UPDATE users SET login_attempts = 0, locked_until = NULL WHERE id = $1', [user.id]);

  if (!user.verifie) {
    const envoi = await otp.envoyerCode('verification', user);
    throw new HttpError(403, 'ACCOUNT_NOT_VERIFIED', 'Compte non activé. Un nouveau code vient d’être envoyé.', envoi);
  }

  // Chaque hôpital est une « maison » séparée : le PERSONNEL se connecte par le portail de
  // SON établissement. Sans portail, on lui indique où se connecter (mot de passe déjà vérifié,
  // donc aucune information n'est révélée à un inconnu).
  if (user.role_global === 'PROFESSIONNEL' && !structure_id) {
    const { rows: portails } = await pool.query(
      `SELECT s.code, COALESCE(s.sigle, s.nom) AS nom, s.logo_url, s.couleur FROM membres_structure m
         JOIN structures s ON s.id = m.structure_id
        WHERE m.user_id = $1 AND m.statut = 'ACTIF' AND s.actif AND s.code IS NOT NULL ORDER BY m.date_affectation`, [user.id]);
    if (portails.length) {
      throw new HttpError(409, 'PORTAIL_REQUIS', 'Connectez-vous depuis le portail de votre établissement.', { portails });
    }
  }
  const session = await buildSession(user, structure_id);

  if (user.mfa_enabled) {
    const envoi = await otp.envoyerCode('mfa', user);
    return res.json({
      mfa_required: true,
      mfa_token: tokens.signMfa(session),
      verification: envoi,
      message: 'Entrez le code de sécurité reçu.',
    });
  }
  const reponse = await sessionResponse(user, session);
  if (portail && user.role_global === 'PARENT') {
    const { rows: [ins] } = await pool.query(
      'SELECT i.statut FROM inscriptions i WHERE i.parent_id = $1 AND i.structure_id = $2', [user.id, structure_id]);
    reponse.portail = { code: portail, inscription: ins?.statut || null };
  }
  return res.json(reponse);
}

// ── POST /api/auth/mfa/verify  { mfa_token, code } ─────────────────────────
async function verifyMfa(req, res) {
  let decoded;
  try {
    decoded = tokens.verifyMfa(req.body.mfa_token);
  } catch {
    throw unauthorized('Session de vérification expirée, reconnectez-vous', 'MFA_EXPIRED');
  }
  const r = await otp.verifierCode('mfa', decoded.sub, req.body.code);
  if (!r.ok) throw badRequest(r.raison === 'INVALID_CODE' ? 'Code incorrect' : 'Code expiré, reconnectez-vous', r.raison);
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1 AND is_active = true', [decoded.sub]);
  if (!rows[0]) throw unauthorized();
  const session = await buildSession(rows[0], decoded.structure_id);
  res.json(await sessionResponse(rows[0], session));
}

// ── POST /api/auth/refresh  { refresh_token } ──────────────────────────────
async function refresh(req, res) {
  const data = await tokens.consumeRefresh(req.body.refresh_token);
  if (!data) throw unauthorized('Session expirée, reconnectez-vous', 'INVALID_REFRESH');
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1 AND is_active = true', [data.user_id]);
  if (!rows[0]) throw unauthorized('Compte désactivé', 'ACCOUNT_DISABLED');
  // Le rôle est relu en base : un retrait de droits prend effet immédiatement
  const session = await buildSession(rows[0], data.structure_id);
  res.json(await sessionResponse(rows[0], session));
}

// ── POST /api/auth/logout ──────────────────────────────────────────────────
async function logout(req, res) {
  await tokens.blacklistAccess({ jti: req.user.jti, exp: req.user.exp });
  await tokens.revokeRefresh(req.body?.refresh_token);
  res.json({ message: 'Déconnexion réussie' });
}

// ── GET /api/auth/me ───────────────────────────────────────────────────────
async function me(req, res) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  if (!rows[0]) throw unauthorized();
  const session = await buildSession(rows[0], req.user.structure_id);
  res.json({
    user: {
      ...userPublic(rows[0]),
      role: session.role,
      structure_id: session.structure_id,
      structure_nom: session.structure_nom,
      structure: session.structure_id ? (await pool.query(
        'SELECT code, sigle, nom, logo_url, couleur FROM structures WHERE id = $1', [session.structure_id])).rows[0] || null : null,
      specialite: session.specialite || null,
      structures: session.structures.map((s) => ({
        structure_id: s.structure_id, structure_nom: s.structure_nom, role: s.role,
      })),
    },
  });
}

// ── POST /api/auth/switch-structure  { structure_id } ──────────────────────
async function switchStructure(req, res) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  const session = await buildSession(rows[0], req.body.structure_id);
  await tokens.blacklistAccess({ jti: req.user.jti, exp: req.user.exp });
  res.json(await sessionResponse(rows[0], session));
}

// ── POST /api/auth/password/reset  { identifier, code, nouveau_mot_de_passe }
async function resetPassword(req, res) {
  const user = await findByIdentifier(req.body.identifier);
  if (!user) throw badRequest('Code incorrect ou expiré', 'INVALID_CODE');
  const r = await otp.verifierCode('reset', user.id, req.body.code);
  if (!r.ok) throw badRequest('Code incorrect ou expiré', r.raison);
  await pool.query(
    'UPDATE users SET password_hash = $1, login_attempts = 0, locked_until = NULL, verifie = true WHERE id = $2',
    [await hashPassword(req.body.nouveau_mot_de_passe), user.id],
  );
  res.json({ message: 'Mot de passe modifié. Vous pouvez vous connecter.' });
}

// ── PUT /api/auth/password  { ancien, nouveau }  (connecté) ────────────────
async function changePassword(req, res) {
  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!(await argon2.verify(rows[0].password_hash, req.body.ancien))) {
    throw badRequest('Ancien mot de passe incorrect', 'INVALID_PASSWORD');
  }
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2',
    [await hashPassword(req.body.nouveau), req.user.id]);
  res.json({ message: 'Mot de passe modifié' });
}

module.exports = {
  statutCandidature,
  register, registerProfessionnel, verifyAccount, resendCode, login, verifyMfa, refresh, logout, me,
  switchStructure, resetPassword, changePassword, hashPassword,
};
