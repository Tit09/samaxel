import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';

final _inscriptionsProvider = FutureProvider.autoDispose.family<List<Map<String, dynamic>>, String>((ref, statut) async {
  ref.watch(utilisateurProvider);
  final r = await Api.instance.get('/inscriptions', query: {'statut': statut});
  return ((r['inscriptions'] as List?) ?? []).map((e) => Map<String, dynamic>.from(e)).toList();
});

/// Côté établissement : les familles qui ont rejoint (demande) ou qui sont suivies (acceptées).
/// Le dossier de la personne concernée est dans « Dossiers » (file triée par l'IA).
class FamillesEcran extends ConsumerWidget {
  const FamillesEcran({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final u = ref.watch(utilisateurProvider);
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: Text('Familles — ${u?.structureNom ?? ''}'),
          bottom: const TabBar(tabs: [Tab(text: 'En attente'), Tab(text: 'Acceptées')]),
        ),
        body: const TabBarView(children: [_Liste('DEMANDEE'), _Liste('ACTIVE')]),
      ),
    );
  }
}

class _Liste extends ConsumerWidget {
  const _Liste(this.statut);
  final String statut;

  Future<void> _decider(BuildContext context, WidgetRef ref, String id, String nouveau) async {
    // Accepter = désigner le soignant référent que la famille verra (sinon : le moins chargé)
    String? referent;
    if (nouveau == 'ACTIVE') {
      final r = await Api.instance.get('/etablissement/soignants').catchError((_) => <String, dynamic>{});
      final soignants = ((r['soignants'] as List?) ?? []).map((s) => Map<String, dynamic>.from(s)).toList();
      if (!context.mounted) return;
      if (soignants.isNotEmpty) {
        final choix = await showModalBottomSheet<String>(
          context: context,
          showDragHandle: true,
          builder: (_) => SafeArea(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Padding(padding: EdgeInsets.all(12), child: Text('Quel soignant suivra cette famille ?', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17))),
              ListTile(leading: const Icon(Icons.auto_awesome), title: const Text('Automatique'), subtitle: const Text('Le soignant qui suit le moins de dossiers'), onTap: () => Navigator.pop(context, '')),
              for (final s in soignants)
                ListTile(
                  leading: const Icon(Icons.medical_services_outlined),
                  title: Text(s['nom']),
                  subtitle: Text('${s['specialite'] ?? s['role']} · ${s['dossiers']} dossier(s)'),
                  onTap: () => Navigator.pop(context, s['id'] as String),
                ),
            ]),
          ),
        );
        if (choix == null) return;
        referent = choix.isEmpty ? null : choix;
      }
    }
    try {
      await Api.instance.put('/inscriptions/$id', {'statut': nouveau, 'referent_id': ?referent});
      ref.invalidate(_inscriptionsProvider);
      if (context.mounted) toast(context, nouveau == 'ACTIVE' ? 'Famille acceptée : elle voit maintenant son soignant.' : 'Demande refusée.');
    } catch (e) {
      if (context.mounted) toast(context, messageErreur(e), erreur: true);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = ref.watch(_inscriptionsProvider(statut));
    return AsyncVue<List<Map<String, dynamic>>>(
      l,
      reessayer: () => ref.invalidate(_inscriptionsProvider(statut)),
      donnees: (liste) => liste.isEmpty
          ? Vide(
              icone: Icons.family_restroom_rounded,
              titre: statut == 'DEMANDEE' ? 'Aucune demande en attente' : 'Aucune famille acceptée',
              texte: 'Quand une famille touche « Rejoindre cet établissement » dans l’application, elle apparaît ici.',
            )
          : RefreshIndicator(
              onRefresh: () async => ref.invalidate(_inscriptionsProvider(statut)),
              child: ListView(padding: const EdgeInsets.all(16), children: [
                Centre(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    for (final i in liste)
                      Card(
                        margin: const EdgeInsets.only(bottom: 10),
                        child: Padding(
                          padding: const EdgeInsets.all(14),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Row(children: [
                              CircleAvatar(backgroundColor: C.vertPale, child: Text('${i['prenom'] ?? '?'}'.substring(0, 1))),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                  Text('${i['prenom']} ${i['nom']}', style: const TextStyle(fontWeight: FontWeight.w800)),
                                  Text([
                                    if (i['service'] != null) i['service'],
                                    'depuis le ${dateCourte(DateTime.tryParse('${i['created_at']}'))}',
                                    if (i['origine'] == 'QR_CODE') 'par QR code',
                                  ].join(' · '), style: const TextStyle(color: C.texteDoux, fontSize: 13)),
                                ]),
                              ),
                            ]),
                            const SizedBox(height: 10),
                            Wrap(spacing: 8, runSpacing: 8, children: [
                              if (statut == 'DEMANDEE') ...[
                                FilledButton.icon(onPressed: () => _decider(context, ref, i['id'], 'ACTIVE'), icon: const Icon(Icons.check), label: const Text('Accepter')),
                                OutlinedButton(onPressed: () => _decider(context, ref, i['id'], 'REFUSEE'), child: const Text('Refuser')),
                              ],
                              TextButton.icon(onPressed: () => context.go('/pro/dossiers'), icon: const Icon(Icons.folder_open), label: const Text('Voir les dossiers')),
                            ]),
                          ]),
                        ),
                      ),
                  ]),
                ),
              ]),
            ),
    );
  }
}
