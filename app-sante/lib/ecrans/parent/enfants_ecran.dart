import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/donnees.dart';
import '../../core/modeles.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';

class EnfantsEcran extends ConsumerWidget {
  const EnfantsEcran({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final enfants = ref.watch(enfantsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Personnes suivies'), actions: const [Padding(padding: EdgeInsets.only(right: 12), child: BoutonVoix('enfants', compact: true))]),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/enfant/ajouter'),
        icon: const Icon(Icons.add),
        label: const Text('Ajouter une personne', style: TextStyle(fontWeight: FontWeight.w800)),
      ),
      body: AsyncVue<List<Enfant>>(
        enfants,
        reessayer: () => ref.invalidate(enfantsProvider),
        donnees: (liste) => liste.isEmpty
            ? Vide(
                icone: Icons.child_care,
                titre: 'Personne enregistrée pour l’instant',
                texte: 'Ajoutez-vous, votre enfant ou un proche pour faire un test, demander un rendez-vous et être suivi.',
                action: FilledButton.icon(onPressed: () => context.push('/enfant/ajouter'), icon: const Icon(Icons.add), label: const Text('Ajouter un enfant')),
              )
            : RefreshIndicator(
                onRefresh: () async => ref.invalidate(enfantsProvider),
                child: ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
                  itemCount: liste.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 10),
                  itemBuilder: (_, i) {
                    final e = liste[i];
                    return Centre(
                      child: Card(
                        child: ListTile(
                          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                          onTap: () => context.push('/enfant/${e.id}'),
                          leading: CircleAvatar(
                            radius: 26,
                            backgroundColor: e.sexe == 'F' ? const Color(0xFFFCE4EC) : C.infoPale,
                            child: Text(e.initiale, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
                          ),
                          title: Text('${e.prenom} ${e.nom}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
                          subtitle: Text('${e.ageLisible ?? ''} · ${e.sexe == 'F' ? 'Fille' : 'Garçon'}'),
                          trailing: const Icon(Icons.chevron_right),
                        ),
                      ),
                    );
                  },
                ),
              ),
      ),
    );
  }
}
