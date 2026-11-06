'use strict';
/**
 * CANDIDATURE D'UN PROFESSIONNEL (médecin, thérapeute, secrétaire) inscrit depuis le site vitrine.
 *
 *   1. Inscription (POST /auth/register-professionnel) → statut EN_ATTENTE + jeton de dépôt (24 h).
 *   2. Dépôt des pièces : diplôme, pièce d'identité, et pour un médecin l'attestation
 *      d'inscription à l'Ordre des médecins du Sénégal. PDF/JPEG/PNG, 5 Mo max, chiffrées en base.
 *   3. L'administrateur de la structure examine chaque pièce (CONFORME / NON_CONFORME).
 *   4. Il CONVOQUE le candidat (date + lieu) pour un entretien et la vérification des originaux.
 *   5. Après l'entretien seulement, il peut l'activer (ACTIF) ou refuser (REFUSE, motif obligatoire).
 * Chaque étape est tracée (journal d'audit) et le candidat est prévenu par e-mail / SMS.
 */
const crypto = require('crypto');
const { pool, ctx } = require('../config/database');
const redis = require('../config/redis');
const { invaliderStructuresDuPro } = require('../middlewares/auth');
const { notifier } = require('../services/notification.service');
const { informer } = require('../services/contact.service');
const { chiffrerOctets, dechiffrerOctets, sha256 } = require('../utils/crypto');
const { notFound, badRequest, unauthorized, conflict } = require('../utils/errors');

const TAILLE_MAX = 5 * 1024 * 1024;
const PIECES_OBLIGATOIRES = { MEDECIN: ['DIPLOME', 'IDENTITE', 'ORDRE'], THERAPEUTE: ['DIPLOME', 'IDENTITE'], SECRETAIRE: ['IDENTITE'] };
const SIGNATURES = { // vérification du VRAI contenu (« nombres magiques »), pas seulement du type annoncé
  'application/pdf': (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
};

/** Jeton de dépôt remis à l'inscription (le candidat ne peut pas encore se connecter) */
async function creerJetonDepot(userId) {
  const jeton = crypto.randomBytes(24).toString('base64url');
  await redis.set(`depot:${sha256(jeton)}`, userId, 'EX', 24 * 3600);
  return jeton;
}

// ── POST /api/candidatures/pieces?type=DIPLOME  (corps = le fichier) ──────
// Auth : jeton de dépôt (X-Jeton-Depot) OU session du candidat.
async function deposerPiece(req, res) {
  let userId = req.user?.id;
  const jeton = req.headers['x-jeton-depot'];
  if (!userId && jeton) userId = await redis.get(`depot:${sha256(String(jeton))}`);
  if (!userId) throw unauthorized('Lien de dépôt expiré : connectez-vous pour envoyer vos pièces', 'DEPOT_EXPIRED');

  const mime = String(req.headers['content-type'] || '').split(';')[0].trim();
  const fichier = req.body;
  if (!SIGNATURES[mime]) throw badRequest('Formats acceptés : PDF, JPEG, PNG', 'INVALID_FILE_TYPE');
  if (!Buffer.isBuffer(fichier) || !fichier.length) throw badRequest('Fichier vide', 'EMPTY_FILE');
  if (fichier.length > TAILLE_MAX) throw badRequest('Fichier trop lourd (5 Mo maximum)', 'FILE_TOO_LARGE');
  if (!SIGNATURES[mime](fichier)) throw badRequest('Le contenu du fichier ne correspond pas à son type', 'FILE_MISMATCH');

  const nom = String(req.validQuery.nom || `${req.validQuery.type}.${mime.split('/')[1]}`).replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 120);
  const piece = await ctx(req.user ? req : { user: null }, async (db) => {
    // Pas de RETURNING : un candidat pas encore connecté ne peut pas RELIRE ses pièces (RLS), seulement les déposer
    const p = { id: crypto.randomUUID(), type: req.validQuery.type, nom_fichier: nom, mime, taille: fichier.length,
      sha256: crypto.createHash('sha256').update(fichier).digest('hex'), statut: 'A_VERIFIER' };
    await db.query(
      `INSERT INTO pieces_justificatives (id, user_id, type, nom_fichier, mime, taille, sha256, contenu_chiffre)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [p.id, userId, p.type, nom, mime, p.taille, p.sha256, chiffrerOctets(fichier)]);
    return p;
  });
  res.status(201).json({ piece });
}

// ── GET /api/candidatures/moi — le candidat suit son dossier ──────────────
async function maCandidature(req, res) {
  const data = await ctx(req, async (db) => {
    const { rows: pieces } = await db.query(
      'SELECT id, type, nom_fichier, statut, created_at FROM pieces_justificatives WHERE user_id = $1 ORDER BY created_at', [req.user.id]);
    const { rows: structures } = await pool.query(
      `SELECT s.nom, m.role, m.statut, m.convocation_date, m.convocation_lieu, m.decision_motif
       FROM membres_structure m JOIN structures s ON s.id = m.structure_id WHERE m.user_id = $1`, [req.user.id]);
    return { pieces, structures };
  });
  res.json(data);
}

// ── GET /api/admin/membres/:user_id/pieces ────────────────────────────────
async function piecesDuCandidat(req, res) {
  const data = await ctx(req, async (db) => {
    const { rows: [m] } = await db.query(
      'SELECT role, statut, convocation_date, convocation_lieu FROM membres_structure WHERE user_id = $1 AND structure_id = $2',
      [req.params.user_id, req.user.structure_id]);
    if (!m) throw notFound('Candidat introuvable dans votre structure');
    const { rows } = await db.query(
      `SELECT id, type, nom_fichier, mime, taille, sha256, statut, verifie_le, created_at
       FROM pieces_justificatives WHERE user_id = $1 ORDER BY type, created_at DESC`, [req.params.user_id]);
    const deposees = new Set(rows.map((r) => r.type));
    const conformes = new Set(rows.filter((r) => r.statut === 'CONFORME').map((r) => r.type));
    const obligatoires = PIECES_OBLIGATOIRES[m.role] || [];
    return {
      membre: m, pieces: rows, obligatoires,
      manquantes: obligatoires.filter((t) => !deposees.has(t)),
      a_verifier: obligatoires.filter((t) => deposees.has(t) && !conformes.has(t)),
      complet: obligatoires.every((t) => conformes.has(t)),
    };
  });
  res.json(data);
}

// ── GET /api/admin/pieces/:id — ouvrir une pièce (téléchargement tracé) ───
async function ouvrirPiece(req, res) {
  const p = await ctx(req, async (db) => {
    const { rows: [x] } = await db.query('SELECT * FROM pieces_justificatives WHERE id = $1', [req.params.id]);
    if (!x) throw notFound('Pièce introuvable');
    return x;
  });
  const contenu = dechiffrerOctets(p.contenu_chiffre);
  if (crypto.createHash('sha256').update(contenu).digest('hex') !== p.sha256) {
    throw conflict('Intégrité de la pièce compromise', 'INTEGRITY_ERROR');
  }
  res.set({
    'Content-Type': p.mime, 'Cache-Control': 'no-store',
    'Content-Disposition': `inline; filename="${encodeURIComponent(p.nom_fichier)}"`,
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(contenu);
}

// ── PUT /api/admin/pieces/:id  { statut: CONFORME | NON_CONFORME } ────────
async function verifierPiece(req, res) {
  const data = await ctx(req, async (db) => {
    const { rows: [p] } = await db.query(
      `UPDATE pieces_justificatives SET statut = $1, verifie_par = $2, verifie_le = NOW()
       WHERE id = $3 RETURNING id, user_id, type, statut`, [req.body.statut, req.user.id, req.params.id]);
    if (!p) throw notFound('Pièce introuvable');
    if (p.statut === 'NON_CONFORME') {
      await notifier(db, p.user_id, {
        type: 'PIECE_REFUSEE', titre: 'Pièce justificative à remplacer',
        corps: `Votre pièce « ${p.type} » n’a pas été acceptée. Déposez-en une nouvelle depuis votre espace.`, data: {},
      });
    }
    return p;
  });
  res.json({ piece: data });
}

// ── PUT /api/admin/membres/:user_id/decision ──────────────────────────────
// { statut: 'CONVOQUE', convocation_date, convocation_lieu } | { statut: 'ACTIF' } | { statut: 'REFUSE', motif }
async function decider(req, res) {
  const b = req.body;
  const userId = req.params.user_id;
  const sid = req.user.structure_id;
  const resultat = await ctx(req, async (db) => {
    const { rows: [m] } = await db.query('SELECT * FROM membres_structure WHERE user_id = $1 AND structure_id = $2', [userId, sid]);
    if (!m) throw notFound('Candidat introuvable dans votre structure');
    const { rows: pieces } = await db.query('SELECT type, statut FROM pieces_justificatives WHERE user_id = $1', [userId]);
    const conformes = new Set(pieces.filter((p) => p.statut === 'CONFORME').map((p) => p.type));
    const manquantes = (PIECES_OBLIGATOIRES[m.role] || []).filter((t) => !conformes.has(t));

    if (b.statut === 'CONVOQUE') {
      if (manquantes.length) throw badRequest(`Pièces non vérifiées : ${manquantes.join(', ')}`, 'PIECES_INCOMPLETES', { manquantes });
      if (new Date(b.convocation_date) <= new Date()) throw badRequest('La date de convocation doit être dans le futur', 'INVALID_DATE');
    }
    if (b.statut === 'ACTIF') {
      if (manquantes.length) throw badRequest(`Pièces non vérifiées : ${manquantes.join(', ')}`, 'PIECES_INCOMPLETES', { manquantes });
      if (m.statut !== 'CONVOQUE' || !m.convocation_date || new Date(m.convocation_date) > new Date()) {
        throw badRequest('Le candidat doit d’abord passer l’entretien de vérification (convocation)', 'ENTRETIEN_REQUIS');
      }
    }
    const { rows: [maj] } = await db.query(
      `UPDATE membres_structure SET statut = $1, valide_par = $2, decision_le = NOW(),
              convocation_date = COALESCE($3, convocation_date), convocation_lieu = COALESCE($4, convocation_lieu),
              decision_motif = $5
       WHERE user_id = $6 AND structure_id = $7 RETURNING *`,
      [b.statut, req.user.id, b.convocation_date || null, b.convocation_lieu || null, b.motif || null, userId, sid]);
    const { rows: [s] } = await db.query('SELECT nom FROM structures WHERE id = $1', [sid]);
    const date = b.convocation_date ? new Date(b.convocation_date).toLocaleString('fr-FR', { timeZone: 'Africa/Dakar', dateStyle: 'full', timeStyle: 'short' }) : '';
    const messages = {
      CONVOQUE: ['Convocation à un entretien', `${s.nom} vous convoque le ${date} — ${b.convocation_lieu}. Apportez les ORIGINAUX de vos diplômes, votre pièce d’identité et votre attestation d’inscription à l’Ordre.`],
      ACTIF: ['Inscription validée', `Votre accès à ${s.nom} est validé. Vous pouvez vous connecter à SAMA XHEL.`],
      REFUSE: ['Candidature non retenue', `${s.nom} n’a pas retenu votre candidature. Motif : ${b.motif}`],
      SUSPENDU: ['Accès suspendu', `Votre accès à ${s.nom} est suspendu. Contactez la structure.`],
    };
    const [titre, corps] = messages[b.statut];
    await notifier(db, userId, { type: `CANDIDATURE_${b.statut}`, titre, corps, data: { structure_id: sid } });
    return { membre: maj, titre, corps };
  });
  await invaliderStructuresDuPro(userId);
  // Telegram / WhatsApp / SMS / e-mail (un échec d'envoi n'empêche pas la décision)
  await informer({ id: userId }, resultat.titre, resultat.corps, { type: `CANDIDATURE_${req.body.statut}` });
  res.json({ membre: resultat.membre });
}

module.exports = { creerJetonDepot, deposerPiece, maCandidature, piecesDuCandidat, ouvrirPiece, verifierPiece, decider, PIECES_OBLIGATOIRES };
