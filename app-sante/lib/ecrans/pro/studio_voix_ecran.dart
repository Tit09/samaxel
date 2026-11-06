import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api.dart';
import '../../core/donnees.dart';
import '../../core/phrases.dart';
import '../../core/theme.dart';
import '../../core/voix.dart';
import '../../widgets/communs.dart';
import '../../widgets/vocal.dart';

/// Une phrase à enregistrer : sa clé, le texte français à traduire oralement
class _Phrase {
  const _Phrase(this.cle, this.fr, this.groupe);
  final String cle;
  final String fr;
  final String groupe;
}

const _reponses = {
  'rep_freq_0': 'Jamais', 'rep_freq_1': 'Parfois', 'rep_freq_2': 'Souvent', 'rep_freq_3': 'Très souvent',
  'rep_acquis_0': 'Oui, souvent', 'rep_acquis_1': 'Parfois', 'rep_acquis_2': 'Rarement', 'rep_acquis_3': 'Jamais',
  'rep_age_0': 'Comme les enfants de son âge', 'rep_age_1': 'Un peu en retard', 'rep_age_2': 'Nettement en retard', 'rep_age_3': 'Pas encore du tout',
  'rep_phq_0': 'Jamais', 'rep_phq_1': 'Plusieurs jours', 'rep_phq_2': 'Plus de la moitié des jours', 'rep_phq_3': 'Presque tous les jours',
  'rep_ouinon_0': 'Non', 'rep_ouinon_1': 'Oui', 'rep_changement_0': 'Non, pas de changement', 'rep_changement_1': 'Oui, ça a changé',
};

final _catalogueVoixProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) => Api.instance.get('/voix/catalogue', public: true));

/// STUDIO DES VOIX (super-administrateur) : un locuteur natif écoute la phrase en français,
/// la dit dans sa langue, et sa voix remplace la voix de synthèse pour tous les utilisateurs.
/// Indispensable pour le sérère (aucun modèle de synthèse) et pour valider les autres langues.
class StudioVoixEcran extends ConsumerStatefulWidget {
  const StudioVoixEcran({super.key});
  @override
  ConsumerState<StudioVoixEcran> createState() => _StudioVoixEcranState();
}

class _StudioVoixEcranState extends ConsumerState<StudioVoixEcran> {
  String _langue = 'srr';
  String _groupe = 'Écrans';

  List<_Phrase> _phrases(List questionnaires) => [
        for (final e in phrases.entries) _Phrase(e.key, e.value.fr, 'Écrans'),
        for (final e in _reponses.entries) _Phrase(e.key, e.value, 'Réponses'),
        for (final q in questionnaires) ...[
          if (q.consigne != null) _Phrase('${q.code.toLowerCase()}_consigne', q.consigne!, 'Tests'),
          for (final x in q.questions) _Phrase(x.audioKey, x.texte, 'Tests'),
        ],
      ];

  Future<void> _enregistrer(_Phrase p) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 28),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Dites cette phrase en ${langueParCode(_langue).nom}', style: Theme.of(ctx).textTheme.titleLarge),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: C.orPale, borderRadius: BorderRadius.circular(14)),
            child: Text(p.fr, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
          ),
          const SizedBox(height: 6),
          const Text('Parlez lentement et clairement, comme à un parent qui découvre l’application.', style: TextStyle(color: C.texteDoux)),
          const SizedBox(height: 18),
          EnregistreurVocal(
            dureeMax: const Duration(seconds: 40),
            libelle: 'Appuyez, dites la phrase, appuyez de nouveau',
            onVocal: (v) async {
              try {
                await Api.instance.envoyerAudio('/admin/voix/$_langue/${p.cle}', v.octets, 'audio/wav');
                GuideVocal.instance.rafraichirVoix();
                ref.invalidate(_catalogueVoixProvider);
                if (ctx.mounted) {
                  Navigator.pop(ctx);
                  toast(context, 'Voix enregistrée : elle est jouée à tous les utilisateurs.');
                }
              } catch (e) {
                if (ctx.mounted) toast(ctx, messageErreur(e), erreur: true);
              }
            },
          ),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final qs = ref.watch(questionnairesProvider(null)).value ?? const [];
    final details = qs.map((q) => ref.watch(questionnaireProvider(q.code)).value).whereType<dynamic>().toList();
    final cat = ref.watch(_catalogueVoixProvider).value;
    final enregistrees = Map<String, dynamic>.from(((cat?['fichiers'] as Map?) ?? {})[_langue] ?? {});
    final toutes = _phrases(details).where((p) => p.groupe == _groupe).toList();
    final faites = toutes.where((p) => enregistrees.containsKey(p.cle)).length;
    return Scaffold(
      appBar: AppBar(title: const Text('Studio des voix')),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: Centre(
            largeur: 900,
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              const Text('Un locuteur natif enregistre chaque phrase dans sa langue. Sa voix remplace la voix de synthèse pour tous les utilisateurs.',
                  style: TextStyle(color: C.texteDoux)),
              const SizedBox(height: 10),
              Wrap(spacing: 8, runSpacing: 8, children: [
                for (final l in langues.where((l) => !['fr', 'en'].contains(l.code)))
                  ChoiceChip(label: Text(l.nomLocal), selected: _langue == l.code, onSelected: (_) => setState(() => _langue = l.code)),
              ]),
              const SizedBox(height: 8),
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: 'Écrans', label: Text('Écrans')),
                  ButtonSegment(value: 'Réponses', label: Text('Réponses')),
                  ButtonSegment(value: 'Tests', label: Text('Questions des tests')),
                ],
                selected: {_groupe},
                onSelectionChanged: (v) => setState(() => _groupe = v.first),
              ),
              const SizedBox(height: 8),
              LinearProgressIndicator(value: toutes.isEmpty ? 0 : faites / toutes.length, minHeight: 8, color: C.vert, backgroundColor: C.vertPale),
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Text('$faites / ${toutes.length} phrases enregistrées en ${langueParCode(_langue).nom}', style: const TextStyle(fontWeight: FontWeight.w700)),
              ),
            ]),
          ),
        ),
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
            itemCount: toutes.length,
            itemBuilder: (_, i) {
              final p = toutes[i];
              final ok = enregistrees.containsKey(p.cle);
              return Centre(
                largeur: 900,
                child: Card(
                  child: ListTile(
                    leading: Icon(ok ? Icons.check_circle_rounded : Icons.mic_none_rounded, color: ok ? C.normal : C.texteDoux),
                    title: Text(p.fr, maxLines: 2, overflow: TextOverflow.ellipsis),
                    subtitle: Text(p.cle, style: const TextStyle(fontSize: 12, color: C.texteDoux)),
                    trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                      IconButton(
                        tooltip: 'Écouter la voix actuelle',
                        onPressed: () => GuideVocal.instance.lire(cle: p.cle, texteFr: p.fr, langue: _langue),
                        icon: const Icon(Icons.play_circle_outline_rounded),
                      ),
                      FilledButton.tonalIcon(
                        style: FilledButton.styleFrom(minimumSize: const Size(0, 42)),
                        onPressed: () => _enregistrer(p),
                        icon: const Icon(Icons.mic_rounded),
                        label: Text(ok ? 'Refaire' : 'Enregistrer'),
                      ),
                    ]),
                  ),
                ),
              );
            },
          ),
        ),
      ]),
    );
  }
}
