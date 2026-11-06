import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../core/api.dart';
import '../../core/config.dart';
import '../../core/session.dart';
import '../../core/stockage.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';

/// Téléconsultation vidéo en WebRTC (sans LiveKit ni service étranger).
///  1. Le serveur vérifie que l'on PARTICIPE à la consultation et donne les serveurs ICE
///     (STUN + relais TURN de SAMA XHEL, identifiants valables 1 h).
///  2. Socket.IO relaie la signalisation (offre, réponse, candidats) entre les deux participants.
///  3. L'image et le son vont directement d'un appareil à l'autre, chiffrés (DTLS-SRTP).
class VisioEcran extends ConsumerStatefulWidget {
  const VisioEcran({super.key, required this.consultationId});
  final String consultationId;
  @override
  ConsumerState<VisioEcran> createState() => _VisioEcranState();
}

class _VisioEcranState extends ConsumerState<VisioEcran> {
  final _local = RTCVideoRenderer();
  final _distant = RTCVideoRenderer();
  io.Socket? _socket;
  RTCPeerConnection? _pc;
  MediaStream? _flux;
  List<Map<String, dynamic>> _ice = [];
  String _etat = 'Connexion…';
  String? _erreur;
  bool _micro = true;
  bool _camera = true;
  bool _connecte = false;
  final List<RTCIceCandidate> _enAttente = [];
  bool _descriptionDistante = false;

  @override
  void initState() {
    super.initState();
    _demarrer();
  }

  Future<void> _demarrer() async {
    try {
      await _local.initialize();
      await _distant.initialize();
      final r = await Api.instance.get('/teleconsultation/${widget.consultationId}/join');
      _ice = ((r['ice'] as List?) ?? []).map((e) => Map<String, dynamic>.from(e)).toList();
      _flux = await navigator.mediaDevices.getUserMedia({
        'audio': true,
        'video': {'facingMode': 'user', 'width': {'ideal': 640}, 'height': {'ideal': 480}, 'frameRate': {'ideal': 20}},
      });
      _local.srcObject = _flux;
      setState(() => _etat = 'En attente de l’autre participant…');

      final jeton = await Stockage.lireSecret(Stockage.kToken);
      final s = io.io(AppConfig.apiUrl, io.OptionBuilder()
          .setPath('/socket.io')
          .setTransports(['websocket'])
          .setAuth({'token': jeton})
          // Connexion DÉDIÉE à la visio : sans forceNew, socket_io_client réutilise la connexion
          // temps réel déjà ouverte (même adresse) et l'événement « connect » ne se produit plus.
          .enableForceNew()
          .disableAutoConnect()
          .build());
      _socket = s;
      s.onConnect((_) {
        final structure = ref.read(utilisateurProvider)?.structureId;
        s.emitWithAck('visio:rejoindre', {'consultationId': widget.consultationId, 'structureId': ?structure}, ack: (rep) async {
          final m = Map<String, dynamic>.from((rep is List && rep.isNotEmpty ? rep.first : rep) as Map);
          if (m['ok'] != true) {
            if (mounted) setState(() => _erreur = 'Accès refusé à cette consultation (${m['erreur'] ?? ''}).');
            return;
          }
          _ice = ((m['ice'] as List?) ?? _ice).map((e) => Map<String, dynamic>.from(e)).toList();
          if (m['initiateur'] == true) await _appeler();
        });
      });
      s.on('visio:arrivee', (_) { if (mounted) setState(() => _etat = 'Connexion à l’autre participant…'); });
      s.on('visio:signal', (d) => _recevoir(Map<String, dynamic>.from(d as Map)));
      s.on('visio:depart', (_) async {
        await _pc?.close();
        _pc = null;
        _distant.srcObject = null;
        _descriptionDistante = false;
        if (mounted) setState(() { _connecte = false; _etat = 'L’autre participant a quitté. Il peut revenir.'; });
      });
      s.onConnectError((e) { if (mounted) setState(() => _erreur = 'Connexion au serveur impossible.'); });
      s.connect();
    } catch (e) {
      debugPrint('[Visio] $e');
      if (mounted) {
        setState(() => _erreur = e is ApiException ? e.message : 'Caméra ou micro indisponible. Autorisez-les dans les réglages, puis réessayez.');
      }
    }
  }

  Future<RTCPeerConnection> _connexion() async {
    if (_pc != null) return _pc!;
    final pc = await createPeerConnection({'iceServers': _ice, 'sdpSemantics': 'unified-plan'});
    for (final piste in _flux!.getTracks()) {
      await pc.addTrack(piste, _flux!);
    }
    pc.onIceCandidate = (c) {
      if (c.candidate != null) _socket?.emit('visio:signal', {'type': 'candidat', 'candidat': c.toMap()});
    };
    pc.onTrack = (ev) {
      if (ev.streams.isNotEmpty) {
        _distant.srcObject = ev.streams.first;
        if (mounted) setState(() { _connecte = true; _etat = 'En consultation'; });
      }
    };
    pc.onConnectionState = (etat) {
      if (!mounted) return;
      if (etat == RTCPeerConnectionState.RTCPeerConnectionStateFailed) setState(() => _etat = 'Connexion perdue : vérifiez internet.');
    };
    _pc = pc;
    return pc;
  }

  Future<void> _appeler() async {
    final pc = await _connexion();
    final offre = await pc.createOffer();
    await pc.setLocalDescription(offre);
    _socket?.emit('visio:signal', {'type': 'offre', 'sdp': offre.sdp});
  }

  Future<void> _recevoir(Map<String, dynamic> d) async {
    final pc = await _connexion();
    switch (d['type']) {
      case 'offre':
        await pc.setRemoteDescription(RTCSessionDescription(d['sdp'], 'offer'));
        _descriptionDistante = true;
        final rep = await pc.createAnswer();
        await pc.setLocalDescription(rep);
        _socket?.emit('visio:signal', {'type': 'reponse', 'sdp': rep.sdp});
        await _viderCandidats();
      case 'reponse':
        await pc.setRemoteDescription(RTCSessionDescription(d['sdp'], 'answer'));
        _descriptionDistante = true;
        await _viderCandidats();
      case 'candidat':
        final m = Map<String, dynamic>.from(d['candidat'] as Map);
        final c = RTCIceCandidate(m['candidate'], m['sdpMid'], m['sdpMLineIndex']);
        if (_descriptionDistante) {
          await pc.addCandidate(c);
        } else {
          _enAttente.add(c);
        }
    }
  }

  Future<void> _viderCandidats() async {
    for (final c in _enAttente) {
      await _pc?.addCandidate(c);
    }
    _enAttente.clear();
  }

  void _basculerMicro() {
    _micro = !_micro;
    for (final p in _flux?.getAudioTracks() ?? <MediaStreamTrack>[]) {
      p.enabled = _micro;
    }
    setState(() {});
  }

  void _basculerCamera() {
    _camera = !_camera;
    for (final p in _flux?.getVideoTracks() ?? <MediaStreamTrack>[]) {
      p.enabled = _camera;
    }
    setState(() {});
  }

  Future<void> _raccrocher() async {
    _socket?.emit('visio:quitter');
    if (mounted) Navigator.of(context).maybePop();
  }

  @override
  void dispose() {
    _socket?.emit('visio:quitter');
    _socket?.dispose();
    _pc?.close();
    for (final p in _flux?.getTracks() ?? <MediaStreamTrack>[]) {
      p.stop();
    }
    _flux?.dispose();
    _local.dispose();
    _distant.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_erreur != null) {
      return Scaffold(appBar: AppBar(title: const Text('Consultation vidéo')), body: VueErreur(ApiException(_erreur!, code: 'VISIO')));
    }
    return Scaffold(
      backgroundColor: const Color(0xFF0B1A12),
      body: SafeArea(
        child: Stack(children: [
          Positioned.fill(
            child: _connecte
                ? RTCVideoView(_distant, objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover)
                : Center(
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      const CircularProgressIndicator(color: Colors.white),
                      const SizedBox(height: 16),
                      Text(_etat, style: const TextStyle(color: Colors.white, fontSize: 16)),
                    ]),
                  ),
          ),
          Positioned(
            right: 14, top: 14, width: 110, height: 150,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: Container(color: Colors.black, child: RTCVideoView(_local, mirror: true, objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover)),
            ),
          ),
          Positioned(
            left: 16, top: 16,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(color: Colors.black45, borderRadius: BorderRadius.circular(20)),
              child: Row(children: [
                const Icon(Icons.lock_rounded, color: Colors.white, size: 14),
                const SizedBox(width: 6),
                Text(_connecte ? 'Chiffré de bout en bout' : _etat, style: const TextStyle(color: Colors.white, fontSize: 12.5)),
              ]),
            ),
          ),
          Positioned(
            left: 0, right: 0, bottom: 24,
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              _Rond(icone: _micro ? Icons.mic_rounded : Icons.mic_off_rounded, onTap: _basculerMicro),
              const SizedBox(width: 18),
              _Rond(icone: Icons.call_end_rounded, couleur: C.urgent, onTap: _raccrocher, grand: true),
              const SizedBox(width: 18),
              _Rond(icone: _camera ? Icons.videocam_rounded : Icons.videocam_off_rounded, onTap: _basculerCamera),
            ]),
          ),
        ]),
      ),
    );
  }
}

class _Rond extends StatelessWidget {
  const _Rond({required this.icone, required this.onTap, this.couleur = Colors.white24, this.grand = false});
  final IconData icone;
  final VoidCallback onTap;
  final Color couleur;
  final bool grand;
  @override
  Widget build(BuildContext context) => Material(
        color: couleur,
        shape: const CircleBorder(),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: Padding(padding: EdgeInsets.all(grand ? 20 : 15), child: Icon(icone, color: Colors.white, size: grand ? 32 : 26)),
        ),
      );
}
