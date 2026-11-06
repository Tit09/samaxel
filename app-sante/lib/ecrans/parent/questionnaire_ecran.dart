import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';

import '../../core/api.dart';
import '../../core/donnees.dart';
import '../../core/modeles.dart';
import '../../core/theme.dart';
import '../../core/voix.dart';
import '../../widgets/communs.dart';

/// Une question par écran, gros boutons de réponse, lecture vocale de chaque question.
class QuestionnaireEcran extends ConsumerStatefulWidget {
  const QuestionnaireEcran({super.key, required this.code, this.enfantId});
  final String code;
  final String? enfantId;
  @override
  ConsumerState<QuestionnaireEcran> createState() => _QuestionnaireEcranState();
}

class _QuestionnaireEcranState extends ConsumerState<QuestionnaireEcran> {
  int _index = 0;
  final Map<int, int> _reponses = {};
  bool _envoi = false;
  bool _debutLu = false;

  /// Au début du test : la consigne puis la première question, à voix haute dans la langue choisie
  Future<void> _commencer(Questionnaire q) async {
    final langue = ref.read(langueProvider);
    if (!await GuideVocal.instance.guideAuto(langue) || !mounted) return;
    if (q.consigne != null) {
      await GuideVocal.instance.lire(cle: '${q.code.toLowerCase()}_consigne', texteFr: q.consigne!, langue: langue);
    }
    if (mounted && _index == 0) _lire(q);
  }

  @override
  void dispose() {
    GuideVocal.instance.arreter();
    super.dispose();
  }

  Future<({double? lat, double? lng})> _position() async {
    try {
      var p = await Geolocator.checkPermission();
      if (p == LocationPermission.denied) p = await Geolocator.requestPermission();
      if (p == LocationPermission.denied || p == LocationPermission.deniedForever) return (lat: null, lng: null);
      final pos = await Geolocator.getCurrentPosition(locationSettings: const LocationSettings(accuracy: LocationAccuracy.low)).timeout(const Duration(seconds: 8));
      return (lat: pos.latitude, lng: pos.longitude);
    } catch (_) {
      return (lat: null, lng: null);
    }
  }

  Future<void> _envoyer(Questionnaire q) async {
    setState(() => _envoi = true);
    try {
      final pos = await _position();
      final r = await Api.instance.post('/depistages', {
        'questionnaire_code': q.code,
        if (widget.enfantId != null) 'enfant_id': widget.enfantId,
        'reponses': _reponses.map((k, v) => MapEntry('$k', v)),
        if (pos.lat != null) 'lat': pos.lat,
        if (pos.lng != null) 'lng': pos.lng,
      });
      if (widget.enfantId != null) {
        ref.invalidate(depistagesProvider(widget.enfantId));
        ref.invalidate(enfantDetailProvider(widget.enfantId!));
      }
      if (mounted) context.pushReplacement('/resultat', extra: {...r, 'titre': q.titre, 'enfant_id': widget.enfantId});
    } catch (e) {
      if (mounted) toast(context, messageErreur(e), erreur: true);
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  void _repondre(Questionnaire q, int valeur) {
    setState(() => _reponses[q.questions[_index].id] = valeur);
    Future.delayed(const Duration(milliseconds: 250), () {
      if (!mounted) return;
      if (_index < q.questions.length - 1) {
        setState(() => _index++);
        _lire(q);
      }
    });
  }

  void _lire(Questionnaire q) {
    final question = q.questions[_index];
    GuideVocal.instance.lire(cle: question.audioKey, texteFr: question.texte, langue: ref.read(langueProvider));
  }

  @override
  Widget build(BuildContext context) {
    final asyncQ = ref.watch(questionnaireProvider(widget.code));
    return Scaffold(
      appBar: AppBar(title: Text(asyncQ.value?.titre ?? 'Test', maxLines: 1, overflow: TextOverflow.ellipsis)),
      body: AsyncVue<Questionnaire>(
        asyncQ,
        reessayer: () => ref.invalidate(questionnaireProvider(widget.code)),
        donnees: (q) {
          if (!_debutLu) {
            _debutLu = true;
            WidgetsBinding.instance.addPostFrameCallback((_) => _commencer(q));
          }
          final question = q.questions[_index];
          final dernier = _index == q.questions.length - 1;
          final complet = _reponses.length == q.questions.length;
          return SafeArea(
            child: Column(children: [
              LinearProgressIndicator(value: (_index + 1) / q.questions.length, minHeight: 6, color: C.vert, backgroundColor: C.vertPale),
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(20),
                  child: Centre(
                    largeur: 620,
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      Row(children: [
                        Text('Question ${_index + 1} / ${q.questions.length}', style: const TextStyle(color: C.texteDoux, fontWeight: FontWeight.w700)),
                        const Spacer(),
                        BoutonVoix(question.audioKey, texte: question.texte, auto: false),
                      ]),
                      if (_index == 0 && q.consigne != null) ...[
                        const SizedBox(height: 12),
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(color: C.orPale, borderRadius: BorderRadius.circular(12)),
                          child: Text(q.consigne!, style: const TextStyle(fontWeight: FontWeight.w600)),
                        ),
                      ],
                      const SizedBox(height: 20),
                      if (question.type == 'alerte')
                        const Padding(
                          padding: EdgeInsets.only(bottom: 8),
                          child: Row(children: [
                            Icon(Icons.warning_amber_rounded, color: C.prioritaire),
                            SizedBox(width: 6),
                            Text('Question importante', style: TextStyle(color: C.prioritaire, fontWeight: FontWeight.w800)),
                          ]),
                        ),
                      Text(question.texte, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontSize: 23, height: 1.3)),
                      const SizedBox(height: 24),
                      for (final o in question.options)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: _BoutonReponse(
                            libelle: o.libelle,
                            onEcouter: () => GuideVocal.instance.lire(cle: o.audioKey ?? '', texteFr: o.libelle, langue: ref.read(langueProvider)),
                            choisi: _reponses[question.id] == o.valeur,
                            onTap: () => _repondre(q, o.valeur),
                          ),
                        ),
                    ]),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
                child: Centre(
                  largeur: 620,
                  child: Row(children: [
                    if (_index > 0)
                      Expanded(child: OutlinedButton.icon(onPressed: () => setState(() => _index--), icon: const Icon(Icons.arrow_back), label: const Text('Précédente'))),
                    if (_index > 0) const SizedBox(width: 12),
                    Expanded(
                      child: dernier
                          ? FilledButton(
                              onPressed: complet && !_envoi ? () => _envoyer(q) : null,
                              child: _envoi ? const CircularProgressIndicator(color: Colors.white) : const Text('Voir le résultat'),
                            )
                          : FilledButton.tonal(
                              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                              onPressed: _reponses.containsKey(question.id) ? () => setState(() => _index++) : null,
                              child: const Text('Suivante'),
                            ),
                    ),
                  ]),
                ),
              ),
            ]),
          );
        },
      ),
    );
  }
}

class _BoutonReponse extends StatelessWidget {
  const _BoutonReponse({required this.libelle, required this.choisi, required this.onTap, this.onEcouter});
  final String libelle;
  final VoidCallback? onEcouter;
  final bool choisi;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
        color: choisi ? C.vert : Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: BorderSide(color: choisi ? C.vert : C.bordure, width: 1.5)),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 18),
            child: Row(children: [
              Icon(choisi ? Icons.radio_button_checked : Icons.radio_button_off, color: choisi ? Colors.white : C.texteDoux),
              const SizedBox(width: 12),
              Expanded(child: Text(libelle, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: choisi ? Colors.white : C.texte))),
              // Écouter la réponse avant de la choisir (parents qui ne lisent pas)
              if (onEcouter != null)
                IconButton(
                  tooltip: 'Écouter cette réponse',
                  onPressed: onEcouter,
                  icon: Icon(Icons.volume_up_rounded, color: choisi ? Colors.white : C.vertFonce),
                ),
            ]),
          ),
        ),
      );
}
