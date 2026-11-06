import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api.dart';
import '../../core/config.dart';
import '../../core/modeles.dart';
import '../../core/session.dart';
import '../../core/stockage.dart';
import '../../core/theme.dart';
import '../../core/voix.dart';
import '../../widgets/communs.dart';

class ProfilEcran extends ConsumerWidget {
  const ProfilEcran({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final u = ref.watch(utilisateurProvider);
    final langue = ref.watch(langueProvider);
    if (u == null) return const Chargement();
    return Scaffold(
      appBar: AppBar(title: const Text('Mon profil'), actions: const [Padding(padding: EdgeInsets.only(right: 12), child: BoutonVoix('profil', compact: true))]),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Centre(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(children: [
                  CircleAvatar(radius: 30, backgroundColor: C.vertPale, child: Text(u.prenom.isEmpty ? '?' : u.prenom[0], style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: C.vert))),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(u.nomComplet, style: Theme.of(context).textTheme.titleLarge),
                      Text([libellesRoles[u.role], u.specialite, u.structureNom].whereType<String>().join(' · '), style: const TextStyle(color: C.texteDoux)),
                      Text(u.telephone ?? u.email ?? '', style: const TextStyle(color: C.texteDoux)),
                    ]),
                  ),
                ]),
              ),
            ),
            if (u.estPro && u.structures.length > 1) ...[
              const Titre('Structure active'),
              Card(
                child: RadioGroup<String>(
                  groupValue: u.structureId,
                  onChanged: (v) async {
                    if (v == null || v == u.structureId) return;
                    try {
                      await ref.read(sessionProvider.notifier).changerStructure(v);
                      if (context.mounted) toast(context, 'Structure active changée');
                    } catch (e) {
                      if (context.mounted) toast(context, messageErreur(e), erreur: true);
                    }
                  },
                  child: Column(children: [
                    for (final s in u.structures)
                      RadioListTile<String>(
                        value: s.id,
                        title: Text(s.nom, style: const TextStyle(fontWeight: FontWeight.w700)),
                        subtitle: Text(libellesRoles[s.role] ?? s.role),
                      ),
                  ]),
                ),
              ),
              const Padding(
                padding: EdgeInsets.only(top: 6),
                child: Text('Chaque structure a ses propres dossiers : vous ne voyez que ceux de la structure active.', style: TextStyle(fontSize: 13, color: C.texteDoux)),
              ),
            ],
            if (u.estAdmin) ...[
              const SizedBox(height: 12),
              Card(
                child: ListTile(
                  leading: const Icon(Icons.admin_panel_settings_outlined, color: C.vert),
                  title: const Text('Administration de la structure', style: TextStyle(fontWeight: FontWeight.w800)),
                  subtitle: const Text('Valider les professionnels, statistiques'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/pro/admin'),
                ),
              ),
            ],
            const Titre('Langue du guide vocal'),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Wrap(spacing: 8, runSpacing: 8, children: [
                  for (final l in langues)
                    ChoiceChip(
                      label: Text('${l.drapeau} ${l.nomLocal}'),
                      selected: l.code == langue,
                      onSelected: (_) async {
                        await ref.read(langueProvider.notifier).choisir(l.code);
                        try {
                          await Api.instance.put('/users/me', {'langue': l.code});
                        } catch (_) {}
                      },
                    ),
                ]),
              ),
            ),
            const _GuideAuto(),
            const Titre('Notifications'),
            Card(
              child: ListTile(
                leading: const Icon(Icons.notifications_active_outlined, color: C.vert),
                title: const Text('Où recevoir mes codes et mes rappels'),
                subtitle: const Text('Telegram, WhatsApp, SMS'),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () => context.push('/reglages/notifications'),
              ),
            ),
            if (u.estParent) ...[
              const Titre('Mes données'),
              Card(
                child: Column(children: [
                  ListTile(
                    leading: const Icon(Icons.download_outlined),
                    title: const Text('Télécharger mes données'),
                    subtitle: const Text('Droit d’accès — loi n° 2008-12'),
                    onTap: () async {
                      try {
                        final d = await Api.instance.get('/users/me/export');
                        if (context.mounted) {
                          showDialog(
                            context: context,
                            builder: (_) => AlertDialog(
                              title: const Text('Vos données'),
                              content: Text('${(d['enfants'] as List).length} enfant(s), ${(d['depistages'] as List).length} test(s), '
                                  '${(d['rendez_vous'] as List).length} rendez-vous, ${(d['consentements'] as List).length} consentement(s).\n\n'
                                  'L’export complet est disponible au format JSON depuis la version web.'),
                              actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Fermer'))],
                            ),
                          );
                        }
                      } catch (e) {
                        if (context.mounted) toast(context, messageErreur(e), erreur: true);
                      }
                    },
                  ),
                  // Réglage « Aide de l'IA » masqué (demande du 05/11) : le consentement reste demandé
                  // à l'inscription et la classe _ConsentementIA est conservée pour le réactiver.
                ]),
              ),
            ],
            const SizedBox(height: 20),
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(foregroundColor: C.urgent, side: const BorderSide(color: C.urgent)),
              onPressed: () => ref.read(sessionProvider.notifier).deconnexion(),
              icon: const Icon(Icons.logout),
              label: const Text('Se déconnecter'),
            ),
            const SizedBox(height: 16),
            Text('${AppConfig.nomApp} · version 1.0.0', textAlign: TextAlign.center, style: const TextStyle(color: C.texteDoux, fontSize: 12)),
          ]),
        ),
      ]),
    );
  }
}

// ignore: unused_element
class _ConsentementIA extends StatefulWidget {
  const _ConsentementIA();
  @override
  State<_ConsentementIA> createState() => _ConsentementIAState();
}

class _ConsentementIAState extends State<_ConsentementIA> {
  bool? _actif;

  @override
  void initState() {
    super.initState();
    Api.instance.get('/consentements').then((r) {
      final l = (r['consentements'] as List).where((c) => c['type'] == 'IA_ANALYSE').toList();
      if (mounted) setState(() => _actif = l.isNotEmpty && l.first['accepte'] == true);
    }).catchError((_) {});
  }

  @override
  Widget build(BuildContext context) => SwitchListTile(
        secondary: const Icon(Icons.psychology_outlined),
        title: const Text('Aide de l’intelligence artificielle'),
        subtitle: const Text('Analyse de mon journal d’humeur pour alerter les soignants'),
        value: _actif ?? false,
        onChanged: _actif == null
            ? null
            : (v) async {
                try {
                  await Api.instance.post('/consentements', {'type': 'IA_ANALYSE', 'accepte': v});
                  setState(() => _actif = v);
                } catch (e) {
                  if (context.mounted) toast(context, messageErreur(e), erreur: true);
                }
              },
      );
}


/// Réglage : chaque écran se présente-t-il tout seul à voix haute ?
class _GuideAuto extends ConsumerStatefulWidget {
  const _GuideAuto();
  @override
  ConsumerState<_GuideAuto> createState() => _GuideAutoState();
}

class _GuideAutoState extends ConsumerState<_GuideAuto> {
  bool? _actif;

  @override
  void initState() {
    super.initState();
    GuideVocal.instance.guideAuto(ref.read(langueProvider)).then((v) { if (mounted) setState(() => _actif = v); });
  }

  @override
  Widget build(BuildContext context) => Card(
        child: SwitchListTile(
          secondary: const Icon(Icons.record_voice_over_rounded, color: C.vert),
          title: const Text('Guide vocal automatique', style: TextStyle(fontWeight: FontWeight.w800)),
          subtitle: const Text('Chaque écran se présente tout seul à voix haute, dans votre langue.'),
          value: _actif ?? true,
          onChanged: (v) async {
            setState(() => _actif = v);
            await Stockage.ecrire(Stockage.kGuideAuto, v ? '1' : '0');
          },
        ),
      );
}
