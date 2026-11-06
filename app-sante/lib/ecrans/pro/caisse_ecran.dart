import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/api.dart';
import '../../core/maison.dart';
import '../../core/session.dart';
import '../../core/temps_reel.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';

/// Journal de caisse du jour (ce que la caisse de l'entrée a encaissé)
final journalCaisseProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) => Api.instance.get('/caisse/tickets'));
final tarifsEtabProvider = FutureProvider.autoDispose<List<Tarif>>((ref) async {
  final r = await Api.instance.get('/etablissement/tarifs');
  return ((r['tarifs'] as List?) ?? []).where((t) => t['actif'] != false).map((t) => Tarif.fromJson(t)).toList();
});

/// CAISSE DE L'ENTRÉE (accueil / secrétariat) :
///   encaisser un ticket (espèces, Wave, Orange Money) → numéro + bureau où aller ;
///   confirmer les tickets payés d'avance dans l'application ;
///   registre des patients (import du fichier Excel existant) ; journal du jour en Excel.
class CaisseEcran extends ConsumerStatefulWidget {
  const CaisseEcran({super.key});
  @override
  ConsumerState<CaisseEcran> createState() => _CaisseEcranState();
}

class _CaisseEcranState extends ConsumerState<CaisseEcran> {
  StreamSubscription? _sub;

  @override
  void initState() {
    super.initState();
    // Un ticket payé d'avance arrive : la liste se met à jour toute seule
    _sub = TempsReel.instance.filtre('caisse:maj').listen((_) => ref.invalidate(journalCaisseProvider));
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  Future<void> _action(Ticket t, String action) async {
    try {
      await Api.instance.put('/caisse/tickets/${t.id}', {'action': action});
      ref.invalidate(journalCaisseProvider);
      if (mounted) toast(context, action == 'CONFIRMER' ? 'Paiement confirmé : ticket ${t.numero} dans la file.' : 'Ticket ${t.numero} mis à jour.');
    } catch (e) {
      if (mounted) toast(context, messageErreur(e), erreur: true);
    }
  }

  Future<void> _exporter() async {
    try {
      final f = await Api.instance.telecharger('/caisse/export');
      final jour = DateTime.now().toIso8601String().substring(0, 10);
      await FilePicker.saveFile(dialogTitle: 'Enregistrer le journal de caisse', fileName: 'caisse-$jour.xlsx', bytes: f.octets,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      if (mounted) toast(context, 'Journal de caisse enregistré (Excel).');
    } catch (e) {
      if (mounted) toast(context, messageErreur(e), erreur: true);
    }
  }

  Future<void> _importer() async {
    final r = await FilePicker.pickFiles(type: FileType.custom, allowedExtensions: ['xlsx', 'csv'], dialogTitle: 'Fichier Excel des patients');
    if (r.isEmpty) return;
    final f = r.first;
    try {
      final octets = await f.readAsBytes();
      final res = await Api.instance.envoyerAudio('/caisse/registre/import', octets,
          f.name.toLowerCase().endsWith('.csv') ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      if (mounted) toast(context, res['message'] ?? 'Import terminé.');
    } catch (e) {
      if (mounted) toast(context, messageErreur(e), erreur: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final u = ref.watch(utilisateurProvider);
    final teinte = couleurDe(u?.structureCouleur) ?? C.vert;
    final j = ref.watch(journalCaisseProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Caisse et tickets'),
        actions: [
          IconButton(tooltip: 'Importer le fichier Excel des patients', onPressed: _importer, icon: const Icon(Icons.upload_file_rounded)),
          IconButton(tooltip: 'Journal du jour en Excel', onPressed: _exporter, icon: const Icon(Icons.download_rounded)),
          IconButton(tooltip: 'Actualiser', onPressed: () => ref.invalidate(journalCaisseProvider), icon: const Icon(Icons.refresh)),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: teinte,
        foregroundColor: Colors.white,
        onPressed: () => _nouveauTicket(context),
        icon: const Icon(Icons.add_card_rounded),
        label: const Text('Encaisser un ticket'),
      ),
      body: AsyncVue<Map<String, dynamic>>(
        j,
        reessayer: () => ref.invalidate(journalCaisseProvider),
        donnees: (d) {
          final tickets = ((d['tickets'] as List?) ?? []).map((t) => Ticket.fromJson(t)).toList();
          final aConfirmer = tickets.where((t) => t.statut == 'A_CONFIRMER').toList();
          final autres = tickets.where((t) => t.statut != 'A_CONFIRMER').toList();
          final totaux = Map<String, dynamic>.from(d['totaux'] ?? {});
          return ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 96), children: [
            Centre(
              largeur: 900,
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Card(
                  color: teinte,
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('Encaissé aujourd’hui', style: TextStyle(color: Colors.white.withValues(alpha: .85))),
                      Text(fcfa((d['total'] as num?)?.toInt() ?? 0), style: const TextStyle(color: Colors.white, fontSize: 34, fontWeight: FontWeight.w900)),
                      const SizedBox(height: 6),
                      Wrap(spacing: 14, runSpacing: 4, children: [
                        for (final e in {'ESPECES': 'Espèces', 'WAVE': 'Wave', 'ORANGE_MONEY': 'Orange Money'}.entries)
                          Text('${e.value} : ${fcfa((totaux[e.key] as num?)?.toInt() ?? 0)}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
                      ]),
                      const SizedBox(height: 4),
                      Text('${d['en_attente'] ?? 0} personne(s) dans la salle d’attente', style: const TextStyle(color: Colors.white70)),
                    ]),
                  ),
                ),
                if (aConfirmer.isNotEmpty) ...[
                  const Titre('Payés dans l’application : à vérifier'),
                  for (final t in aConfirmer)
                    Card(
                      color: C.prioritairePale,
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Row(children: [
                          Text(t.numero, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900)),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text('${t.patient ?? ''} · ${t.tarif}\n${fcfa(t.montant)} · ${t.modeLisible} · réf. ${t.reference ?? '—'}'),
                          ),
                          IconButton.filledTonal(tooltip: 'Paiement non trouvé', onPressed: () => _action(t, 'REFUSER'), icon: const Icon(Icons.close)),
                          const SizedBox(width: 6),
                          FilledButton(style: FilledButton.styleFrom(minimumSize: const Size(0, 44)), onPressed: () => _action(t, 'CONFIRMER'), child: const Text('Confirmer')),
                        ]),
                      ),
                    ),
                ],
                const Titre('Tickets du jour'),
                if (autres.isEmpty) const Vide(icone: Icons.confirmation_number_outlined, titre: 'Aucun ticket encaissé aujourd’hui'),
                for (final t in autres)
                  Card(
                    child: ListTile(
                      leading: CircleAvatar(backgroundColor: t.couleur.withValues(alpha: .14), child: Text(t.numero.split('-').first, style: TextStyle(color: t.couleur, fontWeight: FontWeight.w900))),
                      title: Text('${t.numero} · ${t.patient ?? ''}', style: const TextStyle(fontWeight: FontWeight.w800)),
                      subtitle: Text('${t.tarif} · ${fcfa(t.montant)} · ${t.modeLisible}\n${t.statutLisible}${t.bureau != null ? ' · ${t.bureau}' : ''}'),
                      isThreeLine: true,
                      trailing: t.statut == 'PAYE'
                          ? IconButton(tooltip: 'Annuler', onPressed: () => _action(t, 'ANNULER'), icon: const Icon(Icons.block))
                          : null,
                    ),
                  ),
              ]),
            ),
          ]);
        },
      ),
    );
  }

  Future<void> _nouveauTicket(BuildContext context) async {
    final t = await showModalBottomSheet<Ticket>(context: context, isScrollControlled: true, showDragHandle: true, builder: (_) => const _NouveauTicket());
    if (t == null || !context.mounted) return;
    ref.invalidate(journalCaisseProvider);
    await showDialog<void>(context: context, builder: (_) => _Recu(t));
  }
}

class _NouveauTicket extends ConsumerStatefulWidget {
  const _NouveauTicket();
  @override
  ConsumerState<_NouveauTicket> createState() => _NouveauTicketState();
}

class _NouveauTicketState extends ConsumerState<_NouveauTicket> {
  Tarif? _tarif;
  String _mode = 'ESPECES';
  final _prenom = TextEditingController();
  final _nom = TextEditingController();
  final _tel = TextEditingController();
  final _recherche = TextEditingController();
  final _ref = TextEditingController();
  Map<String, dynamic>? _registre; // patient déjà venu (registre)
  List<Map<String, dynamic>> _trouves = [];
  bool _envoi = false;

  Future<void> _chercher() async {
    final q = _recherche.text.trim();
    if (q.length < 2) return;
    try {
      final r = await Api.instance.get('/caisse/registre', query: {'q': q});
      setState(() => _trouves = ((r['patients'] as List?) ?? []).map((p) => Map<String, dynamic>.from(p)).toList());
    } catch (e) {
      if (mounted) toast(context, messageErreur(e), erreur: true);
    }
  }

  Future<void> _encaisser() async {
    if (_tarif == null) return;
    if (_registre == null && (_prenom.text.trim().isEmpty || _nom.text.trim().isEmpty)) {
      toast(context, 'Écrivez le prénom et le nom, ou retrouvez le patient dans le registre.', erreur: true);
      return;
    }
    setState(() => _envoi = true);
    try {
      final r = await Api.instance.post('/caisse/tickets', {
        'tarif_id': _tarif!.id,
        'mode_paiement': _mode,
        if (_ref.text.trim().isNotEmpty) 'reference': _ref.text.trim(),
        if (_registre != null) 'registre_id': _registre!['id']
        else 'patient': {
          'prenom': _prenom.text.trim(), 'nom': _nom.text.trim(),
          if (_tel.text.trim().isNotEmpty) 'telephone': _tel.text.trim(),
        },
      });
      if (mounted) Navigator.pop(context, Ticket.fromJson(r['ticket']));
    } catch (e) {
      if (mounted) toast(context, messageErreur(e), erreur: true);
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final tarifs = ref.watch(tarifsEtabProvider).value ?? [];
    _tarif ??= tarifs.isNotEmpty ? tarifs.first : null;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.viewInsetsOf(context).bottom + 20),
      child: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Encaisser un ticket', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 10),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final t in tarifs)
              ChoiceChip(label: Text('${t.libelle} · ${fcfa(t.montant)}'), selected: _tarif?.id == t.id, onSelected: (_) => setState(() => _tarif = t)),
          ]),
          const SizedBox(height: 12),
          const Text('Patient', style: TextStyle(fontWeight: FontWeight.w800)),
          if (_registre != null)
            Card(
              color: C.vertPale,
              child: ListTile(
                leading: const Icon(Icons.badge_rounded),
                title: Text('${_registre!['prenom']} ${_registre!['nom']}'),
                subtitle: Text('Registre ${_registre!['numero']}'),
                trailing: IconButton(onPressed: () => setState(() => _registre = null), icon: const Icon(Icons.close)),
              ),
            )
          else ...[
            TextField(
              controller: _recherche,
              onSubmitted: (_) => _chercher(),
              decoration: InputDecoration(
                labelText: 'Déjà venu ? Téléphone, nom ou n° de registre',
                suffixIcon: IconButton(onPressed: _chercher, icon: const Icon(Icons.search)),
              ),
            ),
            for (final p in _trouves.take(4))
              ListTile(
                dense: true,
                leading: const Icon(Icons.person_outline),
                title: Text('${p['prenom']} ${p['nom']}'),
                subtitle: Text('${p['numero']}${p['telephone'] != null ? ' · ${p['telephone']}' : ''}'),
                onTap: () => setState(() { _registre = p; _trouves = []; }),
              ),
            const SizedBox(height: 6),
            const Text('Nouveau patient :', style: TextStyle(color: C.texteDoux)),
            Row(children: [
              Expanded(child: TextField(controller: _prenom, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Prénom'))),
              const SizedBox(width: 8),
              Expanded(child: TextField(controller: _nom, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Nom'))),
            ]),
            const SizedBox(height: 8),
            TextField(controller: _tel, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Téléphone (facultatif : pour le prévenir)')),
          ],
          const SizedBox(height: 12),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'ESPECES', label: Text('Espèces')),
              ButtonSegment(value: 'WAVE', label: Text('Wave')),
              ButtonSegment(value: 'ORANGE_MONEY', label: Text('OM')),
            ],
            selected: {_mode},
            onSelectionChanged: (v) => setState(() => _mode = v.first),
          ),
          if (_mode != 'ESPECES') ...[
            const SizedBox(height: 8),
            TextField(controller: _ref, decoration: const InputDecoration(labelText: 'Référence de la transaction')),
          ],
          const SizedBox(height: 14),
          FilledButton.icon(
            onPressed: _envoi || _tarif == null ? null : _encaisser,
            icon: const Icon(Icons.print_rounded),
            label: Text(_tarif == null ? 'Aucun tarif' : 'Encaisser ${fcfa(_tarif!.montant)} et imprimer'),
          ),
        ]),
      ),
    );
  }
}

/// Reçu remis au patient (à imprimer ou à montrer) : numéro, bureau, QR vérifiable
class _Recu extends ConsumerWidget {
  const _Recu(this.t);
  final Ticket t;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final u = ref.watch(utilisateurProvider);
    return AlertDialog(
      title: Text(u?.structureNom ?? 'Ticket', style: const TextStyle(fontSize: 16)),
      content: SizedBox(
        width: 320,
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(t.numero, style: const TextStyle(fontSize: 64, fontWeight: FontWeight.w900, height: 1)),
          const SizedBox(height: 6),
          Text(t.patient ?? '', textAlign: TextAlign.center),
          Text('${t.tarif} · ${fcfa(t.montant)} · ${t.modeLisible}', textAlign: TextAlign.center, style: const TextStyle(color: C.texteDoux)),
          if (t.orientation != null) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: C.infoPale, borderRadius: BorderRadius.circular(12)),
              child: Text('Allez : ${t.orientation}', textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w900)),
            ),
          ],
          const SizedBox(height: 12),
          if (t.qr != null) QrImageView(data: t.qr!, size: 120),
          const Text('Attendez l’appel de votre numéro', style: TextStyle(color: C.texteDoux)),
        ]),
      ),
      actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Fermer'))],
    );
  }
}

/// SALLE D'ATTENTE côté soignant : appeler le numéro suivant dans son bureau.
class FileAttenteEcran extends ConsumerStatefulWidget {
  const FileAttenteEcran({super.key});
  @override
  ConsumerState<FileAttenteEcran> createState() => _FileAttenteEcranState();
}

class _FileAttenteEcranState extends ConsumerState<FileAttenteEcran> {
  final _bureau = TextEditingController(text: 'bureau 1');
  Ticket? _courant;
  bool _envoi = false;

  Future<void> _appeler() async {
    setState(() => _envoi = true);
    try {
      final r = await Api.instance.post('/caisse/appeler', {'bureau': _bureau.text.trim().isEmpty ? 'bureau' : _bureau.text.trim()});
      ref.invalidate(journalCaisseProvider);
      setState(() => _courant = r['ticket'] == null ? null : Ticket.fromJson(r['ticket']));
      if (r['ticket'] == null && mounted) toast(context, 'Personne en attente.');
    } catch (e) {
      if (mounted) toast(context, messageErreur(e), erreur: true);
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  Future<void> _terminer() async {
    if (_courant == null) return;
    try {
      await Api.instance.put('/caisse/tickets/${_courant!.id}', {'action': 'TERMINER'});
      setState(() => _courant = null);
      ref.invalidate(journalCaisseProvider);
    } catch (e) {
      if (mounted) toast(context, messageErreur(e), erreur: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final u = ref.watch(utilisateurProvider);
    final teinte = couleurDe(u?.structureCouleur) ?? C.vert;
    final j = ref.watch(journalCaisseProvider);
    final enAttente = ((j.value?['tickets'] as List?) ?? []).map((t) => Ticket.fromJson(t)).where((t) => t.statut == 'PAYE').toList().reversed.toList();
    return Scaffold(
      appBar: AppBar(title: const Text('Salle d’attente'), actions: [IconButton(onPressed: () => ref.invalidate(journalCaisseProvider), icon: const Icon(Icons.refresh))]),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Centre(
          largeur: 640,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            TextField(controller: _bureau, decoration: const InputDecoration(labelText: 'Mon bureau', prefixIcon: Icon(Icons.meeting_room_outlined))),
            const SizedBox(height: 12),
            FilledButton.icon(
              style: FilledButton.styleFrom(backgroundColor: teinte, minimumSize: const Size.fromHeight(64)),
              onPressed: _envoi ? null : _appeler,
              icon: const Icon(Icons.campaign_rounded, size: 30),
              label: Text('Appeler le suivant (${enAttente.length} en attente)'),
            ),
            if (_courant != null) ...[
              const SizedBox(height: 16),
              Card(
                color: C.prioritairePale,
                child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: Column(children: [
                    const Text('Appelé :'),
                    Text(_courant!.numero, style: const TextStyle(fontSize: 56, fontWeight: FontWeight.w900)),
                    Text('${_courant!.patient ?? ''} · ${_courant!.tarif}'),
                    const SizedBox(height: 4),
                    const Text('Son numéro s’affiche sur l’écran de la salle d’attente ; s’il a l’application, son téléphone le prévient.', textAlign: TextAlign.center, style: TextStyle(color: C.texteDoux, fontSize: 13)),
                    const SizedBox(height: 10),
                    OutlinedButton(onPressed: _terminer, child: const Text('Consultation terminée')),
                  ]),
                ),
              ),
            ],
            const Titre('En attente'),
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final t in enAttente) Chip(label: Text(t.numero, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16))),
              if (enAttente.isEmpty) const Text('Personne pour l’instant.', style: TextStyle(color: C.texteDoux)),
            ]),
          ]),
        ),
      ]),
    );
  }
}
