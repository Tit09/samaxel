import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/donnees.dart';
import '../../core/modeles.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';

/// Dossier de l'enfant côté parent : tests, structures qui le suivent, recommandations.
class EnfantDetailEcran extends ConsumerWidget {
  const EnfantDetailEcran({super.key, required this.id});
  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(enfantDetailProvider(id));
    final deps = ref.watch(depistagesProvider(id));
    final cons = ref.watch(consultationsProvider(id));

    return Scaffold(
      appBar: AppBar(title: Text(detail.value?.enfant.prenom ?? 'Mon enfant')),
      body: AsyncVue(
        detail,
        reessayer: () => ref.invalidate(enfantDetailProvider(id)),
        donnees: (d) {
          final e = d.enfant;
          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(enfantDetailProvider(id));
              ref.invalidate(depistagesProvider(id));
              ref.invalidate(consultationsProvider(id));
            },
            child: ListView(padding: const EdgeInsets.all(16), children: [
              Centre(
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(children: [
                        CircleAvatar(radius: 32, backgroundColor: C.vertPale, child: Text(e.initiale, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900, color: C.vert))),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text('${e.prenom} ${e.nom}', style: Theme.of(context).textTheme.titleLarge),
                            Text('${e.ageLisible ?? ''} · ${e.sexe == 'F' ? 'Fille' : 'Garçon'}${e.region != null ? ' · ${e.region}' : ''}',
                                style: const TextStyle(color: C.texteDoux)),
                          ]),
                        ),
                      ]),
                    ),
                  ),
                  const SizedBox(height: 14),
                  FilledButton.icon(
                    onPressed: () => context.push('/tests?enfant=${e.id}'),
                    icon: const Icon(Icons.fact_check_rounded),
                    label: Text('Faire un test pour ${e.prenom}'),
                  ),
                  const Titre('Structures qui le suivent'),
                  if (d.suivis.isEmpty)
                    Card(
                      child: ListTile(
                        leading: const Icon(Icons.local_hospital_outlined),
                        title: const Text('Aucune structure pour le moment'),
                        subtitle: const Text('Faites un test : nous vous proposerons les structures adaptées.'),
                        onTap: () => context.go('/trouver'),
                      ),
                    )
                  else
                    for (final s in d.suivis)
                      Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        child: ListTile(
                          leading: const CircleAvatar(backgroundColor: C.vertPale, child: Icon(Icons.local_hospital_rounded, color: C.vert)),
                          title: Text(s.structureNom ?? '', style: const TextStyle(fontWeight: FontWeight.w800)),
                          subtitle: Text('Dossier ${s.numeroDossier}'),
                          trailing: BadgeStatut(s.statut),
                        ),
                      ),
                  const Titre('Recommandations des soignants'),
                  AsyncVue<List<Consultation>>(
                    cons,
                    donnees: (liste) {
                      final avecReco = liste.where((c) => (c.recommandations ?? '').isNotEmpty).toList();
                      if (avecReco.isEmpty) return const Card(child: ListTile(title: Text('Aucune recommandation pour le moment')));
                      return Column(children: [
                        for (final c in avecReco)
                          Card(
                            margin: const EdgeInsets.only(bottom: 8),
                            child: Padding(
                              padding: const EdgeInsets.all(14),
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text('${c.professionnelNom ?? ''} — ${dateCourte(c.date)}', style: const TextStyle(fontWeight: FontWeight.w800)),
                                Text(c.structureNom ?? '', style: const TextStyle(color: C.texteDoux, fontSize: 13)),
                                const SizedBox(height: 8),
                                Text(c.recommandations!),
                                const SizedBox(height: 6),
                                Align(alignment: Alignment.centerRight, child: BoutonVoix('reco_${c.id}', texte: c.recommandations, compact: true)),
                              ]),
                            ),
                          ),
                      ]);
                    },
                  ),
                  const Titre('Historique des tests'),
                  AsyncVue<List<Depistage>>(
                    deps,
                    donnees: (liste) => liste.isEmpty
                        ? const Card(child: ListTile(title: Text('Aucun test réalisé')))
                        : Column(children: [
                            for (final dep in liste)
                              Card(
                                margin: const EdgeInsets.only(bottom: 8),
                                child: ListTile(
                                  leading: _PastilleNiveau(dep.niveau),
                                  title: Text(_nomTest(dep.code), style: const TextStyle(fontWeight: FontWeight.w700)),
                                  subtitle: Text('${dateCourte(dep.date)} · score ${dep.score}/${dep.scoreMax}'
                                      '${dep.alertes.isNotEmpty ? ' · ⚠ signal d’alerte' : ''}'),
                                ),
                              ),
                          ]),
                  ),
                ]),
              ),
            ]),
          );
        },
      ),
    );
  }
}

String _nomTest(String code) => const {
      'TSA': 'Autisme', 'TDAH': 'Attention / agitation', 'DI': 'Développement global', 'LANGAGE': 'Langage',
      'DYS': 'Apprentissages', 'DEPRESSION': 'Moral / dépression', 'ADDICTION': 'Consommations',
    }[code] ??
    code;

class _PastilleNiveau extends StatelessWidget {
  const _PastilleNiveau(this.niveau);
  final String niveau;
  @override
  Widget build(BuildContext context) {
    final (c, l) = switch (niveau) { 'ELEVE' => (C.urgent, 'Élevé'), 'MODERE' => (C.prioritaire, 'Modéré'), _ => (C.normal, 'Faible') };
    return Container(
      width: 64,
      padding: const EdgeInsets.symmetric(vertical: 6),
      decoration: BoxDecoration(color: c.withValues(alpha: .12), borderRadius: BorderRadius.circular(10)),
      child: Text(l, textAlign: TextAlign.center, style: TextStyle(color: c, fontWeight: FontWeight.w900, fontSize: 12.5)),
    );
  }
}
