import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:just_audio/just_audio.dart';

import '../core/api.dart';
import '../core/routeur.dart';
import '../core/temps_reel.dart';
import '../core/theme.dart';

/// Écran d'appel entrant, affiché par-dessus toute l'application quand le WebSocket annonce
/// « appel:entrant » : grand nom, sonnerie, deux gros boutons (vert = décrocher, rouge = refuser).
/// Pensé pour une personne qui ne lit pas : les couleurs et les icônes suffisent.
class AppelsEntrants extends ConsumerStatefulWidget {
  const AppelsEntrants({super.key, required this.child});
  final Widget child;
  @override
  ConsumerState<AppelsEntrants> createState() => _AppelsEntrantsState();
}

class _AppelsEntrantsState extends ConsumerState<AppelsEntrants> {
  StreamSubscription<Object?>? _entrant;
  StreamSubscription<Object?>? _fin;
  Map<String, dynamic>? _appel;
  final _sonnerie = AudioPlayer();

  @override
  void initState() {
    super.initState();
    _entrant = TempsReel.instance.filtre('appel:entrant').listen((d) {
      setState(() => _appel = d);
      _sonner();
    });
    _fin = TempsReel.instance.filtre('appel:fin').listen((d) {
      if (_appel != null && d['appel_id'] == _appel!['appel_id']) _fermer();
    });
  }

  Future<void> _sonner() async {
    try {
      await _sonnerie.setAsset('assets/sons/sonnerie.mp3');
      await _sonnerie.setLoopMode(LoopMode.one);
      await _sonnerie.play();
    } catch (_) {}
  }

  void _fermer() {
    _sonnerie.stop().catchError((_) {});
    if (mounted) setState(() => _appel = null);
  }

  Future<void> _repondre(bool accepte) async {
    final a = _appel;
    if (a == null) return;
    _fermer();
    try {
      await Api.instance.post('/appels/${a['appel_id']}/repondre', {'accepte': accepte});
      if (!accepte) return;
      ref.read(routeurProvider).push(Uri(path: '/appel/${a['appel_id']}', queryParameters: {
        'mode': a['mode'] == 'AUDIO' ? 'AUDIO' : 'VIDEO',
        'nom': (a['de'] is Map ? a['de']['nom'] : null) ?? '',
      }).toString());
    } catch (_) {}
  }

  @override
  void dispose() {
    _entrant?.cancel();
    _fin?.cancel();
    _sonnerie.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final a = _appel;
    return Stack(children: [
      widget.child,
      if (a != null)
        Positioned.fill(
          child: Material(
            color: const Color(0xF20B1A12),
            child: SafeArea(
              child: Column(children: [
                const Spacer(),
                Icon(a['mode'] == 'AUDIO' ? Icons.call_rounded : Icons.videocam_rounded, color: Colors.white70, size: 40),
                const SizedBox(height: 12),
                Text(
                  (a['de'] is Map ? a['de']['nom'] : null) ?? 'Appel',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 8),
                Text(a['mode'] == 'AUDIO' ? 'vous appelle' : 'vous appelle en vidéo',
                    style: const TextStyle(color: Colors.white70, fontSize: 18)),
                const Spacer(),
                Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
                  _Bouton(couleur: C.urgent, icone: Icons.call_end_rounded, libelle: 'Refuser', onTap: () => _repondre(false)),
                  _Bouton(couleur: C.vert, icone: a['mode'] == 'AUDIO' ? Icons.call_rounded : Icons.videocam_rounded, libelle: 'Décrocher', onTap: () => _repondre(true)),
                ]),
                const SizedBox(height: 48),
              ]),
            ),
          ),
        ),
    ]);
  }
}

class _Bouton extends StatelessWidget {
  const _Bouton({required this.couleur, required this.icone, required this.libelle, required this.onTap});
  final Color couleur;
  final IconData icone;
  final String libelle;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Column(mainAxisSize: MainAxisSize.min, children: [
        Semantics(
          button: true,
          label: libelle,
          child: Material(
            color: couleur,
            shape: const CircleBorder(),
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: onTap,
              child: Padding(padding: const EdgeInsets.all(26), child: Icon(icone, color: Colors.white, size: 40)),
            ),
          ),
        ),
        const SizedBox(height: 10),
        Text(libelle, style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700)),
      ]);
}
