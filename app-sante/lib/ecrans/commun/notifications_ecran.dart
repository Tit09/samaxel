import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api.dart';
import '../../core/donnees.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';

class NotificationsEcran extends ConsumerWidget {
  const NotificationsEcran({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final n = ref.watch(notificationsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Notifications'), actions: [
        const Padding(padding: EdgeInsets.only(right: 10), child: BoutonVoix('notifications', compact: true)),
        TextButton(
          onPressed: () async {
            await Api.instance.put('/notifications/lues');
            ref.invalidate(notificationsProvider);
          },
          child: const Text('Tout marquer lu'),
        ),
      ]),
      body: AsyncVue(
        n,
        reessayer: () => ref.invalidate(notificationsProvider),
        donnees: (d) => d.liste.isEmpty
            ? const Vide(icone: Icons.notifications_none, titre: 'Aucune notification')
            : ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: d.liste.length,
                separatorBuilder: (_, _) => const SizedBox(height: 8),
                itemBuilder: (_, i) {
                  final x = d.liste[i];
                  final urgent = x.type.contains('ALERTE') || x.titre.contains('URGENT');
                  return Centre(
                    child: Card(
                      color: x.lu ? Colors.white : C.vertPale,
                      child: ListTile(
                        leading: Icon(urgent ? Icons.warning_rounded : Icons.notifications_rounded, color: urgent ? C.urgent : C.vert),
                        title: Text(x.titre, style: TextStyle(fontWeight: x.lu ? FontWeight.w600 : FontWeight.w900)),
                        subtitle: Text('${x.corps}\n${dateLongue(x.date)}'),
                        isThreeLine: true,
                        onTap: () async {
                          if (!x.lu) {
                            await Api.instance.put('/notifications/${x.id}/lue');
                            ref.invalidate(notificationsProvider);
                          }
                        },
                      ),
                    ),
                  );
                },
              ),
      ),
    );
  }
}
