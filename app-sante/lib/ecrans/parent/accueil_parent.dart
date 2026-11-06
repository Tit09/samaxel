import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/config.dart';
import '../../core/donnees.dart';
import '../../core/maison.dart';
import '../../core/modeles.dart';
import '../../core/portails.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';
import '../../widgets/logo_etablissement.dart';

class AccueilParent extends ConsumerWidget {
  const AccueilParent({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final u = ref.watch(utilisateurProvider);
    final enfants = ref.watch(enfantsProvider);
    final rdv = ref.watch(rdvProvider);
    final notifs = ref.watch(notificationsProvider).value?.nonLues ?? 0;
    final largeur = MediaQuery.sizeOf(context).width;
    // Dernier hôpital visité : affiché en premier dans « Mes hôpitaux »
    final code = ref.watch(maisonActiveProvider);
    // Arrivé par le portail d'un hôpital : on entre directement dans son espace
    if (maisonAOuvrir != null) {
      final aOuvrir = maisonAOuvrir!;
      maisonAOuvrir = null;
      WidgetsBinding.instance.addPostFrameCallback((_) { if (context.mounted) context.push('/maison/$aOuvrir'); });
    }

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(enfantsProvider);
          ref.invalidate(rdvProvider);
          ref.invalidate(notificationsProvider);
          ref.invalidate(mesEtablissementsProvider);
        },
        child: CustomScrollView(slivers: [
          SliverToBoxAdapter(child: _EnTete(prenom: u?.prenom ?? '', notifs: notifs)),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
            sliver: SliverToBoxAdapter(
              child: Centre(
                largeur: 900,
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  const SizedBox(height: 4),
                  const Align(alignment: Alignment.centerLeft, child: BoutonVoix('accueil_parent')),
                  // Mes hôpitaux : chaque hôpital rejoint a SON espace (couleur, logo, soignant, tickets)
                  Titre('Mes hôpitaux', action: TextButton.icon(onPressed: () => context.push('/etablissements?en_ligne=true'), icon: const Icon(Icons.add), label: const Text('Rejoindre'))),
                  _MesHopitaux(dernier: code),
                  const SizedBox(height: 12),
                  const _CommentCaMarche(),
                  const SizedBox(height: 12),
                  // Pour les parents qui ne lisent pas : parler, comme sur WhatsApp
                  Material(
                    color: C.vert,
                    borderRadius: BorderRadius.circular(20),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(20),
                      onTap: () => context.push('/assistant'),
                      child: const Padding(
                        padding: EdgeInsets.all(18),
                        child: Row(children: [
                          CircleAvatar(radius: 30, backgroundColor: Colors.white, child: Icon(Icons.mic_rounded, size: 34, color: C.vert)),
                          SizedBox(width: 16),
                          Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text('Parler à SAMA XHEL', style: TextStyle(color: Colors.white, fontSize: 19, fontWeight: FontWeight.w900)),
                              SizedBox(height: 2),
                              Text('Dans votre langue — je vous réponds à voix haute', style: TextStyle(color: Colors.white70)),
                            ]),
                          ),
                          Icon(Icons.chevron_right, color: Colors.white),
                        ]),
                      ),
                    ),
                  ),
                  const Titre('Que voulez-vous faire ?'),
                  GridView.count(
                    crossAxisCount: largeur > 700 ? 3 : 2,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    mainAxisSpacing: 12,
                    crossAxisSpacing: 12,
                    childAspectRatio: largeur > 1100 ? 1.8 : (largeur > 700 ? 1.5 : .98),
                    children: [
                      TuileAction(
                        icone: Icons.fact_check_rounded,
                        titre: 'Faire un test',
                        sousTitre: 'Pour moi, mon enfant ou un proche',
                        couleur: C.vert,
                        onTap: () => context.push('/tests'),
                      ),
                      TuileAction(
                        icone: Icons.travel_explore_rounded,
                        titre: 'Trouver de l’aide',
                        sousTitre: 'Hôpitaux, centres et écoles près de moi',
                        couleur: C.info,
                        onTap: () => context.go('/trouver'),
                      ),
                      TuileAction(
                        icone: Icons.event_available_rounded,
                        titre: 'Mes rendez-vous',
                        sousTitre: 'Voir, annuler, consultation vidéo',
                        couleur: C.prioritaire,
                        onTap: () => context.push('/rendez-vous'),
                      ),
                      TuileAction(
                        icone: Icons.favorite_rounded,
                        titre: 'Comment je vais',
                        sousTitre: 'Prendre soin de moi aussi',
                        couleur: const Color(0xFFAD1457),
                        onTap: () => context.push('/humeur'),
                      ),
                      TuileAction(
                        icone: Icons.local_pharmacy_rounded,
                        titre: 'Ordonnances',
                        sousTitre: 'Et pharmacies proches',
                        couleur: const Color(0xFF00796B),
                        onTap: () => context.push('/ordonnances'),
                      ),
                      TuileAction(
                        icone: Icons.groups_rounded,
                        titre: 'Groupe des parents',
                        sousTitre: 'S’entraider, comprendre l’appli',
                        couleur: const Color(0xFF6A1B9A),
                        onTap: () => context.push('/communaute'),
                      ),
                    ],
                  ),
                  // Tous les hôpitaux et centres déjà sur SAMA XHEL (pas seulement un)
                  Titre('Hôpitaux et centres sur SAMA XHEL', action: TextButton(onPressed: () => context.push('/etablissements?en_ligne=true'), child: const Text('Tout voir'))),
                  const _Partenaires(),
                  Titre('Personnes suivies', action: TextButton.icon(onPressed: () => context.push('/enfant/ajouter'), icon: const Icon(Icons.add), label: const Text('Ajouter'))),
                  AsyncVue<List<Enfant>>(
                    enfants,
                    reessayer: () => ref.invalidate(enfantsProvider),
                    donnees: (liste) => liste.isEmpty
                        ? Card(
                            child: Padding(
                              padding: const EdgeInsets.all(16),
                              child: Row(children: [
                                const Icon(Icons.child_care, size: 36, color: C.vert),
                                const SizedBox(width: 12),
                                const Expanded(child: Text('Ajoutez la personne à suivre (vous-même, votre enfant ou un proche) pour faire un test et prendre rendez-vous.')),
                                FilledButton(
                                  style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
                                  onPressed: () => context.push('/enfant/ajouter'),
                                  child: const Text('Ajouter'),
                                ),
                              ]),
                            ),
                          )
                        : SizedBox(
                            height: 112,
                            child: ListView.separated(
                              scrollDirection: Axis.horizontal,
                              itemCount: liste.length,
                              separatorBuilder: (_, _) => const SizedBox(width: 10),
                              itemBuilder: (_, i) => _CarteEnfant(liste[i]),
                            ),
                          ),
                  ),
                  const Titre('Prochain rendez-vous'),
                  AsyncVue<List<RendezVous>>(
                    rdv,
                    donnees: (liste) {
                      final prochains = liste.where((r) => r.statut == 'CONFIRME' || r.statut == 'DEMANDE').toList();
                      if (prochains.isEmpty) {
                        return const Card(child: ListTile(leading: Icon(Icons.event_busy), title: Text('Aucun rendez-vous prévu')));
                      }
                      final r = prochains.first;
                      return Card(
                        child: ListTile(
                          onTap: () => context.push('/rendez-vous'),
                          leading: CircleAvatar(
                            backgroundColor: r.estVisio ? C.infoPale : C.vertPale,
                            child: Icon(r.estVisio ? Icons.videocam_rounded : Icons.local_hospital_rounded, color: r.estVisio ? C.info : C.vert),
                          ),
                          title: Text(r.structureNom ?? 'Rendez-vous', style: const TextStyle(fontWeight: FontWeight.w800)),
                          subtitle: Text(r.statut == 'DEMANDE' ? 'En attente de confirmation' : dateLongue(r.date)),
                          trailing: BadgeStatut(r.statut),
                        ),
                      );
                    },
                  ),
                  const SizedBox(height: 20),
                  CarteUrgence(
                    message: 'Crise, convulsions, idées de mort, mise en danger : n’attendez pas.',
                    onAppeler: () => launchUrl(Uri.parse('tel:${AppConfig.samu}')),
                  ),
                ]),
              ),
            ),
          ),
        ]),
      ),
    );
  }
}

/// Une carte par hôpital rejoint, à ses couleurs ; toucher = entrer dans son espace
class _MesHopitaux extends ConsumerWidget {
  const _MesHopitaux({this.dernier});
  final String? dernier;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ref.watch(mesEtablissementsProvider).when(
          skipLoadingOnReload: true,
          loading: () => const SizedBox(height: 120, child: Center(child: CircularProgressIndicator())),
          error: (_, _) => const SizedBox.shrink(),
          data: (l) {
            final liste = [...l]..sort((a, b) => (b.code == dernier ? 1 : 0) - (a.code == dernier ? 1 : 0));
            if (liste.isEmpty) {
              return Card(
                color: C.vertPale,
                child: ListTile(
                  leading: const Icon(Icons.local_hospital_rounded, color: C.vert, size: 34),
                  title: const Text('Rejoindre l’hôpital ou le centre qui vous suit', style: TextStyle(fontWeight: FontWeight.w900)),
                  subtitle: const Text('Keur Xaleyi, CEPIAD, Moussa Diop, Éduc’Autisme… Chacun a son espace : dossier, soignant, tickets.'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/etablissements?en_ligne=true'),
                ),
              );
            }
            return SizedBox(
              height: 150,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: liste.length,
                separatorBuilder: (_, _) => const SizedBox(width: 12),
                itemBuilder: (_, i) {
                  final e = liste[i];
                  final ok = e.inscriptionStatut == 'ACTIVE';
                  return SizedBox(
                    width: 250,
                    child: Material(
                      color: e.teinte,
                      borderRadius: BorderRadius.circular(20),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(20),
                        onTap: () => context.push('/maison/${e.code}'),
                        child: Padding(
                          padding: const EdgeInsets.all(14),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Row(children: [
                              LogoEtablissement(e, taille: 46, surFond: true),
                              const Spacer(),
                              const Icon(Icons.arrow_forward_rounded, color: Colors.white),
                            ]),
                            const Spacer(),
                            Text(e.nomCourt, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 18)),
                            Text(ok ? 'Dossier accepté · entrer' : 'Demande en attente · entrer',
                                style: const TextStyle(color: Colors.white70, fontSize: 13)),
                          ]),
                        ),
                      ),
                    ),
                  );
                },
              ),
            );
          },
        );
  }
}

/// Ce que fait l'application, en trois étapes (lisible et écoutable)
class _CommentCaMarche extends StatelessWidget {
  const _CommentCaMarche();
  @override
  Widget build(BuildContext context) {
    const etapes = [
      (Icons.fact_check_rounded, '1. Je fais un test', 'Pour moi, mon enfant ou un proche'),
      (Icons.local_hospital_rounded, '2. Je rejoins un hôpital', 'Il ouvre mon dossier et me donne un soignant'),
      (Icons.medical_services_rounded, '3. Je suis suivi', 'Rendez-vous, messages privés, vidéo, ticket'),
    ];
    final large = MediaQuery.sizeOf(context).width > 700;
    final cartes = [
      for (final e in etapes)
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: C.bordure)),
          child: Row(children: [
            CircleAvatar(backgroundColor: C.vertPale, child: Icon(e.$1, color: C.vert)),
            const SizedBox(width: 10),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(e.$2, style: const TextStyle(fontWeight: FontWeight.w900)),
                Text(e.$3, style: const TextStyle(color: C.texteDoux, fontSize: 13)),
              ]),
            ),
          ]),
        ),
    ];
    return large
        ? Row(children: [for (final c in cartes) Expanded(child: Padding(padding: const EdgeInsets.symmetric(horizontal: 4), child: c))])
        : Column(children: [for (final c in cartes) Padding(padding: const EdgeInsets.only(bottom: 8), child: c)]);
  }
}

/// Établissements partenaires que la famille n'a pas encore rejoints : un geste pour découvrir leur espace
class _Partenaires extends ConsumerWidget {
  const _Partenaires();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mes = ref.watch(mesEtablissementsProvider).value?.map((e) => e.code).toSet() ?? {};
    return ref.watch(partenairesProvider).when(
          skipLoadingOnReload: true,
          loading: () => const SizedBox(height: 90),
          error: (_, _) => const SizedBox.shrink(),
          data: (l) {
            final autres = l.where((e) => !mes.contains(e.code)).toList();
            if (autres.isEmpty) return const SizedBox.shrink();
            return SizedBox(
              height: 96,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: autres.length,
                separatorBuilder: (_, _) => const SizedBox(width: 10),
                itemBuilder: (_, i) {
                  final e = autres[i];
                  return SizedBox(
                    width: 260,
                    child: Card(
                      margin: EdgeInsets.zero,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: BorderSide(color: e.teinte, width: 2)),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(16),
                        onTap: () => context.push('/portail/${e.code}'),
                        child: Padding(
                          padding: const EdgeInsets.all(10),
                          child: Row(children: [
                            LogoEtablissement(e, taille: 52),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text(e.nomCourt, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w900)),
                                Text(e.parentNom ?? e.commune ?? e.region, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: C.texteDoux, fontSize: 12.5)),
                                Text('Voir · rejoindre', style: TextStyle(color: e.teinte, fontWeight: FontWeight.w800, fontSize: 12.5)),
                              ]),
                            ),
                          ]),
                        ),
                      ),
                    ),
                  );
                },
              ),
            );
          },
        );
  }
}

class _EnTete extends StatelessWidget {
  const _EnTete({required this.prenom, required this.notifs});
  final String prenom;
  final int notifs;

  @override
  Widget build(BuildContext context) => Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(colors: [C.vertFonce, C.vert], begin: Alignment.topLeft, end: Alignment.bottomRight),
          borderRadius: BorderRadius.vertical(bottom: Radius.circular(28)),
        ),
        padding: EdgeInsets.fromLTRB(20, MediaQuery.paddingOf(context).top + 14, 12, 26),
        margin: const EdgeInsets.only(bottom: 8),
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Nanga def, $prenom 👋', style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
              const SizedBox(height: 4),
              const Text('Ensemble pour la santé mentale de vos proches', style: TextStyle(color: Color(0xFFD9F2E1), fontSize: 15)),
            ]),
          ),
          IconButton(
            tooltip: 'Notifications',
            onPressed: () => context.push('/notifications'),
            icon: Badge(isLabelVisible: notifs > 0, label: Text('$notifs'), child: const Icon(Icons.notifications_none_rounded, color: Colors.white, size: 28)),
          ),
        ]),
      );
}

class _CarteEnfant extends StatelessWidget {
  const _CarteEnfant(this.e);
  final Enfant e;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: 200,
        child: Card(
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: () => context.push('/enfant/${e.id}'),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Row(children: [
                CircleAvatar(
                  radius: 26,
                  backgroundColor: e.sexe == 'F' ? const Color(0xFFFCE4EC) : C.infoPale,
                  child: Text(e.initiale, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: e.sexe == 'F' ? const Color(0xFFAD1457) : C.info)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(e.prenom, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 17), overflow: TextOverflow.ellipsis),
                    Text(e.ageLisible ?? '', style: const TextStyle(color: C.texteDoux)),
                  ]),
                ),
              ]),
            ),
          ),
        ),
      );
}
