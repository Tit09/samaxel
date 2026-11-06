import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/donnees.dart';
import '../../core/modeles.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';

/// Choix de la personne (moi, mon enfant, un proche) puis du test.
/// TOUS les tests sont proposés : ceux adaptés à l'âge d'abord, les autres ensuite.
class TestsEcran extends ConsumerStatefulWidget {
  const TestsEcran({super.key, this.enfantId});
  final String? enfantId;
  @override
  ConsumerState<TestsEcran> createState() => _TestsEcranState();
}

class _TestsEcranState extends ConsumerState<TestsEcran> {
  String? _personneId;

  @override
  void initState() {
    super.initState();
    _personneId = widget.enfantId;
  }

  @override
  Widget build(BuildContext context) {
    final personnes = ref.watch(enfantsProvider);
    final p = personnes.value?.where((e) => e.id == _personneId).firstOrNull;
    final qs = ref.watch(questionnairesProvider(p?.ageMois));

    return Scaffold(
      appBar: AppBar(title: const Text('Faire un test'), actions: const [Padding(padding: EdgeInsets.only(right: 12), child: BoutonVoix('choix_test', compact: true))]),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Centre(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: C.infoPale, borderRadius: BorderRadius.circular(14)),
              child: const Row(children: [
                Icon(Icons.info_outline, color: C.info),
                SizedBox(width: 10),
                Expanded(child: Text('Ces tests ne donnent pas de diagnostic. Ils disent s’il faut consulter, et vers quel établissement aller.')),
              ]),
            ),
            const Titre('Pour qui ?'),
            AsyncVue<List<Enfant>>(
              personnes,
              donnees: (liste) => Wrap(spacing: 8, runSpacing: 8, children: [
                for (final e in liste)
                  ChoiceChip(
                    avatar: CircleAvatar(child: Text(e.initiale)),
                    label: Text('${e.libelle}${e.ageLisible != null ? ' (${e.ageLisible})' : ''}'),
                    selected: _personneId == e.id,
                    onSelected: (_) => setState(() => _personneId = e.id),
                  ),
                ActionChip(
                  avatar: const Icon(Icons.add),
                  label: Text(liste.isEmpty ? 'Ajouter : moi, mon enfant ou un proche' : 'Ajouter une personne'),
                  onPressed: () => context.push('/enfant/ajouter'),
                ),
              ]),
            ),
            const Titre('Quel test ?'),
            if (p == null)
              const Padding(
                padding: EdgeInsets.only(bottom: 8),
                child: Text('Sans choisir de personne, tous les tests sont proposés. Choisir la personne permet de mettre en premier ceux adaptés à son âge et de garder le résultat dans son dossier.',
                    style: TextStyle(color: C.texteDoux)),
              ),
            AsyncVue<List<Questionnaire>>(
              qs,
              donnees: (liste) {
                final adaptes = liste.where((q) => q.adapte).toList();
                final autres = liste.where((q) => !q.adapte).toList();
                return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  if (p != null && adaptes.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Text('Conseillés pour ${p.lien == 'SOI' ? 'vous' : p.prenom} (${p.ageLisible ?? ''})', style: const TextStyle(fontWeight: FontWeight.w800, color: C.vert)),
                    ),
                  for (final q in adaptes) _CarteTest(q, _personneId),
                  if (autres.isNotEmpty) ...[
                    const Padding(
                      padding: EdgeInsets.fromLTRB(0, 10, 0, 6),
                      child: Text('Autres tests', style: TextStyle(fontWeight: FontWeight.w800, color: C.texteDoux)),
                    ),
                    for (final q in autres) _CarteTest(q, _personneId),
                  ],
                ]);
              },
            ),
          ]),
        ),
      ]),
    );
  }
}

class _CarteTest extends StatelessWidget {
  const _CarteTest(this.q, this.personneId);
  final Questionnaire q;
  final String? personneId;
  @override
  Widget build(BuildContext context) => Card(
        margin: const EdgeInsets.only(bottom: 10),
        child: ListTile(
          contentPadding: const EdgeInsets.all(14),
          leading: Text(q.icone, style: const TextStyle(fontSize: 34)),
          title: Text(q.titre, style: const TextStyle(fontWeight: FontWeight.w800)),
          subtitle: Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text('${q.description}\n${q.nbQuestions} questions · environ ${(q.nbQuestions / 3).ceil()} min'),
          ),
          isThreeLine: true,
          trailing: const Icon(Icons.play_circle_fill_rounded, color: C.vert, size: 36),
          onTap: () => context.push('/test/${q.code}${personneId != null ? '?enfant=$personneId' : ''}'),
        ),
      );
}
