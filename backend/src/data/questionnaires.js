'use strict';
/**
 * Questionnaires de REPÉRAGE (pas de diagnostic) — SAMA XHEL v1.0
 *
 * Sources d'inspiration (formulations adaptées au contexte sénégalais) :
 *  • TSA        : inspiré du M-CHAT-R/F (Robins, Fein & Barton) — dépistage 16–30 mois
 *  • TDAH       : inspiré du SNAP-IV (Swanson, Nolan & Pelham — domaine public)
 *  • DI         : jalons de développement (OMS / CDC « Learn the signs. Act early. »)
 *  • LANGAGE    : jalons du développement du langage oral
 *  • DYS        : signes d'alerte des troubles spécifiques des apprentissages (DSM-5)
 *  • DÉPRESSION : PHQ-9 (Kroenke, Spitzer & Williams — libre d'utilisation)
 *  • ADDICTION  : inspiré du CRAFFT 2.1 (Boston Children's Hospital)
 *  • TSA (ado/adulte) : inspiré de l'AQ-10 (Allison, Auyeung & Baron-Cohen, 2012)
 *  • TDAH adulte : inspiré de l'ASRS v1.1 (OMS)
 *  • ANXIÉTÉ    : GAD-7 (Spitzer, Kroenke, Williams & Löwe — libre d'utilisation)
 *  • MÉMOIRE    : inspiré de l'AD8 (questionnaire rempli par un proche)
 *  • TRAUMA     : inspiré du PC-PTSD-5 (National Center for PTSD — domaine public)
 * Les questions sont reformulées (pas de reproduction mot pour mot des outils sous licence).
 *
 * ⚠ Ces outils orientent vers un professionnel. Seul un professionnel pose un diagnostic.
 *
 * Types de questions :
 *  • 'echelle' : score 0–3 (plus le score est haut, plus le signe est préoccupant)
 *  • 'alerte'  : Oui/Non, non compté dans le score, déclenche un signal d'alerte
 */

const ECHELLES = {
  FREQ: [
    { valeur: 0, libelle: 'Jamais' },
    { valeur: 1, libelle: 'Parfois' },
    { valeur: 2, libelle: 'Souvent' },
    { valeur: 3, libelle: 'Très souvent' },
  ],
  // Comportement positif attendu : « Jamais » = préoccupant
  ACQUIS: [
    { valeur: 0, libelle: 'Oui, souvent' },
    { valeur: 1, libelle: 'Parfois' },
    { valeur: 2, libelle: 'Rarement' },
    { valeur: 3, libelle: 'Jamais' },
  ],
  // Comparaison avec les enfants du même âge
  AGE: [
    { valeur: 0, libelle: 'Comme les enfants de son âge' },
    { valeur: 1, libelle: 'Un peu en retard' },
    { valeur: 2, libelle: 'Nettement en retard' },
    { valeur: 3, libelle: 'Pas encore du tout' },
  ],
  PHQ: [
    { valeur: 0, libelle: 'Jamais' },
    { valeur: 1, libelle: 'Plusieurs jours' },
    { valeur: 2, libelle: 'Plus de la moitié des jours' },
    { valeur: 3, libelle: 'Presque tous les jours' },
  ],
  OUINON: [
    { valeur: 0, libelle: 'Non' },
    { valeur: 1, libelle: 'Oui' },
  ],
  // Changement observé par un proche (mémoire)
  CHANGEMENT: [
    { valeur: 0, libelle: 'Non, pas de changement' },
    { valeur: 1, libelle: 'Oui, ça a changé' },
  ],
};

const q = (id, texte, echelle = 'FREQ', extra = {}) => ({ id, type: 'echelle', texte, echelle, ...extra });
const alerte = (id, texte, code, gravite, message) => ({
  id, type: 'alerte', texte, echelle: 'OUINON', alerte: { code, gravite, message },
});

const QUESTIONNAIRES = [
  // ────────────────────────────────────────────────────────────────────────
  {
    code: 'TSA',
    version: '1.0',
    titre: "Autisme (Trouble du spectre de l'autisme)",
    trouble: 'TSA',
    cim11: '6A02',
    icone: '🧩',
    reference: 'Inspiré du M-CHAT-R/F',
    repondant: 'PARENT',
    age_min_mois: 16,
    age_max_mois: 72,
    description: "Repérer les premiers signes de l'autisme chez le jeune enfant (16 mois à 6 ans).",
    consigne: 'Pensez à la façon dont votre enfant se comporte HABITUELLEMENT.',
    questions: [
      q(1, 'Votre enfant pointe-t-il du doigt pour vous montrer quelque chose qui l’intéresse ?', 'ACQUIS'),
      q(2, 'Votre enfant s’intéresse-t-il aux autres enfants ?', 'ACQUIS'),
      q(3, 'Votre enfant vous regarde-t-il dans les yeux quand vous lui parlez ou jouez avec lui ?', 'ACQUIS'),
      q(4, 'Votre enfant imite-t-il ce que vous faites (taper des mains, dire au revoir) ?', 'ACQUIS'),
      q(5, 'Votre enfant répond-il quand vous l’appelez par son prénom ?', 'ACQUIS'),
      q(6, 'Si vous montrez un objet du doigt, votre enfant regarde-t-il cet objet ?', 'ACQUIS'),
      q(7, 'Votre enfant joue-t-il à « faire semblant » (donner à manger à une poupée, téléphoner avec un objet) ?', 'ACQUIS'),
      q(8, 'Votre enfant vous apporte-t-il des objets juste pour vous les montrer ?', 'ACQUIS'),
      q(9, 'Votre enfant fait-il des gestes répétés (se balancer, battre des mains, tourner sur lui-même, aligner des objets) ?'),
      q(10, 'Votre enfant est-il très perturbé par un petit changement d’habitude (trajet, place d’un objet) ?'),
      q(11, 'Votre enfant réagit-il très fort aux bruits, à la lumière ou au toucher (se bouche les oreilles, crie) ?'),
      alerte(12, 'Votre enfant a-t-il PERDU des mots ou des capacités qu’il avait déjà (parler, jouer, regarder) ?',
        'REGRESSION', 'URGENT',
        'Une perte de capacités déjà acquises doit être vue rapidement par un médecin.'),
    ],
    seuils: { modere: 8, eleve: 15 },
    services: ['DIAGNOSTIC', 'PEDOPSYCHIATRIE', 'ORTHOPHONIE', 'PSYCHOMOTRICITE', 'EDUCATION_SPECIALISEE'],
  },

  // ────────────────────────────────────────────────────────────────────────
  {
    code: 'TDAH',
    version: '1.0',
    titre: "TDAH (Trouble déficit de l'attention avec ou sans hyperactivité)",
    trouble: 'TDAH',
    cim11: '6A05',
    icone: '⚡',
    reference: 'Inspiré du SNAP-IV',
    repondant: 'PARENT',
    age_min_mois: 48,
    age_max_mois: 216,
    description: "Repérer des difficultés d'attention, d'agitation ou d'impulsivité (4 à 18 ans).",
    consigne: 'Pensez aux 6 derniers mois, à la maison ET à l’école.',
    questions: [
      // Inattention
      q(1, 'A du mal à rester attentif longtemps (devoirs, jeux, écoute) ?'),
      q(2, 'Semble ne pas écouter quand on lui parle directement ?'),
      q(3, 'Ne termine pas ce qu’il commence (devoirs, tâches) ?'),
      q(4, 'A du mal à s’organiser (cartable, affaires, temps) ?'),
      q(5, 'Perd souvent ses affaires (cahiers, crayons, vêtements) ?'),
      q(6, 'Est facilement distrait par ce qui se passe autour de lui ?'),
      // Hyperactivité / impulsivité
      q(7, 'Bouge sans arrêt les mains ou les pieds, se tortille sur sa chaise ?'),
      q(8, 'Se lève en classe ou à table quand il devrait rester assis ?'),
      q(9, 'Court ou grimpe partout quand ce n’est pas le moment ?'),
      q(10, 'Parle beaucoup trop, sans s’arrêter ?'),
      q(11, 'Répond avant la fin de la question, coupe la parole ?'),
      q(12, 'A du mal à attendre son tour ?'),
      alerte(13, 'Se met-il souvent en danger (traverse la route sans regarder, grimpe très haut, se blesse souvent) ?',
        'MISE_EN_DANGER', 'PRIORITAIRE',
        'Les mises en danger répétées justifient une consultation sans trop attendre.'),
    ],
    sous_echelles: [
      { code: 'INATTENTION', libelle: 'Inattention', ids: [1, 2, 3, 4, 5, 6], seuil_eleve: 12 },
      { code: 'HYPERACTIVITE', libelle: 'Hyperactivité / impulsivité', ids: [7, 8, 9, 10, 11, 12], seuil_eleve: 12 },
    ],
    seuils: { modere: 14, eleve: 22 },
    services: ['DIAGNOSTIC', 'PEDOPSYCHIATRIE', 'NEUROPEDIATRIE', 'PSYCHOLOGIE', 'GUIDANCE_PARENTALE'],
  },

  // ────────────────────────────────────────────────────────────────────────
  {
    code: 'DI',
    version: '1.0',
    titre: 'Retard global de développement / Déficience intellectuelle',
    trouble: 'DI',
    cim11: '6A00',
    icone: '🌱',
    reference: 'Jalons de développement (OMS, CDC)',
    repondant: 'PARENT',
    age_min_mois: 12,
    age_max_mois: 144,
    description: 'Comparer les acquisitions de votre enfant à celles des enfants de son âge (1 à 12 ans).',
    consigne: 'Comparez votre enfant aux autres enfants du même âge que vous connaissez.',
    questions: [
      q(1, 'Se tenir assis, marcher, courir', 'AGE'),
      q(2, 'Utiliser ses mains (attraper, manger seul, dessiner)', 'AGE'),
      q(3, 'Parler (mots, phrases)', 'AGE'),
      q(4, 'Comprendre une consigne simple (« va chercher ta chaussure »)', 'AGE'),
      q(5, 'Jouer avec les objets et les autres enfants', 'AGE'),
      q(6, 'Être autonome (manger, s’habiller, aller aux toilettes)', 'AGE'),
      q(7, 'Reconnaître les couleurs, les formes, compter', 'AGE'),
      q(8, 'Se souvenir de ce qu’il a appris', 'AGE'),
      q(9, 'Trouver une solution à un petit problème (ouvrir une boîte, contourner un obstacle)', 'AGE'),
      q(10, 'Suivre à l’école ou au daara', 'AGE'),
      alerte(11, 'Votre enfant a-t-il PERDU des capacités qu’il avait déjà ?', 'REGRESSION', 'URGENT',
        'Une perte de capacités déjà acquises doit être vue rapidement par un médecin.'),
      alerte(12, 'Votre enfant fait-il en ce moment des crises (convulsions, raidissements, absences, perte de connaissance) ?',
        'CONVULSIONS', 'URGENT',
        'Des crises répétées nécessitent un avis médical rapide (neuropédiatrie). En cas de crise de plus de 5 minutes, appelez le SAMU au 1515.'),
    ],
    seuils: { modere: 8, eleve: 15 },
    services: ['DIAGNOSTIC', 'NEUROPEDIATRIE', 'PSYCHOMOTRICITE', 'ORTHOPHONIE', 'EDUCATION_SPECIALISEE'],
  },

  // ────────────────────────────────────────────────────────────────────────
  {
    code: 'LANGAGE',
    version: '1.0',
    titre: 'Troubles du langage et de la communication',
    trouble: 'LANGAGE',
    cim11: '6A01',
    icone: '🗣️',
    reference: 'Jalons du développement du langage oral',
    repondant: 'PARENT',
    age_min_mois: 12,
    age_max_mois: 96,
    description: 'Repérer un retard ou un trouble du langage oral (1 à 8 ans), quelle que soit la langue parlée à la maison.',
    consigne: 'Pensez à la langue que votre enfant entend le plus (wolof, pulaar, sérère, français…).',
    questions: [
      q(1, 'Babiller, faire des sons (« ba-ba », « ma-ma »)', 'AGE'),
      q(2, 'Dire ses premiers mots', 'AGE'),
      q(3, 'Assembler deux mots (« donne eau »)', 'AGE'),
      q(4, 'Faire des petites phrases', 'AGE'),
      q(5, 'Comprendre ce qu’on lui dit sans les gestes', 'AGE'),
      q(6, 'Être compris par des personnes qui ne sont pas de la famille', 'AGE'),
      q(7, 'Raconter ce qu’il a fait dans la journée', 'AGE'),
      q(8, 'Bégaie-t-il ou bloque-t-il sur les mots ?'),
      q(9, 'Est-il frustré ou en colère parce qu’on ne le comprend pas ?'),
      alerte(10, 'Votre enfant semble-t-il ne pas entendre (ne réagit pas aux bruits forts ou quand on l’appelle de dos) ?',
        'AUDITION', 'PRIORITAIRE',
        'Un examen de l’audition (ORL) est recommandé avant tout bilan du langage.'),
    ],
    seuils: { modere: 7, eleve: 14 },
    services: ['ORTHOPHONIE', 'DIAGNOSTIC', 'ORL'],
  },

  // ────────────────────────────────────────────────────────────────────────
  {
    code: 'DYS',
    version: '1.0',
    titre: 'Troubles des apprentissages (dyslexie, dysorthographie, dyscalculie, dyspraxie)',
    trouble: 'DYS',
    cim11: '6A03',
    icone: '📚',
    reference: 'Signes d’alerte DSM-5 des troubles spécifiques des apprentissages',
    repondant: 'PARENT',
    age_min_mois: 72,
    age_max_mois: 192,
    description: 'Repérer des difficultés durables à lire, écrire, compter ou coordonner ses gestes (6 à 16 ans).',
    consigne: 'Pensez aux difficultés qui durent depuis plus de 6 mois malgré l’aide apportée.',
    questions: [
      q(1, 'Lit très lentement ou en butant sur les mots ?'),
      q(2, 'Confond des lettres ou des sons (b/d, p/q, f/v) ?'),
      q(3, 'A du mal à comprendre ce qu’il vient de lire ?'),
      q(4, 'Fait beaucoup de fautes d’orthographe, même sur des mots connus ?'),
      q(5, 'Écrit lentement, de façon difficile à lire ?'),
      q(6, 'A du mal avec les nombres, le calcul ou les tables ?'),
      q(7, 'Est maladroit (lacets, boutons, ciseaux, attraper un ballon) ?'),
      q(8, 'A du mal à recopier ce qui est au tableau ?'),
      q(9, 'Est très fatigué ou découragé par l’école ?'),
      q(10, 'Réussit mieux à l’oral qu’à l’écrit ?'),
    ],
    seuils: { modere: 10, eleve: 18 },
    services: ['ORTHOPHONIE', 'PSYCHOMOTRICITE', 'PSYCHOLOGIE', 'ERGOTHERAPIE', 'SCOLARISATION'],
  },

  // ────────────────────────────────────────────────────────────────────────
  {
    code: 'DEPRESSION',
    version: '1.0',
    titre: 'Dépression (adolescent ou adulte)',
    trouble: 'DEPRESSION',
    cim11: '6A70',
    icone: '🌧️',
    reference: 'PHQ-9',
    repondant: 'ADOLESCENT_OU_ADULTE',
    age_min_mois: 132,
    age_max_mois: 1200,
    description: 'Pour un adolescent (dès 11 ans) ou un adulte — y compris vous, parent, si vous vous sentez épuisé.',
    consigne: 'Au cours des 2 DERNIÈRES SEMAINES, à quelle fréquence avez-vous été gêné par…',
    questions: [
      q(1, 'Peu d’intérêt ou de plaisir à faire les choses', 'PHQ'),
      q(2, 'Se sentir triste, déprimé ou sans espoir', 'PHQ'),
      q(3, 'Difficultés à dormir, ou dormir beaucoup trop', 'PHQ'),
      q(4, 'Se sentir fatigué, sans énergie', 'PHQ'),
      q(5, 'Peu d’appétit ou manger trop', 'PHQ'),
      q(6, 'Mauvaise opinion de soi, sentiment d’être nul ou d’avoir déçu sa famille', 'PHQ'),
      q(7, 'Difficultés à se concentrer (lire, regarder la télévision, travailler)', 'PHQ'),
      q(8, 'Bouger ou parler très lentement, ou au contraire être très agité', 'PHQ'),
      q(9, 'Penser qu’il vaudrait mieux mourir, ou penser à se faire du mal', 'PHQ', {
        alerte: {
          code: 'IDEES_SUICIDAIRES',
          gravite: 'URGENT',
          seuil: 1,
          message: 'Vous n’êtes pas seul. Parlez-en dès maintenant à un proche de confiance ou à un professionnel. En cas de danger immédiat, appelez le SAMU au 1515.',
        },
      }),
    ],
    seuils: { modere: 10, eleve: 15 },
    services: ['PSYCHIATRIE', 'PEDOPSYCHIATRIE', 'PSYCHOLOGIE'],
  },

  // ────────────────────────────────────────────────────────────────────────
  {
    code: 'ADDICTION',
    version: '1.0',
    titre: 'Consommation d’alcool ou de drogues (adolescent ou jeune adulte)',
    trouble: 'ADDICTION',
    cim11: '6C4',
    icone: '🚭',
    reference: 'Inspiré du CRAFFT 2.1',
    repondant: 'ADOLESCENT_OU_ADULTE',
    age_min_mois: 144,
    age_max_mois: 1200,
    description: 'Repérer une consommation à risque (alcool, cannabis/yamba, autres produits). Dès 12 ans.',
    consigne: 'Pensez aux 12 DERNIERS MOIS. Vos réponses restent confidentielles.',
    questions: [
      q(1, 'Avez-vous déjà été dans un véhicule conduit par quelqu’un (ou vous-même) qui avait bu ou consommé ?', 'OUINON'),
      q(2, 'Consommez-vous pour vous détendre, vous sentir mieux ou être accepté par le groupe ?', 'OUINON'),
      q(3, 'Vous arrive-t-il de consommer quand vous êtes seul ?', 'OUINON'),
      q(4, 'Vous arrive-t-il d’oublier ce que vous avez fait pendant que vous consommiez ?', 'OUINON'),
      q(5, 'Votre famille ou vos amis vous ont-ils dit de réduire votre consommation ?', 'OUINON'),
      q(6, 'Avez-vous eu des problèmes à cause de votre consommation (bagarre, école, police, argent) ?', 'OUINON'),
      alerte(7, 'Avez-vous déjà eu un malaise grave ou besoin de soins après avoir consommé ?',
        'INTOXICATION', 'PRIORITAIRE',
        'Un accompagnement en addictologie est recommandé rapidement.'),
    ],
    seuils: { modere: 1, eleve: 2 },
    services: ['ADDICTOLOGIE', 'PSYCHOLOGIE', 'PSYCHIATRIE'],
  },
  // ────────────────────────────────────────────────────────────────────────
  {
    code: 'TSAADULTE',
    version: '1.0',
    titre: 'Autisme chez l’enfant (dès 6 ans), l’adolescent ou l’adulte',
    trouble: 'TSA',
    cim11: '6A02',
    icone: '🧩',
    reference: 'Inspiré de l’AQ-10',
    repondant: 'PARENT_OU_PERSONNE',
    age_min_mois: 72,
    age_max_mois: 1200,
    description: 'L’autisme dure toute la vie : beaucoup d’adultes n’ont jamais été repérés. À remplir pour vous-même, votre enfant ou un proche (dès 6 ans).',
    consigne: 'Pour chaque phrase, dites si elle correspond à la personne concernée.',
    questions: [
      q(1, 'Remarque des petits bruits, détails ou odeurs que les autres ne remarquent pas'),
      q(2, 'A du mal à comprendre ce que les autres pensent ou ressentent à partir de leur visage'),
      q(3, 'A du mal à suivre une conversation à plusieurs ou à savoir quand prendre la parole'),
      q(4, 'Se sent très mal quand ses habitudes ou son programme changent'),
      q(5, 'S’intéresse de façon très intense et longue à un seul sujet'),
      q(6, 'Comprend les phrases au pied de la lettre (a du mal avec l’humour ou les sous-entendus)'),
      q(7, 'Préfère faire les choses seul plutôt qu’avec d’autres'),
      q(8, 'A du mal à se faire des amis ou à les garder'),
      q(9, 'Est gêné par certains bruits, lumières, textures ou foules'),
      q(10, 'Répète les mêmes gestes, paroles ou rituels'),
    ],
    seuils: { modere: 12, eleve: 18 },
    services: ['DIAGNOSTIC', 'PSYCHIATRIE', 'PSYCHOLOGIE'],
  },

  // ────────────────────────────────────────────────────────────────────────
  {
    code: 'TDAHADULTE',
    version: '1.0',
    titre: 'TDAH chez l’adulte',
    trouble: 'TDAH',
    cim11: '6A05',
    icone: '⚡',
    reference: 'Inspiré de l’ASRS v1.1 (OMS)',
    repondant: 'ADOLESCENT_OU_ADULTE',
    age_min_mois: 192,
    age_max_mois: 1200,
    description: 'Inattention, oublis, agitation qui gênent le travail ou la vie de famille. Pour vous-même ou un proche adulte.',
    consigne: 'Au cours des 6 DERNIERS MOIS, à quelle fréquence…',
    questions: [
      q(1, 'Avez-vous du mal à terminer les derniers détails d’un travail, une fois le plus difficile fait ?'),
      q(2, 'Avez-vous du mal à mettre de l’ordre quand une tâche demande de l’organisation ?'),
      q(3, 'Avez-vous du mal à vous souvenir de vos rendez-vous ou obligations ?'),
      q(4, 'Repoussez-vous les tâches qui demandent beaucoup de réflexion ?'),
      q(5, 'Bougez-vous les mains ou les pieds quand vous devez rester assis longtemps ?'),
      q(6, 'Vous sentez-vous poussé à agir, comme « monté sur ressort » ?'),
    ],
    seuils: { modere: 8, eleve: 12 },
    services: ['PSYCHIATRIE', 'PSYCHOLOGIE'],
  },

  // ────────────────────────────────────────────────────────────────────────
  {
    code: 'ANXIETE',
    version: '1.0',
    titre: 'Anxiété et stress',
    trouble: 'ANXIETE',
    cim11: '6B00',
    icone: '😰',
    reference: 'GAD-7',
    repondant: 'ADOLESCENT_OU_ADULTE',
    age_min_mois: 132,
    age_max_mois: 1200,
    description: 'Nervosité, inquiétude permanente, tensions. Dès 11 ans, pour vous-même ou un proche.',
    consigne: 'Au cours des 2 DERNIÈRES SEMAINES, à quelle fréquence avez-vous été gêné par…',
    questions: [
      q(1, 'Se sentir nerveux, anxieux ou à bout', 'PHQ'),
      q(2, 'Ne pas arriver à arrêter de s’inquiéter ou à contrôler ses inquiétudes', 'PHQ'),
      q(3, 'S’inquiéter trop pour toutes sortes de choses', 'PHQ'),
      q(4, 'Avoir du mal à se détendre', 'PHQ'),
      q(5, 'Être si agité qu’il est difficile de rester tranquille', 'PHQ'),
      q(6, 'S’énerver ou devenir irritable facilement', 'PHQ'),
      q(7, 'Avoir peur que quelque chose de terrible arrive', 'PHQ'),
    ],
    seuils: { modere: 10, eleve: 15 },
    services: ['PSYCHOLOGIE', 'PSYCHIATRIE'],
  },

  // ────────────────────────────────────────────────────────────────────────
  {
    code: 'MEMOIRE',
    version: '1.0',
    titre: 'Mémoire et troubles cognitifs (personne âgée)',
    trouble: 'DEMENCE',
    cim11: '6D80',
    icone: '🧠',
    reference: 'Inspiré de l’AD8',
    repondant: 'PROCHE',
    age_min_mois: 600,
    age_max_mois: 1440,
    description: 'À remplir par un proche : repérer un changement de la mémoire ou du raisonnement (dès 50 ans).',
    consigne: 'Ces dernières années, avez-vous remarqué un CHANGEMENT dû à des problèmes de mémoire ou de réflexion ?',
    questions: [
      q(1, 'A plus de mal à prendre des décisions (jugement, argent)', 'CHANGEMENT'),
      q(2, 'S’intéresse moins à ses activités ou loisirs habituels', 'CHANGEMENT'),
      q(3, 'Répète les mêmes questions, histoires ou phrases', 'CHANGEMENT'),
      q(4, 'A du mal à apprendre à utiliser un appareil (téléphone, télécommande)', 'CHANGEMENT'),
      q(5, 'Oublie le mois ou l’année', 'CHANGEMENT'),
      q(6, 'A du mal à gérer l’argent ou les factures', 'CHANGEMENT'),
      q(7, 'Oublie ses rendez-vous', 'CHANGEMENT'),
      q(8, 'A des problèmes de mémoire ou de raisonnement tous les jours', 'CHANGEMENT'),
      alerte(9, 'S’est-il déjà perdu dans un lieu connu, ou mis en danger (gaz, sortie la nuit) ?',
        'MISE_EN_DANGER', 'PRIORITAIRE', 'Une consultation rapide est recommandée et la personne ne doit pas rester seule sans surveillance.'),
    ],
    seuils: { modere: 2, eleve: 4 },
    services: ['PSYCHIATRIE', 'NEUROLOGIE', 'DIAGNOSTIC'],
  },

  // ────────────────────────────────────────────────────────────────────────
  {
    code: 'TRAUMA',
    version: '1.0',
    titre: 'Traumatisme psychologique',
    trouble: 'TRAUMA',
    cim11: '6B40',
    icone: '🕊️',
    reference: 'Inspiré du PC-PTSD-5',
    repondant: 'ADOLESCENT_OU_ADULTE',
    age_min_mois: 132,
    age_max_mois: 1200,
    description: 'Après un événement très choquant (accident, violence, deuil brutal, catastrophe). Dès 11 ans.',
    consigne: 'Pensez au DERNIER MOIS, après un événement très choquant.',
    questions: [
      q(1, 'Fait des cauchemars ou repense à l’événement sans le vouloir', 'OUINON'),
      q(2, 'Évite d’y penser ou évite les lieux et personnes qui le rappellent', 'OUINON'),
      q(3, 'Est constamment sur ses gardes ou sursaute facilement', 'OUINON'),
      q(4, 'Se sent détaché des autres ou de ce qui l’entoure', 'OUINON'),
      q(5, 'Se sent coupable ou ne peut s’empêcher de se reprocher l’événement', 'OUINON'),
    ],
    seuils: { modere: 2, eleve: 3 },
    services: ['PSYCHOLOGIE', 'PSYCHIATRIE'],
  },
];

const CONSEILS = {
  FAIBLE: 'Pas de signe préoccupant aujourd’hui. Continuez à observer. En cas de doute, refaites ce questionnaire dans 3 mois ou parlez-en à un agent de santé.',
  MODERE: 'Quelques signes méritent l’attention d’un professionnel. Prenez rendez-vous sans urgence dans une des structures proposées.',
  ELEVE: 'Plusieurs signes importants sont présents. Prenez rendez-vous rapidement avec une structure spécialisée. Ce résultat n’est PAS un diagnostic : seul un professionnel peut le confirmer.',
};

const parCode = Object.fromEntries(QUESTIONNAIRES.map((x) => [x.code, x]));

module.exports = { QUESTIONNAIRES, ECHELLES, CONSEILS, parCode };
