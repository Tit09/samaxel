'use strict';
/**
 * IA D'ORIENTATION — recommande au parent les structures (hôpital, centre,
 * école, thérapie) les plus adaptées à SON enfant.
 *
 * Score de pertinence sur 100, chaque critère étant expliqué :
 *   trouble pris en charge (35) · services utiles (15) · distance (20)
 *   coût adapté au budget (10) · délai d'attente (10) · langue parlée (5)
 *   structure vérifiée / partenaire SAMA XHEL (5)
 * Une structure qui n'accueille pas l'âge de l'enfant est exclue.
 */

const R_TERRE_KM = 6371;
function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R_TERRE_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const COUTS = ['gratuit', 'faible', 'moyen', 'élevé'];
const ECOLES = ['ECOLE_INCLUSIVE', 'ECOLE_SPECIALISEE'];

/**
 * @param {Array<object>} structures lignes de la table structures
 * @param {object} besoin
 * @param {string[]} besoin.troubles     ex. ['TSA', 'LANGAGE']
 * @param {string[]} [besoin.services]   ex. ['DIAGNOSTIC', 'ORTHOPHONIE']
 * @param {number}   [besoin.ageMois]
 * @param {number}   [besoin.lat] [besoin.lng]
 * @param {string}   [besoin.region]
 * @param {number}   [besoin.budget]     0 gratuit … 3 élevé
 * @param {string}   [besoin.langue]     langue de la famille (wo, ff, srr…)
 * @param {boolean}  [besoin.ecole]      cherche une école / scolarisation
 * @param {boolean}  [besoin.diagnosticPose] l'enfant a déjà un diagnostic
 */
function recommander(structures, besoin, limite = 10) {
  const troubles = besoin.troubles || [];
  const services = new Set(besoin.services || []);
  if (!besoin.diagnosticPose) services.add('DIAGNOSTIC');

  const resultats = [];
  for (const s of structures) {
    if (!s.actif) continue;
    if (besoin.ageMois != null && (besoin.ageMois < s.age_min_mois || besoin.ageMois > s.age_max_mois)) continue;
    const estEcole = ECOLES.includes(s.type);
    if (besoin.ecole === true && !estEcole) continue;
    if (besoin.ecole === false && estEcole) continue;

    const raisons = [];
    let score = 0;

    // Trouble pris en charge
    const communs = troubles.filter((t) => s.troubles.includes(t));
    if (troubles.length && communs.length === 0) continue;
    const pTrouble = troubles.length ? Math.round(35 * (communs.length / troubles.length)) : 20;
    score += pTrouble;
    if (communs.length) raisons.push(`Prend en charge : ${communs.join(', ')}`);

    // Services utiles
    const servCommuns = [...services].filter((x) => s.services.includes(x));
    if (services.size) {
      const p = Math.round(15 * (servCommuns.length / services.size));
      score += p;
      if (servCommuns.length) raisons.push(`Propose : ${servCommuns.map(libelleService).join(', ')}`);
    }

    // Distance
    let distance = null;
    if (besoin.lat != null && besoin.lng != null && s.latitude != null && s.longitude != null) {
      distance = Math.round(distanceKm(besoin.lat, besoin.lng, Number(s.latitude), Number(s.longitude)) * 10) / 10;
      const p = Math.round(20 * Math.max(0, 1 - distance / 150));
      score += p;
      raisons.push(`À ${distance} km de chez vous`);
    } else if (besoin.region && s.region && s.region.toLowerCase() === besoin.region.toLowerCase()) {
      score += 14;
      raisons.push(`Dans votre région (${s.region})`);
    }

    // Coût
    if (besoin.budget != null) {
      if (s.cout_niveau <= besoin.budget) {
        score += 10;
        raisons.push(`Coût ${COUTS[s.cout_niveau]}, adapté à votre budget`);
      } else {
        score -= 5;
      }
    } else if (s.cout_niveau <= 1) {
      score += 5;
      raisons.push(`Coût ${COUTS[s.cout_niveau]}`);
    }

    // Délai
    if (s.delai_attente_jours != null) {
      score += Math.round(10 * (1 - Math.min(s.delai_attente_jours, 180) / 180));
      if (s.delai_attente_jours <= 14) raisons.push('Rendez-vous possible sous 2 semaines');
    } else {
      score += 4;
    }

    // Langue
    if (besoin.langue && (s.langues || []).includes(besoin.langue)) {
      score += 5;
      raisons.push('On y parle votre langue');
    }

    // Confiance
    if (s.verifie) score += 2;
    if (s.partenaire) {
      score += 3;
      raisons.push('Rendez-vous en ligne via SAMA XHEL');
    }

    resultats.push({
      structure: s,
      score: Math.max(0, Math.min(100, score)),
      distance_km: distance,
      raisons,
    });
  }

  return resultats
    .sort((a, b) => b.score - a.score || (a.distance_km ?? 1e9) - (b.distance_km ?? 1e9))
    .slice(0, limite);
}

const SERVICES = {
  DIAGNOSTIC: 'diagnostic',
  PEDOPSYCHIATRIE: 'pédopsychiatrie',
  PSYCHIATRIE: 'psychiatrie',
  NEUROPEDIATRIE: 'neuropédiatrie',
  ORTHOPHONIE: 'orthophonie',
  PSYCHOMOTRICITE: 'psychomotricité',
  PSYCHOLOGIE: 'psychologie',
  ERGOTHERAPIE: 'ergothérapie',
  EDUCATION_SPECIALISEE: 'éducation spécialisée',
  SCOLARISATION: 'scolarisation adaptée',
  ADDICTOLOGIE: 'addictologie',
  ORL: 'ORL / audition',
  GUIDANCE_PARENTALE: 'accompagnement des parents',
  TELECONSULTATION: 'téléconsultation',
  KINESITHERAPIE: 'kinésithérapie',
};
const libelleService = (c) => SERVICES[c] || c.toLowerCase();

module.exports = { recommander, distanceKm, SERVICES };
