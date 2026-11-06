import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api.dart';
import '../../core/config.dart';
import '../../core/donnees.dart';
import '../../core/modeles.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';

/// Résultat d'un test : niveau, conseil, alertes, structures recommandées par l'IA.
class ResultatEcran extends ConsumerWidget {
  const ResultatEcran({super.key, required this.donnees});
  final Map<String, dynamic> donnees;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final r = Map<String, dynamic>.from(donnees['resultat']);
    final niveau = r['niveau'] as String;
    final alertes = ((r['alertes'] as List?) ?? []).map((a) => Map<String, dynamic>.from(a)).toList();
    final recos = ((donnees['recommandations'] as List?) ?? []).map((x) => Recommandation.fromJson(Map<String, dynamic>.from(x))).toList();
    final depistageId = donnees['depistage']?['id'] as String?;
    final enfantId = donnees['enfant_id'] as String?;
    final (couleur, fond, titre, icone, cleVoix) = switch (niveau) {
      'ELEVE' => (C.urgent, C.urgentPale, 'Plusieurs signes importants', Icons.report_rounded, 'resultat_eleve'),
      'MODERE' => (C.prioritaire, C.prioritairePale, 'Quelques signes à surveiller', Icons.info_rounded, 'resultat_modere'),
      _ => (C.normal, C.normalPale, 'Pas de signe inquiétant', Icons.check_circle_rounded, 'resultat_faible'),
    };

    return Scaffold(
      appBar: AppBar(title: const Text('Résultat')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Centre(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(color: fond, borderRadius: BorderRadius.circular(20), border: Border.all(color: couleur.withValues(alpha: .4))),
              child: Column(children: [
                Icon(icone, size: 56, color: couleur),
                const SizedBox(height: 8),
                Text(titre, textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleLarge?.copyWith(color: couleur)),
                const SizedBox(height: 4),
                Text(donnees['titre'] ?? '', textAlign: TextAlign.center, style: const TextStyle(color: C.texteDoux)),
                const SizedBox(height: 12),
                Text(r['conseil'] ?? '', textAlign: TextAlign.center, style: const TextStyle(fontSize: 16)),
                const SizedBox(height: 12),
                BoutonVoix(cleVoix),
              ]),
            ),
            for (final a in alertes) ...[
              const SizedBox(height: 12),
              // Le bouton SAMU n'apparaît que pour un danger vital (idées suicidaires, convulsions) ;
              // les autres signes urgents demandent une consultation rapide, pas une ambulance.
              a['gravite'] == 'URGENT' && const ['IDEES_SUICIDAIRES', 'CONVULSIONS'].contains(a['code'])
                  ? CarteUrgence(message: a['message'] ?? '', onAppeler: () => launchUrl(Uri.parse('tel:${AppConfig.samu}')))
                  : Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: a['gravite'] == 'URGENT' ? C.urgentPale : C.prioritairePale,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Row(children: [
                        Icon(Icons.warning_amber_rounded, color: a['gravite'] == 'URGENT' ? C.urgent : C.prioritaire),
                        const SizedBox(width: 10),
                        Expanded(child: Text(a['message'] ?? '')),
                      ]),
                    ),
            ],
            if (donnees['triage'] != null && enfantId != null) ...[
              const SizedBox(height: 12),
              Card(
                child: ListTile(
                  leading: const Icon(Icons.speed_rounded, color: C.vert),
                  title: const Text('Priorité pour les soignants', style: TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: const Text('Si vous demandez une prise en charge, votre dossier sera traité avec cette priorité.'),
                  trailing: BadgePriorite(donnees['triage']['priorite'] ?? 'NORMAL', grand: true),
                ),
              ),
            ],
            if (recos.isNotEmpty) ...[
              const Titre('Structures recommandées pour vous'),
              const Text('Classées par l’intelligence artificielle selon le trouble, l’âge, la distance, le coût et la langue.',
                  style: TextStyle(color: C.texteDoux, fontSize: 13.5)),
              const SizedBox(height: 10),
              for (final reco in recos) _CarteReco(reco: reco, enfantId: enfantId, depistageId: depistageId),
            ],
            const SizedBox(height: 16),
            const Text('Ce résultat n’est pas un diagnostic. Seul un professionnel de santé peut poser un diagnostic.',
                textAlign: TextAlign.center, style: TextStyle(fontSize: 13, color: C.texteDoux)),
            const SizedBox(height: 12),
            OutlinedButton(onPressed: () => context.go('/accueil'), child: const Text('Retour à l’accueil')),
          ]),
        ),
      ]),
    );
  }
}

class _CarteReco extends ConsumerStatefulWidget {
  const _CarteReco({required this.reco, this.enfantId, this.depistageId});
  final Recommandation reco;
  final String? enfantId;
  final String? depistageId;
  @override
  ConsumerState<_CarteReco> createState() => _CarteRecoState();
}

class _CarteRecoState extends ConsumerState<_CarteReco> {
  bool _envoi = false;
  bool _envoye = false;

  Future<void> _demander() async {
    setState(() => _envoi = true);
    try {
      await Api.instance.post('/suivis', {
        'enfant_id': widget.enfantId,
        'structure_id': widget.reco.structure.id,
        if (widget.depistageId != null) 'depistage_id': widget.depistageId,
      });
      ref.invalidate(enfantDetailProvider(widget.enfantId!));
      setState(() => _envoye = true);
      if (mounted) toast(context, 'Demande envoyée. La structure vous contactera.');
    } catch (e) {
      if (mounted) toast(context, messageErreur(e), erreur: true);
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.reco.structure;
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text(s.nom, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16.5))),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(color: C.vertPale, borderRadius: BorderRadius.circular(10)),
              child: Text('${widget.reco.score}/100', style: const TextStyle(fontWeight: FontWeight.w900, color: C.vert)),
            ),
          ]),
          Text('${libellesTypes[s.type] ?? s.type} · ${s.region}', style: const TextStyle(color: C.texteDoux)),
          const SizedBox(height: 8),
          for (final r in widget.reco.raisons.take(4))
            Padding(
              padding: const EdgeInsets.only(bottom: 2),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Icon(Icons.check, size: 16, color: C.vert),
                const SizedBox(width: 6),
                Expanded(child: Text(r, style: const TextStyle(fontSize: 14))),
              ]),
            ),
          const SizedBox(height: 10),
          Wrap(spacing: 8, runSpacing: 8, children: [
            if (s.partenaire && widget.enfantId != null)
              FilledButton.icon(
                style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
                onPressed: _envoi || _envoye ? null : _demander,
                icon: Icon(_envoye ? Icons.check : Icons.send_rounded),
                label: Text(_envoye ? 'Demande envoyée' : 'Demander une prise en charge'),
              ),
            if (s.telephone != null)
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(minimumSize: const Size(0, 44)),
                onPressed: () => launchUrl(Uri.parse('tel:${s.telephone}')),
                icon: const Icon(Icons.call),
                label: const Text('Appeler'),
              ),
            TextButton(onPressed: () => context.push('/structure/${s.id}'), child: const Text('Voir la fiche')),
          ]),
        ]),
      ),
    );
  }
}
