import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api.dart';
import 'e2ee.dart';
import 'maison.dart';
import 'modeles.dart';
import 'stockage.dart';
import 'temps_reel.dart';

/// État de la session.
class EtatSession {
  const EtatSession({this.verification = true, this.user});
  final bool verification; // vrai pendant la vérification au démarrage
  final Utilisateur? user;

  bool get connecte => user != null;
}

/// Résultat d'une tentative de connexion.
sealed class ResultatConnexion {}

class Connecte extends ResultatConnexion {}

class MfaRequis extends ResultatConnexion {
  MfaRequis(this.mfaToken, this.destination);
  final String mfaToken;
  final String destination;
}

/// Le personnel doit entrer par le portail de son établissement : le serveur indique lequel
class PortailRequis extends ResultatConnexion {
  PortailRequis(this.portails);
  final List<Map<String, dynamic>> portails;
}

class ActivationRequise extends ResultatConnexion {
  ActivationRequise(this.identifiant, this.destination);
  final String identifiant;
  final String destination;
}

class SessionNotifier extends Notifier<EtatSession> {
  StreamSubscription<void>? _sub;

  @override
  EtatSession build() {
    _sub = Api.instance.sessionExpiree.stream.listen((_) => deconnexionLocale());
    ref.onDispose(() => _sub?.cancel());
    Future.microtask(_restaurer);
    return const EtatSession();
  }

  final _api = Api.instance;

  Future<void> _restaurer() async {
    final token = await Stockage.lireSecret(Stockage.kToken);
    if (token == null) {
      state = const EtatSession(verification: false);
      return;
    }
    try {
      final r = await _api.get('/auth/me');
      state = EtatSession(verification: false, user: Utilisateur.fromJson(r['user']));
      _activerMessagerie();
    } catch (_) {
      await Stockage.effacerSession();
      state = const EtatSession(verification: false);
    }
  }

  Future<void> _ouvrir(Map<String, dynamic> r) async {
    await Stockage.ecrireSecret(Stockage.kToken, r['token']);
    await Stockage.ecrireSecret(Stockage.kRefresh, r['refresh_token']);
    final u = Utilisateur.fromJson(r['user']);
    await Stockage.ecrire(Stockage.kStructure, u.estPro ? u.structureId : null);
    state = EtatSession(verification: false, user: u);
    _activerMessagerie();
    TempsReel.instance.connecter();
  }

  /// Publie la clé publique de messagerie dès la connexion : les autres peuvent alors
  /// écrire à cet utilisateur même s'il n'a encore jamais ouvert la messagerie.
  void _activerMessagerie() {
    final u = state.user;
    if (u == null || u.role == 'SUPER_ADMIN') return;
    E2ee.instance.initialiser(u.id).catchError((_) {});
  }

  Future<ResultatConnexion> connexion(String identifiant, String motDePasse, {String? portail}) async {
    try {
      final r = await _api.post('/auth/login', {'identifier': identifiant.trim(), 'password': motDePasse, if (portail != null) 'portail': portail});
      if (r['mfa_required'] == true) {
        return MfaRequis(r['mfa_token'], r['verification']?['destination'] ?? '');
      }
      await _ouvrir(r);
      // Famille entrée par le portail d'un hôpital : l'application s'ouvre dans cet hôpital
      if (r['portail'] is Map) {
        await ref.read(maisonActiveProvider.notifier).entrer(r['portail']['code']);
        maisonAOuvrir = r['portail']['code'];
      }
      return Connecte();
    } on ApiException catch (e) {
      if (e.code == 'PORTAIL_REQUIS' && e.details is Map) {
        return PortailRequis(((e.details['portails'] as List?) ?? []).map((p) => Map<String, dynamic>.from(p)).toList());
      }
      if (e.code == 'ACCOUNT_NOT_VERIFIED') {
        return ActivationRequise(identifiant.trim(), (e.details is Map ? e.details['destination'] : null) ?? '');
      }
      rethrow;
    }
  }

  Future<void> validerMfa(String mfaToken, String code) async {
    final r = await _api.post('/auth/mfa/verify', {'mfa_token': mfaToken, 'code': code});
    await _ouvrir(r);
  }

  /// Inscription d'un parent → renvoie la destination masquée du code
  Future<String> inscription(Map<String, dynamic> donnees) async {
    final r = await _api.post('/auth/register', donnees);
    return r['verification']?['destination'] ?? '';
  }

  Future<void> activer(String identifiant, String code) async {
    final r = await _api.post('/auth/verify', {'identifier': identifiant, 'code': code});
    if (r['token'] != null) await _ouvrir(r);
  }

  Future<void> renvoyerCode(String identifiant, String purpose) =>
      _api.post('/auth/resend-code', {'identifier': identifiant, 'purpose': purpose});

  Future<void> reinitialiser(String identifiant, String code, String nouveau) =>
      _api.post('/auth/password/reset', {'identifier': identifiant, 'code': code, 'nouveau_mot_de_passe': nouveau});

  /// Professionnel : changer de structure active (cahier des charges F8)
  Future<void> changerStructure(String structureId) async {
    final r = await _api.post('/auth/switch-structure', {'structure_id': structureId});
    await _ouvrir(r);
  }

  Future<void> rafraichirProfil() async {
    final r = await _api.get('/auth/me');
    state = EtatSession(verification: false, user: Utilisateur.fromJson(r['user']));
  }

  Future<void> deconnexion() async {
    try {
      await _api.post('/auth/logout', {'refresh_token': await Stockage.lireSecret(Stockage.kRefresh)});
    } catch (_) {}
    await deconnexionLocale();
  }

  Future<void> deconnexionLocale() async {
    TempsReel.instance.deconnecter();
    E2ee.instance.oublier();
    await Stockage.effacerSession();
    state = const EtatSession(verification: false);
  }
}

final sessionProvider = NotifierProvider<SessionNotifier, EtatSession>(SessionNotifier.new);
final utilisateurProvider = Provider<Utilisateur?>((ref) => ref.watch(sessionProvider).user);
