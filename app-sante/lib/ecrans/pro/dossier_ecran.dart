import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api.dart';
import '../../core/donnees.dart';
import '../../core/modeles.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';
import '../../core/voix.dart';
import '../../widgets/vocal.dart';
import 'consultation_form_ecran.dart';

const niveaux = {'FAIBLE': 'faible', 'MODERE': 'modéré', 'ELEVE': 'élevé'};

/// Dossier d'un patient dans la structure active.
/// - Le médecin / l'admin décide (accepter, refuser, clore), désigne un référent
///   et peut corriger la priorité de l'IA (avec justification, tracée dans l'audit).
/// - Les cliniciens voient les consultations et le journal d'humeur.
/// - La secrétaire voit l'administratif, jamais le contenu médical.
class DossierEcran extends ConsumerWidget {
  const DossierEcran({super.key, required this.id});
  final String id;

  Future<void> _maj(BuildContext context, WidgetRef ref, Map<String, dynamic> corps, String ok) async {
    try {
      await Api.instance.put('/suivis/$id', corps);
      ref.invalidate(suiviDetailProvider(id));
      ref.invalidate(suivisProvider);
      if (context.mounted) toast(context, ok);
    } catch (e) {
      if (context.mounted) toast(context, messageErreur(e), erreur: true);
    }
  }

  Future<void> _changerPriorite(BuildContext context, WidgetRef ref, String actuelle) async {
    String choix = actuelle;
    final just = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('Corriger la priorité'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            RadioGroup<String>(
              groupValue: choix,
              onChanged: (v) => setState(() => choix = v!),
              child: const Column(children: [
                RadioListTile(value: 'URGENT', title: Text('Urgent')),
                RadioListTile(value: 'PRIORITAIRE', title: Text('Prioritaire')),
                RadioListTile(value: 'NORMAL', title: Text('Normal')),
              ]),
            ),
            TextField(controller: just, decoration: const InputDecoration(labelText: 'Justification clinique (obligatoire)'), maxLines: 2),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Annuler')),
            FilledButton(onPressed: () => Navigator.pop(context, just.text.trim().length >= 5), child: const Text('Valider')),
          ],
        ),
      ),
    );
    if (ok == true && context.mounted) {
      await _maj(context, ref, {'priorite': choix, 'justification': just.text.trim()}, 'Priorité mise à jour');
    } else if (ok == false && just.text.isNotEmpty && context.mounted) {
      toast(context, 'Une justification d’au moins 5 caractères est demandée', erreur: true);
    }
  }

  Future<void> _referent(BuildContext context, WidgetRef ref, String structureId) async {
    final pros = await ref.read(professionnelsProvider(structureId).future);
    if (!context.mounted) return;
    final choisi = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (_) => ListView(shrinkWrap: true, children: [
        const Padding(padding: EdgeInsets.fromLTRB(20, 0, 20, 8), child: Text('Choisir le référent', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800))),
        for (final p in pros)
          ListTile(
            leading: const Icon(Icons.person_outline),
            title: Text('${p['prenom']} ${p['nom']}'),
            subtitle: Text('${libellesRoles[p['role']] ?? ''} ${p['specialite'] ?? ''}'),
            onTap: () => Navigator.pop(context, p['id'] as String),
          ),
      ]),
    );
    if (choisi != null && context.mounted) await _maj(context, ref, {'referent_id': choisi}, 'Référent désigné');
  }

  Future<void> _ouvrirConversation(BuildContext context, WidgetRef ref, String parentId, String enfantId) async {
    try {
      final r = await Api.instance.post('/conversations', {'parent_id': parentId, 'enfant_id': enfantId});
      ref.invalidate(conversationsProvider);
      final liste = await ref.read(conversationsProvider.future);
      final c = liste.firstWhere((x) => x.id == r['conversation']['id']);
      if (context.mounted) context.push('/chat/${c.id}', extra: c);
    } catch (e) {
      if (context.mounted) toast(context, messageErreur(e), erreur: true);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final u = ref.watch(utilisateurProvider);
    final d = ref.watch(suiviDetailProvider(id));
    final decideur = u?.role == 'MEDECIN' || u?.role == 'ADMIN_STRUCTURE';
    final clinicien = u?.estClinicien ?? false;

    return Scaffold(
      appBar: AppBar(title: const Text('Dossier patient')),
      body: AsyncVue<Map<String, dynamic>>(
        d,
        reessayer: () => ref.invalidate(suiviDetailProvider(id)),
        donnees: (m) {
          final s = Suivi.fromJson(Map<String, dynamic>.from(m['suivi']));
          final e = Enfant.fromJson(Map<String, dynamic>.from(m['enfant']));
          final motif = m['suivi']['motif'] as String?;
          final deps = ((m['depistages'] as List?) ?? []).map((x) => Depistage.fromJson(Map<String, dynamic>.from(x))).toList();
          final rdvs = (m['rendez_vous'] as List?) ?? [];
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(suiviDetailProvider(id)),
            child: ListView(padding: const EdgeInsets.all(16), children: [
              Centre(
                largeur: 900,
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  // ── Identité
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(children: [
                        CircleAvatar(radius: 28, backgroundColor: C.vertPale, child: Text(e.initiale, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: C.vert))),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text('${e.prenom} ${e.nom}', style: Theme.of(context).textTheme.titleLarge),
                            Text([s.numeroDossier, e.ageLisible, e.sexe == 'F' ? 'Fille' : 'Garçon', e.region].whereType<String>().join(' · '), style: const TextStyle(color: C.texteDoux)),
                            Text('Langue à la maison : ${langueParCode(e.langueMaison).nom} · ${e.scolarise ? 'scolarisé(e)' : 'non scolarisé(e)'}', style: const TextStyle(color: C.texteDoux)),
                          ]),
                        ),
                        BadgeStatut(s.statut),
                      ]),
                    ),
                  ),
                  // ── Triage IA expliqué
                  const Titre('Priorité calculée par l’IA'),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(children: [
                          BadgePriorite(s.priorite, grand: true),
                          const SizedBox(width: 10),
                          Text('Score ${s.score}/100', style: const TextStyle(fontWeight: FontWeight.w800)),
                          const Spacer(),
                          if (decideur) TextButton.icon(onPressed: () => _changerPriorite(context, ref, s.priorite), icon: const Icon(Icons.edit, size: 18), label: const Text('Corriger')),
                        ]),
                        const SizedBox(height: 8),
                        if (s.raisons.isEmpty) const Text('Aucun facteur de risque relevé.', style: TextStyle(color: C.texteDoux)),
                        for (final r in s.raisons)
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 3),
                            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Container(
                                width: 42,
                                padding: const EdgeInsets.symmetric(vertical: 2),
                                alignment: Alignment.center,
                                decoration: BoxDecoration(color: r.manuel ? C.infoPale : C.orPale, borderRadius: BorderRadius.circular(6)),
                                child: Text(r.manuel ? 'Dr' : '+${r.points}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12)),
                              ),
                              const SizedBox(width: 8),
                              Expanded(child: Text(r.texte)),
                            ]),
                          ),
                        const SizedBox(height: 6),
                        const Text('L’IA aide à classer ; la décision reste celle du soignant.', style: TextStyle(fontSize: 12, color: C.texteDoux)),
                      ]),
                    ),
                  ),
                  if (motif != null && motif.isNotEmpty) ...[
                    const Titre('Motif de la demande'),
                    Card(child: Padding(padding: const EdgeInsets.all(16), child: Text(motif))),
                  ],
                  // ── Décisions
                  const SizedBox(height: 12),
                  Wrap(spacing: 8, runSpacing: 8, children: [
                    if (decideur && s.statut == 'DEMANDE') ...[
                      FilledButton.icon(onPressed: () => _maj(context, ref, {'statut': 'ACTIF'}, 'Prise en charge acceptée'), icon: const Icon(Icons.check), label: const Text('Accepter')),
                      OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(foregroundColor: C.urgent),
                        onPressed: () => _maj(context, ref, {'statut': 'REFUSE'}, 'Demande refusée'),
                        icon: const Icon(Icons.close),
                        label: const Text('Refuser'),
                      ),
                    ],
                    if (decideur && s.statut == 'ACTIF') ...[
                      OutlinedButton.icon(onPressed: () => _referent(context, ref, s.structureId), icon: const Icon(Icons.badge_outlined), label: Text(s.referent == null ? 'Désigner un référent' : 'Référent : ${s.referent}')),
                      OutlinedButton.icon(onPressed: () => _maj(context, ref, {'statut': 'CLOS'}, 'Dossier clos'), icon: const Icon(Icons.lock_outline), label: const Text('Clore')),
                    ],
                    if (clinicien && s.parentId != null)
                      OutlinedButton.icon(onPressed: () => _ouvrirConversation(context, ref, s.parentId!, e.id), icon: const Icon(Icons.chat_outlined), label: const Text('Écrire au parent')),
                    if (u?.role == 'MEDECIN' && s.statut == 'ACTIF')
                      OutlinedButton.icon(
                        onPressed: () => showModalBottomSheet(context: context, isScrollControlled: true, showDragHandle: true,
                            builder: (_) => _FormOrdonnance(enfantId: e.id, prenom: e.prenom)),
                        icon: const Icon(Icons.medication_outlined),
                        label: const Text('Ordonnance'),
                      ),
                    if (clinicien && s.statut == 'ACTIF')
                      FilledButton.icon(
                        onPressed: () => context.push('/pro/consultation', extra: ParamsConsultation(enfantId: e.id, prenom: e.prenom)),
                        icon: const Icon(Icons.note_add_outlined),
                        label: const Text('Nouvelle consultation'),
                      ),
                  ]),
                  // ── Tests
                  const Titre('Tests de repérage'),
                  if (deps.isEmpty) const Card(child: ListTile(title: Text('Aucun test réalisé'))),
                  for (final dp in deps)
                    Card(
                      child: ListTile(
                        leading: Icon(dp.alertes.isEmpty ? Icons.assignment_outlined : Icons.warning_amber_rounded, color: dp.alertes.isEmpty ? C.vert : C.urgent),
                        title: Text('${libellesTroubles[dp.code] ?? dp.code} — ${dp.score}/${dp.scoreMax}', style: const TextStyle(fontWeight: FontWeight.w800)),
                        subtitle: Text('Niveau ${niveaux[dp.niveau] ?? dp.niveau} · ${dateCourte(dp.date)}${dp.alertes.isEmpty ? '' : '\n${dp.alertes.join(' · ')}'}'),
                        isThreeLine: dp.alertes.isNotEmpty,
                      ),
                    ),
                  // ── Rendez-vous
                  const Titre('Rendez-vous'),
                  if (rdvs.isEmpty) const Card(child: ListTile(title: Text('Aucun rendez-vous'))),
                  for (final r in rdvs)
                    Card(
                      child: ListTile(
                        leading: Icon(r['type'] == 'TELECONSULTATION' ? Icons.videocam_outlined : Icons.event_outlined),
                        title: Text(dateLongue(DateTime.tryParse('${r['date_confirmee'] ?? r['date_souhaitee']}')?.toLocal())),
                        trailing: BadgeStatut(r['statut']),
                      ),
                    ),
                  if (clinicien) ...[
                    if (s.parentId != null) _Vocaux(parentId: s.parentId!, enfantId: e.id),
                    _Consultations(enfantId: e.id, prenom: e.prenom),
                    _Humeur(enfantId: e.id),
                  ] else
                    const Padding(
                      padding: EdgeInsets.only(top: 16),
                      child: Text('Le contenu médical (consultations, journal) est réservé aux médecins et thérapeutes.', style: TextStyle(color: C.texteDoux)),
                    ),
                  const SizedBox(height: 24),
                ]),
              ),
            ]),
          );
        },
      ),
    );
  }
}

class _Consultations extends ConsumerWidget {
  const _Consultations({required this.enfantId, required this.prenom});
  final String enfantId;
  final String prenom;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = ref.watch(consultationsProvider(enfantId));
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const Titre('Consultations'),
      AsyncVue<List<Consultation>>(
        c,
        donnees: (liste) => liste.isEmpty
            ? const Card(child: ListTile(title: Text('Aucune consultation')))
            : Column(children: [
                for (final x in liste)
                  Card(
                    child: ListTile(
                      leading: Icon(x.type == 'TELECONSULTATION' ? Icons.videocam_outlined : Icons.medical_information_outlined, color: C.vert),
                      title: Text('${dateCourte(x.date)} · ${x.professionnelNom ?? ''}', style: const TextStyle(fontWeight: FontWeight.w800)),
                      subtitle: Text([x.motif, x.diagnosticCode == null ? null : 'CIM-11 ${x.diagnosticCode}'].whereType<String>().join(' · '), maxLines: 2, overflow: TextOverflow.ellipsis),
                      trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                        if (x.type == 'TELECONSULTATION' && x.statut == 'PLANIFIEE')
                          IconButton(tooltip: 'Rejoindre la vidéo', onPressed: () => context.push('/visio/${x.id}'), icon: const Icon(Icons.videocam, color: C.info)),
                        BadgeStatut(x.statut),
                      ]),
                      onTap: () => context.push('/pro/consultation', extra: ParamsConsultation(enfantId: enfantId, consultation: x, prenom: prenom)),
                    ),
                  ),
              ]),
      ),
    ]);
  }
}

class _Humeur extends ConsumerWidget {
  const _Humeur({required this.enfantId});
  final String enfantId;
  static const _emojis = ['', '😢', '🙁', '😐', '🙂', '😄'];
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final h = ref.watch(humeurProvider(enfantId));
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const Titre('Journal d’humeur du parent'),
      AsyncVue<List<Map<String, dynamic>>>(
        h,
        donnees: (liste) => liste.isEmpty
            ? const Card(child: ListTile(title: Text('Aucune entrée')))
            : Column(children: [
                for (final x in liste.take(10))
                  Card(
                    color: switch ((x['analyse_ia'] as Map?)?['niveau']) { 'CRISE' => C.urgentPale, 'ELEVE' => C.prioritairePale, _ => Colors.white },
                    child: ListTile(
                      leading: Text(_emojis[((x['humeur'] as int?) ?? 3).clamp(1, 5)], style: const TextStyle(fontSize: 28)),
                      title: Text(x['texte'] ?? '—'),
                      subtitle: Text('${dateCourte(DateTime.tryParse('${x['created_at']}')?.toLocal())}'
                          '${(x['analyse_ia'] as Map?) == null ? '' : ' · IA : ${(x['analyse_ia'] as Map)['niveau']} (${(x['analyse_ia'] as Map)['emotion_dominante'] ?? ''})'}'),
                    ),
                  ),
              ]),
      ),
    ]);
  }
}

/// Messages vocaux du parent (souvent un parent qui ne lit pas) : écouter, voir ce que l'IA a compris, répondre par la voix.
class _Vocaux extends ConsumerWidget {
  const _Vocaux({required this.parentId, required this.enfantId});
  final String parentId;
  final String enfantId;

  static const _intentions = {
    'URGENCE': 'Urgence signalée', 'CRISE': 'Détresse grave', 'TROUVER_STRUCTURE': 'Cherche une structure',
    'RENDEZ_VOUS': 'Rendez-vous', 'TEST_ENFANT': 'Inquiétude sur le développement', 'QUESTION_SOIGNANT': 'Question pour l’équipe',
    'SANS_IA': 'Non analysé (pas de consentement IA)', 'NON_TRANSCRIT': 'Non transcrit', 'AIDE_APPLI': 'Aide pour l’application',
  };

  Future<void> _repondre(BuildContext context, WidgetRef ref, String vocalId) async {
    await showModalBottomSheet(
      context: context,
      showDragHandle: true,
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 28),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Text('Répondre par un message vocal', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          const Text('Parlez dans la langue du parent. Il recevra une notification.', style: TextStyle(color: C.texteDoux)),
          const SizedBox(height: 16),
          EnregistreurVocal(
            libelle: 'Appuyez pour enregistrer votre réponse',
            onVocal: (v) async {
              try {
                await Api.instance.envoyerAudio('/vocaux/$vocalId/repondre', v.octets, 'audio/wav', query: {'duree_s': v.duree.inMilliseconds / 1000});
                ref.invalidate(vocauxProvider((enfantId: null, parentId: parentId)));
                if (ctx.mounted) Navigator.pop(ctx);
                if (context.mounted) toast(context, 'Réponse vocale envoyée');
              } catch (e) {
                if (context.mounted) toast(context, messageErreur(e), erreur: true);
              }
            },
          ),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final v = ref.watch(vocauxProvider((enfantId: null, parentId: parentId)));
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const Titre('Messages vocaux du parent'),
      AsyncVue<List<Map<String, dynamic>>>(
        v,
        donnees: (liste) {
          final recus = liste.where((x) => x['sens'] == 'PARENT').toList().reversed.toList();
          if (recus.isEmpty) return const Card(child: ListTile(title: Text('Aucun message vocal')));
          return Column(children: [
            for (final x in recus.take(8))
              Card(
                color: ['URGENCE', 'CRISE'].contains(x['intention']) ? C.urgentPale : (x['lu'] == true ? Colors.white : C.vertPale),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(4, 4, 12, 10),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      LecteurVocal(vocalId: x['id'], duree: (x['duree_s'] as num?)?.toDouble()),
                      const Spacer(),
                      Text(dateCourte(DateTime.tryParse('${x['created_at']}')?.toLocal()), style: const TextStyle(color: C.texteDoux, fontSize: 12)),
                    ]),
                    Padding(
                      padding: const EdgeInsets.only(left: 12),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('${_intentions[x['intention']] ?? x['intention'] ?? ''} · langue : ${langueParCode(x['langue'] ?? 'fr').nom}',
                            style: const TextStyle(fontWeight: FontWeight.w800)),
                        if (x['transcription'] != null)
                          Text('Transcription IA (à vérifier en écoutant) : « ${x['transcription']} »',
                              style: const TextStyle(color: C.texteDoux, fontSize: 13, fontStyle: FontStyle.italic)),
                        const SizedBox(height: 6),
                        OutlinedButton.icon(
                          onPressed: () => _repondre(context, ref, x['id']),
                          icon: const Icon(Icons.mic_rounded),
                          label: const Text('Répondre par la voix'),
                        ),
                      ]),
                    ),
                  ]),
                ),
              ),
          ]);
        },
      ),
    ]);
  }
}

/// Ordonnance (médecin) : le parent la reçoit avec les pharmacies proches qui ont déclaré le médicament.
class _FormOrdonnance extends StatefulWidget {
  const _FormOrdonnance({required this.enfantId, required this.prenom});
  final String enfantId;
  final String prenom;
  @override
  State<_FormOrdonnance> createState() => _FormOrdonnanceState();
}

class _FormOrdonnanceState extends State<_FormOrdonnance> {
  final _lignes = [_Ligne()];
  bool _envoi = false;

  Future<void> _envoyer() async {
    final lignes = _lignes.where((l) => l.dci.text.trim().length > 1 && l.posologie.text.trim().length > 1).map((l) => {
          'dci': l.dci.text.trim(),
          if (l.forme.text.trim().isNotEmpty) 'forme': l.forme.text.trim(),
          'posologie': l.posologie.text.trim(),
          if (l.duree.text.trim().isNotEmpty) 'duree': l.duree.text.trim(),
        }).toList();
    if (lignes.isEmpty) {
      toast(context, 'Indiquez au moins un médicament (DCI) et sa posologie', erreur: true);
      return;
    }
    setState(() => _envoi = true);
    try {
      await Api.instance.post('/ordonnances', {'enfant_id': widget.enfantId, 'lignes': lignes});
      if (mounted) {
        Navigator.pop(context);
        toast(context, 'Ordonnance envoyée au parent');
      }
    } catch (e) {
      if (mounted) toast(context, messageErreur(e), erreur: true);
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Ordonnance — ${widget.prenom}', style: Theme.of(context).textTheme.titleLarge),
          const Text('Écrivez la DCI (ex. rispéridone). Méthadone et buprénorphine restent délivrées par le centre.',
              style: TextStyle(color: C.texteDoux, fontSize: 13)),
          for (final l in _lignes)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(10),
                child: Column(children: [
                  TextField(controller: l.dci, decoration: const InputDecoration(labelText: 'Médicament (DCI)')),
                  const SizedBox(height: 8),
                  TextField(controller: l.forme, decoration: const InputDecoration(labelText: 'Forme (facultatif)')),
                  const SizedBox(height: 8),
                  TextField(controller: l.posologie, decoration: const InputDecoration(labelText: 'Posologie')),
                  const SizedBox(height: 8),
                  TextField(controller: l.duree, decoration: const InputDecoration(labelText: 'Durée (facultatif)')),
                ]),
              ),
            ),
          TextButton.icon(onPressed: () => setState(() => _lignes.add(_Ligne())), icon: const Icon(Icons.add), label: const Text('Ajouter un médicament')),
          FilledButton(onPressed: _envoi ? null : _envoyer, child: const Text('Envoyer l’ordonnance')),
        ]),
      ),
    );
  }
}

class _Ligne {
  final dci = TextEditingController();
  final forme = TextEditingController();
  final posologie = TextEditingController();
  final duree = TextEditingController();
}
