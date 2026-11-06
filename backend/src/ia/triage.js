'use strict';
/**
 * IA DE TRI (TRIAGE) — aide le médecin à voir en premier les cas les plus urgents.
 *
 * Type : système expert à règles pondérées, EXPLICABLE.
 *  → chaque point du score est justifié par une « raison » lisible.
 *  → l'IA PROPOSE une priorité ; le médecin peut toujours la modifier.
 *
 * Évolution prévue (chapitre 6, perspectives) : quand assez de dossiers réels
 * auront été validés par les médecins, entraîner un modèle d'apprentissage
 * supervisé (ex. gradient boosting) sur ces décisions, en gardant l'explicabilité.
 *
 * Score 0–100 :  ≥ 70 ou alerte URGENT → URGENT ;  ≥ 40 → PRIORITAIRE ;  sinon NORMAL
 */

const POIDS_NIVEAU = { FAIBLE: 5, MODERE: 25, ELEVE: 45 };

/**
 * @param {object} p
 * @param {Array<{questionnaire_code:string, niveau:string, pourcentage?:number, alertes:Array}>} p.depistages
 * @param {number|null} p.ageMois âge de l'enfant
 * @param {number} [p.joursAttente] depuis la demande de prise en charge
 * @param {{niveau:string, score:number}|null} [p.detresseParent] dernière analyse émotionnelle
 */
function trier({ depistages = [], ageMois = null, joursAttente = 0, detresseParent = null }) {
  const raisons = [];
  let score = 0;
  let urgentForce = false;
  const ajouter = (points, texte) => {
    if (points) { score += points; raisons.push({ points, texte }); }
  };

  // 1. Résultat le plus sévère des questionnaires
  const tries = [...depistages].sort((a, b) => POIDS_NIVEAU[b.niveau] - POIDS_NIVEAU[a.niveau]);
  const pire = tries[0];
  if (pire) {
    ajouter(POIDS_NIVEAU[pire.niveau],
      `Questionnaire ${pire.questionnaire_code} : niveau ${({ FAIBLE: 'faible', MODERE: 'modéré', ELEVE: 'élevé' })[pire.niveau] || pire.niveau.toLowerCase()}`);
  }

  // 2. Plusieurs troubles suspectés en même temps (comorbidité)
  const eleves = depistages.filter((d) => d.niveau !== 'FAIBLE').map((d) => d.questionnaire_code);
  const uniques = [...new Set(eleves)];
  if (uniques.length >= 2) ajouter(10, `Plusieurs troubles suspectés (${uniques.join(', ')})`);

  // 3. Signaux d'alerte
  const vus = new Set();
  for (const d of depistages) {
    for (const a of d.alertes || []) {
      if (vus.has(a.code)) continue;
      vus.add(a.code);
      if (a.gravite === 'URGENT') {
        urgentForce = true;
        ajouter(40, `Signal d'alerte : ${libelleAlerte(a.code)}`);
      } else {
        ajouter(20, `Signal à surveiller : ${libelleAlerte(a.code)}`);
      }
    }
  }

  // 4. Fenêtre d'intervention précoce : plus l'enfant est jeune, plus c'est efficace
  if (ageMois !== null && pire && pire.niveau !== 'FAIBLE') {
    if (ageMois < 36) ajouter(15, 'Enfant de moins de 3 ans : intervention précoce plus efficace');
    else if (ageMois < 72) ajouter(8, 'Enfant de moins de 6 ans : période clé du développement');
  }

  // 5. Détresse du parent (journal d'humeur analysé)
  if (detresseParent?.niveau === 'CRISE') {
    urgentForce = true;
    ajouter(30, 'Le parent exprime une détresse grave');
  } else if (detresseParent?.niveau === 'ELEVE') {
    ajouter(10, 'Le parent exprime une forte détresse');
  }

  // 6. Anti-oubli : un dossier qui attend gagne des points chaque semaine
  const semaines = Math.floor((joursAttente || 0) / 7);
  if (semaines > 0) ajouter(Math.min(semaines * 2, 15), `En attente depuis ${semaines} semaine(s)`);

  score = Math.min(100, score);
  let priorite = 'NORMAL';
  if (urgentForce || score >= 70) priorite = 'URGENT';
  else if (score >= 40) priorite = 'PRIORITAIRE';

  return { score, priorite, raisons, version: 'triage-regles-1.0' };
}

const LIBELLES = {
  REGRESSION: 'perte de capacités déjà acquises',
  CONVULSIONS: 'crises / convulsions',
  IDEES_SUICIDAIRES: 'idées de mort ou de se faire du mal',
  MISE_EN_DANGER: 'mises en danger répétées',
  AUDITION: 'suspicion de problème d’audition',
  INTOXICATION: 'antécédent d’intoxication',
};
const libelleAlerte = (code) => LIBELLES[code] || code;

module.exports = { trier, libelleAlerte };
