'use strict';
/**
 * Consultations (contenu médical). Lecture/écriture : cliniciens de la structure
 * active (RLS). Parent : lecture des consultations partagées, sans les observations.
 */
const { ctx } = require('../config/database');
const { notifier } = require('../services/notification.service');
const { chiffrer } = require('../utils/crypto');
const { consultationPublic } = require('../utils/format');
const { notFound, badRequest } = require('../utils/errors');

const SELECT = `SELECT c.*, st.nom AS structure_nom, u.prenom || ' ' || u.nom AS professionnel_nom
  FROM consultations c JOIN structures st ON st.id = c.structure_id JOIN users u ON u.id = c.professionnel_id`;

// ── POST /api/consultations  (médecin / thérapeute) ────────────────────────
async function creer(req, res) {
  const b = req.body;
  const data = await ctx(req, async (db) => {
    const { rows: [s] } = await db.query(
      "SELECT * FROM suivis WHERE enfant_id = $1 AND structure_id = $2 AND statut IN ('DEMANDE','ACTIF')",
      [b.enfant_id, req.user.structure_id]);
    if (!s) throw badRequest('Cet enfant n’a pas de dossier ouvert dans votre structure', 'NO_SUIVI');
    const { rows: [c] } = await db.query(
      `INSERT INTO consultations (structure_id, rdv_id, suivi_id, enfant_id, parent_id, professionnel_id,
         date_consultation, type, motif_chiffre, observations_chiffre, recommandations_chiffre,
         diagnostic_code, visible_parent, statut)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
      [req.user.structure_id, b.rdv_id || null, s.id, b.enfant_id, s.parent_id, req.user.id,
        b.date_consultation || new Date(), b.type, chiffrer(b.motif), chiffrer(b.observations),
        chiffrer(b.recommandations), b.diagnostic_code || null, b.visible_parent, b.statut || 'TERMINEE'],
    );
    if (s.statut === 'DEMANDE') await db.query("UPDATE suivis SET statut = 'ACTIF' WHERE id = $1", [s.id]);
    if (b.recommandations && b.visible_parent) {
      await notifier(db, s.parent_id, {
        type: 'RECOMMANDATIONS', titre: 'Nouvelles recommandations',
        corps: 'Votre professionnel de santé a partagé des recommandations.', data: { consultation_id: c.id },
      });
    }
    const { rows } = await db.query(`${SELECT} WHERE c.id = $1`, [c.id]);
    return rows[0];
  });
  res.status(201).json({ consultation: consultationPublic(data) });
}

// ── GET /api/consultations?enfant_id= ──────────────────────────────────────
async function lister(req, res) {
  const { enfant_id: enfantId, statut } = req.validQuery;
  const pourParent = req.user.role === 'PARENT';
  const data = await ctx(req, async (db) => {
    const cond = []; const p = [];
    if (enfantId) { p.push(enfantId); cond.push(`c.enfant_id = $${p.length}`); }
    if (statut) { p.push(statut); cond.push(`c.statut = $${p.length}`); }
    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
    const { rows } = await db.query(`${SELECT} ${where} ORDER BY c.date_consultation DESC`, p);
    return rows.map((r) => consultationPublic(r, { pourParent }));
  });
  res.json({ consultations: data, total: data.length });
}

// ── GET /api/consultations/:id ─────────────────────────────────────────────
async function detail(req, res) {
  const data = await ctx(req, async (db) => {
    const { rows } = await db.query(`${SELECT} WHERE c.id = $1`, [req.params.id]);
    if (!rows[0]) throw notFound('Consultation introuvable');
    return consultationPublic(rows[0], { pourParent: req.user.role === 'PARENT' });
  });
  res.json({ consultation: data });
}

// ── PUT /api/consultations/:id  (clinicien) ────────────────────────────────
async function modifier(req, res) {
  const b = req.body;
  const data = await ctx(req, async (db) => {
    const { rows: [c] } = await db.query('SELECT * FROM consultations WHERE id = $1', [req.params.id]);
    if (!c) throw notFound('Consultation introuvable');
    const sets = []; const p = [];
    const set = (col, v) => { p.push(v); sets.push(`${col} = $${p.length}`); };
    if (b.motif !== undefined) set('motif_chiffre', chiffrer(b.motif));
    if (b.observations !== undefined) set('observations_chiffre', chiffrer(b.observations));
    if (b.recommandations !== undefined) set('recommandations_chiffre', chiffrer(b.recommandations));
    if (b.diagnostic_code !== undefined) set('diagnostic_code', b.diagnostic_code);
    if (b.visible_parent !== undefined) set('visible_parent', b.visible_parent);
    if (b.statut) set('statut', b.statut);
    if (!sets.length) throw badRequest('Aucune modification', 'NO_FIELDS');
    p.push(c.id);
    await db.query(`UPDATE consultations SET ${sets.join(', ')} WHERE id = $${p.length}`, p);
    if (b.statut === 'TERMINEE' && c.rdv_id) {
      await db.query("UPDATE rendez_vous SET statut = 'TERMINE' WHERE id = $1 AND statut = 'CONFIRME'", [c.rdv_id]);
    }
    if (b.recommandations && (b.visible_parent ?? c.visible_parent)) {
      await notifier(db, c.parent_id, {
        type: 'RECOMMANDATIONS', titre: 'Nouvelles recommandations',
        corps: 'Votre professionnel de santé a partagé des recommandations.', data: { consultation_id: c.id },
      });
    }
    const { rows } = await db.query(`${SELECT} WHERE c.id = $1`, [c.id]);
    return rows[0];
  });
  res.json({ consultation: consultationPublic(data) });
}

// ── DELETE /api/consultations/:id — annulation (jamais d'effacement) ───────
async function annuler(req, res) {
  await ctx(req, async (db) => {
    const { rowCount } = await db.query(
      "UPDATE consultations SET statut = 'ANNULEE' WHERE id = $1 AND statut <> 'TERMINEE'", [req.params.id]);
    if (!rowCount) throw notFound('Consultation introuvable ou déjà terminée');
  });
  res.json({ message: 'Consultation annulée' });
}

module.exports = { creer, lister, detail, modifier, annuler };
