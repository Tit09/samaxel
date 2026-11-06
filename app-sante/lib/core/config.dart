import 'package:flutter/foundation.dart';

/// Configuration de l'application.
///
/// L'adresse de l'API se choisit à la compilation, sans modifier le code :
///   flutter run --dart-define=API_URL=http://192.168.1.20:3001
///   flutter build apk --dart-define=API_URL=https://api.samaxhel.sn
class AppConfig {
  AppConfig._();

  static const String _apiUrl = String.fromEnvironment('API_URL');

  /// Adresse saisie dans l'application (démonstration : appui long sur le logo de l'accueil).
  /// Permet d'utiliser le même APK avec le serveur lancé sur le PC de la soutenance.
  static String? serveurPersonnalise;

  /// Adresse de l'API Santé.
  /// Par défaut : localhost (web/ordinateur) ou 10.0.2.2 (émulateur Android = PC hôte).
  static String get apiUrl {
    if (serveurPersonnalise != null && serveurPersonnalise!.isNotEmpty) return serveurPersonnalise!;
    if (_apiUrl.isNotEmpty) return _apiUrl;
    // Version web servie par le PC de test : l'API est sur la même machine (port 3001),
    // ce qui permet d'ouvrir l'app depuis un téléphone sur le même Wi-Fi.
    // Version web servie par le serveur SAMA XHEL lui-même (/app) : l'API est à la même adresse.
    if (kIsWeb && Uri.base.path.startsWith('/app')) return Uri.base.origin;
    if (kIsWeb && Uri.base.host.isNotEmpty) return '${Uri.base.scheme}://${Uri.base.host}:3001';
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      return 'http://10.0.2.2:3001';
    }
    return 'http://localhost:3001';
  }

  /// Adresse du site (servi par le même serveur que l'API) : candidatures, établissements
  static String get siteUrl => apiUrl;

  /// Numéro du SAMU au Sénégal
  static const String samu = '1515';

  static const String nomApp = 'SAMA XHEL Santé';

  /// Paiements de DÉMONSTRATION (compte marchand Wave et agent Orange Money de SAMA XHEL).
  /// En production, chaque établissement renseigne SES propres comptes.
  static const String lienWave = 'https://pay.wave.com/m/M_sn_GUIRN49SXtRv/c/sn/';
  static const String numeroOm = '77 470 21 57';
}
