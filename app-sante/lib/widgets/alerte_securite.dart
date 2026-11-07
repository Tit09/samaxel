import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:just_audio/just_audio.dart';

import '../core/routeur.dart';
import '../core/session.dart';
import '../core/temps_reel.dart';
import '../core/theme.dart';

/// Supervision en temps réel : quand le serveur lève une alerte de sécurité (compte verrouillé,
/// accès anormaux, journal d'audit modifié…), le super-administrateur et la direction de l'hôpital
/// concerné voient aussitôt une bannière rouge, avec un signal sonore, par-dessus n'importe quel écran.
class AlertesSecuriteTempsReel extends ConsumerStatefulWidget {
  const AlertesSecuriteTempsReel({super.key, required this.child});
  final Widget child;
  @override
  ConsumerState<AlertesSecuriteTempsReel> createState() => _AlertesState();
}

class _AlertesState extends ConsumerState<AlertesSecuriteTempsReel> {
  StreamSubscription<Object?>? _sub;
  final _alertes = <Map<String, dynamic>>[];
  final _son = AudioPlayer();

  @override
  void initState() {
    super.initState();
    _sub = TempsReel.instance.filtre('alerte:nouvelle').listen((a) async {
      if (!mounted) return;
      setState(() => _alertes.insert(0, a));
      try {
        await _son.setAsset('assets/sons/alerte.mp3');
        await _son.play();
      } catch (_) {}
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    _son.dispose();
    super.dispose();
  }

  void _voir() {
    final u = ref.read(utilisateurProvider);
    setState(_alertes.clear);
    ref.read(routeurProvider).go(u?.role == 'SUPER_ADMIN' ? '/super' : '/notifications');
  }

  @override
  Widget build(BuildContext context) {
    if (_alertes.isEmpty) return widget.child;
    final a = _alertes.first;
    final heure = DateTime.tryParse('${a['created_at']}')?.toLocal();
    return Stack(children: [
      widget.child,
      Positioned(
        left: 12, right: 12, top: MediaQuery.paddingOf(context).top + 8,
        child: Material(
          elevation: 10,
          color: C.urgent,
          borderRadius: BorderRadius.circular(14),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 10, 6, 10),
            child: Row(children: [
              const Icon(Icons.gpp_bad_rounded, color: Colors.white, size: 34),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                  Text('Alerte de sécurité${_alertes.length > 1 ? ' (${_alertes.length})' : ''}',
                      style: const TextStyle(color: Colors.white70, fontSize: 12.5, fontWeight: FontWeight.w700)),
                  Text('${a['libelle'] ?? a['type']}', style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w800)),
                  Text([
                    a['structure'] ?? 'Plateforme',
                    if (heure != null) '${heure.hour.toString().padLeft(2, '0')}:${heure.minute.toString().padLeft(2, '0')}',
                  ].join(' · '), style: const TextStyle(color: Colors.white, fontSize: 13)),
                ]),
              ),
              TextButton(
                onPressed: _voir,
                style: TextButton.styleFrom(foregroundColor: Colors.white, backgroundColor: Colors.white24),
                child: const Text('Voir'),
              ),
              IconButton(
                tooltip: 'Fermer',
                onPressed: () => setState(_alertes.clear),
                icon: const Icon(Icons.close_rounded, color: Colors.white),
              ),
            ]),
          ),
        ),
      ),
    ]);
  }
}
