'use strict';
/**
 * ASSISTANT VOCAL — compréhension de la demande d'un parent (texte issu de la transcription).
 *
 * Choix assumé : PAS de modèle génératif (type ChatGPT) pour répondre à un parent qui ne lit pas.
 *   - Il ne peut pas vérifier une réponse inventée (« hallucination ») : risque médical réel.
 *   - Les réponses sont donc des phrases VALIDÉES à l'avance (enregistrées dans sa langue),
 *     et l'assistant déclenche une action utile (ouvrir la carte, le rendez-vous, le test)
 *     ou transmet le message à l'équipe soignante, qui répond elle-même.
 *
 * Méthode : mots-clés par intention (français, wolof, pulaar, mandinka, bambara, diola),
 * tolérants aux fautes de transcription (distance d'édition), + l'IA émotionnelle existante
 * pour repérer une détresse grave. Explicable : on renvoie les mots reconnus.
 * Les lexiques en langues nationales sont un point de départ À VALIDER et enrichir avec
 * des locuteurs natifs (COPEX, CEPIAD) à partir des vrais messages.
 */
const { analyser } = require('./emotion');

// Sans humeur déclarée (5 = neutre) : seul le contenu du message compte
const analyserTexte = (texte) => analyser(5, texte);

const INTENTIONS = {
  URGENCE: {
    priorite: 0,
    mots: ['urgence', 'urgent', 'convulsion', 'convulse', 'crise', 'evanoui', 'inconscient', 'saigne', 'samu', 'ambulance',
      'daanu', 'dafa daanu', 'xuus', 'yaram wu tang', 'emergency', 'seizure', 'noppi', 'faat', 'dafay faat'],
  },
  TROUVER_STRUCTURE: {
    priorite: 2,
    mots: ['hopital', 'hôpital', 'opital', 'lopitaan', 'loppitaan', 'loppitam', 'lopital', 'clinique', 'centre', 'docteur',
      'medecin', 'médecin', 'fajkat', 'doktoor', 'ecole', 'école', 'ekool', 'lekool', 'daara', 'kër', 'ker', 'xaleyi',
      'cepiad', 'fann', 'orthophoniste', 'psychologue', 'jege', 'jegee', 'fan la', 'fu', 'where', 'hospital', 'doctor', 'school',
      'safrumaa', 'dokotoro', 'lopitali'],
  },
  RENDEZ_VOUS: {
    priorite: 3,
    mots: ['rendez', 'rendezvous', 'randewu', 'randevu', 'rdv', 'consultation', 'waxtu', 'appointment', 'ëllëg', 'elleg', 'bis bi'],
  },
  TEST_ENFANT: {
    priorite: 4,
    mots: ['parle pas', 'parler', 'regarde pas', 'tester', 'test', 'autisme', 'hyperactif', 'retard', 'apprendre', 'comprend pas',
      'waxul', 'wax', 'déggul', 'deggul', 'xoolul', 'xool', 'dox', 'doxul', 'jangul', 'jàng', 'xam', 'xamul', 'feebar', 'feebaar',
      'doesnt talk', 'speak', 'autism', 'delay'],
  },
  AIDE_APPLI: {
    priorite: 5,
    mots: ['comment', 'application', 'appli', 'utiliser', 'naka', 'nan la', 'how', 'help', 'ndimbal', 'dimbali', 'jàppale', 'jappale'],
  },
  SALUTATION: {
    priorite: 9,
    mots: ['bonjour', 'salut', 'salam', 'salaam', 'asalaa', 'assalamou', 'maalekum', 'malekum', 'nanga def', 'jamm', 'hello', 'hi',
      'jam tan', 'no ngoolu', 'i ni ce'],
  },
};

/** Réponses validées : clé du fichier audio (assets/voix/<langue>/<cle>.mp3) + texte + action à l'écran */
const REPONSES = {
  URGENCE: { cle: 'assistant_urgence', fr: 'Si votre enfant est en danger maintenant, appelez le SAMU au 1515. J’ai aussi prévenu votre équipe soignante.', action: { type: 'APPELER', numero: '1515' } },
  CRISE: { cle: 'crise', fr: 'Vous n’êtes pas seul. Parlez dès maintenant à une personne de confiance. En cas de danger, appelez le SAMU au 1515.', action: { type: 'APPELER', numero: '1515' } },
  TROUVER_STRUCTURE: { cle: 'assistant_structure', fr: 'Voici les centres qui peuvent aider votre enfant, les plus proches en premier. Appuyez sur le bouton vert pour appeler.', action: { type: 'OUVRIR', route: '/trouver' } },
  RENDEZ_VOUS: { cle: 'assistant_rdv', fr: 'Voici vos rendez-vous. Appuyez sur le bouton plus pour en demander un.', action: { type: 'OUVRIR', route: '/rendez-vous' } },
  TEST_ENFANT: { cle: 'assistant_test', fr: 'Je vous propose un petit test : j’écoute avec vous les questions et vous appuyez sur la réponse. Ce n’est pas un diagnostic.', action: { type: 'OUVRIR', route: '/tests' } },
  AIDE_APPLI: { cle: 'assistant_aide', fr: 'Appuyez sur le haut-parleur jaune de chaque page pour l’entendre dans votre langue. Vous pouvez aussi rejoindre le groupe des parents.', action: { type: 'OUVRIR', route: '/communaute' } },
  SALUTATION: { cle: 'assistant_salut', fr: 'Bonjour, je suis l’assistant de SAMA XHEL. Dites-moi ce dont votre enfant a besoin.', action: null },
  TRANSMIS: { cle: 'assistant_transmis', fr: 'J’ai bien reçu votre message. Je l’ai transmis à l’équipe qui suit votre enfant. Elle vous répondra.', action: null },
  PAS_COMPRIS: { cle: 'assistant_repeter', fr: 'Je n’ai pas bien compris. Pouvez-vous répéter, plus près du téléphone ?', action: null },
  SANS_IA: { cle: 'assistant_transmis', fr: 'J’ai bien reçu votre message. Je l’ai transmis à l’équipe qui suit votre enfant. Elle vous répondra.', action: null },
};

function normaliser(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, ' ').replace(/[^a-z0-9ñŋ\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Distance d'édition bornée (Levenshtein) — tolère les petites erreurs de transcription */
function distance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prec = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cour = [i];
    let minLigne = i;
    for (let j = 1; j <= b.length; j++) {
      cour[j] = Math.min(prec[j] + 1, cour[j - 1] + 1, prec[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      minLigne = Math.min(minLigne, cour[j]);
    }
    if (minLigne > max) return max + 1;
    prec = cour;
  }
  return prec[b.length];
}

function trouve(texte, mots, motCle) {
  const cle = normaliser(motCle);
  if (cle.includes(' ')) return texte.includes(cle);
  const tolerance = cle.length >= 7 ? 2 : cle.length >= 5 ? 1 : 0;
  return mots.some((m) => (tolerance ? distance(m, cle, tolerance) <= tolerance : m === cle));
}

/**
 * @param {string} transcription texte reconnu
 * @param {{ confiance?: number, aUneEquipe?: boolean }} contexte
 * @returns {{ intention, mots, emotion, reponse, transmettre }}
 */
function comprendre(transcription, { confiance = 1, aUneEquipe = false } = {}) {
  const texte = normaliser(transcription);
  const mots = texte.split(' ').filter(Boolean);
  const emotion = analyserTexte(transcription || '');

  if (emotion.niveau === 'CRISE') {
    return { intention: 'CRISE', mots: (emotion.declencheurs || []).map((d) => d.mot), emotion, reponse: REPONSES.CRISE, transmettre: true };
  }
  if (!mots.length || confiance < 0.5) {
    return { intention: 'PAS_COMPRIS', mots: [], emotion, reponse: REPONSES.PAS_COMPRIS, transmettre: false };
  }
  const resultats = Object.entries(INTENTIONS)
    .map(([nom, def]) => ({ nom, priorite: def.priorite, trouves: def.mots.filter((m) => trouve(texte, mots, m)) }))
    .filter((r) => r.trouves.length)
    .sort((a, b) => b.trouves.length - a.trouves.length || a.priorite - b.priorite);

  // L'urgence l'emporte toujours, même si d'autres mots sont plus nombreux
  const urgence = resultats.find((r) => r.nom === 'URGENCE');
  const choix = urgence || resultats.find((r) => r.nom !== 'SALUTATION') || resultats[0];

  if (!choix) {
    // Rien de reconnu : c'est probablement une question pour le soignant
    return aUneEquipe
      ? { intention: 'QUESTION_SOIGNANT', mots: [], emotion, reponse: REPONSES.TRANSMIS, transmettre: true }
      : { intention: 'PAS_COMPRIS', mots: [], emotion, reponse: REPONSES.PAS_COMPRIS, transmettre: false };
  }
  const transmettre = choix.nom === 'URGENCE' || (aUneEquipe && ['TEST_ENFANT', 'RENDEZ_VOUS'].includes(choix.nom))
    || ['ELEVE'].includes(emotion.niveau);
  return { intention: choix.nom, mots: choix.trouves, emotion, reponse: REPONSES[choix.nom], transmettre };
}

module.exports = { comprendre, REPONSES, INTENTIONS, normaliser };
