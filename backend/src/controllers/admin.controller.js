'use strict';
/**
 * Administration multi-tenant.
 *  • ADMIN_STRUCTURE : gère les membres de SA structure (validation, rôles, suspension),
 *    met à jour la fiche de la structure, consulte ses statistiques et son audit.
 *  • SUPER_ADMIN     : gère l'annuaire national, active les structures partenaires,
 *    vérifie l'intégrité du journal d'audit.
 */
const crypto = require('crypto');
const { pool, ctx } = require('../config/database');
const { invaliderStructuresDuPro } = require('../middlewares/auth');
const { hashPassword } = require('./auth.controller');
const otp = require('../services/otp.service');
const { notifier } = require('../services/notification.service');
const { CHAMPS_PUBLICS } = require('./structures.controller');
const { notFound, badRequest, conflict } = require('../utils/errors');

// ── GET /api/admin/membres?statut= ─────────────────────────────────────────
async function membres(req, res) {
  const { statut } = req.validQuery;
  const p = [req.user.structure_id]; let f = '';
  if (statut) { p.push(statut); f = 'AND m.statut = $2'; }
  const { rows } = await pool.query(
    `SELECT u.id, u.prenom, u.nom, u.email, u.telephone, u.numero_ordre, u.mode_exercice, u.langues_parlees,
            u.teleconsultation, u.verifie, m.role, m.specialite, m.statut, m.date_affectation
     FROM membres_structure m JOIN users u ON u.id = m.user_id
     WHERE m.structure_id = $1 ${f}
     ORDER BY CASE m.statut WHEN 'EN_ATTENTE' THEN 0 ELSE 1 END, u.nom`, p);
  res.json({ membres: rows });
}

// ── POST /api/admin/membres  — ajouter un professionnel ────────────────────
// Si le compte existe (même e-mail/téléphone), il est rattaché ; sinon il est créé
// et reçoit un code pour choisir son mot de passe.
async function ajouterMembre(req, res) {
  const b = req.body;
  const { rows: ex } = await pool.query(
    'SELECT * FROM users WHERE lower(email) = lower($1) OR telephone = $2 LIMIT 1', [b.email, b.telephone]);
  let user = ex[0];
  let cree = false;
  if (user && user.role_global === 'PARENT') {
    throw conflict('Ce contact appartient à un compte parent. Utilisez un autre e-mail professionnel.', 'PARENT_ACCOUNT');
  }
  if (!user) {
    const { rows } = await pool.query(
      `INSERT INTO users (role_global, nom, prenom, email, telephone, password_hash, verifie, mfa_enabled)
       VALUES ('PROFESSIONNEL', $1, $2, $3, $4, $5, true, true) RETURNING *`,
      [b.nom, b.prenom, b.email, b.telephone, await hashPassword(crypto.randomBytes(24).toString('base64url'))]);
    user = rows[0]; cree = true;
  }
  await pool.query(
    `INSERT INTO membres_structure (user_id, structure_id, role, specialite, statut, valide_par)
     VALUES ($1, $2, $3, $4, 'ACTIF', $5)
     ON CONFLICT (user_id, structure_id) DO UPDATE SET role = EXCLUDED.role, specialite = EXCLUDED.specialite,
       statut = 'ACTIF', valide_par = EXCLUDED.valide_par`,
    [user.id, req.user.structure_id, b.role, b.specialite || null, req.user.id]);
  await invaliderStructuresDuPro(user.id);
  let envoi = null;
  if (cree) envoi = await otp.envoyerCode('reset', user, 'email');
  res.status(201).json({
    message: cree
      ? 'Compte créé. Le professionnel a reçu un code pour choisir son mot de passe (« Mot de passe oublié »).'
      : 'Professionnel rattaché à la structure.',
    user_id: user.id, verification: envoi,
  });
}

// ── PUT /api/admin/membres/:user_id  { statut?, role?, specialite? } ───────
async function modifierMembre(req, res) {
  const b = req.body;
  if (req.params.user_id === req.user.id && b.statut && b.statut !== 'ACTIF') {
    throw badRequest('Vous ne pouvez pas suspendre votre propre compte', 'SELF_SUSPEND');
  }
  if (b.statut) {
    // Une candidature (EN_ATTENTE / CONVOQUE) se décide uniquement par le circuit pièces → convocation
    const { rows: [actuel] } = await pool.query(
      'SELECT statut FROM membres_structure WHERE user_id = $1 AND structure_id = $2', [req.params.user_id, req.user.structure_id]);
    if (!actuel) throw notFound('Membre introuvable dans votre structure');
    const permis = { ACTIF: ['SUSPENDU'], SUSPENDU: ['ACTIF'] };
    if (!(permis[b.statut] || []).includes(actuel.statut)) {
      throw badRequest('Utilisez la décision de candidature (pièces vérifiées puis convocation)', 'USE_CANDIDATURE_FLOW');
    }
  }
  const sets = ['valide_par = $1']; const p = [req.user.id];
  const set = (col, v) => { p.push(v); sets.push(`${col} = $${p.length}`); };
  if (b.statut) set('statut', b.statut);
  if (b.role) set('role', b.role);
  if (b.specialite !== undefined) set('specialite', b.specialite);
  p.push(req.params.user_id, req.user.structure_id);
  const { rows } = await pool.query(
    `UPDATE membres_structure SET ${sets.join(', ')}
     WHERE user_id = $${p.length - 1} AND structure_id = $${p.length} RETURNING *`, p);
  if (!rows[0]) throw notFound('Membre introuvable dans votre structure');
  await invaliderStructuresDuPro(req.params.user_id);
  if (b.statut === 'ACTIF') {
    await ctx(req, (db) => notifier(db, req.params.user_id, {
      type: 'COMPTE_VALIDE', titre: 'Inscription validée',
      corps: 'Votre accès à la structure a été validé. Vous pouvez vous connecter.', data: {},
    }));
  }
  res.json({ membre: rows[0] });
}

// ── PUT /api/admin/structure  — fiche de SA structure ──────────────────────
async function modifierMaStructure(req, res) {
  const id = req.user.structure_id;
  const { rows } = await majStructure(id, req.body, ['description', 'adresse', 'telephone', 'email', 'site_web',
    'horaires', 'troubles', 'services', 'age_min_mois', 'age_max_mois', 'langues', 'cout_niveau', 'delai_attente_jours',
    'latitude', 'longitude', 'commune', 'departement']);
  res.json({ structure: rows[0] });
}

// ── GET /api/admin/statistiques  — statistiques de la structure active ─────
async function statistiques(req, res) {
  const data = await ctx(req, async (db) => {
    const one = async (sql) => (await db.query(sql)).rows;
    return {
      dossiers_par_statut: await one('SELECT statut, count(*)::int AS n FROM suivis GROUP BY statut'),
      dossiers_par_priorite: await one("SELECT priorite, count(*)::int AS n FROM suivis WHERE statut IN ('DEMANDE','ACTIF') GROUP BY priorite"),
      troubles_reperes: await one(
        `SELECT d.questionnaire_code AS trouble, count(DISTINCT d.enfant_id)::int AS enfants
         FROM depistages d JOIN suivis s ON s.enfant_id = d.enfant_id
         WHERE d.niveau <> 'FAIBLE' GROUP BY d.questionnaire_code ORDER BY 2 DESC`),
      rendez_vous_par_statut: await one('SELECT statut, count(*)::int AS n FROM rendez_vous GROUP BY statut'),
      taux_presence: (await one(
        `SELECT CASE WHEN count(*) FILTER (WHERE statut IN ('TERMINE','ABSENT')) = 0 THEN NULL
                ELSE round(100.0 * count(*) FILTER (WHERE statut = 'TERMINE') /
                     count(*) FILTER (WHERE statut IN ('TERMINE','ABSENT')))::int END AS pct
         FROM rendez_vous`))[0].pct,
      nouveaux_dossiers_par_mois: await one(
        `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS mois, count(*)::int AS n
         FROM suivis GROUP BY 1 ORDER BY 1 DESC LIMIT 12`),
    };
  });
  res.json({ structure_id: req.user.structure_id, statistiques: data });
}

// ── GET /api/admin/audit  — accès aux données de la structure ──────────────
async function audit(req, res) {
  const estSuper = req.user.role === 'SUPER_ADMIN';
  const { rows } = await pool.query(
    `SELECT a.id, a.created_at, a.action, a.ressource, a.ressource_id, a.role, a.statut_http, a.ip,
            u.prenom || ' ' || u.nom AS utilisateur
     FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
     ${estSuper ? '' : 'WHERE a.structure_id = $1'}
     ORDER BY a.id DESC LIMIT 200`, estSuper ? [] : [req.user.structure_id]);
  res.json({ journal: rows });
}

// ═══ Super-administrateur ═════════════════════════════════════════════════

async function creerStructure(req, res) {
  const b = req.body;
  const cols = Object.keys(b);
  const vals = cols.map((c) => b[c]);
  const { rows } = await pool.query(
    `INSERT INTO structures (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})
     RETURNING ${CHAMPS_PUBLICS}`, vals);
  res.status(201).json({ structure: rows[0] });
}

async function modifierStructure(req, res) {
  const { rows } = await majStructure(req.params.id, req.body, null);
  res.json({ structure: rows[0] });
}

/** Active une structure partenaire et crée (ou rattache) son premier administrateur */
async function activerPartenaire(req, res) {
  const b = req.body;
  const { rows: [st] } = await pool.query(
    'UPDATE structures SET partenaire = true, verifie = true WHERE id = $1 RETURNING id, nom', [req.params.id]);
  if (!st) throw notFound('Structure introuvable');
  req.user.structure_id = st.id;
  req.body = { ...b, role: 'ADMIN_STRUCTURE' };
  return ajouterMembre(req, res);
}

async function verifierAudit(req, res) {
  const { rows } = await ctx(req, (db) => db.query('SELECT * FROM audit_verifier()'));
  res.json({ integrite: rows[0] });
}

async function statistiquesNationales(_req, res) {
  // Statistiques AGRÉGÉES et anonymes (observatoire national)
  const one = async (sql) => (await pool.query(sql)).rows;
  res.json({
    structures: await one('SELECT region, count(*)::int AS total, count(*) FILTER (WHERE partenaire)::int AS partenaires FROM structures WHERE actif GROUP BY region ORDER BY region'),
    familles: (await one("SELECT count(*)::int AS n FROM users WHERE role_global = 'PARENT'"))[0].n,
    professionnels: (await one("SELECT count(DISTINCT user_id)::int AS n FROM membres_structure WHERE statut = 'ACTIF'"))[0].n,
    dons: await one("SELECT moyen, count(*)::int AS n, coalesce(sum(montant),0)::int AS total FROM dons WHERE statut = 'PAYE' GROUP BY moyen"),
  });
}

/**
 * SUPERVISION (super-administrateur / équipe DevOps) : état des services, sécurité, activité.
 * Aucune donnée nominative ni médicale : uniquement des compteurs et des états.
 */
async function supervision(req, res) {
  const env = require('../config/env'); // eslint-disable-line global-require
  const redis = require('../config/redis'); // eslint-disable-line global-require
  const one = async (sql) => (await pool.query(sql)).rows;
  const t0 = Date.now();
  const etat = async (f) => { try { return { ok: true, detail: await f() }; } catch (e) { return { ok: false, detail: e.message }; } };
  const services = {
    base_de_donnees: await etat(async () => `${(await one('SELECT version()'))[0].version.split(' ')[1]} — ${Date.now() - t0} ms`),
    redis: await etat(async () => (await redis.ping()) === 'PONG' && 'PONG'),
    ia_vocale: await etat(async () => {
      if (!env.iaVoix.url) throw new Error('non configurée');
      const r = await fetch(`${env.iaVoix.url}/sante`, { signal: AbortSignal.timeout(3000) });
      return (await r.json()).modele;
    }),
    visio_livekit: { ok: true, detail: env.turn.url ? 'WebRTC + relais TURN' : 'WebRTC (réseau local ; relais TURN à configurer en ligne)' },
    sms: { ok: require('../services/sms.service').smsConfigure(), detail: env.smsFournisseur === 'orange' ? 'Orange SMS Sénégal' : (env.sms.username === 'sandbox' ? 'bac à sable (aucun SMS réel)' : (env.sms.username || 'non configuré')) },
    telegram: { ok: Boolean(env.telegram.token), detail: env.telegram.bot ? `@${env.telegram.bot}` : 'non configuré' },
    email: { ok: Boolean(env.mail.user), detail: env.mail.host || 'non configuré' },
    push: { ok: Boolean(env.fcmServiceAccount), detail: env.fcmServiceAccount ? 'Firebase' : 'non configuré (notifications dans l’application seulement)' },
  };
  const { rows: [integrite] } = await ctx(req, (db) => db.query('SELECT * FROM audit_verifier()'));
  res.json({
    services,
    securite: {
      journal_integre: integrite,
      acces_24h: (await one("SELECT action, count(*)::int AS n FROM audit_logs WHERE created_at > NOW() - INTERVAL '24 hours' GROUP BY action ORDER BY 2 DESC")),
      refus_24h: (await one("SELECT count(*)::int AS n FROM audit_logs WHERE created_at > NOW() - INTERVAL '24 hours' AND statut_http >= 400"))[0]?.n ?? 0,
    },
    activite: {
      structures_partenaires: (await one('SELECT count(*)::int AS n FROM structures WHERE partenaire'))[0].n,
      structures_annuaire: (await one('SELECT count(*)::int AS n FROM structures WHERE actif'))[0].n,
      pharmacies: (await one('SELECT count(*)::int AS n FROM pharmacies WHERE actif'))[0].n,
      familles: (await one("SELECT count(*)::int AS n FROM users WHERE role_global = 'PARENT'"))[0].n,
      professionnels_actifs: (await one("SELECT count(DISTINCT user_id)::int AS n FROM membres_structure WHERE statut = 'ACTIF'"))[0].n,
      candidatures_en_cours: (await one("SELECT count(*)::int AS n FROM membres_structure WHERE statut IN ('EN_ATTENTE','CONVOQUE')"))[0].n,
      // Agrégats seulement (fonction SECURITY DEFINER) : le super-admin ne lit aucun contenu médical.
      ...(await (async () => { const [c] = await one('SELECT * FROM supervision_compteurs()');
        return { vocaux_7j: c.vocaux_7j, vocaux_non_attribues: c.vocaux_non_attribues, rappels_ussd_en_attente: c.rappels_en_attente }; })()),
    },
    version: '1.1.0',
    heure_serveur: new Date().toISOString(),
  });
}

async function majStructure(id, b, autorises) {
  const cols = Object.keys(b).filter((c) => !autorises || autorises.includes(c));
  if (!cols.length) throw badRequest('Aucune modification', 'NO_FIELDS');
  const vals = cols.map((c) => b[c]);
  vals.push(id);
  const r = await pool.query(
    `UPDATE structures SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')} WHERE id = $${vals.length}
     RETURNING ${CHAMPS_PUBLICS}`, vals);
  if (!r.rows[0]) throw notFound('Structure introuvable');
  return r;
}

module.exports = {
  supervision,
  membres, ajouterMembre, modifierMembre, modifierMaStructure, statistiques, audit,
  creerStructure, modifierStructure, activerPartenaire, verifierAudit, statistiquesNationales,
};

// ═══ Sécurité avancée (mémoire 4.3.6) : alertes de l'IA et ancrages blockchain ═══
async function alertesSecurite(req, res) {
  const rows = await ctx(req, async (db) => (await db.query(
    `SELECT a.id, a.type, a.score, a.details, a.statut, a.created_at, a.structure_id,
            u.prenom, u.nom, s.sigle AS structure
       FROM alertes_securite a LEFT JOIN users u ON u.id = a.user_id LEFT JOIN structures s ON s.id = a.structure_id
      WHERE ($1::text IS NULL OR a.statut = $1)
      ORDER BY a.created_at DESC LIMIT 200`, [req.validQuery.statut || null])).rows);
  res.json({ alertes: rows });
}

async function traiterAlerte(req, res) {
  const r = await ctx(req, async (db) => (await db.query(
    'UPDATE alertes_securite SET statut = $2, traitee_par = $3 WHERE id = $1 RETURNING id, statut',
    [req.params.id, req.body.statut, req.user.id])).rows[0]);
  if (!r) throw notFound('Alerte introuvable');
  res.json({ alerte: r });
}

async function ancrages(req, res) {
  const rows = await ctx(req, async (db) => (await db.query(
    `SELECT id, dernier_audit, empreinte, calendrier, statut, erreur, created_at, (preuve IS NOT NULL) AS preuve_disponible
       FROM ancrages ORDER BY id DESC LIMIT 60`)).rows);
  res.json({
    ancrages: rows,
    verification: 'Télécharger la preuve .ots puis, avec l’outil officiel OpenTimestamps : « ots upgrade preuve.ots » et « ots verify preuve.ots ».',
  });
}

async function preuveAncrage(req, res) {
  const r = await ctx(req, async (db) => (await db.query('SELECT empreinte, preuve FROM ancrages WHERE id = $1 AND preuve IS NOT NULL', [req.params.id])).rows[0]);
  if (!r) throw notFound('Preuve introuvable');
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="samaxhel-journal-${r.empreinte.slice(0, 12)}.ots"`);
  res.send(r.preuve);
}

async function ancrerMaintenant(req, res) {
  const { ancrer } = require('../services/securite/ancrage.service'); // eslint-disable-line global-require
  res.json(await ancrer());
}

module.exports.alertesSecurite = alertesSecurite;
module.exports.traiterAlerte = traiterAlerte;
module.exports.ancrages = ancrages;
module.exports.preuveAncrage = preuveAncrage;
module.exports.ancrerMaintenant = ancrerMaintenant;
