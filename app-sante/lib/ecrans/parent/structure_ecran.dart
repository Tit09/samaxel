import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api.dart';
import '../../core/donnees.dart';
import '../../core/modeles.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';

class StructureEcran extends ConsumerWidget {
  const StructureEcran({super.key, required this.id});
  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(structureProvider(id));
    final connecte = ref.watch(utilisateurProvider)?.estParent ?? false;
    return Scaffold(
      appBar: AppBar(title: Text(s.value?.nomCourt ?? 'Structure'), actions: const [Padding(padding: EdgeInsets.only(right: 12), child: BoutonVoix('structure', compact: true))]),
      body: AsyncVue<Structure>(
        s,
        donnees: (s) => ListView(padding: const EdgeInsets.all(16), children: [
          Centre(
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text(s.nom, style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 4),
              Text('${libellesTypes[s.type] ?? s.type} · ${s.secteur?.toLowerCase() ?? ''} · ${s.commune ?? ''} ${s.region}', style: const TextStyle(color: C.texteDoux)),
              if (s.description != null) ...[const SizedBox(height: 12), Text(s.description!)],
              const SizedBox(height: 16),
              Wrap(spacing: 10, runSpacing: 10, children: [
                if (s.telephone != null)
                  FilledButton.icon(
                    style: FilledButton.styleFrom(minimumSize: const Size(0, 48)),
                    onPressed: () => launchUrl(Uri.parse('tel:${s.telephone}')),
                    icon: const Icon(Icons.call),
                    label: const Text('Appeler'),
                  ),
                if (s.latitude != null)
                  OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(minimumSize: const Size(0, 48)),
                    onPressed: () => launchUrl(Uri.parse('https://www.openstreetmap.org/directions?to=${s.latitude},${s.longitude}'), mode: LaunchMode.externalApplication),
                    icon: const Icon(Icons.directions),
                    label: const Text('Itinéraire'),
                  ),
              ]),
              const Titre('Prise en charge'),
              Wrap(spacing: 6, runSpacing: 6, children: [for (final t in s.troubles) Chip(label: Text(libellesTroubles[t] ?? t))]),
              const SizedBox(height: 12),
              _Ligne(Icons.payments_outlined, 'Coût', const ['Gratuit', 'Faible', 'Moyen', 'Élevé'][s.coutNiveau.clamp(0, 3)]),
              if (s.delaiJours != null) _Ligne(Icons.hourglass_bottom, 'Délai habituel', '${s.delaiJours} jours'),
              if (s.horaires != null) _Ligne(Icons.schedule, 'Horaires', s.horaires!),
              if (s.adresse != null) _Ligne(Icons.place_outlined, 'Adresse', s.adresse!),
              if (!s.verifie)
                const Padding(
                  padding: EdgeInsets.only(top: 8),
                  child: Text('Informations à confirmer par téléphone avant de vous déplacer.', style: TextStyle(color: C.prioritaire, fontSize: 13)),
                ),
              const SizedBox(height: 20),
              if (s.partenaire && connecte)
                _DemandePriseEnCharge(structure: s)
              else if (s.partenaire)
                const Card(child: ListTile(leading: Icon(Icons.info_outline), title: Text('Créez un compte pour demander une prise en charge en ligne.')))
              else
                const Card(child: ListTile(leading: Icon(Icons.phone_in_talk_outlined), title: Text('Cette structure n’utilise pas encore SAMA XHEL : contactez-la par téléphone.'))),
            ]),
          ),
        ]),
      ),
    );
  }
}

class _Ligne extends StatelessWidget {
  const _Ligne(this.icone, this.titre, this.valeur);
  final IconData icone;
  final String titre;
  final String valeur;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(children: [
          Icon(icone, color: C.vert),
          const SizedBox(width: 10),
          Text('$titre : ', style: const TextStyle(fontWeight: FontWeight.w700)),
          Expanded(child: Text(valeur)),
        ]),
      );
}

class _DemandePriseEnCharge extends ConsumerStatefulWidget {
  const _DemandePriseEnCharge({required this.structure});
  final Structure structure;
  @override
  ConsumerState<_DemandePriseEnCharge> createState() => _DemandePriseEnChargeState();
}

class _DemandePriseEnChargeState extends ConsumerState<_DemandePriseEnCharge> {
  String? _enfant;
  final _motif = TextEditingController();
  bool _envoi = false;

  Future<void> _envoyer() async {
    setState(() => _envoi = true);
    try {
      final r = await Api.instance.post('/suivis', {
        'enfant_id': _enfant,
        'structure_id': widget.structure.id,
        if (_motif.text.trim().isNotEmpty) 'motif': _motif.text.trim(),
      });
      ref.invalidate(enfantDetailProvider(_enfant!));
      if (mounted) toast(context, 'Demande envoyée (dossier ${r['suivi']['numero_dossier']}). La structure vous contactera.');
      _motif.clear();
    } catch (e) {
      if (mounted) toast(context, messageErreur(e), erreur: true);
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final enfants = ref.watch(enfantsProvider).value ?? const <Enfant>[];
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Demander une prise en charge', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 10),
          DropdownButtonFormField<String>(
            initialValue: _enfant,
            decoration: const InputDecoration(labelText: 'Pour qui ? (moi, mon enfant, un proche)'),
            items: [for (final e in enfants) DropdownMenuItem(value: e.id, child: Text(e.libelle))],
            onChanged: (v) => setState(() => _enfant = v),
          ),
          if (enfants.isEmpty)
            TextButton.icon(onPressed: () => context.push('/enfant/ajouter'), icon: const Icon(Icons.person_add_alt_1), label: const Text('Ajouter la personne concernée')),
          const SizedBox(height: 10),
          TextField(controller: _motif, maxLines: 3, decoration: const InputDecoration(labelText: 'Pourquoi consultez-vous ? (facultatif)')),
          const SizedBox(height: 12),
          FilledButton(onPressed: _enfant == null || _envoi ? null : _envoyer, child: const Text('Envoyer la demande')),
        ]),
      ),
    );
  }
}
