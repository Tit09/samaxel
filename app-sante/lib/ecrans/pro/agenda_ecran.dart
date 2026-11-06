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
import '../parent/rdv_parent_ecran.dart';
import 'consultation_form_ecran.dart';

/// Agenda de la structure : la secrétaire confirme les demandes (date + soignant),
/// puis marque le rendez-vous terminé ou absent.
class AgendaEcran extends ConsumerStatefulWidget {
  const AgendaEcran({super.key});
  @override
  ConsumerState<AgendaEcran> createState() => _AgendaEcranState();
}

class _AgendaEcranState extends ConsumerState<AgendaEcran> {
  String _onglet = 'DEMANDE';

  Future<void> _maj(RendezVous r, Map<String, dynamic> corps, String ok) async {
    try {
      await Api.instance.put('/rendez-vous/${r.id}', corps);
      ref.invalidate(rdvProvider);
      if (mounted) toast(context, ok);
    } catch (e) {
      if (mounted) toast(context, messageErreur(e), erreur: true);
    }
  }

  Future<void> _confirmer(RendezVous r) async {
    final depart = r.dateSouhaitee != null && r.dateSouhaitee!.isAfter(DateTime.now()) ? r.dateSouhaitee! : DateTime.now().add(const Duration(days: 1));
    final jour = await showDatePicker(
      context: context,
      initialDate: depart,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 180)),
    );
    if (jour == null || !mounted) return;
    final h = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(r.dateSouhaitee ?? DateTime(2026, 1, 1, 9)));
    if (h == null || !mounted) return;
    final pros = await ref.read(professionnelsProvider(r.structureId).future);
    if (!mounted) return;
    String? proId = r.professionnelId ?? (pros.isNotEmpty ? pros.first['id'] as String : null);
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('Avec quel soignant ?'),
          content: RadioGroup<String>(
            groupValue: proId,
            onChanged: (v) => setState(() => proId = v),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (final p in pros) RadioListTile<String>(value: p['id'], title: Text('${p['prenom']} ${p['nom']}'), subtitle: Text(p['specialite'] ?? '')),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Annuler')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Confirmer')),
          ],
        ),
      ),
    );
    if (ok != true) return;
    final date = DateTime(jour.year, jour.month, jour.day, h.hour, h.minute);
    await _maj(r, {
      'statut': 'CONFIRME',
      'date_confirmee': date.toUtc().toIso8601String(),
      'professionnel_id': ?proId,
    }, 'Rendez-vous confirmé — le parent est prévenu');
  }

  @override
  Widget build(BuildContext context) {
    final rdv = ref.watch(rdvProvider);
    final u = ref.watch(utilisateurProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Agenda')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
            child: Centre(
              largeur: 1000,
              child: SizedBox(
                width: double.infinity,
                child: SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(value: 'DEMANDE', label: Text('À confirmer')),
                    ButtonSegment(value: 'CONFIRME', label: Text('À venir')),
                    ButtonSegment(value: 'PASSE', label: Text('Passés')),
                    ButtonSegment(value: 'RAPPEL', label: Text('À rappeler')),
                  ],
                  selected: {_onglet},
                  showSelectedIcon: false,
                  onSelectionChanged: (v) => setState(() => _onglet = v.first),
                ),
              ),
            ),
          ),
          if (_onglet == 'RAPPEL')
            const Expanded(child: _Rappels())
          else
            Expanded(
              child: AsyncVue<List<RendezVous>>(
                rdv,
                reessayer: () => ref.invalidate(rdvProvider),
                donnees: (tous) {
                  final liste = tous.where((r) => _onglet == 'PASSE' ? !['DEMANDE', 'CONFIRME'].contains(r.statut) : r.statut == _onglet).toList();
                  if (liste.isEmpty) return const Vide(icone: Icons.event_available, titre: 'Rien ici pour le moment');
                  return RefreshIndicator(
                    onRefresh: () async => ref.invalidate(rdvProvider),
                    child: ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: liste.length,
                      itemBuilder: (_, i) {
                        final r = liste[i];
                        return Centre(
                          largeur: 1000,
                          child: CarteRdv(
                            r: r,
                            parent: false,
                            actions: [
                              if (r.statut == 'DEMANDE')
                                FilledButton.icon(onPressed: () => _confirmer(r), icon: const Icon(Icons.event_available), label: const Text('Confirmer')),
                              if (r.statut == 'CONFIRME') ...[
                                OutlinedButton(onPressed: () => _maj(r, {'statut': 'TERMINE'}, 'Rendez-vous terminé'), child: const Text('Terminé')),
                                OutlinedButton(onPressed: () => _maj(r, {'statut': 'ABSENT'}, 'Absence notée'), child: const Text('Absent')),
                              ],
                              if (r.statut == 'DEMANDE' || r.statut == 'CONFIRME')
                                TextButton(
                                  onPressed: () => _maj(r, {'statut': 'ANNULE', 'raison': 'Annulé par la structure'}, 'Rendez-vous annulé'),
                                  child: const Text('Annuler'),
                                ),
                              if (r.suiviId != null) TextButton(onPressed: () => context.push('/pro/dossier/${r.suiviId}'), child: const Text('Dossier')),
                              if ((u?.estClinicien ?? false) && r.statut == 'CONFIRME' && !r.estVisio)
                                TextButton(
                                  onPressed: () => context.push(
                                    '/pro/consultation',
                                    extra: ParamsConsultation(enfantId: r.enfantId, rdvId: r.id, prenom: r.enfantPrenom),
                                  ),
                                  child: const Text('Compte rendu'),
                                ),
                            ],
                          ),
                        );
                      },
                    ),
                  );
                },
              ),
            ),
        ],
      ),
    );
  }
}

final rappelsProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final r = await Api.instance.get('/rappels');
  return ((r['rappels'] as List?) ?? []).map((e) => Map<String, dynamic>.from(e)).toList();
});

/// Parents sans smartphone qui ont demandé (par USSD) à être rappelés.
class _Rappels extends ConsumerWidget {
  const _Rappels();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final r = ref.watch(rappelsProvider);
    Future<void> maj(String id, String statut) async {
      try {
        await Api.instance.put('/rappels/$id', {'statut': statut});
        ref.invalidate(rappelsProvider);
      } catch (e) {
        if (context.mounted) toast(context, messageErreur(e), erreur: true);
      }
    }

    return AsyncVue<List<Map<String, dynamic>>>(
      r,
      reessayer: () => ref.invalidate(rappelsProvider),
      donnees: (liste) => liste.isEmpty
          ? const Vide(
              icone: Icons.phone_callback_outlined,
              titre: 'Aucun parent à rappeler',
              texte: 'Les parents sans smartphone demandent un rappel en composant le code USSD.',
            )
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                for (final x in liste)
                  Centre(
                    largeur: 1000,
                    child: Card(
                      color: x['statut'] == 'A_RAPPELER' ? C.orPale : Colors.white,
                      child: ListTile(
                        leading: const Icon(Icons.dialpad, color: C.prioritaire),
                        title: Text('${x['telephone']}', style: const TextStyle(fontWeight: FontWeight.w800)),
                        subtitle: Text('${x['region'] ?? ''} · ${x['canal']} · ${dateLongue(DateTime.tryParse('${x['created_at']}')?.toLocal())}'),
                        trailing: x['statut'] != 'A_RAPPELER'
                            ? Text(x['statut'] == 'RAPPELE' ? 'Rappelé' : 'Injoignable')
                            : Wrap(
                                spacing: 4,
                                children: [
                                  IconButton.filled(
                                    tooltip: 'Appeler',
                                    onPressed: () => launchUrl(Uri.parse('tel:${x['telephone']}')),
                                    icon: const Icon(Icons.call),
                                  ),
                                  IconButton(
                                    tooltip: 'Rappelé',
                                    onPressed: () => maj(x['id'], 'RAPPELE'),
                                    icon: const Icon(Icons.check, color: C.normal),
                                  ),
                                  IconButton(
                                    tooltip: 'Injoignable',
                                    onPressed: () => maj(x['id'], 'INJOIGNABLE'),
                                    icon: const Icon(Icons.phone_disabled, color: C.urgent),
                                  ),
                                ],
                              ),
                      ),
                    ),
                  ),
              ],
            ),
    );
  }
}
