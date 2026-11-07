// Les histoires de l'espace parents, sous forme de données :
// le moteur de récit (recit.dart) les joue sans code spécifique.

class Choix {
  const Choix(this.texte, this.reponse, {this.observations = const [], this.reprendre = false});
  final String texte; // clé de la phrase du choix
  final String reponse; // clé de la réponse du personnage
  final List<String> observations; // ajoutées au carnet
  final bool reprendre; // réponse maladroite : on explique et on rejoue l'étape (jamais d'échec)
}

class Etape {
  const Etape({required this.fond, required this.portrait, required this.orateur, required this.texte, this.choix = const [], this.observations = const []});
  final String fond;
  final String portrait; // sprite du visage
  final String orateur; // clé du nom (ou nom propre)
  final String texte;
  final List<Choix> choix;
  final List<String> observations; // notées automatiquement à cette étape
}

class Recit {
  const Recit({
    required this.id,
    required this.titre,
    required this.icone,
    required this.intro,
    required this.etapes,
    required this.bilan,
    this.bilanFond = 'penc',
    this.urgence = false,
    this.carnet = false,
  });
  final String id;
  final String titre;
  final String icone;
  final String intro;
  final List<Etape> etapes;
  final String bilan;
  final String bilanFond;
  final bool urgence; // affiche le message de sécurité (chemin Dépression)
  final bool carnet; // propose d'ouvrir le carnet à la fin
}

const missionAwa = Recit(
  id: 'awa',
  titre: 'lieu_awa',
  icone: 'i_infini',
  intro: 'awa_intro',
  carnet: true,
  bilan: 'awa_bilan',
  bilanFond: 'penc_fin',
  etapes: [
    Etape(
      fond: 'cour',
      portrait: 'v_awa_doux',
      orateur: 'Awa',
      texte: 'a1',
      choix: [
        Choix('a1_c1', 'a1_r1', observations: ['obs_voitures', 'obs_prenom']),
        Choix('a1_c2', 'a1_r2'),
        Choix('a1_c3', 'a1_r3', reprendre: true),
      ],
    ),
    Etape(
      fond: 'marche',
      portrait: 'v_awa_doux',
      orateur: 'Awa',
      texte: 'a2',
      choix: [
        Choix('a2_c1', 'a2_r1', observations: ['obs_bruit']),
        Choix('a2_c2', 'a2_r2', reprendre: true),
        Choix('a2_c3', 'a2_r3', observations: ['obs_bruit']),
      ],
    ),
    Etape(
      fond: 'voisine',
      portrait: 'v_voisine_doux',
      orateur: 'voisine',
      texte: 'a3',
      choix: [Choix('a3_c1', 'a3_r1'), Choix('a3_c2', 'a3_r2', reprendre: true), Choix('a3_c3', 'a3_r3', reprendre: true)],
    ),
    Etape(
      fond: 'cour',
      portrait: 'v_awa_doux',
      orateur: 'Awa',
      texte: 'a4',
      observations: ['obs_mots'],
      choix: [Choix('a4_c1', 'a4_r1'), Choix('a4_c2', 'a4_r2', reprendre: true)],
    ),
    Etape(fond: 'centre', portrait: 'v_docteure_doux', orateur: 'docteure', texte: 'a5', choix: [Choix('a5_c1', 'a5_r1')]),
    Etape(fond: 'penc_fin', portrait: 'v_amadou_content', orateur: 'Amadou', texte: 'a6'),
  ],
);

const prologueModou = Recit(
  id: 'modou',
  titre: 'lieu_modou',
  icone: 'i_lanterne',
  intro: 'modou_intro',
  bilan: 'modou_bilan',
  bilanFond: 'chambre',
  urgence: true,
  etapes: [
    Etape(
      fond: 'chambre',
      portrait: 'v_modou_neutre',
      orateur: 'Modou',
      texte: 'm1',
      choix: [Choix('m1_c1', 'm1_r1'), Choix('m1_c2', 'm1_r2'), Choix('m1_c3', 'm1_r3')],
    ),
  ],
);

const prologueMaam = Recit(
  id: 'maam',
  titre: 'lieu_maam',
  icone: 'i_cadre',
  intro: 'maam_intro',
  bilan: 'maam_bilan',
  bilanFond: 'maam',
  etapes: [
    Etape(
      fond: 'maam',
      portrait: 'v_ndeye_doux',
      orateur: 'ndeye',
      texte: 'k1',
      choix: [Choix('k1_c1', 'k1_r1', reprendre: true), Choix('k1_c2', 'k1_r2'), Choix('k1_c3', 'k1_r3')],
    ),
  ],
);
