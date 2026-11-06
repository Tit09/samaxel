'use strict';
/**
 * Rassemble les données d'un enfant et appelle l'IA de tri.
 * S'exécute dans le contexte RLS de l'appelant (parent ou professionnel).
 */
const { trier } = require('../ia/triage');
const { ageEnMois } = require('../utils/format');

async function calculerTriage(db, enfantId, { joursAttente = 0 } = {}) {
  const { rows: [enfant] } = await db.query('SELECT mois_naissance FROM enfants WHERE id = $1', [enfantId]);
  const { rows: depistages } = await db.query(
    `SELECT questionnaire_code, niveau, alertes, score, score_max
     FROM depistages
     WHERE enfant_id = $1 AND created_at > NOW() - INTERVAL '6 months'
     ORDER BY created_at DESC`,
    [enfantId],
  );
  const { rows: [humeur] } = await db.query(
    `SELECT analyse_ia FROM humeur_journal
     WHERE enfant_id = $1 AND created_at > NOW() - INTERVAL '14 days' AND analyse_ia ? 'niveau'
     ORDER BY created_at DESC LIMIT 1`,
    [enfantId],
  );
  return trier({
    depistages: depistages.map((d) => ({
      questionnaire_code: d.questionnaire_code,
      niveau: d.niveau,
      alertes: (d.alertes || []).map((code) => ({ code, gravite: GRAVITE[code] || 'PRIORITAIRE' })),
    })),
    ageMois: enfant ? ageEnMois(enfant.mois_naissance) : null,
    joursAttente,
    detresseParent: humeur ? { niveau: humeur.analyse_ia.niveau, score: humeur.analyse_ia.score_detresse } : null,
  });
}

/** Recalcule la priorité de tous les dossiers ouverts d'un enfant */
async function recalculerSuivis(db, enfantId) {
  const { rows } = await db.query(
    `SELECT id, created_at, priorite FROM suivis
     WHERE enfant_id = $1 AND statut IN ('DEMANDE', 'ACTIF')`,
    [enfantId],
  );
  const resultats = [];
  for (const s of rows) {
    const jours = Math.floor((Date.now() - new Date(s.created_at).getTime()) / 86400000);
    const t = await calculerTriage(db, enfantId, { joursAttente: jours });
    await db.query(
      'UPDATE suivis SET priorite = $1, triage_score = $2, triage_raisons = $3 WHERE id = $4',
      [t.priorite, t.score, JSON.stringify(t.raisons), s.id],
    );
    resultats.push({ suivi_id: s.id, avant: s.priorite, apres: t.priorite });
  }
  return resultats;
}

// Gravité des alertes stockées sous forme de codes
const GRAVITE = {
  REGRESSION: 'URGENT',
  CONVULSIONS: 'URGENT',
  IDEES_SUICIDAIRES: 'URGENT',
  MISE_EN_DANGER: 'PRIORITAIRE',
  AUDITION: 'PRIORITAIRE',
  INTOXICATION: 'PRIORITAIRE',
};

module.exports = { calculerTriage, recalculerSuivis, GRAVITE };
