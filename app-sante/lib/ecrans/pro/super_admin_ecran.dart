import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api.dart';
import '../../core/session.dart';
import '../../core/temps_reel.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';

final supervisionProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) => Api.instance.get('/admin/supervision'));
final statsNationalesProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) => Api.instance.get('/admin/statistiques-nationales'));
final alertesProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async =>
    (((await Api.instance.get('/admin/securite/alertes'))['alertes'] as List?) ?? []).map((e) => Map<String, dynamic>.from(e)).toList());
/// Rafraîchit la liste des alertes dès qu'une nouvelle arrive par le WebSocket
final _alertesDirectProvider = StreamProvider.autoDispose<void>((ref) =>
    TempsReel.instance.filtre('alerte:nouvelle').map((_) => ref.invalidate(alertesProvider)));
final ancragesProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async =>
    (((await Api.instance.get('/admin/ancrages'))['ancrages'] as List?) ?? []).map((e) => Map<String, dynamic>.from(e)).toList());
final partenairesAdminProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async =>
    (((await Api.instance.get('/portails', query: {'en_ligne': 'true'}, public: true))['etablissements'] as List?) ?? [])
        .map((e) => Map<String, dynamic>.from(e)).toList());

/// Espace du SUPER-ADMINISTRATEUR (équipe SAMA XHEL / DevOps) : supervision des services,
/// intégrité du journal, activité nationale, modération du groupe des parents.
/// Aucune donnée nominative ni médicale n'est visible ici.
class SuperAdminEcran extends ConsumerWidget {
  const SuperAdminEcran({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(supervisionProvider);
    final n = ref.watch(statsNationalesProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Supervision SAMA XHEL'),
        actions: [
          IconButton(tooltip: 'Studio des voix (langues nationales)', onPressed: () => context.push('/studio-voix'), icon: const Icon(Icons.record_voice_over_outlined)),
          IconButton(tooltip: 'Groupe des parents (modération)', onPressed: () => context.push('/communaute'), icon: const Icon(Icons.forum_outlined)),
          IconButton(tooltip: 'Actualiser', onPressed: () => ref.invalidate(supervisionProvider), icon: const Icon(Icons.refresh)),
          IconButton(tooltip: 'Se déconnecter', onPressed: () => ref.read(sessionProvider.notifier).deconnexion(), icon: const Icon(Icons.logout)),
        ],
      ),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Centre(
          largeur: 1100,
          child: AsyncVue<Map<String, dynamic>>(
            s,
            reessayer: () => ref.invalidate(supervisionProvider),
            donnees: (d) {
              final services = Map<String, dynamic>.from(d['services']);
              final secu = Map<String, dynamic>.from(d['securite']);
              final act = Map<String, dynamic>.from(d['activite']);
              final integre = Map<String, dynamic>.from(secu['journal_integre'] ?? {});
              return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                const Titre('État des services'),
                Wrap(spacing: 10, runSpacing: 10, children: [
                  for (final e in services.entries)
                    SizedBox(
                      width: 250,
                      child: Card(
                        color: e.value['ok'] == true ? C.normalPale : C.urgentPale,
                        child: ListTile(
                          leading: Icon(e.value['ok'] == true ? Icons.check_circle : Icons.error, color: e.value['ok'] == true ? C.normal : C.urgent),
                          title: Text(_libelles[e.key] ?? e.key, style: const TextStyle(fontWeight: FontWeight.w800)),
                          subtitle: Text('${e.value['detail'] ?? ''}', maxLines: 2, overflow: TextOverflow.ellipsis),
                        ),
                      ),
                    ),
                ]),
                const Titre('Sécurité'),
                Card(
                  color: integre['valide'] == true ? C.normalPale : C.urgentPale,
                  child: ListTile(
                    leading: Icon(integre['valide'] == true ? Icons.verified_user : Icons.gpp_bad, color: integre['valide'] == true ? C.normal : C.urgent),
                    title: Text(integre['valide'] == true ? 'Journal d’audit intègre (chaîne SHA-256 vérifiée)' : 'ALERTE : le journal d’audit a été modifié',
                        style: const TextStyle(fontWeight: FontWeight.w800)),
                    subtitle: Text(integre['valide'] == true
                        ? '${integre['entrees']} entrées vérifiées · ${secu['refus_24h']} accès refusés en 24 h'
                        : 'Première rupture de la chaîne : entrée n° ${integre['premiere_rupture']} — déclencher la procédure d’incident'),
                  ),
                ),
                const SizedBox(height: 8),
                Wrap(spacing: 8, runSpacing: 8, children: [
                  for (final a in (secu['acces_24h'] as List? ?? []))
                    Chip(label: Text('${a['action']} : ${a['n']}')),
                ]),
                const Titre('Activité'),
                Wrap(spacing: 10, runSpacing: 10, children: [
                  for (final e in act.entries)
                    SizedBox(
                      width: 200,
                      child: Card(
                        child: Padding(
                          padding: const EdgeInsets.all(14),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text('${e.value}', style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: C.vert)),
                            Text(_libelles[e.key] ?? e.key, style: const TextStyle(color: C.texteDoux)),
                          ]),
                        ),
                      ),
                    ),
                ]),
              ]);
            },
          ),
        ),
        Centre(largeur: 1100, child: _SecuriteAvancee()),
        Centre(largeur: 1100, child: _Etablissements()),
        Centre(
          largeur: 1100,
          child: AsyncVue<Map<String, dynamic>>(
            n,
            donnees: (d) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              const Titre('Couverture par région'),
              Card(
                child: Column(children: [
                  for (final r in (d['structures'] as List? ?? []))
                    ListTile(
                      dense: true,
                      title: Text('${r['region']}'),
                      trailing: Text('${r['partenaires']} partenaire(s) / ${r['total']} structure(s)', style: const TextStyle(fontWeight: FontWeight.w700)),
                    ),
                ]),
              ),
            ]),
          ),
        ),
      ]),
    );
  }

  static const _libelles = {
    'base_de_donnees': 'Base de données', 'redis': 'Cache / sessions (Redis)', 'ia_vocale': 'IA vocale', 'visio_livekit': 'Visio',
    'sms': 'SMS', 'email': 'E-mail', 'push': 'Notifications push',
    'structures_partenaires': 'structures partenaires', 'structures_annuaire': 'structures dans l’annuaire', 'pharmacies': 'pharmacies',
    'familles': 'familles inscrites', 'professionnels_actifs': 'professionnels actifs', 'candidatures_en_cours': 'candidatures en cours',
    'vocaux_7j': 'messages vocaux de parents (7 j)', 'vocaux_non_attribues': 'vocaux sans équipe (7 j)', 'rappels_ussd_en_attente': 'rappels USSD en attente',
  };
}


/// Sécurité avancée (mémoire 4.3.6) : alertes de l'IA d'accès + preuves blockchain du journal.
class _SecuriteAvancee extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.watch(_alertesDirectProvider);
    final alertes = ref.watch(alertesProvider);
    final ancrages = ref.watch(ancragesProvider);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const Titre('Alertes de sécurité (IA)'),
      AsyncVue<List<Map<String, dynamic>>>(
        alertes,
        donnees: (l) => l.isEmpty
            ? const Card(child: ListTile(leading: Icon(Icons.verified_user, color: C.normal), title: Text('Aucun accès anormal détecté')))
            : Column(children: [
                for (final a in l.take(10))
                  Card(
                    color: a['statut'] == 'NOUVELLE' ? C.urgentPale : null,
                    child: ListTile(
                      leading: const Icon(Icons.gpp_maybe_rounded, color: C.urgent),
                      title: Text('${a['type']}'.replaceAll('_', ' ').toLowerCase(), style: const TextStyle(fontWeight: FontWeight.w800)),
                      subtitle: Text('${a['prenom'] ?? ''} ${a['nom'] ?? ''} · ${a['structure'] ?? ''} · score ${a['score']} · ${a['statut']}'),
                      trailing: a['statut'] == 'NOUVELLE'
                          ? PopupMenuButton<String>(
                              onSelected: (v) async {
                                await Api.instance.put('/admin/securite/alertes/${a['id']}', {'statut': v});
                                ref.invalidate(alertesProvider);
                              },
                              itemBuilder: (_) => const [
                                PopupMenuItem(value: 'FAUX_POSITIF', child: Text('Faux positif')),
                                PopupMenuItem(value: 'CONFIRMEE', child: Text('Incident confirmé')),
                              ],
                            )
                          : null,
                    ),
                  ),
              ]),
      ),
      Titre('Journal scellé dans la blockchain Bitcoin', action: TextButton.icon(
        onPressed: () async {
          try {
            final r = await Api.instance.post('/admin/ancrages');
            ref.invalidate(ancragesProvider);
            if (context.mounted) toast(context, r['ancre'] == true ? 'Empreinte envoyée à OpenTimestamps.' : 'Ancrage impossible pour le moment.', erreur: r['ancre'] != true);
          } catch (e) {
            if (context.mounted) toast(context, messageErreur(e), erreur: true);
          }
        },
        icon: const Icon(Icons.link_rounded),
        label: const Text('Sceller maintenant'),
      )),
      AsyncVue<List<Map<String, dynamic>>>(
        ancrages,
        donnees: (l) => Card(
          child: Column(children: [
            if (l.isEmpty) const ListTile(title: Text('Aucun ancrage pour l’instant (un par jour, automatiquement).')),
            for (final a in l.take(6))
              ListTile(
                dense: true,
                leading: Icon(a['statut'] == 'ECHEC' ? Icons.link_off : Icons.link, color: a['statut'] == 'ECHEC' ? C.urgent : C.normal),
                title: Text('Maillon n° ${a['dernier_audit']} · ${'${a['empreinte']}'.substring(0, 16)}…'),
                subtitle: Text('${a['calendrier']} · ${a['statut']}'),
              ),
          ]),
        ),
      ),
    ]);
  }
}

/// Établissements partenaires : inviter leur directeur (vraie personne) qui gérera ensuite son équipe.
class _Etablissements extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = ref.watch(partenairesAdminProvider);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const Titre('Établissements sur SAMA XHEL'),
      AsyncVue<List<Map<String, dynamic>>>(
        l,
        donnees: (liste) => Card(
          child: Column(children: [
            for (final e in liste)
              ListTile(
                leading: const Icon(Icons.local_hospital_rounded, color: C.vert),
                title: Text('${e['nom']}', style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text('code portail : ${e['code']} · ${e['region']}'),
                trailing: TextButton(
                  onPressed: () => _inviterDirecteur(context, e),
                  child: const Text('Inviter le directeur'),
                ),
              ),
          ]),
        ),
      ),
    ]);
  }

  Future<void> _inviterDirecteur(BuildContext context, Map<String, dynamic> e) async {
    final dest = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text('Directeur de ${e['sigle'] ?? e['nom']}'),
        content: TextField(controller: dest, decoration: const InputDecoration(labelText: 'Téléphone ou e-mail')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Annuler')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Inviter')),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    try {
      final r = await Api.instance.post('/etablissement/invitations', {'role': 'ADMIN_STRUCTURE', 'destinataire': dest.text.trim(), 'structure_id': e['id']});
      if (context.mounted) {
        showDialog(context: context, builder: (_) => AlertDialog(
          title: const Text('Invitation créée'),
          content: SelectableText('Lien à transmettre au directeur (valable 7 jours) :\n\n${r['lien']}'),
          actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Fermer'))],
        ));
      }
    } catch (err) {
      if (context.mounted) toast(context, messageErreur(err), erreur: true);
    }
  }
}
