import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api.dart';
import '../../core/donnees.dart';
import '../../core/modeles.dart';
import '../../core/phrases.dart';
import '../../core/theme.dart';
import '../../core/voix.dart';
import '../../widgets/communs.dart';
import '../../widgets/vocal.dart';

/// « Parler à SAMA XHEL » — pour les parents qui ne lisent pas.
/// Le parent parle dans sa langue ; l'assistant lui répond À VOIX HAUTE dans cette langue,
/// ouvre le bon écran, et transmet le message à l'équipe qui suit l'enfant.
class AssistantEcran extends ConsumerStatefulWidget {
  const AssistantEcran({super.key});
  @override
  ConsumerState<AssistantEcran> createState() => _AssistantEcranState();
}

class _AssistantEcranState extends ConsumerState<AssistantEcran> {
  final _defil = ScrollController();
  String? _enfantId;

  ({String? enfantId, String? parentId}) get _filtre => (enfantId: null, parentId: null);

  Future<void> _envoyer(Vocal v) async {
    final langue = ref.read(langueProvider);
    try {
      final r = await Api.instance.envoyerAudio('/vocaux', v.octets, 'audio/wav',
          query: {'langue': langue, 'enfant_id': _enfantId, 'duree_s': v.duree.inMilliseconds / 1000});
      ref.invalidate(vocauxProvider(_filtre));
      final rep = Map<String, dynamic>.from(r['reponse']['reponse'] as Map);
      await _lireReponse(rep['cle'] as String, rep['texte'] as String);
      _enBas();
    } catch (e) {
      if (mounted) toast(context, messageErreur(e), erreur: true);
    }
  }

  Future<void> _lireReponse(String cle, String texte) =>
      GuideVocal.instance.lire(cle: cle, texteFr: texte, texteEn: phrases[cle]?.en, langue: ref.read(langueProvider));

  void _enBas() => WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_defil.hasClients) _defil.animateTo(_defil.position.maxScrollExtent, duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
      });

  @override
  Widget build(BuildContext context) {
    final fil = ref.watch(vocauxProvider(_filtre));
    final enfants = ref.watch(enfantsProvider).value ?? const <Enfant>[];
    return Scaffold(
      appBar: AppBar(
        title: const Text('Parler à SAMA XHEL'),
        actions: const [Padding(padding: EdgeInsets.only(right: 12), child: BoutonVoix('assistant', compact: true))],
      ),
      body: Column(children: [
        if (enfants.length > 1)
          SizedBox(
            height: 56,
            child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8), children: [
              for (final e in enfants)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    avatar: CircleAvatar(child: Text(e.initiale)),
                    label: Text(e.prenom),
                    selected: _enfantId == e.id,
                    onSelected: (v) => setState(() => _enfantId = v ? e.id : null),
                  ),
                ),
            ]),
          ),
        Expanded(
          child: AsyncVue<List<Map<String, dynamic>>>(
            fil,
            reessayer: () => ref.invalidate(vocauxProvider(_filtre)),
            donnees: (liste) {
              if (liste.isEmpty) {
                return const Vide(
                  icone: Icons.record_voice_over_rounded,
                  titre: 'Parlez, je vous écoute',
                  texte: 'Wolof, pulaar, sérère, diola, mandinka, bambara, français ou anglais. '
                      'Je vous réponds à voix haute et je préviens l’équipe qui vous suit.',
                );
              }
              _enBas();
              return ListView.builder(
                controller: _defil,
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
                itemCount: liste.length,
                itemBuilder: (_, i) => Centre(child: _Bulle(v: liste[i], rejouer: _lireReponse)),
              );
            },
          ),
        ),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 18),
          decoration: const BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: C.bordure))),
          child: SafeArea(top: false, child: EnregistreurVocal(onVocal: _envoyer)),
        ),
      ]),
    );
  }
}

class _Bulle extends StatelessWidget {
  const _Bulle({required this.v, required this.rejouer});
  final Map<String, dynamic> v;
  final Future<void> Function(String cle, String texte) rejouer;

  @override
  Widget build(BuildContext context) {
    final sens = v['sens'];
    final date = DateTime.tryParse('${v['created_at']}')?.toLocal();
    if (sens == 'PARENT') {
      final transcription = v['transcription'] as String?;
      return Align(
        alignment: Alignment.centerRight,
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 4),
          padding: const EdgeInsets.fromLTRB(4, 4, 12, 8),
          constraints: const BoxConstraints(maxWidth: 340),
          decoration: const BoxDecoration(
            color: C.vert,
            borderRadius: BorderRadius.only(topLeft: Radius.circular(18), topRight: Radius.circular(18), bottomLeft: Radius.circular(18), bottomRight: Radius.circular(4)),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            LecteurVocal(vocalId: v['id'], duree: (v['duree_s'] as num?)?.toDouble(), clair: true),
            if (transcription != null && transcription.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(left: 12),
                child: Text('« $transcription »', style: const TextStyle(color: Colors.white70, fontSize: 13, fontStyle: FontStyle.italic)),
              ),
            Text(heure(date), style: const TextStyle(color: Colors.white70, fontSize: 11)),
          ]),
        ),
      );
    }
    if (sens == 'SOIGNANT') {
      return Align(
        alignment: Alignment.centerLeft,
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 4),
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
          constraints: const BoxConstraints(maxWidth: 340),
          decoration: BoxDecoration(color: C.infoPale, borderRadius: BorderRadius.circular(18), border: Border.all(color: C.info.withValues(alpha: .3))),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.medical_services_rounded, size: 18, color: C.info),
              const SizedBox(width: 6),
              Text(v['auteur'] ?? 'Votre soignant', style: const TextStyle(fontWeight: FontWeight.w800, color: C.info)),
            ]),
            LecteurVocal(vocalId: v['id'], duree: (v['duree_s'] as num?)?.toDouble()),
            Text(heure(date), style: const TextStyle(color: C.texteDoux, fontSize: 11)),
          ]),
        ),
      );
    }
    // Réponse de l'assistant : phrase validée lue dans la langue du parent + action
    final rep = v['reponse'] == null ? null : Map<String, dynamic>.from(v['reponse'] as Map);
    if (rep == null) return const SizedBox.shrink();
    final action = rep['action'] == null ? null : Map<String, dynamic>.from(rep['action'] as Map);
    final urgence = action?['type'] == 'APPELER';
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.all(12),
        constraints: const BoxConstraints(maxWidth: 360),
        decoration: BoxDecoration(
          color: urgence ? C.urgentPale : Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: urgence ? C.urgent.withValues(alpha: .4) : C.bordure),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Image.asset('assets/images/embleme.png', width: 28),
            const SizedBox(width: 8),
            const Text('SAMA XHEL', style: TextStyle(fontWeight: FontWeight.w900, color: C.vertFonce)),
            const Spacer(),
            IconButton.filledTonal(
              tooltip: 'Réécouter',
              onPressed: () => rejouer(rep['cle'], rep['texte']),
              icon: const Icon(Icons.volume_up_rounded),
            ),
          ]),
          Text(rep['texte'] ?? '', style: const TextStyle(fontSize: 15)),
          if (action != null) ...[
            const SizedBox(height: 10),
            if (urgence)
              FilledButton.icon(
                style: FilledButton.styleFrom(backgroundColor: C.urgent),
                onPressed: () => launchUrl(Uri.parse('tel:${action['numero']}')),
                icon: const Icon(Icons.call),
                label: Text('Appeler le SAMU — ${action['numero']}'),
              )
            else
              FilledButton.icon(
                onPressed: () => context.push(action['route']),
                icon: Icon(switch (action['route']) {
                  '/trouver' => Icons.travel_explore,
                  '/rendez-vous' => Icons.event_available,
                  '/tests' => Icons.fact_check_outlined,
                  _ => Icons.groups_rounded,
                }),
                label: Text(switch (action['route']) {
                  '/trouver' => 'Voir les centres',
                  '/rendez-vous' => 'Mes rendez-vous',
                  '/tests' => 'Faire le test',
                  _ => 'Ouvrir',
                }),
              ),
          ],
        ]),
      ),
    );
  }
}
