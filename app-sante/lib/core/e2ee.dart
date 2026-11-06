import 'dart:convert';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';

import 'api.dart';
import 'stockage.dart';

/// Messagerie chiffrée de bout en bout, lisible sur TOUS les appareils de l'utilisateur.
///
///  1. Chaque COMPTE possède une paire de clés X25519 ; seule la clé PUBLIQUE est lisible par le serveur.
///  2. Secret partagé = X25519(ma clé privée, clé publique de l'autre) — identique des deux côtés.
///  3. Clé de message = HKDF-SHA256(secret, info = id de la conversation).
///  4. Chiffrement AES-256-GCM avec un nonce aléatoire de 12 octets (texte comme message vocal).
///
/// Sauvegarde de la clé (comme les sauvegardes chiffrées de WhatsApp) : à la connexion, l'appareil
/// tire une clé du MOT DE PASSE (PBKDF2-SHA256, 200 000 tours, sel aléatoire), chiffre la clé privée
/// avec, et dépose ce coffre sur le serveur. Le serveur ne connaît pas le mot de passe : il ne peut
/// pas ouvrir le coffre. Sur un nouveau téléphone ou ordinateur, la connexion avec le mot de passe
/// rouvre le coffre → la même clé → les anciens messages restent lisibles.
/// Seuls les deux participants lisent : ni SAMA XHEL, ni les autres soignants, ni la direction.
class E2ee {
  E2ee._();
  static final E2ee instance = E2ee._();

  static const _tours = 200000;
  final _x25519 = X25519();
  final _aes = AesGcm.with256bits();
  final _hkdf = Hkdf(hmac: Hmac.sha256(), outputLength: 32);
  SimpleKeyPair? _paire;
  String? _userId;

  /// Oublie la clé en mémoire (déconnexion). La clé reste rangée sur l'appareil sous l'identifiant
  /// de l'utilisateur, et sa sauvegarde chiffrée reste sur le serveur.
  void oublier() {
    _paire = null;
    _userId = null;
  }

  bool get prete => _paire != null;

  Pbkdf2 _pbkdf2(int tours) => Pbkdf2(macAlgorithm: Hmac.sha256(), iterations: tours, bits: 256);

  Future<SecretKey> _cleDuMotDePasse(String motDePasse, List<int> sel, int tours) =>
      _pbkdf2(tours).deriveKey(secretKey: SecretKey(utf8.encode(motDePasse)), nonce: sel);

  /// Prépare la clé de CET utilisateur.
  /// [motDePasse] n'est connu qu'au moment de la connexion : il sert à ouvrir (ou créer) la sauvegarde.
  Future<void> initialiser(String userId, {String? motDePasse}) async {
    // Une seule préparation à la fois : la connexion (avec mot de passe) et l'ouverture d'une
    // conversation peuvent la demander en même temps ; la seconde attend la première.
    while (_tache != null) {
      try {
        await _tache;
      } catch (_) {}
    }
    if (_paire != null && _userId == userId && motDePasse == null) return;
    final tache = _preparer(userId, motDePasse);
    _tache = tache;
    try {
      await tache;
    } finally {
      if (identical(_tache, tache)) _tache = null;
    }
  }

  Future<void>? _tache;

  Future<void> _preparer(String userId, String? motDePasse) async {
    _userId = userId;
    final nomCle = '${Stockage.kClePrivee}_$userId';
    final locale = await Stockage.lireSecret(nomCle);
    List<int>? graine = locale == null ? null : base64Decode(locale);

    Map<String, dynamic>? sauvegarde;
    try {
      final r = await Api.instance.get('/users/me/cle-messagerie');
      if (r['sauvegarde'] is Map) sauvegarde = Map<String, dynamic>.from(r['sauvegarde']);
    } catch (_) {}

    var aSauvegarder = false;
    if (sauvegarde != null && motDePasse != null) {
      // Nouvel appareil (ou appareil déjà connu) : on rouvre le coffre avec le mot de passe
      final ouverte = await _ouvrirCoffre(sauvegarde, motDePasse);
      if (ouverte != null) {
        graine = ouverte;
      } else {
        // Mot de passe changé depuis : on garde la clé de cet appareil et on refait le coffre
        aSauvegarder = true;
      }
    } else if (sauvegarde == null) {
      aSauvegarder = true;
    }

    if (graine == null) {
      if (sauvegarde != null && motDePasse == null) {
        // Coffre présent mais pas de mot de passe (session restaurée) : il faudra se reconnecter
        _paire = null;
        throw StateError('Reconnectez-vous avec votre mot de passe pour lire vos messages sur cet appareil.');
      }
      final nouvelle = await _x25519.newKeyPair();
      graine = await nouvelle.extractPrivateKeyBytes();
      aSauvegarder = true;
    }
    final paire = await _x25519.newKeyPairFromSeed(graine);
    final publique = base64Encode((await paire.extractPublicKey()).bytes);
    if (motDePasse == null && sauvegarde != null && sauvegarde['pk'] != publique) {
      // Cet appareil a une ancienne clé, le compte en a une autre (sauvegardée depuis un autre appareil) :
      // on ne l'écrase pas, on demande le mot de passe pour récupérer la bonne.
      _paire = null;
      throw StateError('Reconnectez-vous avec votre mot de passe pour lire vos messages sur cet appareil.');
    }
    await Stockage.ecrireSecret(nomCle, base64Encode(graine));
    _paire = paire;

    if (aSauvegarder && motDePasse != null) {
      await _deposerCoffre(graine, publique, motDePasse);
    } else {
      await Api.instance.put('/users/me/public-key', {'public_key': publique});
    }
  }

  Future<List<int>?> _ouvrirCoffre(Map<String, dynamic> s, String motDePasse) async {
    try {
      final cle = await _cleDuMotDePasse(motDePasse, base64Decode(s['sel']), (s['iter'] as num).toInt());
      final octets = base64Decode(s['c']);
      final boite = SecretBox(octets.sublist(0, octets.length - 16),
          nonce: base64Decode(s['nonce']), mac: Mac(octets.sublist(octets.length - 16)));
      return await _aes.decrypt(boite, secretKey: cle);
    } catch (_) {
      return null;
    }
  }

  Future<void> _deposerCoffre(List<int> graine, String publique, String motDePasse) async {
    final sel = _aes.newNonce() + _aes.newNonce().sublist(0, 4); // 16 octets aléatoires
    final cle = await _cleDuMotDePasse(motDePasse, sel, _tours);
    final nonce = _aes.newNonce();
    final boite = await _aes.encrypt(graine, secretKey: cle, nonce: nonce);
    await Api.instance.put('/users/me/cle-messagerie', {
      'c': base64Encode([...boite.cipherText, ...boite.mac.bytes]),
      'sel': base64Encode(sel),
      'nonce': base64Encode(nonce),
      'iter': _tours,
      'pk': publique,
    });
  }

  Future<SecretKey> _cle(String clePubliqueAutre, String conversationId) async {
    if (_paire == null) throw StateError('Messagerie non prête : reconnectez-vous.');
    final partage = await _x25519.sharedSecretKey(
      keyPair: _paire!,
      remotePublicKey: SimplePublicKey(base64Decode(clePubliqueAutre), type: KeyPairType.x25519),
    );
    return _hkdf.deriveKey(secretKey: partage, nonce: const [], info: utf8.encode('sama-xhel:$conversationId'));
  }

  Future<({String ciphertext, String nonce})> chiffrerOctets(List<int> clair, String clePubliqueAutre, String conversationId) async {
    final cle = await _cle(clePubliqueAutre, conversationId);
    final nonce = _aes.newNonce();
    final boite = await _aes.encrypt(clair, secretKey: cle, nonce: nonce);
    return (ciphertext: base64Encode([...boite.cipherText, ...boite.mac.bytes]), nonce: base64Encode(nonce));
  }

  Future<Uint8List?> dechiffrerOctets(String ciphertext, String nonce, String clePubliqueAutre, String conversationId) async {
    try {
      final cle = await _cle(clePubliqueAutre, conversationId);
      final octets = base64Decode(ciphertext);
      final boite = SecretBox(octets.sublist(0, octets.length - 16),
          nonce: base64Decode(nonce), mac: Mac(octets.sublist(octets.length - 16)));
      return Uint8List.fromList(await _aes.decrypt(boite, secretKey: cle));
    } catch (_) {
      return null;
    }
  }

  Future<({String ciphertext, String nonce})> chiffrer(String texte, String clePubliqueAutre, String conversationId) =>
      chiffrerOctets(utf8.encode(texte), clePubliqueAutre, conversationId);

  Future<String> dechiffrer(String ciphertext, String nonce, String clePubliqueAutre, String conversationId) async {
    final o = await dechiffrerOctets(ciphertext, nonce, clePubliqueAutre, conversationId);
    return o == null ? '🔒 Message envoyé avant le changement de clé : illisible' : utf8.decode(o);
  }
}
