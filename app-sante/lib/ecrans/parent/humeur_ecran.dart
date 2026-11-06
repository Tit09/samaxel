import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api.dart';
import '../../core/config.dart';
import '../../core/donnees.dart';
import '../../core/modeles.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';

/// Journal d'humeur du parent — analysé par l'IA émotionnelle (avec son accord).
class HumeurEcran extends ConsumerStatefulWidget {
  const HumeurEcran({super.key});
  @override
  ConsumerState<HumeurEcran> createState() => _HumeurEcranState();
}

class _HumeurEcranState extends ConsumerState<HumeurEcran> {
  int? _humeur;
  String? _enfant;
  final _texte = TextEditingController();
  bool _envoi = false;
  Map<String, dynamic>? _analyse;

  static const _visages = [(1, '😢', 'Très mal'), (2, '😟', 'Mal'), (3, '😐', 'Moyen'), (4, '🙂', 'Bien'), (5, '😄', 'Très bien')];

  Future<void> _envoyer() async {
    setState(() => _envoi = true);
    try {
      final r = await Api.instance.post('/humeur', {
        'humeur': _humeur,
        if (_texte.text.trim().isNotEmpty) 'texte': _texte.text.trim(),
        if (_enfant != null) 'enfant_id': _enfant,
      });
      ref.invalidate(humeurProvider(null));
      setState(() {
        _analyse = r['entree']['analyse_ia'] == null ? {'niveau': 'SANS_IA'} : Map<String, dynamic>.from(r['entree']['analyse_ia']);
        _texte.clear();
      });
    } catch (e) {
      if (mounted) toast(context, messageErreur(e), erreur: true);
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final enfants = ref.watch(enfantsProvider).value ?? const <Enfant>[];
    final historique = ref.watch(humeurProvider(null));
    return Scaffold(
      appBar: AppBar(title: const Text('Comment je vais'), actions: const [Padding(padding: EdgeInsets.only(right: 12), child: BoutonVoix('humeur', compact: true))]),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Centre(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Text('Accompagner un proche qui a des difficultés est fatigant. Prenez aussi soin de vous.', style: TextStyle(color: C.texteDoux)),
            const SizedBox(height: 16),
            Text('Aujourd’hui, je me sens…', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 10),
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              for (final (v, e, l) in _visages)
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 3),
                    child: Material(
                      color: _humeur == v ? C.vertPale : Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: BorderSide(color: _humeur == v ? C.vert : C.bordure, width: _humeur == v ? 2 : 1)),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(14),
                        onTap: () => setState(() => _humeur = v),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          child: Column(children: [
                            Text(e, style: const TextStyle(fontSize: 34)),
                            const SizedBox(height: 2),
                            Text(l, style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700), textAlign: TextAlign.center),
                          ]),
                        ),
                      ),
                    ),
                  ),
                ),
            ]),
            const SizedBox(height: 14),
            TextField(controller: _texte, maxLines: 4, decoration: const InputDecoration(labelText: 'Voulez-vous en dire plus ? (facultatif)', alignLabelWithHint: true)),
            if (enfants.isNotEmpty) ...[
              const SizedBox(height: 12),
              DropdownButtonFormField<String?>(
                initialValue: _enfant,
                decoration: const InputDecoration(labelText: 'Partager avec les soignants de… (facultatif)'),
                items: [
                  const DropdownMenuItem(value: null, child: Text('Personne, c’est pour moi')),
                  for (final e in enfants) DropdownMenuItem(value: e.id, child: Text('Les soignants de ${e.prenom}')),
                ],
                onChanged: (v) => setState(() => _enfant = v),
              ),
            ],
            const SizedBox(height: 16),
            FilledButton(onPressed: _humeur == null || _envoi ? null : _envoyer, child: const Text('Enregistrer')),
            if (_analyse != null) ...[const SizedBox(height: 16), _Analyse(_analyse!)],
            const Titre('Mes derniers jours'),
            AsyncVue<List<Map<String, dynamic>>>(
              historique,
              donnees: (liste) => liste.isEmpty
                  ? const Text('Rien pour le moment.', style: TextStyle(color: C.texteDoux))
                  : Column(children: [
                      for (final h in liste.take(10))
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: Text(_visages[(h['humeur'] as int) - 1].$2, style: const TextStyle(fontSize: 28)),
                          title: Text(h['texte'] ?? _visages[(h['humeur'] as int) - 1].$3, maxLines: 2, overflow: TextOverflow.ellipsis),
                          subtitle: Text(dateCourte(DateTime.tryParse(h['created_at'] ?? '')?.toLocal())),
                        ),
                    ]),
            ),
          ]),
        ),
      ]),
    );
  }
}

class _Analyse extends StatelessWidget {
  const _Analyse(this.a);
  final Map<String, dynamic> a;

  @override
  Widget build(BuildContext context) {
    final niveau = a['niveau'];
    if (niveau == 'SANS_IA') {
      return const Card(child: ListTile(leading: Icon(Icons.check_circle, color: C.vert), title: Text('Merci, c’est enregistré.')));
    }
    if (niveau == 'CRISE' || niveau == 'ELEVE') {
      return CarteUrgence(message: a['message'] ?? '', onAppeler: () => launchUrl(Uri.parse('tel:${AppConfig.samu}')));
    }
    return Card(
      color: niveau == 'MODERE' ? C.orPale : C.vertPale,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(children: [
          Icon(niveau == 'MODERE' ? Icons.self_improvement : Icons.favorite, color: C.vertFonce),
          const SizedBox(width: 10),
          Expanded(child: Text(a['message'] ?? '')),
        ]),
      ),
    );
  }
}
