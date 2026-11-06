'use strict';
const { pool, ctx } = require('../config/database');
const { QUESTIONNAIRES, ECHELLES, parCode } = require('../data/questionnaires');
const { scorer } = require('../ia/scoring');
const { recommander } = require('../ia/orientation');
const { calculerTriage, recalculerSuivis } = require('../services/triage.service');
const { chiffrerJson } = require('../utils/crypto');
const { ageEnMois, depistagePublic } = require('../utils/format');
const { notFound, badRequest } = require('../utils/errors');
const { CHAMPS_PUBLICS } = require('./structures.controller');

/** Questionnaire avec ses échelles résolues (pour l'affichage dans l'app et le site) */
function questionnairePublic(q) {
  return {
    ...q,
    questions: q.questions.map((x) => ({
      ...x,
      options: ECHELLES[x.echelle],
      audio_key: `${q.code.toLowerCase()}_q${x.id}`,
    })),
  };
}

// ── GET /api/questionnaires?age_mois=  (public) ────────────────────────────
function lister(req, res) {
  const age = req.validQuery.age_mois;
  // TOUS les tests sont proposés, quel que soit l'âge : ceux adaptés à l'âge d'abord.
  // (Un adulte peut être autiste ou avoir un TDAH jamais repéré ; un proche peut remplir pour lui.)
  const adapte = (q) => age === undefined || (age >= q.age_min_mois && age <= q.age_max_mois);
  const liste = QUESTIONNAIRES
    .map((q) => ({
      code: q.code, titre: q.titre, trouble: q.trouble, icone: q.icone, description: q.description,
      age_min_mois: q.age_min_mois, age_max_mois: q.age_max_mois, repondant: q.repondant,
      nb_questions: q.questions.length, reference: q.reference, adapte: adapte(q),
    }))
    .sort((a, b) => Number(b.adapte) - Number(a.adapte));
  res.json({ questionnaires: liste, avertissement: 'Outils de repérage : ils ne remplacent pas un diagnostic médical.' });
}

// ── GET /api/questionnaires/:code ──────────────────────────────────────────
function detail(req, res) {
  const q = parCode[req.params.code.toUpperCase()];
  if (!q) throw notFound('Questionnaire introuvable');
  res.json({ questionnaire: questionnairePublic(q) });
}

// ── POST /api/questionnaires/:code/evaluer  (public, site vitrine) ─────────
// Calcule le résultat SANS rien enregistrer (visiteur anonyme)
async function evaluerAnonyme(req, res) {
  const q = parCode[req.params.code.toUpperCase()];
  if (!q) throw notFound('Questionnaire introuvable');
  const r = scorer(q, req.body.reponses);
  let recommandations = [];
  if (r.niveau !== 'FAIBLE') {
    const { rows } = await pool.query(`SELECT ${CHAMPS_PUBLICS}, actif FROM structures WHERE actif = true`);
    recommandations = recommander(rows, {
      troubles: [q.trouble], services: q.services, ageMois: req.body.age_mois,
      lat: req.body.lat, lng: req.body.lng, region: req.body.region, langue: req.body.langue,
    }, 5);
  }
  res.json({ resultat: r, recommandations, enregistre: false });
}

// ── POST /api/depistages  (parent) ─────────────────────────────────────────
async function soumettre(req, res) {
  const { questionnaire_code: code, enfant_id: enfantId, reponses, lat, lng, budget } = req.body;
  const q = parCode[code.toUpperCase()];
  if (!q) throw notFound('Questionnaire introuvable');
  const r = scorer(q, reponses);

  const data = await ctx(req, async (db) => {
    let ageMois = null; let enfant = null;
    if (enfantId) {
      const { rows } = await db.query('SELECT * FROM enfants WHERE id = $1 AND parent_id = $2', [enfantId, req.user.id]);
      enfant = rows[0];
      if (!enfant) throw notFound('Personne suivie introuvable');
      ageMois = ageEnMois(enfant.mois_naissance);
    }
    // Sans personne choisie : le résultat oriente quand même, mais n'est rattaché à aucun dossier.

    // Insertion d'abord (pour que le tri tienne compte de ce nouveau résultat)
    const { rows: [dep] } = await db.query(
      `INSERT INTO depistages (parent_id, enfant_id, questionnaire_code, questionnaire_version,
                               reponses_chiffre, score, score_max, niveau, alertes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [req.user.id, enfantId || null, q.code, q.version, chiffrerJson(reponses),
        r.score, r.score_max, r.niveau, r.alertes.map((a) => a.code)],
    );

    let triage = null;
    if (enfantId) {
      triage = await calculerTriage(db, enfantId);
      await db.query('UPDATE depistages SET triage = $1 WHERE id = $2', [JSON.stringify(triage), dep.id]);
      dep.triage = triage;
      await recalculerSuivis(db, enfantId);
    }

    let recommandations = [];
    if (r.niveau !== 'FAIBLE' || r.alertes.length) {
      const { rows } = await db.query(`SELECT ${CHAMPS_PUBLICS}, actif FROM structures WHERE actif = true`);
      recommandations = recommander(rows, {
        troubles: [q.trouble], services: q.services, ageMois,
        lat, lng, region: enfant?.region, langue: enfant?.langue_maison, budget,
      }, 5);
    }
    return { depistage: depistagePublic(dep), resultat: r, triage, recommandations };
  });
  res.status(201).json(data);
}

// ── GET /api/depistages?enfant_id= ─────────────────────────────────────────
async function historique(req, res) {
  const { enfant_id: enfantId } = req.validQuery;
  const data = await ctx(req, async (db) => {
    const p = []; let where = '';
    if (enfantId) { p.push(enfantId); where = 'WHERE enfant_id = $1'; }
    const { rows } = await db.query(`SELECT * FROM depistages ${where} ORDER BY created_at DESC LIMIT 100`, p);
    return rows.map((d) => depistagePublic(d));
  });
  res.json({ depistages: data });
}

// ── GET /api/depistages/:id  (avec les réponses déchiffrées) ───────────────
async function lire(req, res) {
  const data = await ctx(req, async (db) => {
    const { rows } = await db.query('SELECT * FROM depistages WHERE id = $1', [req.params.id]);
    if (!rows[0]) throw notFound('Dépistage introuvable');
    return depistagePublic(rows[0], { avecReponses: true });
  });
  res.json({ depistage: data });
}

module.exports = { lister, detail, evaluerAnonyme, soumettre, historique, lire };
