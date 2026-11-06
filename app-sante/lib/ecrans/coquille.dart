import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/donnees.dart';
import '../core/session.dart';
import '../core/theme.dart';

/// Navigation principale, adaptée à la taille de l'écran :
/// barre en bas sur téléphone, rail latéral sur tablette / ordinateur.
class Coquille extends ConsumerWidget {
  const Coquille({super.key, required this.shell, required this.pro});
  final StatefulNavigationShell shell;
  final bool pro;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final u = ref.watch(utilisateurProvider);
    final nonLus = ref.watch(conversationsProvider).value?.fold<int>(0, (a, c) => a + c.nonLus) ?? 0;
    final destinations = pro
        ? [
            const _Dest(Icons.space_dashboard_outlined, Icons.space_dashboard, 'Accueil'),
            _Dest(Icons.folder_shared_outlined, Icons.folder_shared, u?.role == 'SECRETAIRE' ? 'Dossiers' : 'Patients'),
            const _Dest(Icons.calendar_month_outlined, Icons.calendar_month, 'Agenda'),
            _Dest(Icons.chat_bubble_outline, Icons.chat_bubble, 'Messages', badge: nonLus),
            const _Dest(Icons.person_outline, Icons.person, 'Profil'),
          ]
        : [
            const _Dest(Icons.home_outlined, Icons.home_rounded, 'Accueil'),
            const _Dest(Icons.people_outline, Icons.people, 'Suivis'),
            const _Dest(Icons.travel_explore_outlined, Icons.travel_explore, 'Trouver'),
            _Dest(Icons.chat_bubble_outline, Icons.chat_bubble, 'Messages', badge: nonLus),
            const _Dest(Icons.person_outline, Icons.person, 'Profil'),
          ];

    void aller(int i) => shell.goBranch(i, initialLocation: i == shell.currentIndex);
    final large = MediaQuery.sizeOf(context).width >= 840;

    if (large) {
      return Scaffold(
        body: Row(children: [
          NavigationRail(
            selectedIndex: shell.currentIndex,
            onDestinationSelected: aller,
            labelType: NavigationRailLabelType.all,
            backgroundColor: Colors.white,
            indicatorColor: C.vertPale,
            leading: Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Image.asset('assets/images/embleme.png', width: 52),
            ),
            destinations: [
              for (final d in destinations)
                NavigationRailDestination(icon: d.icone(false), selectedIcon: d.icone(true), label: Text(d.libelle)),
            ],
          ),
          const VerticalDivider(width: 1, color: C.bordure),
          Expanded(child: shell),
        ]),
      );
    }
    return Scaffold(
      body: shell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: shell.currentIndex,
        onDestinationSelected: aller,
        destinations: [
          for (final d in destinations) NavigationDestination(icon: d.icone(false), selectedIcon: d.icone(true), label: d.libelle),
        ],
      ),
    );
  }
}

class _Dest {
  const _Dest(this.normal, this.actif, this.libelle, {this.badge = 0});
  final IconData normal;
  final IconData actif;
  final String libelle;
  final int badge;

  Widget icone(bool selectionne) {
    final i = Icon(selectionne ? actif : normal);
    return badge > 0 ? Badge(label: Text('$badge'), child: i) : i;
  }
}
