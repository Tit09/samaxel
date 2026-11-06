// StreamAudioSource est marqué « expérimental » par just_audio mais stable depuis plusieurs versions :
// il sert à lire un vocal en mémoire sur iOS/macOS/ordinateur sans l’écrire sur le disque.
// ignore_for_file: experimental_member_use

import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:just_audio/just_audio.dart';
import 'package:record/record.dart';

import '../core/api.dart';
import '../core/theme.dart';

/// Un message vocal enregistré : WAV 16 kHz mono (format attendu par l'IA vocale).
class Vocal {
  Vocal(this.octets, this.duree);
  final Uint8List octets;
  final Duration duree;
}

/// Bouton micro « comme WhatsApp » : on appuie une fois pour parler, une fois pour envoyer.
/// (Un appui maintenu est difficile pour certaines personnes : on préfère deux appuis simples.)
class EnregistreurVocal extends StatefulWidget {
  const EnregistreurVocal({super.key, required this.onVocal, this.dureeMax = const Duration(seconds: 60), this.libelle = 'Appuyez et parlez'});
  final Future<void> Function(Vocal vocal) onVocal;
  final Duration dureeMax;
  final String libelle;
  @override
  State<EnregistreurVocal> createState() => _EnregistreurVocalState();
}

class _EnregistreurVocalState extends State<EnregistreurVocal> with SingleTickerProviderStateMixin {
  final _rec = AudioRecorder();
  final _morceaux = BytesBuilder(copy: false);
  StreamSubscription<Uint8List>? _flux;
  StreamSubscription<Amplitude>? _niveauSub;
  Timer? _chrono;
  Duration _ecoule = Duration.zero;
  double _niveau = 0;
  bool _enCours = false;
  bool _envoi = false;
  String? _erreur;

  Future<void> _demarrer() async {
    setState(() => _erreur = null);
    if (!await _rec.hasPermission()) {
      setState(() => _erreur = 'Autorisez le micro pour parler à SAMA XHEL.');
      return;
    }
    _morceaux.clear();
    final flux = await _rec.startStream(const RecordConfig(
      encoder: AudioEncoder.pcm16bits,
      sampleRate: 16000,
      numChannels: 1,
      noiseSuppress: true,
      echoCancel: true,
    ));
    _flux = flux.listen(_morceaux.add);
    _niveauSub = _rec.onAmplitudeChanged(const Duration(milliseconds: 150)).listen((a) {
      if (mounted) setState(() => _niveau = ((a.current + 50) / 50).clamp(0.0, 1.0));
    });
    _ecoule = Duration.zero;
    _chrono = Timer.periodic(const Duration(seconds: 1), (_) {
      setState(() => _ecoule += const Duration(seconds: 1));
      if (_ecoule >= widget.dureeMax) _arreter(envoyer: true);
    });
    setState(() => _enCours = true);
  }

  Future<void> _arreter({required bool envoyer}) async {
    _chrono?.cancel();
    await _rec.stop();
    await _flux?.cancel();
    await _niveauSub?.cancel();
    final pcm = _morceaux.takeBytes();
    setState(() {
      _enCours = false;
      _niveau = 0;
    });
    if (!envoyer) return;
    if (pcm.length < 16000) {
      setState(() => _erreur = 'Message trop court : appuyez, parlez, puis appuyez de nouveau.');
      return;
    }
    setState(() => _envoi = true);
    try {
      await widget.onVocal(Vocal(wav16kMono(pcm), Duration(milliseconds: pcm.length ~/ 32)));
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  @override
  void dispose() {
    _chrono?.cancel();
    _flux?.cancel();
    _niveauSub?.cancel();
    _rec.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = _ecoule.inSeconds;
    return Column(mainAxisSize: MainAxisSize.min, children: [
      if (_erreur != null)
        Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(_erreur!, textAlign: TextAlign.center, style: const TextStyle(color: C.urgent))),
      Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        if (_enCours) ...[
          IconButton.outlined(
            tooltip: 'Annuler',
            onPressed: () => _arreter(envoyer: false),
            icon: const Icon(Icons.delete_outline),
            style: IconButton.styleFrom(minimumSize: const Size(56, 56), foregroundColor: C.urgent),
          ),
          const SizedBox(width: 20),
        ],
        Semantics(
          button: true,
          label: _enCours ? 'Envoyer le message vocal' : widget.libelle,
          child: GestureDetector(
            onTap: _envoi ? null : (_enCours ? () => _arreter(envoyer: true) : _demarrer),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 150),
              width: 88 + _niveau * 22,
              height: 88 + _niveau * 22,
              decoration: BoxDecoration(
                color: _enCours ? C.urgent : C.vert,
                shape: BoxShape.circle,
                boxShadow: [BoxShadow(color: (_enCours ? C.urgent : C.vert).withValues(alpha: .35), blurRadius: 18 + _niveau * 20)],
              ),
              child: _envoi
                  ? const Padding(padding: EdgeInsets.all(28), child: CircularProgressIndicator(color: Colors.white, strokeWidth: 3))
                  : Icon(_enCours ? Icons.send_rounded : Icons.mic_rounded, color: Colors.white, size: 44),
            ),
          ),
        ),
        if (_enCours) const SizedBox(width: 76),
      ]),
      const SizedBox(height: 8),
      Text(
        _envoi ? 'J’écoute votre message…' : (_enCours ? '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')} — appuyez pour envoyer' : widget.libelle),
        style: const TextStyle(fontWeight: FontWeight.w800, color: C.texteDoux),
      ),
    ]);
  }
}

/// Ajoute l'en-tête WAV à un flux PCM 16 bits 16 kHz mono.
Uint8List wav16kMono(Uint8List pcm) {
  final b = ByteData(44);
  void ecrire(int pos, String s) {
    for (var i = 0; i < s.length; i++) {
      b.setUint8(pos + i, s.codeUnitAt(i));
    }
  }

  ecrire(0, 'RIFF');
  b.setUint32(4, 36 + pcm.length, Endian.little);
  ecrire(8, 'WAVEfmt ');
  b.setUint32(16, 16, Endian.little);
  b.setUint16(20, 1, Endian.little);
  b.setUint16(22, 1, Endian.little);
  b.setUint32(24, 16000, Endian.little);
  b.setUint32(28, 32000, Endian.little);
  b.setUint16(32, 2, Endian.little);
  b.setUint16(34, 16, Endian.little);
  ecrire(36, 'data');
  b.setUint32(40, pcm.length, Endian.little);
  return (BytesBuilder()
        ..add(b.buffer.asUint8List())
        ..add(pcm))
      .takeBytes();
}

/// Lecteur d'un vocal stocké sur le serveur (téléchargé à la demande, jamais mis en cache sur le disque).
class LecteurVocal extends StatefulWidget {
  const LecteurVocal({super.key, required this.vocalId, this.duree, this.clair = false});
  final String vocalId;
  final double? duree;
  final bool clair;
  @override
  State<LecteurVocal> createState() => _LecteurVocalState();
}

class _LecteurVocalState extends State<LecteurVocal> {
  final _player = AudioPlayer();
  bool _charge = false;
  bool _chargement = false;

  Future<void> _basculer() async {
    if (_player.playing) {
      await _player.pause();
      return;
    }
    if (!_charge) {
      setState(() => _chargement = true);
      try {
        final f = await Api.instance.telecharger('/vocaux/${widget.vocalId}/audio');
        await _player.setAudioSource(sourceOctets(f.octets, f.type));
        _charge = true;
      } catch (_) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Lecture impossible pour le moment')));
        return;
      } finally {
        if (mounted) setState(() => _chargement = false);
      }
    }
    if (_player.processingState == ProcessingState.completed) await _player.seek(Duration.zero);
    await _player.play();
  }

  @override
  void dispose() {
    _player.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final couleur = widget.clair ? Colors.white : C.vert;
    return StreamBuilder<PlayerState>(
      stream: _player.playerStateStream,
      builder: (_, etat) {
        final lecture = etat.data?.playing == true && etat.data?.processingState != ProcessingState.completed;
        return Row(mainAxisSize: MainAxisSize.min, children: [
          IconButton(
            tooltip: lecture ? 'Pause' : 'Écouter',
            iconSize: 40,
            onPressed: _chargement ? null : _basculer,
            icon: _chargement
                ? SizedBox(width: 28, height: 28, child: CircularProgressIndicator(strokeWidth: 3, color: couleur))
                : Icon(lecture ? Icons.pause_circle_filled : Icons.play_circle_fill, color: couleur),
          ),
          StreamBuilder<Duration>(
            stream: _player.positionStream,
            builder: (_, pos) {
              final total = _player.duration?.inMilliseconds ?? ((widget.duree ?? 1) * 1000).round();
              final p = total == 0 ? 0.0 : ((pos.data?.inMilliseconds ?? 0) / total).clamp(0.0, 1.0);
              return SizedBox(
                width: 110,
                child: LinearProgressIndicator(
                  value: p,
                  minHeight: 5,
                  borderRadius: BorderRadius.circular(4),
                  color: couleur,
                  backgroundColor: couleur.withValues(alpha: .25),
                ),
              );
            },
          ),
          const SizedBox(width: 8),
          if (widget.duree != null)
            Text('${widget.duree!.round()} s', style: TextStyle(color: widget.clair ? Colors.white70 : C.texteDoux, fontSize: 12)),
        ]);
      },
    );
  }
}

/// Source audio en mémoire : URI « data: » sur le web et Android, flux sur iOS/macOS/ordinateur.
AudioSource sourceOctets(Uint8List octets, String type) {
  if (kIsWeb || defaultTargetPlatform == TargetPlatform.android) {
    return AudioSource.uri(Uri.dataFromBytes(octets, mimeType: type));
  }
  return _SourceMemoire(octets, type);
}

class _SourceMemoire extends StreamAudioSource {
  _SourceMemoire(this._octets, this._type);
  final Uint8List _octets;
  final String _type;

  @override
  Future<StreamAudioResponse> request([int? start, int? end]) async {
    start ??= 0;
    end ??= _octets.length;
    return StreamAudioResponse(
      sourceLength: _octets.length,
      contentLength: end - start,
      offset: start,
      stream: Stream.value(_octets.sublist(start, end)),
      contentType: _type,
    );
  }
}
