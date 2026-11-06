'use strict';
/**
 * Invitations du PERSONNEL RÉEL d'un établissement (directeur, médecins, accueil…).
 *
 *  1. L'administrateur de l'établissement (ou le super-administrateur pour le premier
 *     administrateur) crée une invitation : rôle, service, téléphone ou e-mail.
 *  2. Un jeton aléatoire est généré ; seul son empreinte SHA-256 est stockée.
 *     Le lien est envoyé par SMS / e-mail, et affiché pour être partagé (WhatsApp).
 *  3. La personne ouvre le lien, crée son compte (identité, mot de passe) : elle devient
 *     membre ACTIF de cet établissement uniquement, avec double authentification.
 * Lien valable 7 jours, à usage unique.
 */
const crypto = require('crypto');
const { pool, ctx } = require('../config/database');
const { sha256 } = require('../utils/crypto');
const { hashPassword } = require('./auth.controller');
const { informer } = require('../services/contact.service');
const { notFound, badRequest, conflict } = require('../utils/errors');

const LIBELLES = { MEDECIN: 'médecin', THERAPEUTE: 'thérapeute', SECRETAIRE: 'accueil / secrétariat', ADMIN_STRUCTURE: 'administrateur' };

// ── POST /api/etablissement/invitations  [ADMIN_STRUCTURE | SUPER_ADMIN] ───
async function creer(req, res) {
  const b = req.body;
  const structureId = req.user.role === 'SUPER_ADMIN' ? b.structure_id : req.user.structure_id;
  if (!structureId) throw badRequest('Établissement manquant', 'MISSING_STRUCTURE');
  const jeton = crypto.randomBytes(24).toString('base64url');
  const { st, inv } = await ctx(req, async (db) => {
    const { rows: [st] } = await db.query('SELECT id, nom, code FROM structures WHERE id = $1 AND actif', [structureId]);
    if (!st) throw notFound('Établissement introuvable');
    let serviceId = null;
    if (b.service_code) {
      const sv = await db.query('SELECT id FROM services WHERE structure_id = $1 AND code = $2', [st.id, b.service_code]);
      serviceId = sv.rows[0]?.id || null;
    }
    const { rows: [inv] } = await db.query(
      `INSERT INTO invitations (structure_id, service_id, role, destinataire, jeton_hash, expire_le, cree_par)
       VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '7 days', $6) RETURNING id, role, destinataire, expire_le`,
      [st.id, serviceId, b.role, b.destinataire, sha256(jeton), req.user.id]);
    return { st, inv };
  });
  const base = (req.headers.origin || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const lien = `${base}/#invitation=${jeton}`;
  const texte = `${st.nom} vous invite sur SAMA XHEL comme ${LIBELLES[b.role]}. Créez votre compte (lien valable 7 jours) : ${lien}`;
  const dest = b.destinataire.includes('@') ? { email: b.destinataire } : { telephone: b.destinataire };
  const envoye = await informer(dest, `Invitation — ${st.nom}`, texte, { type: 'INVITATION' }).catch(() => []);
  res.status(201).json({ invitation: inv, lien, envoye_par: envoye, message: 'Partagez aussi ce lien par WhatsApp si la personne ne l’a pas reçu.' });
}

// ── GET /api/invitations/:jeton  (public) : pour qui est cette invitation ? ─
async function lire(req, res) {
  const { rows: [i] } = await pool.query('SELECT * FROM invitation_lire($1)', [sha256(req.params.jeton)]);
  if (!i || i.utilisee_le || new Date(i.expire_le) < new Date()) throw notFound('Invitation expirée ou déjà utilisée', 'INVITATION_INVALIDE');
  res.json({ etablissement: { nom: i.nom, code: i.code, logo_url: i.logo_url, couleur: i.couleur }, role: i.role, libelle: LIBELLES[i.role], destinataire: i.destinataire });
}

// ── POST /api/invitations/:jeton/accepter  (public) : créer son compte ─────
async function accepter(req, res) {
  const b = req.body;
  const h = sha256(req.params.jeton);
  const { rows: [i] } = await pool.query('SELECT destinataire, expire_le, utilisee_le FROM invitation_lire($1)', [h]);
  if (!i || i.utilisee_le || new Date(i.expire_le) < new Date()) throw notFound('Invitation expirée ou déjà utilisée', 'INVITATION_INVALIDE');
  const email = b.email || (i.destinataire.includes('@') ? i.destinataire : null);
  const telephone = b.telephone || (!i.destinataire.includes('@') ? i.destinataire : null);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [u] } = await client.query(
      `INSERT INTO users (role_global, nom, prenom, email, telephone, password_hash, verifie, mfa_enabled, numero_ordre, langue)
       VALUES ('PROFESSIONNEL', $1, $2, $3, $4, $5, true, true, $6, 'fr') RETURNING id`,
      [b.nom, b.prenom, email, telephone, await hashPassword(b.password), b.numero_ordre || null]);
    const { rows: [m] } = await client.query('SELECT * FROM utiliser_invitation($1, $2)', [h, u.id]);
    if (!m) throw notFound('Invitation expirée ou déjà utilisée', 'INVITATION_INVALIDE');
    await client.query('COMMIT');
    res.status(201).json({ message: 'Compte créé. Connectez-vous par le portail de votre établissement (code de sécurité à chaque connexion).', role: m.role });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') throw conflict('Un compte existe déjà avec ce téléphone ou cet e-mail', 'DUPLICATE');
    throw err;
  } finally {
    client.release();
  }
}

// ── GET /api/etablissement/equipe  [ADMIN_STRUCTURE] : invitations en cours ─
async function enCours(req, res) {
  const rows = await ctx(req, async (db) => (await db.query(
    `SELECT id, role, destinataire, expire_le, utilisee_le, created_at FROM invitations
      WHERE structure_id = $1 ORDER BY created_at DESC LIMIT 50`, [req.user.structure_id])).rows);
  res.json({ invitations: rows });
}

module.exports = { creer, lire, accepter, enCours };
