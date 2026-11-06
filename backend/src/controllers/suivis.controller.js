'use strict';
/**
 * Suivis = dossiers d'un enfant dans une structure (multi-tenant).
 * Côté professionnel : la file triée par l'IA (urgence) de la structure active.
 */
const { ctx } = require('../config/database');
const { calculerTriage } = require('../services/triage.service');
const { notifierStructure } = require('../services/membres.service');
const { notifier } = require('../services/notification.service');
const { chiffrer, dechiffrer } = require('../utils/crypto');
const { enfantPublic } = require('../utils/format');
const { notFound, badRequest, conflict, forbidden } = require('../utils/errors');

const ORDRE = `CASE s.priorite WHEN 'URGENT' THEN 0 WHEN 'PRIORITAIRE' THEN 1 ELSE 2 END, s.triage_score DESC, s.created_at`;

// ── POST /api/suivis  (parent) — demande de prise en charge ───────────────
/**
 * Ouvre le dossier (« prise en charge ») d'une personne suivie dans un établissement partenaire.
 * Utilisé par : la demande de prise en charge, la première demande de rendez-vous,
 * et « Rejoindre cet établissement » quand la famille choisit la personne concernée.
 * @returns {{suivi, triage, existait:boolean}}
 */
async function ouvrirSuivi(db, req, { enfantId, structureId, motif, depistageId }) {
  const { rows: [e] } = await db.query('SELECT id FROM enfants WHERE id = $1 AND parent_id = $2', [enfantId, req.user.id]);
  if (!e) throw notFound('Personne suivie introuvable');
  const { rows: [st] } = await db.query('SELECT id, nom, partenaire FROM structures WHERE id = $1 AND actif', [structureId]);
  if (!st) throw notFound('Établissement introuvable');
  if (!st.partenaire) {
    throw badRequest('Cet établissement n’utilise pas encore SAMA XHEL : contactez-le par téléphone.', 'STRUCTURE_NOT_PARTNER');
  }
  const { rows: [deja] } = await db.query(
    "SELECT * FROM suivis WHERE enfant_id = $1 AND structure_id = $2 AND statut IN ('DEMANDE', 'ACTIF')", [enfantId, structureId]);
  if (deja) return { suivi: { ...suiviPublic(deja), structure_nom: st.nom }, triage: null, existait: true };
  const t = await calculerTriage(db, enfantId);
  let suivi;
  try {
    const { rows } = await db.query(
      `INSERT INTO suivis (enfant_id, parent_id, structure_id, priorite, triage_score, triage_raisons, motif_chiffre, depistage_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [enfantId, req.user.id, structureId, t.priorite, t.score, JSON.stringify(t.raisons), chiffrer(motif), depistageId || null],
    );
    suivi = rows[0];
  } catch (err) {
    if (err.code === '23505') throw conflict('Une demande existe déjà pour cette personne dans cet établissement', 'ALREADY_REQUESTED');
    throw err;
  }
  await db.query(
    `INSERT INTO consentements (parent_id, enfant_id, type, accepte, ip) VALUES ($1, $2, 'PARTAGE_STRUCTURE', true, $3)`,
    [req.user.id, enfantId, req.ip]);
  // La famille « rejoint » aussi l'établissement (tuile « Mes établissements »)
  await db.query(
    `INSERT INTO inscriptions (parent_id, structure_id, personne_id, origine) VALUES ($1, $2, $3, 'PORTAIL')
     ON CONFLICT (parent_id, structure_id) DO NOTHING`, [req.user.id, structureId, enfantId]);
  await notifierStructure(db, structureId, ['MEDECIN', 'SECRETAIRE', 'ADMIN_STRUCTURE'], {
    type: 'NOUVELLE_DEMANDE',
    titre: t.priorite === 'URGENT' ? 'Nouvelle demande URGENTE' : 'Nouvelle demande de prise en charge',
    corps: `Dossier ${suivi.numero_dossier} — priorité ${t.priorite.toLowerCase()}`,
    data: { suivi_id: suivi.id, structure_id: structureId },
  });
  return { suivi: { ...suiviPublic(suivi), structure_nom: st.nom }, triage: t, existait: false };
}

async function demander(req, res) {
  const { enfant_id: enfantId, structure_id: structureId, motif, depistage_id: depistageId } = req.body;
  const data = await ctx(req, async (db) => {
    const r = await ouvrirSuivi(db, req, { enfantId, structureId, motif, depistageId });
    if (r.existait) throw conflict('Une demande existe déjà pour cette personne dans cet établissement', 'ALREADY_REQUESTED');
    return { suivi: r.suivi, triage: r.triage };
  });
  res.status(201).json(data);
}

// ── GET /api/suivis ────────────────────────────────────────────────────────
// Parent : ses dossiers. Professionnel : file de la structure active, triée par urgence.
async function lister(req, res) {
  const { statut, priorite } = req.validQuery;
  const data = await ctx(req, async (db) => {
    const cond = []; const p = [];
    if (statut) { p.push(statut); cond.push(`s.statut = $${p.length}`); }
    if (priorite) { p.push(priorite); cond.push(`s.priorite = $${p.length}`); }
    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
    const { rows } = await db.query(
      `SELECT s.*, st.nom AS structure_nom, e.prenom_chiffre, e.nom_chiffre, e.mois_naissance, e.sexe,
              e.date_naissance_chiffre, e.region AS enfant_region, e.langue_maison, e.parent_id AS e_parent,
              e.scolarise, e.archive, e.created_at AS e_created,
              u.prenom AS referent_prenom, u.nom AS referent_nom
       FROM suivis s
       JOIN structures st ON st.id = s.structure_id
       JOIN enfants e ON e.id = s.enfant_id
       LEFT JOIN users u ON u.id = s.referent_id
       ${where}
       ORDER BY ${ORDRE}`, p);
    return rows.map((r) => ({
      ...suiviPublic(r),
      structure_nom: r.structure_nom,
      referent: r.referent_id ? `${r.referent_prenom} ${r.referent_nom}` : null,
      enfant: enfantPublic({
        id: r.enfant_id, parent_id: r.e_parent, prenom_chiffre: r.prenom_chiffre, nom_chiffre: r.nom_chiffre,
        date_naissance_chiffre: r.date_naissance_chiffre, mois_naissance: r.mois_naissance, sexe: r.sexe,
        region: r.enfant_region, langue_maison: r.langue_maison, scolarise: r.scolarise, archive: r.archive, created_at: r.e_created,
      }),
    }));
  });
  const resume = { URGENT: 0, PRIORITAIRE: 0, NORMAL: 0 };
  data.filter((s) => ['DEMANDE', 'ACTIF'].includes(s.statut)).forEach((s) => { resume[s.priorite] += 1; });
  res.json({ suivis: data, total: data.length, resume });
}

// ── GET /api/suivis/:id ────────────────────────────────────────────────────
async function detail(req, res) {
  const data = await ctx(req, async (db) => {
    const { rows } = await db.query(
      `SELECT s.*, st.nom AS structure_nom FROM suivis s JOIN structures st ON st.id = s.structure_id WHERE s.id = $1`,
      [req.params.id]);
    if (!rows[0]) throw notFound('Dossier introuvable');
    const s = rows[0];
    const { rows: [e] } = await db.query('SELECT * FROM enfants WHERE id = $1', [s.enfant_id]);
    const { rows: deps } = await db.query(
      `SELECT id, questionnaire_code, score, score_max, niveau, alertes, created_at
       FROM depistages WHERE enfant_id = $1 ORDER BY created_at DESC`, [s.enfant_id]);
    const { rows: rdv } = await db.query(
      `SELECT id, type, statut, date_souhaitee, date_confirmee, priorite FROM rendez_vous
       WHERE suivi_id = $1 ORDER BY coalesce(date_confirmee, date_souhaitee) DESC`, [s.id]);
    return {
      suivi: { ...suiviPublic(s), structure_nom: s.structure_nom, motif: dechiffrer(s.motif_chiffre) },
      enfant: enfantPublic(e),
      depistages: deps,
      rendez_vous: rdv,
    };
  });
  res.json(data);
}

// ── PUT /api/suivis/:id  (médecin / admin) ─────────────────────────────────
// Accepter, refuser, clore, désigner un référent, modifier la priorité proposée par l'IA
async function decider(req, res) {
  const b = req.body;
  const data = await ctx(req, async (db) => {
    const { rows: [s] } = await db.query('SELECT * FROM suivis WHERE id = $1 AND structure_id = $2', [req.params.id, req.user.structure_id]);
    if (!s) throw notFound('Dossier introuvable');
    const sets = []; const p = [];
    const set = (col, v) => { p.push(v); sets.push(`${col} = $${p.length}`); };
    if (b.statut) set('statut', b.statut);
    if (b.referent_id !== undefined) {
      if (b.referent_id) {
        const { rowCount } = await db.query(
          "SELECT 1 FROM membres_structure WHERE user_id = $1 AND structure_id = $2 AND statut = 'ACTIF' AND role IN ('MEDECIN','THERAPEUTE')",
          [b.referent_id, req.user.structure_id]);
        if (!rowCount) throw badRequest('Le référent doit être un médecin ou thérapeute de la structure', 'INVALID_REFERENT');
      }
      set('referent_id', b.referent_id);
    }
    if (b.priorite && b.priorite !== s.priorite) {
      if (req.user.role !== 'MEDECIN' && req.user.role !== 'ADMIN_STRUCTURE') throw forbidden('Seul un médecin peut modifier la priorité');
      const raisons = [...(s.triage_raisons || []), {
        points: 0,
        texte: `Priorité modifiée par le médecin (${s.priorite} → ${b.priorite})${b.justification ? ` : ${b.justification}` : ''}`,
        manuel: true, par: req.user.id, le: new Date().toISOString(),
      }];
      set('priorite', b.priorite);
      set('triage_raisons', JSON.stringify(raisons));
    }
    if (!sets.length) throw badRequest('Aucune modification', 'NO_FIELDS');
    p.push(s.id);
    const { rows } = await db.query(`UPDATE suivis SET ${sets.join(', ')} WHERE id = $${p.length} RETURNING *`, p);

    // Dossier accepté → l'inscription de la famille dans l'établissement devient active
    if (b.statut === 'ACTIF') {
      await db.query("UPDATE inscriptions SET statut = 'ACTIVE', traite_par = $3 WHERE parent_id = $1 AND structure_id = $2 AND statut = 'DEMANDEE'",
        [s.parent_id, s.structure_id, req.user.id]);
    }
    if (b.statut && b.statut !== s.statut) {
      const messages = {
        ACTIF: 'Votre demande de prise en charge a été acceptée.',
        REFUSE: 'Votre demande n’a pas pu être acceptée. Consultez l’application pour d’autres structures.',
        CLOS: 'Le suivi a été clôturé.',
      };
      if (messages[b.statut]) {
        await notifier(db, s.parent_id, {
          type: 'SUIVI_' + b.statut, titre: 'Mise à jour de votre dossier', corps: messages[b.statut],
          data: { suivi_id: s.id },
        });
      }
    }
    return suiviPublic(rows[0]);
  });
  res.json({ suivi: data });
}

// ── POST /api/suivis/:id/recalculer  (professionnel) ───────────────────────
async function recalculer(req, res) {
  const data = await ctx(req, async (db) => {
    const { rows: [s] } = await db.query('SELECT * FROM suivis WHERE id = $1', [req.params.id]);
    if (!s) throw notFound('Dossier introuvable');
    const jours = Math.floor((Date.now() - new Date(s.created_at).getTime()) / 86400000);
    const t = await calculerTriage(db, s.enfant_id, { joursAttente: jours });
    await db.query('UPDATE suivis SET priorite = $1, triage_score = $2, triage_raisons = $3 WHERE id = $4',
      [t.priorite, t.score, JSON.stringify(t.raisons), s.id]);
    return t;
  });
  res.json({ triage: data });
}

function suiviPublic(s) {
  return {
    id: s.id, enfant_id: s.enfant_id, parent_id: s.parent_id, structure_id: s.structure_id,
    numero_dossier: s.numero_dossier, referent_id: s.referent_id, statut: s.statut, priorite: s.priorite,
    triage_score: s.triage_score, triage_raisons: s.triage_raisons, depistage_id: s.depistage_id,
    created_at: s.created_at, updated_at: s.updated_at,
  };
}

module.exports = {
  ouvrirSuivi, demander, lister, detail, decider, recalculer };
