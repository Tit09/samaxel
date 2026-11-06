'use strict';
const { ctx } = require('../config/database');
const { chiffrer, indexAveugle } = require('../utils/crypto');
const { enfantPublic, premierDuMois } = require('../utils/format');
const { notFound, badRequest } = require('../utils/errors');

// ── POST /api/enfants  (parent) ────────────────────────────────────────────
async function creer(req, res) {
  const b = req.body;
  if (new Date(b.date_naissance) > new Date()) throw badRequest('La date de naissance est dans le futur', 'INVALID_DATE');
  const enfant = await ctx(req, async (db) => {
    const { rows } = await db.query(
      `INSERT INTO enfants (parent_id, prenom_chiffre, nom_chiffre, nom_index, date_naissance_chiffre,
                            mois_naissance, sexe, region, langue_maison, scolarise, lien)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [req.user.id, chiffrer(b.prenom), chiffrer(b.nom), indexAveugle(b.nom), chiffrer(b.date_naissance),
        premierDuMois(b.date_naissance), b.sexe, b.region || null, b.langue_maison, b.scolarise, b.lien || 'ENFANT'],
    );
    await db.query(
      `INSERT INTO consentements (parent_id, enfant_id, type, accepte, ip)
       VALUES ($1, $2, 'DONNEES_SANTE', true, $3)`,
      [req.user.id, rows[0].id, req.ip],
    );
    return rows[0];
  });
  res.status(201).json({ enfant: enfantPublic(enfant) });
}

// ── GET /api/enfants ───────────────────────────────────────────────────────
// Parent : ses enfants. Professionnel : les enfants suivis par sa structure (RLS).
async function lister(req, res) {
  const data = await ctx(req, async (db) => {
    if (req.user.role === 'PARENT') {
      const { rows } = await db.query(
        'SELECT * FROM enfants WHERE parent_id = $1 AND NOT archive ORDER BY created_at', [req.user.id]);
      return rows.map(enfantPublic);
    }
    const { rows } = await db.query(
      `SELECT e.*, s.id AS suivi_id, s.numero_dossier, s.statut AS suivi_statut, s.priorite
       FROM enfants e JOIN suivis s ON s.enfant_id = e.id AND s.structure_id = $1
       WHERE s.statut <> 'REFUSE'
       ORDER BY CASE s.priorite WHEN 'URGENT' THEN 0 WHEN 'PRIORITAIRE' THEN 1 ELSE 2 END, s.created_at`,
      [req.user.structure_id]);
    return rows.map((r) => ({
      ...enfantPublic(r), suivi_id: r.suivi_id, numero_dossier: r.numero_dossier,
      suivi_statut: r.suivi_statut, priorite: r.priorite,
    }));
  });
  res.json({ enfants: data, total: data.length });
}

// ── GET /api/enfants/:id ───────────────────────────────────────────────────
async function detail(req, res) {
  const data = await ctx(req, async (db) => {
    const { rows } = await db.query('SELECT * FROM enfants WHERE id = $1', [req.params.id]);
    if (!rows[0]) throw notFound('Enfant introuvable');
    const { rows: suivis } = await db.query(
      `SELECT s.id, s.structure_id, st.nom AS structure_nom, s.numero_dossier, s.statut, s.priorite,
              s.triage_score, s.triage_raisons, s.created_at
       FROM suivis s JOIN structures st ON st.id = s.structure_id
       WHERE s.enfant_id = $1 ORDER BY s.created_at DESC`, [req.params.id]);
    return { enfant: enfantPublic(rows[0]), suivis };
  });
  res.json(data);
}

// ── PUT /api/enfants/:id  (parent) ─────────────────────────────────────────
async function modifier(req, res) {
  const b = req.body;
  const data = await ctx(req, async (db) => {
    const sets = []; const p = [];
    const set = (col, v) => { p.push(v); sets.push(`${col} = $${p.length}`); };
    if (b.prenom) set('prenom_chiffre', chiffrer(b.prenom));
    if (b.nom) { set('nom_chiffre', chiffrer(b.nom)); set('nom_index', indexAveugle(b.nom)); }
    if (b.date_naissance) { set('date_naissance_chiffre', chiffrer(b.date_naissance)); set('mois_naissance', premierDuMois(b.date_naissance)); }
    if (b.sexe) set('sexe', b.sexe);
    if (b.region !== undefined) set('region', b.region);
    if (b.langue_maison) set('langue_maison', b.langue_maison);
    if (b.scolarise !== undefined) set('scolarise', b.scolarise);
    if (b.lien !== undefined) set('lien', b.lien);
    if (!sets.length) throw badRequest('Aucun champ à modifier', 'NO_FIELDS');
    p.push(req.params.id, req.user.id);
    const { rows } = await db.query(
      `UPDATE enfants SET ${sets.join(', ')} WHERE id = $${p.length - 1} AND parent_id = $${p.length} RETURNING *`, p);
    if (!rows[0]) throw notFound('Enfant introuvable');
    return enfantPublic(rows[0]);
  });
  res.json({ enfant: data });
}

// ── DELETE /api/enfants/:id  (parent) — archivage, jamais d'effacement du dossier médical
async function archiver(req, res) {
  await ctx(req, async (db) => {
    const { rowCount } = await db.query(
      'UPDATE enfants SET archive = true WHERE id = $1 AND parent_id = $2', [req.params.id, req.user.id]);
    if (!rowCount) throw notFound('Enfant introuvable');
  });
  res.json({ message: 'Profil archivé' });
}

module.exports = { creer, lister, detail, modifier, archiver };
