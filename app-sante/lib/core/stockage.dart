import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Stockage local.
///  • Jetons et clé privée de messagerie → stockage SÉCURISÉ du système
///    (Keychain iOS/macOS, Keystore Android, Credential Manager Windows, WebCrypto web).
///  • Préférences sans risque (langue, structure active) → SharedPreferences.
class Stockage {
  Stockage._();
  static const _secure = FlutterSecureStorage();

  static const kToken = 'sx_token';
  static const kRefresh = 'sx_refresh';
  static const kClePrivee = 'sx_cle_privee_x25519';
  static const kLangue = 'sx_langue';
  static const kServeur = 'sx_serveur';
  static const kStructure = 'sx_structure_active';
  static const kOnboarding = 'sx_onboarding_vu';
  static const kGuideAuto = 'sx_guide_auto'; // '1' / '0' : chaque écran se présente à voix haute
  static const kMaison = 'sx_maison'; // code de l'hôpital où la famille est « entrée »
  static const kPourQui = 'sx_pour_qui'; // SOI, ENFANT, PARENT_AGE : parcours choisi à l'accueil

  static Future<String?> lireSecret(String k) async {
    try {
      return await _secure.read(key: k);
    } catch (_) {
      return null;
    }
  }

  static Future<void> ecrireSecret(String k, String? v) async {
    try {
      if (v == null) {
        await _secure.delete(key: k);
      } else {
        await _secure.write(key: k, value: v);
      }
    } catch (_) {}
  }

  static Future<String?> lire(String k) async => (await SharedPreferences.getInstance()).getString(k);

  static Future<void> ecrire(String k, String? v) async {
    final p = await SharedPreferences.getInstance();
    if (v == null) {
      await p.remove(k);
    } else {
      await p.setString(k, v);
    }
  }

  /// Déconnexion : on efface la session, on garde la langue et la clé de messagerie
  static Future<void> effacerSession() async {
    await ecrireSecret(kToken, null);
    await ecrireSecret(kRefresh, null);
    await ecrire(kStructure, null);
  }
}
