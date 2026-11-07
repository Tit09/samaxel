import 'dart:convert';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'adaptatif.dart';

enum Langue {
  wo('wo', 'Wolof'),
  fr('fr', 'Français'),
  en('en', 'English');

  const Langue(this.code, this.nom);
  final String code;
  final String nom;
}

/// État de l'application : langue, réglages, carnet, progression.
/// Tout reste sur l'appareil (préférences locales). Aucune donnée de santé,
/// aucun nom, aucun envoi réseau.
class Etat extends ChangeNotifier {
  Etat._(this._prefs, this._textes, this._voixDispo);

  final SharedPreferences? _prefs;
  final Map<String, Map<String, String>> _textes;
  final Set<String> _voixDispo;
  final AudioPlayer _voix = AudioPlayer(playerId: 'voix');
  final AudioPlayer _sons = AudioPlayer(playerId: 'sons');
  final AudioPlayer _fond = AudioPlayer(playerId: 'fond');

  Langue langue = Langue.wo;
  bool voixActive = true;
  bool sonsDoux = false;
  bool texteGrand = false;
  bool moinsMouvement = false;
  final Set<String> carnet = <String>{};
  final Set<String> histoiresFinies = <String>{};
  final Map<String, MoteurAdaptatif> adaptatif = {'emotions': MoteurAdaptatif(), 'journee': MoteurAdaptatif(), 'pareil': MoteurAdaptatif()};

  static Future<Etat> charger({bool persistance = true}) async {
    final textes = <String, Map<String, String>>{};
    for (final l in Langue.values) {
      final brut = await rootBundle.loadString('assets/textes/${l.code}.json');
      textes[l.code] = (jsonDecode(brut) as Map<String, dynamic>).map((k, v) => MapEntry(k, v as String));
    }
    final manifeste = await AssetManifest.loadFromAssetBundle(rootBundle);
    final voix = manifeste.listAssets().where((a) => a.startsWith('assets/voix/')).toSet();
    final prefs = persistance ? await SharedPreferences.getInstance() : null;
    final e = Etat._(prefs, textes, voix);
    e._lire();
    await e._voix.setReleaseMode(ReleaseMode.stop);
    return e;
  }

  /// Pour les tests : textes fournis directement, sans audio ni stockage.
  @visibleForTesting
  static Etat pourTests(Map<String, Map<String, String>> textes) => Etat._(null, textes, {});

  void _lire() {
    final p = _prefs;
    if (p == null) return;
    langue = Langue.values.firstWhere((l) => l.code == p.getString('langue'), orElse: () => Langue.wo);
    voixActive = p.getBool('voix') ?? true;
    sonsDoux = p.getBool('sonsDoux') ?? false;
    texteGrand = p.getBool('texteGrand') ?? false;
    moinsMouvement = p.getBool('moinsMouvement') ?? false;
    carnet.addAll(p.getStringList('carnet') ?? const []);
    histoiresFinies.addAll(p.getStringList('finies') ?? const []);
    adaptatif.forEach((k, m) => m.niveau = p.getInt('niveau_$k') ?? 1);
  }

  void _ecrire() {
    final p = _prefs;
    if (p == null) return;
    p.setString('langue', langue.code);
    p.setBool('voix', voixActive);
    p.setBool('sonsDoux', sonsDoux);
    p.setBool('texteGrand', texteGrand);
    p.setBool('moinsMouvement', moinsMouvement);
    p.setStringList('carnet', carnet.toList());
    p.setStringList('finies', histoiresFinies.toList());
    adaptatif.forEach((k, m) => p.setInt('niveau_$k', m.niveau));
  }

  /// Texte dans la langue choisie ; repli sur le français si une phrase manque.
  String t(String cle, {Langue? en}) => _textes[(en ?? langue).code]?[cle] ?? _textes['fr']?[cle] ?? cle;

  bool aVoix(String cle, {Langue? en}) => _voixDispo.contains('assets/voix/${(en ?? langue).code}/$cle.mp3');

  /// Lit une phrase à voix haute (si la voix est activée et enregistrée).
  Future<void> dire(String cle, {Langue? en, bool forcer = false}) async {
    if (!voixActive && !forcer) return;
    final l = en ?? langue;
    if (!aVoix(cle, en: l)) return;
    try {
      await _voix.stop();
      await _voix.setVolume(sonsDoux ? 0.6 : 1.0);
      await _voix.play(AssetSource('voix/${l.code}/$cle.mp3'));
    } catch (_) {
      /* son indisponible : le texte reste affiché */
    }
  }

  Future<void> taire() async {
    try {
      await _voix.stop();
    } catch (_) {}
  }

  Future<void> ding() async {
    try {
      await _sons.setVolume(sonsDoux ? 0.25 : 0.6);
      await _sons.play(AssetSource('sons/ding.mp3'));
    } catch (_) {}
  }

  Future<void> mer(bool on) async {
    try {
      if (on) {
        await _fond.setReleaseMode(ReleaseMode.loop);
        await _fond.setVolume(sonsDoux ? 0.3 : 0.6);
        await _fond.play(AssetSource('sons/mer.mp3'));
      } else {
        await _fond.stop();
      }
    } catch (_) {}
  }

  void choisirLangue(Langue l) {
    langue = l;
    _ecrire();
    notifyListeners();
  }

  void regler({bool? voix, bool? doux, bool? grand, bool? mouvement}) {
    voixActive = voix ?? voixActive;
    sonsDoux = doux ?? sonsDoux;
    texteGrand = grand ?? texteGrand;
    moinsMouvement = mouvement ?? moinsMouvement;
    _ecrire();
    notifyListeners();
  }

  void noter(Iterable<String> observations) {
    if (observations.isEmpty) return;
    carnet.addAll(observations);
    _ecrire();
    notifyListeners();
  }

  void effacerCarnet() {
    carnet.clear();
    _ecrire();
    notifyListeners();
  }

  void terminer(String histoire) {
    histoiresFinies.add(histoire);
    _ecrire();
    notifyListeners();
  }

  void sauverNiveaux() => _ecrire();
}

/// Accès à l'état depuis n'importe quel écran.
class EtatScope extends InheritedNotifier<Etat> {
  const EtatScope({super.key, required Etat etat, required super.child}) : super(notifier: etat);
  static Etat of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<EtatScope>()!.notifier!;
  static Etat lire(BuildContext context) => context.getInheritedWidgetOfExactType<EtatScope>()!.notifier!;
}
