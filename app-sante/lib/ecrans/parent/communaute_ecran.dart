import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';

final communauteProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) => Api.instance.get('/communaute'));

/// Groupe des parents « TND Sénégal » : entraide, modéré par l'équipe SAMA XHEL.
class CommunauteEcran extends ConsumerStatefulWidget {
  const CommunauteEcran({super.key});
  @override
  ConsumerState<CommunauteEcran> createState() => _CommunauteEcranState();
}

class _CommunauteEcranState extends ConsumerState<CommunauteEcran> {
  final _texte = TextEditingController();
  bool _envoi = false;

  Future<void> _publier() async {
    if (_texte.text.trim().isEmpty) return;
    setState(() => _envoi = true);
    try {
      await Api.instance.post('/communaute', {'texte': _texte.text.trim()});
      _texte.clear();
      ref.invalidate(communauteProvider);
    } catch (e) {
      if (mounted) toast(context, messageErreur(e), erreur: true);
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  Future<void> _masquer(String id, bool masque) async {
    await Api.instance.put('/communaute/$id/moderation', {'masque': masque, 'motif': 'Modération SAMA XHEL'});
    ref.invalidate(communauteProvider);
  }

  @override
  Widget build(BuildContext context) {
    final d = ref.watch(communauteProvider);
    final moderateur = ref.watch(utilisateurProvider)?.role == 'SUPER_ADMIN';
    return Scaffold(
      appBar: AppBar(title: const Text('Groupe des familles'), actions: const [Padding(padding: EdgeInsets.only(right: 10), child: BoutonVoix('communaute', compact: true))]),
      body: AsyncVue<Map<String, dynamic>>(
        d,
        reessayer: () => ref.invalidate(communauteProvider),
        donnees: (r) {
          final msgs = ((r['messages'] as List?) ?? []).map((e) => Map<String, dynamic>.from(e)).toList();
          return Column(children: [
            Container(
              width: double.infinity,
              color: C.orPale,
              padding: const EdgeInsets.all(12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Qui voit ces messages ?', style: TextStyle(fontWeight: FontWeight.w800)),
                const Text(
                  'Toutes les familles inscrites sur SAMA XHEL, et l’équipe SAMA XHEL qui modère. Les soignants n’y ont pas accès. '
                  'Seuls votre prénom et votre région s’affichent, jamais votre numéro. N’écrivez aucune information médicale ici : '
                  'pour parler de votre dossier, utilisez « Messages » (chiffré, réservé à votre établissement).',
                  style: TextStyle(fontSize: 13),
                ),
                const SizedBox(height: 6),
                Text(r['regles'] ?? '', style: const TextStyle(fontSize: 12.5, color: C.texteDoux)),
                if (r['telegram'] != null || r['whatsapp'] != null)
                  Wrap(spacing: 8, children: [
                    if (r['telegram'] != null)
                      FilledButton.tonalIcon(
                        onPressed: () => launchUrl(Uri.parse(r['telegram']), mode: LaunchMode.externalApplication),
                        icon: const Icon(Icons.send_rounded),
                        label: const Text('Groupe Telegram'),
                      ),
                    if (r['whatsapp'] != null)
                      FilledButton.tonalIcon(
                        onPressed: () => launchUrl(Uri.parse(r['whatsapp']), mode: LaunchMode.externalApplication),
                        icon: const Icon(Icons.groups_rounded),
                        label: const Text('Groupe WhatsApp'),
                      ),
                  ]),
              ]),
            ),
            Expanded(
              child: msgs.isEmpty
                  ? const Vide(icone: Icons.forum_outlined, titre: 'Soyez le premier à écrire', texte: 'Présentez-vous et posez vos questions sur l’application.')
                  : ListView.builder(
                      padding: const EdgeInsets.all(12),
                      itemCount: msgs.length,
                      itemBuilder: (_, i) {
                        final m = msgs[i];
                        final equipe = m['pseudo'] == 'Équipe SAMA XHEL';
                        return Centre(
                          child: Card(
                            color: m['masque'] == true ? Colors.grey.shade200 : (equipe ? C.vertPale : Colors.white),
                            child: ListTile(
                              leading: CircleAvatar(
                                backgroundColor: equipe ? C.vert : C.infoPale,
                                child: equipe ? const Icon(Icons.verified, color: Colors.white) : Text('${m['pseudo']}'[0]),
                              ),
                              title: Text(m['pseudo'], style: const TextStyle(fontWeight: FontWeight.w800)),
                              subtitle: Text(m['masque'] == true ? '(message masqué par la modération)' : m['texte']),
                              trailing: moderateur
                                  ? IconButton(
                                      tooltip: m['masque'] == true ? 'Rétablir' : 'Masquer',
                                      onPressed: () => _masquer(m['id'], m['masque'] != true),
                                      icon: Icon(m['masque'] == true ? Icons.visibility : Icons.visibility_off),
                                    )
                                  : Text(heure(DateTime.tryParse('${m['created_at']}')?.toLocal()), style: const TextStyle(color: C.texteDoux, fontSize: 12)),
                            ),
                          ),
                        );
                      },
                    ),
            ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 6, 12, 10),
                child: Row(children: [
                  Expanded(child: TextField(controller: _texte, minLines: 1, maxLines: 4, decoration: const InputDecoration(hintText: 'Écrire au groupe…'))),
                  const SizedBox(width: 8),
                  IconButton.filled(tooltip: 'Publier', onPressed: _envoi ? null : _publier, icon: const Icon(Icons.send_rounded)),
                ]),
              ),
            ),
          ]);
        },
      ),
    );
  }
}
