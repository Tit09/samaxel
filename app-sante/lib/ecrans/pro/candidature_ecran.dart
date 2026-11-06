import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api.dart';
import '../../core/donnees.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';

final candidatureProvider = FutureProvider.autoDispose.family<Map<String, dynamic>, String>(
    (ref, userId) => Api.instance.get('/admin/membres/$userId/pieces'));

const _libellesPieces = {
  'DIPLOME': 'Diplôme', 'ORDRE': 'Attestation d’inscription à l’Ordre', 'IDENTITE': 'Pièce d’identité', 'CV': 'CV', 'ATTESTATION': 'Attestation',
};

/// Examen d'une candidature : pièces (ouvrir, conforme / non conforme), convocation à un entretien,
/// puis validation APRÈS l'entretien ou refus motivé.
class CandidatureEcran extends ConsumerWidget {
  const CandidatureEcran({super.key, required this.membre});
  final Map<String, dynamic> membre;

  String get _id => membre['id'] as String;

  Future<void> _action(BuildContext context, WidgetRef ref, Future<void> Function() f, String ok) async {
    try {
      await f();
      ref.invalidate(candidatureProvider(_id));
      ref.invalidate(membresProvider);
      if (context.mounted) toast(context, ok);
    } catch (e) {
      if (context.mounted) toast(context, messageErreur(e), erreur: true);
    }
  }

  Future<void> _ouvrir(BuildContext context, Map<String, dynamic> p) async {
    try {
      final f = await Api.instance.telecharger('/admin/pieces/${p['id']}');
      if (!context.mounted) return;
      if (f.type.startsWith('image/')) {
        await showDialog(context: context, builder: (_) => Dialog(child: InteractiveViewer(child: Image.memory(f.octets))));
      } else {
        await launchUrl(Uri.dataFromBytes(f.octets, mimeType: f.type));
      }
    } catch (e) {
      if (context.mounted) toast(context, messageErreur(e), erreur: true);
    }
  }

  Future<void> _convoquer(BuildContext context, WidgetRef ref) async {
    final jour = await showDatePicker(context: context, firstDate: DateTime.now(), lastDate: DateTime.now().add(const Duration(days: 90)),
        initialDate: DateTime.now().add(const Duration(days: 3)));
    if (jour == null || !context.mounted) return;
    final h = await showTimePicker(context: context, initialTime: const TimeOfDay(hour: 10, minute: 0));
    if (h == null || !context.mounted) return;
    final lieu = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Lieu de l’entretien'),
        content: TextField(controller: lieu, decoration: const InputDecoration(hintText: 'ex. Bureau de la direction, Keur Xaleyi, Fann')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Annuler')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Convoquer')),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    final date = DateTime(jour.year, jour.month, jour.day, h.hour, h.minute);
    await _action(context, ref, () => Api.instance.put('/admin/membres/$_id/decision', {
          'statut': 'CONVOQUE', 'convocation_date': date.toUtc().toIso8601String(), 'convocation_lieu': lieu.text.trim(),
        }), 'Candidat convoqué — il est prévenu par e-mail et SMS');
  }

  Future<void> _refuser(BuildContext context, WidgetRef ref) async {
    final motif = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Motif du refus'),
        content: TextField(controller: motif, maxLines: 3, decoration: const InputDecoration(hintText: 'Le candidat recevra ce motif')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Annuler')),
          FilledButton(style: FilledButton.styleFrom(backgroundColor: C.urgent), onPressed: () => Navigator.pop(context, true), child: const Text('Refuser')),
        ],
      ),
    );
    if (ok == true && context.mounted) {
      await _action(context, ref, () => Api.instance.put('/admin/membres/$_id/decision', {'statut': 'REFUSE', 'motif': motif.text.trim()}), 'Candidature refusée');
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = ref.watch(candidatureProvider(_id));
    return Scaffold(
      appBar: AppBar(title: Text('Candidature — ${membre['prenom']} ${membre['nom']}')),
      body: AsyncVue<Map<String, dynamic>>(
        c,
        reessayer: () => ref.invalidate(candidatureProvider(_id)),
        donnees: (d) {
          final m = Map<String, dynamic>.from(d['membre']);
          final pieces = ((d['pieces'] as List?) ?? []).map((e) => Map<String, dynamic>.from(e)).toList();
          final manquantes = List<String>.from(d['manquantes'] ?? []);
          final complet = d['complet'] == true;
          final convoque = m['statut'] == 'CONVOQUE';
          final dateConv = DateTime.tryParse('${m['convocation_date']}')?.toLocal();
          final entretienPasse = convoque && dateConv != null && dateConv.isBefore(DateTime.now());
          return ListView(padding: const EdgeInsets.all(16), children: [
            Centre(
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Card(
                  child: ListTile(
                    leading: const Icon(Icons.badge_outlined, color: C.vert),
                    title: Text('${membre['prenom']} ${membre['nom']} — ${membre['specialite'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.w800)),
                    subtitle: Text([membre['email'], membre['telephone'], membre['numero_ordre'] == null ? null : 'N° Ordre : ${membre['numero_ordre']}']
                        .whereType<String>()
                        .join('\n')),
                    trailing: BadgeStatut(m['statut'], membre: true),
                  ),
                ),
                _Etapes(etape: m['statut'] == 'ACTIF' ? 4 : (entretienPasse ? 3 : (convoque ? 2 : (complet ? 1 : 0)))),
                const Titre('Pièces justificatives'),
                if (manquantes.isNotEmpty)
                  Card(
                    color: C.orPale,
                    child: ListTile(
                      leading: const Icon(Icons.hourglass_empty, color: C.prioritaire),
                      title: Text('Pièces manquantes : ${manquantes.map((t) => _libellesPieces[t] ?? t).join(', ')}'),
                    ),
                  ),
                for (final p in pieces)
                  Card(
                    child: ListTile(
                      leading: Icon(p['mime'] == 'application/pdf' ? Icons.picture_as_pdf : Icons.image, color: C.info),
                      title: Text(_libellesPieces[p['type']] ?? p['type'], style: const TextStyle(fontWeight: FontWeight.w800)),
                      subtitle: Text('${p['nom_fichier']} · ${(p['taille'] / 1024).round()} Ko\nEmpreinte SHA-256 : ${(p['sha256'] as String).substring(0, 16)}…'),
                      isThreeLine: true,
                      trailing: Wrap(spacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
                        IconButton(tooltip: 'Ouvrir', onPressed: () => _ouvrir(context, p), icon: const Icon(Icons.open_in_new)),
                        if (p['statut'] == 'A_VERIFIER') ...[
                          IconButton(
                            tooltip: 'Conforme',
                            onPressed: () => _action(context, ref, () => Api.instance.put('/admin/pieces/${p['id']}', {'statut': 'CONFORME'}), 'Pièce conforme'),
                            icon: const Icon(Icons.check_circle_outline, color: C.normal),
                          ),
                          IconButton(
                            tooltip: 'Non conforme',
                            onPressed: () => _action(context, ref, () => Api.instance.put('/admin/pieces/${p['id']}', {'statut': 'NON_CONFORME'}), 'Pièce refusée — le candidat est prévenu'),
                            icon: const Icon(Icons.cancel_outlined, color: C.urgent),
                          ),
                        ] else
                          Chip(label: Text(p['statut'] == 'CONFORME' ? 'Conforme' : 'Non conforme')),
                      ]),
                    ),
                  ),
                if (convoque && dateConv != null)
                  Card(
                    color: C.infoPale,
                    child: ListTile(
                      leading: const Icon(Icons.event, color: C.info),
                      title: Text('Entretien : ${dateLongue(dateConv)}'),
                      subtitle: Text('${m['convocation_lieu'] ?? ''}\nVérifier les ORIGINAUX des diplômes et la pièce d’identité.'),
                    ),
                  ),
                const SizedBox(height: 16),
                if (m['statut'] != 'ACTIF' && m['statut'] != 'REFUSE')
                  Wrap(spacing: 8, runSpacing: 8, children: [
                    FilledButton.icon(
                      onPressed: complet ? () => _convoquer(context, ref) : null,
                      icon: const Icon(Icons.event_available),
                      label: Text(convoque ? 'Changer la convocation' : 'Convoquer à un entretien'),
                    ),
                    FilledButton.icon(
                      style: FilledButton.styleFrom(backgroundColor: C.vertFonce),
                      onPressed: entretienPasse
                          ? () => _action(context, ref, () => Api.instance.put('/admin/membres/$_id/decision', {'statut': 'ACTIF'}), 'Professionnel validé')
                          : null,
                      icon: const Icon(Icons.verified),
                      label: const Text('Valider après l’entretien'),
                    ),
                    OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(foregroundColor: C.urgent),
                      onPressed: () => _refuser(context, ref),
                      icon: const Icon(Icons.block),
                      label: const Text('Refuser'),
                    ),
                  ]),
              ]),
            ),
          ]);
        },
      ),
    );
  }
}

class _Etapes extends StatelessWidget {
  const _Etapes({required this.etape});
  final int etape;
  @override
  Widget build(BuildContext context) {
    const noms = ['Pièces déposées', 'Pièces vérifiées', 'Convoqué', 'Entretien passé', 'Validé'];
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(children: [
        for (var i = 0; i < noms.length; i++)
          Expanded(
            child: Column(children: [
              CircleAvatar(
                radius: 14,
                backgroundColor: i <= etape ? C.vert : C.bordure,
                child: i < etape ? const Icon(Icons.check, size: 16, color: Colors.white) : Text('${i + 1}', style: const TextStyle(fontSize: 12, color: Colors.white)),
              ),
              const SizedBox(height: 4),
              Text(noms[i], textAlign: TextAlign.center, style: TextStyle(fontSize: 11, color: i <= etape ? C.vertFonce : C.texteDoux)),
            ]),
          ),
      ]),
    );
  }
}
