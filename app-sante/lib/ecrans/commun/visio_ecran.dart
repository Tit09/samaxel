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

/// Téléconsultation vidéo ET appels audio/vidéo de la messagerie, en WebRTC (sans service étranger).
///  1. Le serveur vérifie que l'on PARTICIPE (consultation ou conversation) et donne les serveurs ICE
///     (STUN + relais TURN de SAMA XHEL, identifiants valables 1 h).
///  2. Le WebSocket (Socket.IO) relaie la signalisation (offre, réponse, candidats) entre les deux.
///  3. L'image et le son vont directement d'un appareil à l'autre, chiffrés (DTLS-SRTP).
class VisioEcran extends ConsumerStatefulWidget {
  const VisioEcran({super.key, this.consultationId, this.appelId, this.mode = 'VIDEO', this.appelant = false, this.nom})
      : assert(consultationId != null || appelId != null);
  final String? consultationId;
  /// Appel lancé depuis une conversation (parent ↔ son soignant)
  final String? appelId;
  final String mode; // VIDEO ou AUDIO
  final bool appelant; // c'est moi qui appelle : on attend que l'autre décroche
  final String? nom;
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
  bool get _audio => widget.mode == 'AUDIO';
  Timer? _chrono;
  Duration _duree = Duration.zero;
  bool _fini = false;
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
      if (widget.consultationId != null) {
        final r = await Api.instance.get('/teleconsultation/${widget.consultationId}/join');
        _ice = ((r['ice'] as List?) ?? []).map((e) => Map<String, dynamic>.from(e)).toList();
      }
      _flux = await navigator.mediaDevices.getUserMedia({
        'audio': true,
        'video': _audio ? false : {'facingMode': 'user', 'width': {'ideal': 640}, 'height': {'ideal': 480}, 'frameRate': {'ideal': 20}},
      });
      _local.srcObject = _flux;
      setState(() => _etat = widget.appelant ? 'Ça sonne chez ${widget.nom ?? 'votre interlocuteur'}…' : 'En attente de l’autre participant…');

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
        final (evenement, donnees) = widget.appelId != null
            ? ('appel:rejoindre', <String, dynamic>{'appelId': widget.appelId})
            : ('visio:rejoindre', <String, dynamic>{'consultationId': widget.consultationId, 'structureId': ?structure});
        s.emitWithAck(evenement, donnees, ack: (rep) async {
          final m = Map<String, dynamic>.from((rep is List && rep.isNotEmpty ? rep.first : rep) as Map);
          if (m['ok'] != true) {
            if (mounted) setState(() => _erreur = 'Accès refusé (${m['erreur'] ?? ''}).');
            return;
          }
          _ice = ((m['ice'] as List?) ?? _ice).map((e) => Map<String, dynamic>.from(e)).toList();
          if (m['initiateur'] == true) await _appeler();
        });
      });
      s.on('visio:arrivee', (_) { if (mounted) setState(() => _etat = 'Connexion à l’autre participant…'); });
      // Appel refusé, manqué ou raccroché par l'autre
      s.on('appel:fin', (d) {
        final m = d is Map ? d : {};
        if (m['appel_id'] != widget.appelId || !mounted) return;
        final statut = m['statut'];
        _terminer(statut == 'REFUSE'
            ? '${widget.nom ?? 'Votre interlocuteur'} ne peut pas répondre maintenant.'
            : statut == 'MANQUE' ? 'Pas de réponse. Il verra votre appel manqué.' : 'Appel terminé.');
      });
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
        if (!_connecte) {
          _chrono?.cancel();
          _chrono = Timer.periodic(const Duration(seconds: 1), (_) { if (mounted) setState(() => _duree += const Duration(seconds: 1)); });
        }
        if (mounted) setState(() { _connecte = true; _etat = widget.appelId != null ? 'En communication' : 'En consultation'; });
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
    if (widget.appelId != null) {
      try {
        await Api.instance.post('/appels/${widget.appelId}/fin');
      } catch (_) {}
    }
    _fini = true;
    if (mounted) Navigator.of(context).maybePop();
  }

  /// L'autre a refusé, n'a pas répondu ou a raccroché : on l'affiche puis on ferme
  void _terminer(String message) {
    if (_fini) return;
    _fini = true;
    _chrono?.cancel();
    setState(() { _connecte = false; _etat = message; });
    Future<void>.delayed(const Duration(seconds: 3), () { if (mounted) Navigator.of(context).maybePop(); });
  }

  String get _dureeTexte => '${_duree.inMinutes.toString().padLeft(2, '0')}:${(_duree.inSeconds % 60).toString().padLeft(2, '0')}';

  @override
  void dispose() {
    _chrono?.cancel();
    if (widget.appelId != null && !_fini) Api.instance.post('/appels/${widget.appelId}/fin').catchError((_) => <String, dynamic>{});
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
      return Scaffold(appBar: AppBar(title: Text(widget.appelId != null ? 'Appel' : 'Consultation vidéo')), body: VueErreur(ApiException(_erreur!, code: 'VISIO')));
    }
    if (_audio) return _vueAudio();
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
                Text(_connecte ? (widget.appelId != null ? 'Chiffré · $_dureeTexte' : 'Chiffré de bout en bout') : _etat, style: const TextStyle(color: Colors.white, fontSize: 12.5)),
              ]),
            ),
          ),
          Positioned(
            left: 0, right: 0, bottom: 24,
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              _Rond(icone: _micro ? Icons.mic_rounded : Icons.mic_off_rounded, onTap: _basculerMicro, libelle: _micro ? 'Couper le micro' : 'Rétablir le micro'),
              const SizedBox(width: 18),
              _Rond(icone: Icons.call_end_rounded, couleur: C.urgent, onTap: _raccrocher, grand: true, libelle: 'Raccrocher'),
              const SizedBox(width: 18),
              _Rond(icone: _camera ? Icons.videocam_rounded : Icons.videocam_off_rounded, onTap: _basculerCamera, libelle: _camera ? 'Couper la caméra' : 'Rétablir la caméra'),
            ]),
          ),
        ]),
      ),
    );
  }
}

extension on _VisioEcranState {
  /// Appel audio : grand visage (initiale), nom, état et durée ; boutons très gros
  Widget _vueAudio() {
    final nom = widget.nom ?? 'Votre interlocuteur';
    return Scaffold(
      backgroundColor: const Color(0xFF0B1A12),
      body: SafeArea(
        child: Column(children: [
          // Le son de l'autre est joué par ce lecteur (invisible)
          SizedBox(width: 1, height: 1, child: RTCVideoView(_distant)),
          const Spacer(),
          CircleAvatar(
            radius: 64,
            backgroundColor: C.vert,
            child: Text(nom.isEmpty ? '?' : nom.characters.first.toUpperCase(),
                style: const TextStyle(color: Colors.white, fontSize: 56, fontWeight: FontWeight.w800)),
          ),
          const SizedBox(height: 20),
          Text(nom, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          Text(_connecte ? _dureeTexte : _etat, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white70, fontSize: 18)),
          const SizedBox(height: 8),
          const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(Icons.lock_rounded, color: Colors.white54, size: 14),
            SizedBox(width: 6),
            Text('Appel privé, chiffré', style: TextStyle(color: Colors.white54, fontSize: 13)),
          ]),
          const Spacer(),
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            _Rond(icone: _micro ? Icons.mic_rounded : Icons.mic_off_rounded, onTap: _basculerMicro, libelle: _micro ? 'Couper le micro' : 'Rétablir le micro'),
            const SizedBox(width: 28),
            _Rond(icone: Icons.call_end_rounded, couleur: C.urgent, onTap: _raccrocher, grand: true, libelle: 'Raccrocher'),
          ]),
          const SizedBox(height: 40),
        ]),
      ),
    );
  }
}

class _Rond extends StatelessWidget {
  const _Rond({required this.icone, required this.onTap, required this.libelle, this.couleur = Colors.white24, this.grand = false});
  final IconData icone;
  final String libelle;
  final VoidCallback onTap;
  final Color couleur;
  final bool grand;
  @override
  Widget build(BuildContext context) => Semantics(
      button: true,
      label: libelle,
      child: Material(
        color: couleur,
        shape: const CircleBorder(),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: Padding(padding: EdgeInsets.all(grand ? 20 : 15), child: Icon(icone, color: Colors.white, size: grand ? 32 : 26)),
        ),
      ));
}
