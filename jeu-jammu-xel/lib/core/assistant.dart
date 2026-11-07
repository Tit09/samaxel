import 'dart:math';

/// Une question connue de Xel, avec les phrases de réponse (clés de texte)
/// et des mots-clés en français, anglais et wolof.
class QuestionXel {
  const QuestionXel(this.cle, this.reponses, this.motsCles);
  final String cle; // clé de la question (texte affiché et lu)
  final List<String> reponses; // clés des phrases de réponse
  final String motsCles;
}

const questionsXel = <QuestionXel>[
  QuestionXel('xq_autiste', ['xa_autiste'], 'autiste autisme signe signes reconnaitre savoir regard prenom repetitif autism autistic sign otism xam'),
  QuestionXel('xq_cause', [
    'xa_cause',
  ], 'cause faute mauvais oeil sort parent parents maraboutage djinn sorcier pourquoi evil eye spell fault why bet bët liggeey'),
  QuestionXel('xq_guerir', ['xa_guerir'], 'guerir guerison soigner traitement medicament disparaitre cure treatment heal faj'),
  QuestionXel('xq_parle', ['xa_parle'], 'parle parler parole mot mots langage retard muet bouche speech talk talking words speak wax waxul'),
  QuestionXel(
    'xq_ou',
    ['xa_ou'],
    'ou consulter hopital hopitaux centre structure medecin docteur psychiatre adresse aller trouver where help hospital doctor clinic loopitaan doktoor bereb fan',
  ),
  QuestionXel('xq_depression', [
    's_depression_s',
    's_depression_c',
  ], 'depression deprime triste tristesse envie fatigue fatigué sommeil dormir pleurer sad depressed sleep tired tiis'),
  QuestionXel('xq_mourir', ['xa_mourir'], 'mourir mort suicide suicider tuer blesser mal vie finir die death kill hurt suicidal dee gaanu gaañu'),
  QuestionXel(
    'xq_memoire',
    ['maam_bilan'],
    'memoire oublie oublier oubli perd perdre grand mere grand-mere grandpere vieux vieille age alzheimer demence perdu forget memory old grandmother maam fatte fàtte',
  ),
  QuestionXel('xq_tdah', [
    's_tdah_s',
    's_tdah_c',
  ], 'tdah hyperactif hyperactivite agite bouge place concentrer concentration attention turbulent adhd hyperactive restless dal'),
  QuestionXel(
    'xq_drogue',
    ['xa_drogue'],
    'drogue droguer alcool tabac cigarette addiction dependance chanvre yamba cannabis jeux argent pari drug alcohol addict addicted gambling sangara tuuti ngem',
  ),
  QuestionXel('xq_crise', ['xa_crise'], 'crise crises colere crie crier frappe pleure hurle calmer meltdown tantrum angry mer'),
  QuestionXel('xq_ecole', ['xa_ecole'], 'ecole scolarite classe apprendre maitre enseignant inclusion school teacher learn lekkool jang'),
  QuestionXel('xq_tradi', ['xa_tradi'], 'tradipraticien guerisseur marabout traditionnel tradition plante healer traditional fajkat'),
  QuestionXel('xq_jeu', ['xa_jeu'], 'jeu application appli sert servir but game app purpose fo'),
  QuestionXel('xq_donnees', ['xa_donnees'], 'donnee donnees information informations prive internet confidentiel garder secret data privacy private xibaar'),
];

class ReponseXel {
  const ReponseXel(this.question, this.score, this.motsTrouves);
  final QuestionXel? question; // null : Xel ne sait pas
  final double score;
  final List<String> motsTrouves; // pour expliquer la réponse
}

/// Xel : assistant embarqué, hors ligne et explicable.
/// Recherche par similarité (TF-IDF + cosinus) entre la question posée et
/// les questions connues (texte dans les trois langues + mots-clés).
/// Xel ne génère jamais de texte : il renvoie une réponse relue et validée.
class Xel {
  Xel(String Function(String cle, String langue) texte) {
    for (final q in questionsXel) {
      final doc = <String>[
        ...decouper(q.motsCles),
        for (final l in const ['fr', 'en', 'wo']) ...decouper(texte(q.cle, l)),
      ];
      _docs.add(doc);
    }
    final n = _docs.length;
    final df = <String, int>{};
    for (final d in _docs) {
      for (final m in d.toSet()) {
        df[m] = (df[m] ?? 0) + 1;
      }
    }
    df.forEach((m, f) => _idf[m] = log((n + 1) / (f + 0.5)));
    _vecteurs.addAll(_docs.map(_vecteur));
  }

  final List<List<String>> _docs = [];
  final Map<String, double> _idf = {};
  final List<Map<String, double>> _vecteurs = [];
  static const seuil = 0.12;

  static const _vides = {
    'le',
    'la',
    'les',
    'un',
    'une',
    'des',
    'de',
    'du',
    'et',
    'ou',
    'a',
    'au',
    'aux',
    'en',
    'est',
    'il',
    'elle',
    'je',
    'tu',
    'on',
    'nous',
    'vous',
    'ils',
    'mon',
    'ma',
    'mes',
    'ton',
    'ta',
    'son',
    'sa',
    'ses',
    'que',
    'qui',
    'quoi',
    'ce',
    'cet',
    'cette',
    'ne',
    'pas',
    'plus',
    'pour',
    'par',
    'sur',
    'dans',
    'avec',
    'se',
    'si',
    'faire',
    'fait',
    'comment',
    'quand',
    'est-ce',
    'the',
    'is',
    'my',
    'an',
    'to',
    'of',
    'and',
    'or',
    'can',
    'how',
    'what',
    'do',
    'does',
    'it',
    'in',
    'i',
    'me',
    'ci',
    'ak',
    'mu',
    'na',
    'bi',
    'gi',
    'yi',
    'ndax',
    'lu',
    'naka',
  };

  static String _sansAccents(String s) {
    const de = 'àâäáãçéèêëíìîïñóòôöõúùûüÿœæ';
    const vers = 'aaaaaceeeeiiiinooooouuuuyoa';
    final b = StringBuffer();
    for (final r in s.runes) {
      final c = String.fromCharCode(r);
      final i = de.indexOf(c);
      b.write(i >= 0 ? vers[i] : c);
    }
    return b.toString();
  }

  /// Minuscules, sans accents, sans ponctuation ; pluriels simples ramenés au singulier.
  static List<String> decouper(String texte) {
    final t = _sansAccents(texte.toLowerCase()).replaceAll(RegExp(r"[^a-zŋë0-9\- ]"), ' ');
    return t
        .split(RegExp(r'\s+'))
        .where((m) => m.length > 1 && !_vides.contains(m))
        .map((m) => m.length > 4 && RegExp(r'[etnrldo][sx]$').hasMatch(m) ? m.substring(0, m.length - 1) : m)
        .toList();
  }

  Map<String, double> _vecteur(List<String> mots) {
    final tf = <String, double>{};
    for (final m in mots) {
      tf[m] = (tf[m] ?? 0) + 1;
    }
    final v = <String, double>{};
    tf.forEach((m, f) {
      final idf = _idf[m];
      if (idf != null) v[m] = f * idf;
    });
    return v;
  }

  static double _cosinus(Map<String, double> a, Map<String, double> b) {
    var p = 0.0;
    a.forEach((m, x) => p += x * (b[m] ?? 0));
    final na = sqrt(a.values.fold<double>(0, (s, x) => s + x * x));
    final nb = sqrt(b.values.fold<double>(0, (s, x) => s + x * x));
    return na == 0 || nb == 0 ? 0 : p / (na * nb);
  }

  ReponseXel repondre(String question) {
    final q = _vecteur(decouper(question));
    var meilleur = -1;
    var score = 0.0;
    for (var i = 0; i < _vecteurs.length; i++) {
      final s = _cosinus(q, _vecteurs[i]);
      if (s > score) {
        score = s;
        meilleur = i;
      }
    }
    if (meilleur < 0 || score < seuil) return ReponseXel(null, score, const []);
    final trouves = q.keys.where((m) => _vecteurs[meilleur].containsKey(m)).toList();
    return ReponseXel(questionsXel[meilleur], score, trouves);
  }
}
