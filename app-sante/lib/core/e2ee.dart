import 'dart:convert';

import 'package:cryptography/cryptography.dart';

import 'api.dart';
import 'stockage.dart';

/// Messagerie chiffrée de bout en bout.
///
///  1. Chaque appareil possède une paire de clés X25519 ; seule la clé PUBLIQUE est envoyée au serveur.
///  2. Secret partagé = X25519(ma clé privée, clé publique de l'autre) — identique des deux côtés.
///  3. Clé de message = HKDF-SHA256(secret, info = id de la conversation).
///  4. Chiffrement AES-256-GCM avec un nonce aléatoire de 12 octets.
/// Le serveur ne stocke que le texte chiffré : il ne peut pas lire les messages.
class E2ee {
  E2ee._();
  static final E2ee instance = E2ee._();

  final _x25519 = X25519();
  final _aes = AesGcm.with256bits();
  final _hkdf = Hkdf(hmac: Hmac.sha256(), outputLength: 32);
  SimpleKeyPair? _paire;
  String? _userId;

  /// Oublie la clé en mémoire (déconnexion). La clé privée reste sur l'appareil,
  /// rangée sous l'identifiant de l'utilisateur : elle resservira à sa prochaine connexion.
  void oublier() {
    _paire = null;
    _userId = null;
  }

  /// Crée (au premier usage) la paire de clés de CET utilisateur sur cet appareil et publie la clé publique.
  /// Chaque compte a sa propre clé : deux personnes qui partagent un téléphone ne lisent pas les messages l'une de l'autre.
  Future<void> initialiser(String userId) async {
    if (_paire != null && _userId == userId) return;
    _paire = null;
    _userId = userId;
    final nomCle = '${Stockage.kClePrivee}_$userId';
    final stockee = await Stockage.lireSecret(nomCle);
    if (stockee != null) {
      _paire = await _x25519.newKeyPairFromSeed(base64Decode(stockee));
    } else {
      _paire = await _x25519.newKeyPair();
      final privee = await _paire!.extractPrivateKeyBytes();
      await Stockage.ecrireSecret(nomCle, base64Encode(privee));
    }
    final publique = await _paire!.extractPublicKey();
    await Api.instance.put('/users/me/public-key', {'public_key': base64Encode(publique.bytes)});
  }

  Future<SecretKey> _cle(String clePubliqueAutre, String conversationId) async {
    if (_paire == null) throw StateError('E2EE non initialisé');
    final partage = await _x25519.sharedSecretKey(
      keyPair: _paire!,
      remotePublicKey: SimplePublicKey(base64Decode(clePubliqueAutre), type: KeyPairType.x25519),
    );
    return _hkdf.deriveKey(secretKey: partage, nonce: const [], info: utf8.encode('sama-xhel:$conversationId'));
  }

  Future<({String ciphertext, String nonce})> chiffrer(String texte, String clePubliqueAutre, String conversationId) async {
    final cle = await _cle(clePubliqueAutre, conversationId);
    final nonce = _aes.newNonce();
    final boite = await _aes.encrypt(utf8.encode(texte), secretKey: cle, nonce: nonce);
    return (
      ciphertext: base64Encode([...boite.cipherText, ...boite.mac.bytes]),
      nonce: base64Encode(nonce),
    );
  }

  Future<String> dechiffrer(String ciphertext, String nonce, String clePubliqueAutre, String conversationId) async {
    try {
      final cle = await _cle(clePubliqueAutre, conversationId);
      final octets = base64Decode(ciphertext);
      final boite = SecretBox(
        octets.sublist(0, octets.length - 16),
        nonce: base64Decode(nonce),
        mac: Mac(octets.sublist(octets.length - 16)),
      );
      return utf8.decode(await _aes.decrypt(boite, secretKey: cle));
    } catch (_) {
      return '🔒 Message chiffré pour un autre appareil : illisible ici';
    }
  }
}
