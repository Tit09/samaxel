'use strict';
/**
 * IA D'ANALYSE ÉMOTIONNELLE — journal d'humeur du parent.
 *
 * Entrées : humeur choisie (1 = très mal … 5 = très bien) + texte libre facultatif
 * (français, anglais, wolof — lexique wolof à enrichir et valider par des locuteurs natifs).
 *
 * Méthode : lexique pondéré par émotion + gestion simple de la négation.
 * Explicable : on renvoie les mots qui ont déclenché chaque émotion.
 *
 * Choix éthique : pas d'analyse du visage par caméra (peu fiable, intrusif,
 * surtout pour des mineurs). Les messages E2EE ne sont PAS analysés
 * (le serveur ne peut pas les lire). L'analyse exige le consentement IA_ANALYSE.
 */

const LEXIQUE = {
  tristesse: {
    poids: 2,
    mots: ['triste', 'tristesse', 'pleure', 'pleurer', 'déprimé', 'déprimée', 'malheureux', 'malheureuse',
      'sans espoir', 'désespéré', 'désespérée', 'chagrin', 'seul', 'seule', 'sad', 'hopeless', 'lonely',
      'tiis', 'naqar', 'jooy'],
  },
  anxiete: {
    poids: 2,
    mots: ['peur', 'inquiet', 'inquiète', 'angoisse', 'angoissé', 'angoissée', 'stress', 'stressé', 'stressée',
      'panique', 'nerveux', 'nerveuse', 'worried', 'anxious', 'scared', 'tiit', 'jaaxle', 'jaxle'],
  },
  epuisement: {
    poids: 2,
    mots: ['fatigué', 'fatiguée', 'épuisé', 'épuisée', 'épuisement', 'à bout', 'n’en peux plus', "n'en peux plus",
      'craque', 'craquer', 'plus la force', 'tired', 'exhausted', 'burnout', 'sonn', 'dama sonn'],
  },
  colere: {
    poids: 1,
    mots: ['colère', 'énervé', 'énervée', 'furieux', 'furieuse', 'marre', 'injuste', 'angry', 'mer'],
  },
  isolement: {
    poids: 2,
    mots: ['personne ne m’aide', "personne ne m'aide", 'rejeté', 'rejetée', 'honte', 'on se moque', 'stigmat',
      'abandonné', 'abandonnée', 'gacce', 'ashamed'],
  },
  espoir: {
    poids: -2,
    mots: ['mieux', 'progrès', 'progresse', 'content', 'contente', 'heureux', 'heureuse', 'merci', 'espoir',
      'fier', 'fière', 'better', 'happy', 'proud', 'neex', 'alhamdoulilah', 'alhamdulillah'],
  },
};

// Expressions de crise : déclenchent toujours le niveau CRISE (aucune pondération)
const CRISE = [
  'me tuer', 'me suicider', 'suicide', 'en finir', 'veux mourir', 'envie de mourir', 'plus envie de vivre',
  'me faire du mal', 'faire du mal à mon enfant', 'kill myself', 'end it all', 'want to die',
  'bëgg dee', 'begg dee', 'dama bëgg dee',
];

const NEGATIONS = ['pas', 'plus', 'jamais', 'non', 'not', "n't", 'no', 'du tout'];

function normaliser(t) {
  return ` ${String(t || '').toLowerCase().replace(/[’']/g, "'").replace(/[.,;:!?()"]/g, ' ').replace(/\s+/g, ' ')} `;
}

function precedeDeNegation(texte, index) {
  const avant = texte.slice(Math.max(0, index - 18), index);
  return NEGATIONS.some((n) => avant.includes(` ${n} `));
}

/**
 * @param {number} humeur 1..5
 * @param {string} [texte]
 */
function analyser(humeur, texte = '') {
  const t = normaliser(texte);
  const emotions = {};
  const declencheurs = [];
  let brut = 0;

  for (const [emotion, { poids, mots }] of Object.entries(LEXIQUE)) {
    for (const mot of mots) {
      const m = normaliser(mot).trim();
      const idx = t.indexOf(` ${m}`);
      if (idx === -1) continue;
      if (precedeDeNegation(t, idx + 1) && poids > 0) continue; // « pas triste »
      emotions[emotion] = (emotions[emotion] || 0) + 1;
      declencheurs.push({ emotion, mot });
      brut += poids;
    }
  }

  const crise = CRISE.some((c) => t.includes(` ${normaliser(c).trim()}`));

  // Humeur déclarée : 1 → +40 … 5 → 0
  const partHumeur = (5 - humeur) * 10;
  const partTexte = Math.max(-20, Math.min(60, brut * 6));
  let score = Math.max(0, Math.min(100, partHumeur + partTexte));

  let niveau = 'FAIBLE';
  if (crise) { niveau = 'CRISE'; score = 100; } else if (score >= 60) niveau = 'ELEVE';
  else if (score >= 35) niveau = 'MODERE';

  const dominante = Object.entries(emotions).filter(([e]) => e !== 'espoir')
    .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  return {
    score_detresse: score,
    niveau,
    emotion_dominante: dominante,
    emotions,
    declencheurs,
    message: MESSAGES[niveau],
    ressources: niveau === 'CRISE' || niveau === 'ELEVE'
      ? [{ nom: 'SAMU Sénégal', telephone: '1515' }]
      : [],
    version: 'emotion-lexique-1.0',
  };
}

const MESSAGES = {
  FAIBLE: 'Merci de partager comment vous allez. Continuez à prendre soin de vous.',
  MODERE: 'Vous traversez une période difficile. Parler à un professionnel ou à un proche peut aider.',
  ELEVE: 'Vous semblez très éprouvé(e). Vous n’êtes pas seul(e) : nous vous conseillons d’en parler rapidement à un professionnel.',
  CRISE: 'Votre sécurité compte avant tout. Appelez le SAMU au 1515 ou rendez-vous aux urgences les plus proches. Parlez dès maintenant à une personne de confiance.',
};

module.exports = { analyser };
