import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:just_audio/just_audio.dart';

import 'api.dart';
import 'config.dart';
import 'phrases.dart';
import 'stockage.dart';

/// Langues du guide vocal.
class Langue {
  const Langue(this.code, this.nom, this.nomLocal, this.drapeau);
  final String code;
  final String nom;
  final String nomLocal;
  final String drapeau;
}

const langues = [
  Langue('wo', 'Wolof', 'Wolof', '🇸🇳'),
  Langue('ff', 'Pulaar', 'Pulaar', '🇸🇳'),
  Langue('srr', 'Sérère', 'Seereer', '🇸🇳'),
  Langue('dyo', 'Diola', 'Joola', '🇸🇳'),
  Langue('mnk', 'Mandinka (socé)', 'Mandinka', '🇸🇳'),
  Langue('bm', 'Bambara', 'Bamanankan', '🇲🇱'),
  Langue('fr', 'Français', 'Français', '🇫🇷'),
  Langue('en', 'Anglais', 'English', '🇬🇧'),
];

Langue langueParCode(String code) => langues.firstWhere((l) => l.code == code, orElse: () => langues[6]);

/// Guide vocal.
///
/// Les phrases du guide étant fixes, elles sont enregistrées UNE fois en fichiers audio
/// (voix IA sénégalaises : Kiriku-Wolof-TTS pour le wolof, Meta MMS pour les autres
/// langues), validées par des locuteurs natifs, puis intégrées à l'application :
///     `assets/voix/<langue>/<cle>.mp3`
/// → fonctionne sans internet et sans coût.
/// Si le fichier d'une langue n'existe pas encore, la synthèse vocale du téléphone lit
/// la phrase en français (ou en anglais).
class GuideVocal {
  GuideVocal._();
  static final GuideVocal instance = GuideVocal._();

  final _player = AudioPlayer();
  final _tts = FlutterTts();
  Set<String>? _assets;

  Future<Set<String>> _listeAssets() async {
    if (_assets != null) return _assets!;
    try {
      final m = await AssetManifest.loadFromAssetBundle(rootBundle);
      _assets = m.listAssets().where((a) => a.startsWith('assets/voix/')).toSet();
    } catch (_) {
      _assets = {};
    }
    return _assets!;
  }

  // Voix enregistrées par des locuteurs natifs dans le studio du serveur (prioritaires)
  Map<String, Map<String, String>>? _distant;
  DateTime? _distantLe;

  Future<Map<String, Map<String, String>>> _catalogueDistant() async {
    if (_distant != null && DateTime.now().difference(_distantLe!) < const Duration(minutes: 10)) return _distant!;
    try {
      final r = await Api.instance.get('/voix/catalogue', public: true);
      _distant = {
        for (final e in ((r['fichiers'] as Map?) ?? {}).entries) e.key as String: Map<String, String>.from(e.value as Map),
      };
    } catch (_) {
      _distant ??= {};
    }
    _distantLe = DateTime.now();
    return _distant!;
  }

  /// À appeler après un enregistrement dans le studio : la nouvelle voix est jouée tout de suite
  void rafraichirVoix() => _distant = null;

  /// Cette phrase a-t-elle une voix (enregistrée ou intégrée) dans cette langue ?
  Future<bool> aUneVoix(String cle, String langue) async {
    if ((await _catalogueDistant())[langue]?[cle] != null) return true;
    final assets = await _listeAssets();
    return ['mp3', 'wav', 'm4a'].any((e) => assets.contains('assets/voix/$langue/$cle.$e'));
  }

  /// Guide automatique : chaque écran se présente à voix haute dès qu'on l'ouvre.
  /// Activé d'office pour les langues nationales (parents qui ne lisent pas), réglable dans Profil.
  Future<bool> guideAuto(String langue) async {
    final v = await Stockage.lire(Stockage.kGuideAuto);
    if (v != null) return v == '1';
    return !['fr', 'en'].contains(langue);
  }

  /// Lit une phrase et attend la fin. Renvoie `true` si elle a été lue dans la langue demandée.
  /// Ordre : voix d'un locuteur natif (studio) → voix intégrée → synthèse du téléphone (français).
  Future<bool> lire({required String cle, required String texteFr, String? texteEn, required String langue}) async {
    await arreter();
    final url = (await _catalogueDistant())[langue]?[cle];
    if (url != null) {
      try {
        await _player.setUrl('${AppConfig.apiUrl.replaceFirst(RegExp(r'/api/?$'), '')}$url');
        await _player.play();
        return true;
      } catch (_) {}
    }
    final assets = await _listeAssets();
    for (final ext in ['mp3', 'wav', 'm4a']) {
      final chemin = 'assets/voix/$langue/$cle.$ext';
      if (assets.contains(chemin)) {
        try {
          await _player.setAsset(chemin);
          await _player.play();
          return true;
        } catch (_) {}
      }
    }
    final anglais = langue == 'en' && texteEn != null;
    try {
      await _tts.awaitSpeakCompletion(true);
      await _tts.setLanguage(anglais ? 'en-US' : 'fr-FR');
      await _tts.setSpeechRate(0.45);
      await _tts.speak(anglais ? texteEn : texteFr);
    } catch (_) {}
    return langue == 'fr' || anglais;
  }

  Future<void> arreter() async {
    try {
      await _player.stop();
      await _tts.stop();
    } catch (_) {}
  }
}

class LangueNotifier extends Notifier<String> {
  @override
  String build() {
    Future.microtask(() async {
      final l = await Stockage.lire(Stockage.kLangue);
      if (l != null) state = l;
    });
    return 'fr';
  }

  Future<void> choisir(String code) async {
    state = code;
    await Stockage.ecrire(Stockage.kLangue, code);
    // On confirme le choix À VOIX HAUTE dans la langue choisie : la personne sait que l'appli va lui parler
    final p = phrases['langue'];
    GuideVocal.instance.lire(cle: 'langue', texteFr: p?.fr ?? '', texteEn: p?.en, langue: code);
  }
}

final langueProvider = NotifierProvider<LangueNotifier, String>(LangueNotifier.new);
