import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

import 'config.dart';
import 'stockage.dart';

/// Connexion temps réel (Socket.IO) ouverte pendant la session :
/// le serveur prévient instantanément d'un nouveau message (sans en transmettre le contenu,
/// qui reste chiffré de bout en bout). Remplace l'interrogation toutes les 8 secondes : moins de
/// données mobiles et de batterie.
class TempsReel {
  TempsReel._();
  static final TempsReel instance = TempsReel._();

  io.Socket? _socket;
  final _evenements = StreamController<({String type, Map<String, dynamic> donnees})>.broadcast();

  Stream<({String type, Map<String, dynamic> donnees})> get evenements => _evenements.stream;

  /// Événements d'un seul type (ex. « caisse:maj » : un ticket payé d'avance à vérifier)
  Stream<Map<String, dynamic>> filtre(String type) => _evenements.stream.where((e) => e.type == type).map((e) => e.donnees);

  Future<void> connecter() async {
    final jeton = await Stockage.lireSecret(Stockage.kToken);
    if (jeton == null) return;
    _socket?.dispose();
    final s = io.io(AppConfig.apiUrl, io.OptionBuilder()
        .setPath('/socket.io')
        .setTransports(['websocket'])
        .setAuth({'token': jeton})
        .enableReconnection()
        .build());
    for (final ev in ['message:nouveau', 'caisse:maj', 'ticket:maj', 'appel:entrant', 'appel:accepte', 'appel:fin', 'alerte:nouvelle']) {
      s.on(ev, (d) => _evenements.add((type: ev, donnees: d is Map ? Map<String, dynamic>.from(d) : <String, dynamic>{})));
    }
    // Le jeton d'accès dure 15 min : à la reconnexion, on reprend le jeton renouvelé
    s.onReconnectAttempt((_) async => s.auth = {'token': await Stockage.lireSecret(Stockage.kToken)});
    _socket = s;
  }

  void deconnecter() {
    _socket?.dispose();
    _socket = null;
  }
}
