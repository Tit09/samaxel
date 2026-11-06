import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/donnees.dart';
import '../../core/maison.dart';
import '../../core/portails.dart';
import '../../core/modeles.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';
import '../../widgets/logo_etablissement.dart';

/// Tableau de bord du professionnel : la file de priorité calculée par l'IA
/// (urgents en tête), les alertes récentes et la détresse des parents.
class AccueilPro extends ConsumerWidget {
  const AccueilPro({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final u = ref.watch(utilisateurProvider);
    final tdb = ref.watch(tableauDeBordProvider);
    final suivis = ref.watch(suivisProvider);
    final notifs = ref.watch(notificationsProvider).value?.nonLues ?? 0;
    // La maison du personnel : SON établissement, avec son logo et sa couleur
    final etab = u?.structureCode == null ? null : ref.watch(portailProvider(u!.structureCode!)).value?.etablissement;
    final teinte = couleurDe(u?.structureCouleur) ?? C.vert;
    final caisse = u?.role == 'SECRETAIRE' || u?.role == 'ADMIN_STRUCTURE';

    return Scaffold(
      appBar: AppBar(
        backgroundColor: teinte,
        foregroundColor: Colors.white,
        toolbarHeight: 72,
        titleTextStyle: const TextStyle(color: Colors.white, fontFamily: 'Nunito', fontSize: 19, fontWeight: FontWeight.w900),
        title: Row(children: [
          if (etab != null) ...[LogoEtablissement(etab, taille: 46, surFond: true), const SizedBox(width: 12)],
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Bonjour ${u?.prenom ?? ''}'),
              Text(u?.structureNom ?? '', overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, color: Colors.white70, fontWeight: FontWeight.w600)),
            ]),
          ),
        ]),
        actions: [
          IconButton(
            tooltip: 'Notifications',
            onPressed: () => context.push('/notifications'),
            icon: Badge(isLabelVisible: notifs > 0, label: Text('$notifs'), child: const Icon(Icons.notifications_outlined, color: Colors.white)),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(tableauDeBordProvider);
          ref.invalidate(suivisProvider);
        },
        child: ListView(padding: const EdgeInsets.all(16), children: [
          Centre(
            largeur: 1000,
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              AsyncVue(
                suivis,
                reessayer: () => ref.invalidate(suivisProvider),
                donnees: (d) => _Compteurs(resume: d.resume),
              ),
              const SizedBox(height: 8),
              Row(children: [
                if (caisse)
                  Expanded(
                    child: TuileAction(
                      icone: Icons.point_of_sale_rounded,
                      titre: 'Caisse et tickets',
                      sousTitre: 'Encaisser, confirmer Wave / OM, Excel',
                      couleur: teinte,
                      onTap: () => context.push('/pro/caisse'),
                    ),
                  ),
                if (caisse) const SizedBox(width: 12),
                Expanded(
                  child: TuileAction(
                    icone: Icons.campaign_rounded,
                    titre: 'Salle d’attente',
                    sousTitre: 'Appeler le numéro suivant',
                    couleur: C.prioritaire,
                    onTap: () => context.push('/pro/file'),
                  ),
                ),
              ]),
              const SizedBox(height: 8),
              Card(
                child: ListTile(
                  leading: Icon(Icons.how_to_reg_rounded, color: teinte),
                  title: const Text('Demandes des familles', style: TextStyle(fontWeight: FontWeight.w800)),
                  subtitle: const Text('Les familles qui ont rejoint l’établissement : accepter, voir le dossier'),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => context.push('/pro/familles'),
                ),
              ),
              const SizedBox(height: 8),
              AsyncVue<Map<String, dynamic>>(
                tdb,
                reessayer: () => ref.invalidate(tableauDeBordProvider),
                donnees: (t) {
                  final alertes = (t['alertes'] as List?) ?? [];
                  final detresse = (t['detresse_parents'] as List?) ?? [];
                  final attente = t['attente_moyenne_jours'] ?? 0;
                  return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Card(
                      color: C.infoPale,
                      child: ListTile(
                        leading: const Icon(Icons.hourglass_bottom_rounded, color: C.info),
                        title: Text('Attente moyenne des nouvelles demandes : $attente jour(s)', style: const TextStyle(fontWeight: FontWeight.w700)),
                      ),
                    ),
                    if (detresse.isNotEmpty) ...[
                      const Titre('Détresse signalée par l’IA (14 jours)'),
                      for (final d in detresse)
                        Card(
                          color: d['niveau'] == 'CRISE' ? C.urgentPale : C.prioritairePale,
                          child: ListTile(
                            leading: Icon(Icons.crisis_alert, color: d['niveau'] == 'CRISE' ? C.urgent : C.prioritaire),
                            title: Text('Dossier ${d['numero_dossier']}', style: const TextStyle(fontWeight: FontWeight.w800)),
                            subtitle: Text('Journal d’humeur du parent : niveau ${d['niveau']} · ${dateCourte(DateTime.tryParse('${d['created_at']}')?.toLocal())}'),
                          ),
                        ),
                    ],
                    const Titre('Alertes des tests (30 jours)'),
                    if (alertes.isEmpty)
                      const Card(child: ListTile(leading: Icon(Icons.check_circle_outline, color: C.normal), title: Text('Aucune alerte récente')))
                    else
                      for (final a in alertes)
                        Card(
                          child: ListTile(
                            onTap: () => context.push('/pro/dossier/${a['suivi_id']}'),
                            leading: const Icon(Icons.warning_amber_rounded, color: C.urgent),
                            title: Text('${a['numero_dossier']} — ${libellesTroubles[a['questionnaire_code']] ?? a['questionnaire_code']}', style: const TextStyle(fontWeight: FontWeight.w800)),
                            subtitle: Text(((a['alertes'] as List?) ?? []).join(' · '), maxLines: 2, overflow: TextOverflow.ellipsis),
                            trailing: const Icon(Icons.chevron_right),
                          ),
                        ),
                  ]);
                },
              ),
              const Titre('Les plus urgents'),
              AsyncVue(
                suivis,
                donnees: (d) {
                  final urgents = d.suivis.where((s) => s.statut == 'DEMANDE' || s.statut == 'ACTIF').take(5).toList();
                  if (urgents.isEmpty) return const Vide(icone: Icons.inbox_outlined, titre: 'Aucun dossier en cours');
                  return Column(children: [for (final s in urgents) CarteDossier(s)]);
                },
              ),
              const SizedBox(height: 8),
              OutlinedButton(onPressed: () => context.go('/pro/dossiers'), child: const Text('Voir tous les dossiers')),
            ]),
          ),
        ]),
      ),
    );
  }
}

class _Compteurs extends StatelessWidget {
  const _Compteurs({required this.resume});
  final Map<String, dynamic> resume;

  @override
  Widget build(BuildContext context) {
    Widget bloc(String cle, String libelle, Color c, Color fond, IconData i) => Expanded(
          child: Card(
            color: fond,
            child: InkWell(
              borderRadius: BorderRadius.circular(16),
              onTap: () => context.go('/pro/dossiers'),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Icon(i, color: c),
                  const SizedBox(height: 6),
                  Text('${resume[cle] ?? 0}', style: TextStyle(fontSize: 30, fontWeight: FontWeight.w900, color: c)),
                  Text(libelle, style: TextStyle(color: c, fontWeight: FontWeight.w700)),
                ]),
              ),
            ),
          ),
        );
    return Row(children: [
      bloc('URGENT', 'Urgents', C.urgent, C.urgentPale, Icons.priority_high_rounded),
      const SizedBox(width: 8),
      bloc('PRIORITAIRE', 'Prioritaires', C.prioritaire, C.prioritairePale, Icons.trending_up_rounded),
      const SizedBox(width: 8),
      bloc('NORMAL', 'Normaux', C.normal, C.normalPale, Icons.check_rounded),
    ]);
  }
}

/// Carte d'un dossier dans la file de priorité
class CarteDossier extends StatelessWidget {
  const CarteDossier(this.s, {super.key});
  final Suivi s;

  @override
  Widget build(BuildContext context) {
    final e = s.enfant;
    final couleur = switch (s.priorite) { 'URGENT' => C.urgent, 'PRIORITAIRE' => C.prioritaire, _ => C.normal };
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push('/pro/dossier/${s.id}'),
        child: Container(
          decoration: BoxDecoration(border: Border(left: BorderSide(color: couleur, width: 6))),
          padding: const EdgeInsets.all(14),
          child: Row(children: [
            CircleAvatar(backgroundColor: couleur.withValues(alpha: .12), child: Text(e?.initiale ?? '?', style: TextStyle(color: couleur, fontWeight: FontWeight.w900))),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(e == null ? s.numeroDossier : '${e.prenom} ${e.nom}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                Text([s.numeroDossier, e?.ageLisible, e?.region].whereType<String>().join(' · '), style: const TextStyle(color: C.texteDoux)),
                if (s.raisons.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(s.raisons.first.texte, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: couleur, fontSize: 13, fontWeight: FontWeight.w600)),
                  ),
              ]),
            ),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              BadgePriorite(s.priorite),
              const SizedBox(height: 6),
              BadgeStatut(s.statut),
            ]),
          ]),
        ),
      ),
    );
  }
}
