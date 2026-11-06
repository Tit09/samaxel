import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api.dart';
import '../../core/portails.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';

/// Profil > Notifications : où recevoir codes, rappels et messages de l'établissement.
class CanauxEcran extends ConsumerStatefulWidget {
  const CanauxEcran({super.key});
  @override
  ConsumerState<CanauxEcran> createState() => _CanauxEcranState();
}

class _CanauxEcranState extends ConsumerState<CanauxEcran> {
  bool _occupe = false;

  Future<void> _action(Future<void> Function() f) async {
    setState(() => _occupe = true);
    try {
      await f();
    } catch (e) {
      if (mounted) toast(context, messageErreur(e), erreur: true);
    } finally {
      if (mounted) setState(() => _occupe = false);
    }
  }

  Future<void> _relierTelegram() => _action(() async {
        final r = await Api.instance.post('/moi/telegram');
        await launchUrl(Uri.parse(r['url'] as String), mode: LaunchMode.externalApplication);
        if (mounted) {
          toast(context, 'Dans Telegram, appuyez sur « Démarrer », puis revenez ici.');
        }
      });

  Future<void> _tester() => _action(() async {
        final r = await Api.instance.post('/moi/canaux/test', {});
        final par = (r['envoye_par'] as List?)?.cast<String>() ?? [];
        if (mounted) {
          toast(context, par.isEmpty ? 'Aucun canal n’a fonctionné : reliez Telegram ou vérifiez votre numéro.' : 'Message de test envoyé par ${par.join(', ')}.',
              erreur: par.isEmpty);
        }
      });

  @override
  Widget build(BuildContext context) {
    final etat = ref.watch(canauxProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Notifications')),
      body: AsyncVue<Map<String, dynamic>>(
        etat,
        reessayer: () => ref.invalidate(canauxProvider),
        donnees: (c) {
          final tg = Map<String, dynamic>.from(c['telegram'] ?? {});
          final wa = Map<String, dynamic>.from(c['whatsapp'] ?? {});
          final sms = Map<String, dynamic>.from(c['sms'] ?? {});
          final ordre = (c['ordre'] as List?)?.cast<String>() ?? [];
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(canauxProvider),
            child: ListView(padding: const EdgeInsets.all(16), children: [
              Centre(
                largeur: 560,
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  const Text(
                    'Vos codes, rappels de rendez-vous et messages de l’établissement arrivent d’abord sur les canaux gratuits. '
                    'Le SMS ne sert que si les autres ne marchent pas.',
                    style: TextStyle(color: C.texteDoux),
                  ),
                  const SizedBox(height: 14),
                  _Canal(
                    icone: Icons.send_rounded,
                    couleur: const Color(0xFF229ED9),
                    titre: 'Telegram',
                    etat: tg['relie'] == true ? 'Relié' : (tg['disponible'] == true ? 'Non relié' : 'Pas encore activé sur ce serveur'),
                    actif: tg['relie'] == true,
                    action: tg['disponible'] != true
                        ? null
                        : tg['relie'] == true
                            ? TextButton(
                                onPressed: _occupe ? null : () => _action(() async {
                                      await Api.instance.delete('/moi/telegram');
                                      ref.invalidate(canauxProvider);
                                    }),
                                child: const Text('Délier'))
                            : FilledButton(onPressed: _occupe ? null : _relierTelegram, child: const Text('Relier')),
                  ),
                  _Canal(
                    icone: Icons.chat_rounded,
                    couleur: const Color(0xFF25D366),
                    titre: 'WhatsApp',
                    etat: wa['disponible'] != true ? 'Pas encore activé sur ce serveur' : (wa['accepte'] == true ? 'Accepté' : 'Refusé'),
                    actif: wa['accepte'] == true,
                    action: wa['disponible'] != true
                        ? null
                        : Switch(
                            value: wa['accepte'] == true,
                            onChanged: _occupe ? null : (v) => _action(() async {
                                  await Api.instance.put('/moi/canaux', {'whatsapp_accepte': v});
                                  ref.invalidate(canauxProvider);
                                }),
                          ),
                  ),
                  _Canal(
                    icone: Icons.sms_outlined,
                    couleur: C.prioritaire,
                    titre: 'SMS',
                    etat: sms['disponible'] == true ? (sms['numero'] == true ? 'Sur votre numéro' : 'Aucun numéro') : 'Pas encore activé sur ce serveur',
                    actif: sms['disponible'] == true && sms['numero'] == true,
                  ),
                  const SizedBox(height: 10),
                  if (ordre.isNotEmpty)
                    Text('Ordre d’envoi : ${ordre.map((o) => o == 'EMAIL' ? 'e-mail' : o.toLowerCase()).join(' → ')}',
                        style: const TextStyle(color: C.texteDoux, fontSize: 13)),
                  const SizedBox(height: 16),
                  OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                    onPressed: _occupe ? null : _tester,
                    icon: const Icon(Icons.notifications_active_outlined),
                    label: const Text('M’envoyer un message de test'),
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

class _Canal extends StatelessWidget {
  const _Canal({required this.icone, required this.couleur, required this.titre, required this.etat, required this.actif, this.action});
  final IconData icone;
  final Color couleur;
  final String titre;
  final String etat;
  final bool actif;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Card(
        margin: const EdgeInsets.only(bottom: 8),
        child: ListTile(
          leading: CircleAvatar(backgroundColor: couleur.withValues(alpha: 0.12), child: Icon(icone, color: couleur)),
          title: Text(titre, style: const TextStyle(fontWeight: FontWeight.w800)),
          subtitle: Text(etat, style: TextStyle(color: actif ? C.vert : C.texteDoux)),
          trailing: action,
        ),
      );
}
