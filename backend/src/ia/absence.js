'use strict';
/**
 * IA PRÉDICTIVE : RISQUE D'ABSENCE À UN RENDEZ-VOUS — mémoire, section 4.3.6.
 *
 * Régression logistique : risque = 1 / (1 + e^-(b0 + Σ bi·xi)).
 * Les facteurs sont ceux que la littérature sur les rendez-vous non honorés retrouve le plus
 * souvent : absences passées, délai long entre la prise et la date du rendez-vous, premier
 * rendez-vous dans la structure, famille peu joignable, application peu ouverte.
 *
 * ⚠ Les coefficients ci-dessous sont des valeurs INITIALES fixées à la main (pas encore de données
 *   réelles : la plateforme ne contient que des données fictives). Le script
 *   scripts/entrainer-absence.js les ré-estime sur l'historique réel (statuts TERMINE / ABSENT)
 *   dès qu'il y a assez de rendez-vous. Le modèle est volontairement simple et EXPLICABLE :
 *   chaque score est accompagné de ses facteurs, affichés à la secrétaire.
 *
 * Usage : un risque élevé déclenche un rappel supplémentaire 48 h avant, sur tous les canaux.
 */

const fs = require('fs');
const path = require('path');

const COEFFICIENTS_INITIAUX = {
  constante: -2.2,
  absences_passees: 0.9,     // par absence (plafonné à 3)
  taux_presence: -1.2,       // part des rendez-vous honorés (0 à 1)
  delai_long: 0.8,           // rendez-vous pris plus de 14 jours à l'avance
  premier_rdv: 0.5,          // première venue dans cette structure
  injoignable: 0.6,          // ni Telegram ni WhatsApp relié (SMS seulement)
  inactif: 0.5,              // pas ouvert l'application depuis plus de 30 jours
  teleconsultation: -0.4,    // pas de déplacement
};

// Coefficients ré-estimés sur les données réelles (scripts/entrainer-absence.js), s'ils existent
let COEFFICIENTS = COEFFICIENTS_INITIAUX;
try {
  const appris = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'modele-absence.json'), 'utf8'));
  COEFFICIENTS = { ...COEFFICIENTS_INITIAUX, ...appris.coefficients };
} catch { /* pas encore de modèle entraîné */ }

function caracteristiques(r) {
  const passes = (r.absences || 0) + (r.honores || 0);
  return {
    absences_passees: Math.min(r.absences || 0, 3),
    taux_presence: passes ? (r.honores || 0) / passes : 0.5,
    delai_long: Number(r.delai_jours) > 14 ? 1 : 0,
    premier_rdv: r.premier ? 1 : 0,
    injoignable: !r.telegram && !r.whatsapp ? 1 : 0,
    inactif: Number(r.derniere_connexion_jours) > 30 ? 1 : 0,
    teleconsultation: r.type === 'TELECONSULTATION' ? 1 : 0,
  };
}

const LIBELLES = {
  absences_passees: 'absences précédentes', delai_long: 'rendez-vous pris longtemps à l’avance',
  premier_rdv: 'première venue', injoignable: 'joignable seulement par SMS', inactif: 'application peu ouverte',
  taux_presence: 'peu de rendez-vous honorés', teleconsultation: 'téléconsultation',
};

/** @returns {{risque:number, facteurs:{facteur:string, poids:number}[]}} risque en % (0-100) */
function predire(r, coef = COEFFICIENTS) {
  const x = caracteristiques(r);
  const contributions = Object.entries(x).map(([k, v]) => [k, (coef[k] || 0) * v]);
  const logit = coef.constante + contributions.reduce((s, [, c]) => s + c, 0);
  const risque = Math.round(100 / (1 + Math.exp(-logit)));
  const facteurs = contributions
    .filter(([k, c]) => c > 0.05 || (k === 'taux_presence' && x.taux_presence < 0.5))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, c]) => ({ facteur: LIBELLES[k], poids: Math.round(c * 100) / 100 }));
  return { risque, facteurs };
}

module.exports = { predire, caracteristiques, COEFFICIENTS, COEFFICIENTS_INITIAUX };
