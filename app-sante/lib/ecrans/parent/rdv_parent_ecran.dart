import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api.dart';
import '../../core/donnees.dart';
import '../../core/portails.dart';
import '../../core/modeles.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';

/// Rendez-vous du parent : demander, voir, annuler, rejoindre la vidéo.
class RdvParentEcran extends ConsumerWidget {
  const RdvParentEcran({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rdv = ref.watch(rdvProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Mes rendez-vous'), actions: const [Padding(padding: EdgeInsets.only(right: 12), child: BoutonVoix('rdv', compact: true))]),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => showModalBottomSheet(context: context, isScrollControlled: true, showDragHandle: true, builder: (_) => const _NouveauRdv()),
        icon: const Icon(Icons.add),
        label: const Text('Demander un rendez-vous', style: TextStyle(fontWeight: FontWeight.w800)),
      ),
      body: AsyncVue<List<RendezVous>>(
        rdv,
        reessayer: () => ref.invalidate(rdvProvider),
        donnees: (liste) => liste.isEmpty
            ? const Vide(icone: Icons.event_available, titre: 'Aucun rendez-vous', texte: 'Demandez d’abord une prise en charge à une structure, puis un rendez-vous.')
            : RefreshIndicator(
                onRefresh: () async => ref.invalidate(rdvProvider),
                child: ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
                  itemCount: liste.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 10),
                  itemBuilder: (_, i) => Centre(child: CarteRdv(r: liste[i], parent: true)),
                ),
              ),
      ),
    );
  }
}

class CarteRdv extends ConsumerWidget {
  const CarteRdv({super.key, required this.r, required this.parent, this.actions});
  final RendezVous r;
  final bool parent;
  final List<Widget>? actions;

  Future<void> _annuler(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Annuler ce rendez-vous ?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Non')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Oui, annuler')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await Api.instance.put('/rendez-vous/${r.id}', {'statut': 'ANNULE'});
      ref.invalidate(rdvProvider);
      if (context.mounted) toast(context, 'Rendez-vous annulé');
    } catch (e) {
      if (context.mounted) toast(context, messageErreur(e), erreur: true);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final actif = r.statut == 'CONFIRME' || r.statut == 'DEMANDE';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            CircleAvatar(
              backgroundColor: r.estVisio ? C.infoPale : C.vertPale,
              child: Icon(r.estVisio ? Icons.videocam_rounded : Icons.local_hospital_rounded, color: r.estVisio ? C.info : C.vert),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(parent ? (r.structureNom ?? '') : [r.enfantPrenom, r.numeroDossier].whereType<String>().join(' · '),
                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                Text(r.estVisio ? 'Consultation vidéo' : 'Consultation sur place', style: const TextStyle(color: C.texteDoux)),
              ]),
            ),
            BadgeStatut(r.statut),
          ]),
          const SizedBox(height: 10),
          Row(children: [
            const Icon(Icons.event, size: 18, color: C.texteDoux),
            const SizedBox(width: 6),
            Expanded(child: Text(r.statut == 'DEMANDE' ? 'Souhaité : ${dateLongue(r.dateSouhaitee)}' : dateLongue(r.date))),
            if (!parent) BadgePriorite(r.priorite),
          ]),
          if (r.professionnelNom != null) ...[
            const SizedBox(height: 4),
            Row(children: [
              const Icon(Icons.person_outline, size: 18, color: C.texteDoux),
              const SizedBox(width: 6),
              Text(r.professionnelNom!),
            ]),
          ],
          if (r.motif != null && r.motif!.isNotEmpty) ...[const SizedBox(height: 6), Text(r.motif!, style: const TextStyle(color: C.texteDoux))],
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 8, children: [
            if (r.estVisio && r.statut == 'CONFIRME' && r.consultationId != null)
              FilledButton.icon(
                style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
                onPressed: () => context.push('/visio/${r.consultationId}'),
                icon: const Icon(Icons.videocam),
                label: const Text('Rejoindre'),
              ),
            if (parent && actif)
              TextButton.icon(onPressed: () => _annuler(context, ref), icon: const Icon(Icons.close), label: const Text('Annuler')),
            ...?actions,
          ]),
        ]),
      ),
    );
  }
}

class _NouveauRdv extends ConsumerStatefulWidget {
  const _NouveauRdv();
  @override
  ConsumerState<_NouveauRdv> createState() => _NouveauRdvState();
}

/// Demande de rendez-vous : POUR QUI (moi, mon enfant, un proche) et OÙ (établissement partenaire).
/// Si la personne n'a pas encore de dossier dans cet établissement, il est ouvert automatiquement.
class _NouveauRdvState extends ConsumerState<_NouveauRdv> {
  String? _personneId;
  String? _structureId;
  String _type = 'PRESENTIEL';
  DateTime? _date;
  final _motif = TextEditingController();
  bool _envoi = false;

  Future<void> _choisirDate() async {
    final j = await showDatePicker(context: context, firstDate: DateTime.now(), lastDate: DateTime.now().add(const Duration(days: 120)), initialDate: DateTime.now().add(const Duration(days: 2)));
    if (j == null || !mounted) return;
    final h = await showTimePicker(context: context, initialTime: const TimeOfDay(hour: 9, minute: 0));
    setState(() => _date = DateTime(j.year, j.month, j.day, h?.hour ?? 9, h?.minute ?? 0));
  }

  Future<void> _envoyer() async {
    setState(() => _envoi = true);
    try {
      await Api.instance.post('/rendez-vous', {
        'enfant_id': _personneId,
        'structure_id': _structureId,
        'type': _type,
        if (_date != null) 'date_souhaitee': _date!.toUtc().toIso8601String(),
        if (_motif.text.trim().isNotEmpty) 'motif': _motif.text.trim(),
      });
      ref.invalidate(rdvProvider);
      ref.invalidate(suivisProvider);
      ref.invalidate(mesEtablissementsProvider);
      if (mounted) {
        Navigator.pop(context);
        toast(context, 'Demande envoyée. L’établissement vous confirmera la date par notification.');
      }
    } catch (e) {
      if (mounted) toast(context, messageErreur(e), erreur: true);
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final personnes = ref.watch(enfantsProvider).value ?? const <Enfant>[];
    final partenaires = ref.watch(partenairesProvider).value ?? const <Etablissement>[];
    final mes = ref.watch(mesEtablissementsProvider).value ?? const <Etablissement>[];
    // Les établissements déjà rejoints d'abord
    final codesMes = mes.map((e) => e.code).toSet();
    final etabs = [...partenaires.where((e) => codesMes.contains(e.code)), ...partenaires.where((e) => !codesMes.contains(e.code))];
    if (_personneId == null && personnes.length == 1) _personneId = personnes.first.id;
    final pret = _personneId != null && _structureId != null && !_envoi;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.viewInsetsOf(context).bottom + 24),
      child: SingleChildScrollView(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Demander un rendez-vous', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 4),
          const Text('Choisissez pour qui et où. Le dossier est créé automatiquement dans l’établissement.', style: TextStyle(color: C.texteDoux)),
          const SizedBox(height: 14),
          if (personnes.isEmpty)
            OutlinedButton.icon(
              onPressed: () { Navigator.pop(context); context.push('/enfant/ajouter'); },
              icon: const Icon(Icons.person_add_alt_1),
              label: const Text('D’abord : ajouter la personne (moi, mon enfant, un proche)'),
            )
          else
            DropdownButtonFormField<String>(
              initialValue: _personneId,
              isExpanded: true,
              decoration: const InputDecoration(labelText: '1. Pour qui ?', prefixIcon: Icon(Icons.person_outline)),
              items: [for (final p in personnes) DropdownMenuItem(value: p.id, child: Text(p.libelle, overflow: TextOverflow.ellipsis))],
              onChanged: (v) => setState(() => _personneId = v),
            ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _structureId,
            isExpanded: true,
            decoration: const InputDecoration(labelText: '2. Où ?', prefixIcon: Icon(Icons.local_hospital_outlined)),
            items: [
              for (final e in etabs)
                if (e.id != null)
                  DropdownMenuItem(value: e.id, child: Text('${codesMes.contains(e.code) ? '★ ' : ''}${e.nom}', overflow: TextOverflow.ellipsis)),
            ],
            onChanged: (v) => setState(() => _structureId = v),
          ),
          const SizedBox(height: 12),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'PRESENTIEL', label: Text('Sur place'), icon: Icon(Icons.local_hospital_outlined)),
              ButtonSegment(value: 'TELECONSULTATION', label: Text('En vidéo'), icon: Icon(Icons.videocam_outlined)),
            ],
            selected: {_type},
            onSelectionChanged: (s) => setState(() => _type = s.first),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(onPressed: _choisirDate, icon: const Icon(Icons.event), label: Text(_date == null ? 'Date souhaitée (facultatif)' : dateLongue(_date))),
          const SizedBox(height: 12),
          TextField(controller: _motif, maxLines: 2, decoration: const InputDecoration(labelText: 'Pourquoi ? (facultatif)')),
          const SizedBox(height: 16),
          FilledButton(onPressed: pret ? _envoyer : null, child: Text(_envoi ? 'Envoi…' : 'Envoyer la demande')),
          if (!pret && !_envoi)
            const Padding(
              padding: EdgeInsets.only(top: 6),
              child: Text('Choisissez la personne et l’établissement pour activer le bouton.', textAlign: TextAlign.center, style: TextStyle(color: C.texteDoux, fontSize: 12.5)),
            ),
        ]),
      ),
    );
  }
}
