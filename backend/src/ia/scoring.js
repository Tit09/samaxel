'use strict';
/**
 * Calcul du score d'un questionnaire de repérage.
 * Fait côté SERVEUR : l'application ne peut pas falsifier le niveau de risque.
 */
const { ECHELLES, CONSEILS } = require('../data/questionnaires');
const { badRequest } = require('../utils/errors');

/**
 * @param {object} qn questionnaire (data/questionnaires.js)
 * @param {Record<string, number>} reponses { "1": 2, "2": 0, ... }
 */
function scorer(qn, reponses) {
  let score = 0;
  let scoreMax = 0;
  const alertes = [];
  const parId = {};

  for (const question of qn.questions) {
    const v = reponses[String(question.id)];
    const echelle = ECHELLES[question.echelle];
    const valeursPossibles = echelle.map((o) => o.valeur);
    if (v === undefined || v === null) {
      throw badRequest(`Réponse manquante à la question ${question.id}`, 'MISSING_ANSWER');
    }
    if (!valeursPossibles.includes(v)) {
      throw badRequest(`Réponse invalide à la question ${question.id}`, 'INVALID_ANSWER');
    }
    parId[question.id] = v;

    if (question.type === 'echelle') {
      score += v;
      scoreMax += Math.max(...valeursPossibles);
    }
    const a = question.alerte;
    if (a && v >= (a.seuil ?? 1)) {
      alertes.push({ code: a.code, gravite: a.gravite, message: a.message, question: question.id });
    }
  }

  // Sous-échelles (TDAH : inattention / hyperactivité)
  const sousScores = (qn.sous_echelles || []).map((se) => {
    const s = se.ids.reduce((acc, id) => acc + (parId[id] || 0), 0);
    return { code: se.code, libelle: se.libelle, score: s, max: se.ids.length * 3, eleve: s >= se.seuil_eleve };
  });

  let niveau = 'FAIBLE';
  if (score >= qn.seuils.eleve || sousScores.some((s) => s.eleve)) niveau = 'ELEVE';
  else if (score >= qn.seuils.modere) niveau = 'MODERE';

  return {
    score,
    score_max: scoreMax,
    pourcentage: scoreMax ? Math.round((score / scoreMax) * 100) : 0,
    niveau,
    sous_scores: sousScores,
    alertes,
    conseil: CONSEILS[niveau],
  };
}

module.exports = { scorer };
