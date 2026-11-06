import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api.dart';
import '../../core/donnees.dart';
import '../../core/modeles.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';

class MessagesEcran extends ConsumerWidget {
  const MessagesEcran({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final convs = ref.watch(conversationsProvider);
    final u = ref.watch(utilisateurProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Messages'), actions: const [Padding(padding: EdgeInsets.only(right: 12), child: BoutonVoix('messages', compact: true))]),
      floatingActionButton: u?.estParent == true
          ? FloatingActionButton.extended(
              onPressed: () => showModalBottomSheet(context: context, showDragHandle: true, isScrollControlled: true, builder: (_) => const _NouvelleConversation()),
              icon: const Icon(Icons.edit),
              label: const Text('Écrire à un soignant', style: TextStyle(fontWeight: FontWeight.w800)),
            )
          : null,
      body: AsyncVue<List<Conversation>>(
        convs,
        reessayer: () => ref.invalidate(conversationsProvider),
        donnees: (liste) => liste.isEmpty
            ? Vide(
                icone: Icons.lock_outline,
                titre: 'Aucune conversation',
                texte: u?.estParent == true
                    ? 'Vous pourrez écrire aux soignants de l’établissement qui vous suit (vous, votre enfant ou un proche). Vos messages sont chiffrés : personne d’autre ne peut les lire.'
                    : 'Ouvrez une conversation depuis le dossier d’un patient.',
              )
            : RefreshIndicator(
                onRefresh: () async => ref.invalidate(conversationsProvider),
                child: ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: liste.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (_, i) {
                    final c = liste[i];
                    return Centre(
                      child: Card(
                        child: ListTile(
                          onTap: () => context.push('/chat/${c.id}', extra: c),
                          leading: CircleAvatar(backgroundColor: C.vertPale, child: Text(c.interlocuteurNom.isEmpty ? '?' : c.interlocuteurNom[0], style: const TextStyle(fontWeight: FontWeight.w900, color: C.vert))),
                          title: Text(c.interlocuteurNom, style: const TextStyle(fontWeight: FontWeight.w800)),
                          subtitle: Text(c.structureNom ?? ''),
                          trailing: c.nonLus > 0 ? Badge(label: Text('${c.nonLus}')) : Text(heure(c.dernier), style: const TextStyle(color: C.texteDoux)),
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

/// Parent : choisir un soignant d'une structure qui suit son enfant
class _NouvelleConversation extends ConsumerStatefulWidget {
  const _NouvelleConversation();
  @override
  ConsumerState<_NouvelleConversation> createState() => _NouvelleConversationState();
}

class _NouvelleConversationState extends ConsumerState<_NouvelleConversation> {
  Suivi? _suivi;

  Future<void> _ouvrir(Map<String, dynamic> pro) async {
    try {
      final r = await Api.instance.post('/conversations', {
        'professionnel_id': pro['id'],
        'structure_id': _suivi!.structureId,
        'enfant_id': _suivi!.enfantId,
      });
      ref.invalidate(conversationsProvider);
      final liste = await ref.read(conversationsProvider.future);
      final c = liste.firstWhere((x) => x.id == r['conversation']['id']);
      if (mounted) {
        Navigator.pop(context);
        context.push('/chat/${c.id}', extra: c);
      }
    } catch (e) {
      if (mounted) toast(context, messageErreur(e), erreur: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final suivis = ref.watch(suivisProvider).value?.suivis.where((s) => s.statut == 'ACTIF' || s.statut == 'DEMANDE').toList() ?? [];
    final pros = _suivi == null ? null : ref.watch(professionnelsProvider(_suivi!.structureId));
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('Écrire à un soignant', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 12),
        if (suivis.isEmpty)
          const Text('Aucun dossier n’est encore ouvert. Rejoignez un établissement partenaire ou demandez un rendez-vous : vous pourrez ensuite écrire à ses soignants.')
        else
          DropdownButtonFormField<Suivi>(
            initialValue: _suivi,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Structure'),
            items: [for (final s in suivis) DropdownMenuItem(value: s, child: Text('${s.structureNom} (${s.enfant?.prenom ?? ''})'))],
            onChanged: (v) => setState(() => _suivi = v),
          ),
        if (pros != null) ...[
          const SizedBox(height: 12),
          AsyncVue<List<Map<String, dynamic>>>(
            pros,
            donnees: (liste) => Column(children: [
              for (final p in liste)
                ListTile(
                  leading: const Icon(Icons.medical_services_outlined),
                  title: Text('${p['prenom']} ${p['nom']}'),
                  subtitle: Text('${p['specialite'] ?? ''}${p['messagerie_active'] == true ? '' : ' · messagerie pas encore activée'}'),
                  enabled: p['messagerie_active'] == true,
                  onTap: () => _ouvrir(p),
                ),
            ]),
          ),
        ],
      ]),
    );
  }
}
