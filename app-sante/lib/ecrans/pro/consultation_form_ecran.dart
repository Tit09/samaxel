import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api.dart';
import '../../core/donnees.dart';
import '../../core/modeles.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';

/// Paramètres de l'écran : nouvelle consultation pour un enfant, ou modification.
class ParamsConsultation {
  const ParamsConsultation({required this.enfantId, this.consultation, this.rdvId, this.prenom});
  final String enfantId;
  final Consultation? consultation;
  final String? rdvId;
  final String? prenom;
}

/// Compte rendu de consultation (secret médical : visible des seuls cliniciens,
/// et du parent uniquement si « visible par le parent » est coché).
class ConsultationFormEcran extends ConsumerStatefulWidget {
  const ConsultationFormEcran({super.key, required this.params});
  final ParamsConsultation params;
  @override
  ConsumerState<ConsultationFormEcran> createState() => _ConsultationFormEcranState();
}

class _ConsultationFormEcranState extends ConsumerState<ConsultationFormEcran> {
  final _form = GlobalKey<FormState>();
  late final _motif = TextEditingController(text: widget.params.consultation?.motif);
  late final _obs = TextEditingController(text: widget.params.consultation?.observations);
  late final _reco = TextEditingController(text: widget.params.consultation?.recommandations);
  late final _cim = TextEditingController(text: widget.params.consultation?.diagnosticCode);
  late bool _visible = widget.params.consultation?.visibleParent ?? true;
  String _type = 'PRESENTIEL';
  bool _envoi = false;

  bool get _modif => widget.params.consultation != null;

  Future<void> _enregistrer(String statut) async {
    if (!_form.currentState!.validate()) return;
    setState(() => _envoi = true);
    final corps = <String, dynamic>{
      if (_motif.text.trim().isNotEmpty) 'motif': _motif.text.trim(),
      if (_obs.text.trim().isNotEmpty) 'observations': _obs.text.trim(),
      if (_reco.text.trim().isNotEmpty) 'recommandations': _reco.text.trim(),
      if (_cim.text.trim().isNotEmpty) 'diagnostic_code': _cim.text.trim().toUpperCase(),
      'visible_parent': _visible,
      'statut': statut,
    };
    try {
      if (_modif) {
        await Api.instance.put('/consultations/${widget.params.consultation!.id}', corps);
      } else {
        await Api.instance.post('/consultations', {
          ...corps,
          'enfant_id': widget.params.enfantId,
          'type': _type,
          if (widget.params.rdvId != null) 'rdv_id': widget.params.rdvId,
          'date_consultation': DateTime.now().toUtc().toIso8601String(),
        });
      }
      ref.invalidate(consultationsProvider(widget.params.enfantId));
      if (mounted) {
        toast(context, 'Consultation enregistrée');
        Navigator.of(context).pop(true);
      }
    } catch (e) {
      if (mounted) toast(context, messageErreur(e), erreur: true);
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  @override
  void dispose() {
    for (final c in [_motif, _obs, _reco, _cim]) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_modif ? 'Modifier la consultation' : 'Consultation${widget.params.prenom != null ? ' — ${widget.params.prenom}' : ''}')),
      body: Form(
        key: _form,
        child: ListView(padding: const EdgeInsets.all(16), children: [
          Centre(
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: C.infoPale, borderRadius: BorderRadius.circular(12)),
                child: const Row(children: [
                  Icon(Icons.shield_outlined, color: C.info),
                  SizedBox(width: 8),
                  Expanded(child: Text('Secret médical : ces notes sont chiffrées et ne sont lisibles que par les médecins et thérapeutes de votre structure.')),
                ]),
              ),
              const SizedBox(height: 16),
              if (!_modif) ...[
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(value: 'PRESENTIEL', icon: Icon(Icons.local_hospital_outlined), label: Text('Sur place')),
                    ButtonSegment(value: 'TELECONSULTATION', icon: Icon(Icons.videocam_outlined), label: Text('Vidéo')),
                  ],
                  selected: {_type},
                  onSelectionChanged: (v) => setState(() => _type = v.first),
                ),
                const SizedBox(height: 16),
              ],
              TextFormField(controller: _motif, decoration: const InputDecoration(labelText: 'Motif'), maxLines: 2),
              const SizedBox(height: 12),
              TextFormField(controller: _obs, decoration: const InputDecoration(labelText: 'Observations cliniques', alignLabelWithHint: true), minLines: 5, maxLines: 12),
              const SizedBox(height: 12),
              TextFormField(controller: _reco, decoration: const InputDecoration(labelText: 'Recommandations pour la famille', alignLabelWithHint: true), minLines: 3, maxLines: 8),
              const SizedBox(height: 12),
              TextFormField(
                controller: _cim,
                decoration: const InputDecoration(labelText: 'Code diagnostic CIM-11 (facultatif)', hintText: 'ex. 6A02'),
                validator: (v) {
                  final t = (v ?? '').trim().toUpperCase();
                  if (t.isEmpty) return null;
                  return RegExp(r'^[0-9A-Z]{2,8}(\.[0-9A-Z]{1,4})?$').hasMatch(t) ? null : 'Code invalide';
                },
              ),
              const SizedBox(height: 8),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Visible par le parent', style: TextStyle(fontWeight: FontWeight.w700)),
                subtitle: const Text('Le parent verra le motif et les recommandations (jamais vos observations privées si vous décochez).'),
                value: _visible,
                onChanged: (v) => setState(() => _visible = v),
              ),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: _envoi ? null : () => _enregistrer('TERMINEE'),
                icon: const Icon(Icons.check),
                label: const Text('Enregistrer et terminer'),
              ),
              const SizedBox(height: 8),
              OutlinedButton(
                onPressed: _envoi ? null : () => _enregistrer(_modif ? (widget.params.consultation!.statut) : 'EN_COURS'),
                child: const Text('Enregistrer le brouillon'),
              ),
            ]),
          ),
        ]),
      ),
    );
  }
}
