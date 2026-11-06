import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api.dart';
import '../../core/donnees.dart';
import '../../core/modeles.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';
import 'candidature_ecran.dart';

/// Administration de la structure (tenant) : chaque hôpital gère ses propres acteurs.
class AdminEcran extends ConsumerWidget {
  const AdminEcran({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final u = ref.watch(utilisateurProvider);
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: Text(u?.structureNom ?? 'Administration'),
          actions: [
            TextButton.icon(
              onPressed: () => showModalBottomSheet(context: context, isScrollControlled: true, showDragHandle: true, builder: (_) => const _Inviter()),
              icon: const Icon(Icons.forward_to_inbox_rounded),
              label: const Text('Inviter'),
            ),
          ],
          bottom: const TabBar(tabs: [Tab(text: 'Équipe'), Tab(text: 'Statistiques')]),
        ),
        floatingActionButton: FloatingActionButton.extended(
          onPressed: () => showModalBottomSheet(context: context, isScrollControlled: true, showDragHandle: true, builder: (_) => const _AjoutMembre()),
          icon: const Icon(Icons.person_add_alt_1),
          label: const Text('Ajouter'),
        ),
        body: const TabBarView(children: [_Equipe(), _Stats()]),
      ),
    );
  }
}

class _Equipe extends ConsumerWidget {
  const _Equipe();

  Future<void> _maj(BuildContext context, WidgetRef ref, String userId, Map<String, dynamic> corps, String ok) async {
    try {
      await Api.instance.put('/admin/membres/$userId', corps);
      ref.invalidate(membresProvider);
      if (context.mounted) toast(context, ok);
    } catch (e) {
      if (context.mounted) toast(context, messageErreur(e), erreur: true);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final m = ref.watch(membresProvider);
    return AsyncVue<List<Map<String, dynamic>>>(
      m,
      reessayer: () => ref.invalidate(membresProvider),
      donnees: (liste) => ListView(padding: const EdgeInsets.fromLTRB(16, 16, 16, 90), children: [
        for (final x in liste)
          Centre(
            child: Card(
              color: (x['statut'] == 'EN_ATTENTE' || x['statut'] == 'CONVOQUE') ? C.orPale : Colors.white,
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    CircleAvatar(backgroundColor: C.vertPale, child: Text('${x['prenom']}'[0], style: const TextStyle(color: C.vert, fontWeight: FontWeight.w900))),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('${x['prenom']} ${x['nom']}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                        Text([libellesRoles[x['role']], x['specialite'], x['numero_ordre'] == null ? null : 'Ordre n° ${x['numero_ordre']}'].whereType<String>().join(' · '),
                            style: const TextStyle(color: C.texteDoux)),
                        Text(x['email'] ?? x['telephone'] ?? '', style: const TextStyle(color: C.texteDoux, fontSize: 13)),
                      ]),
                    ),
                    BadgeStatut(x['statut'], membre: true),
                  ]),
                  if (x['id'] != u(ref))
                    Wrap(spacing: 8, children: [
                      if (x['statut'] == 'EN_ATTENTE' || x['statut'] == 'CONVOQUE')
                        FilledButton.icon(
                          onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => CandidatureEcran(membre: x))),
                          icon: const Icon(Icons.fact_check_outlined),
                          label: const Text('Examiner la candidature'),
                        ),
                      if (x['statut'] == 'ACTIF')
                        TextButton(onPressed: () => _maj(context, ref, x['id'], {'statut': 'SUSPENDU'}, 'Accès suspendu'), child: const Text('Suspendre')),
                      if (x['statut'] == 'SUSPENDU')
                        TextButton(onPressed: () => _maj(context, ref, x['id'], {'statut': 'ACTIF'}, 'Accès rétabli'), child: const Text('Réactiver')),
                    ]),
                ]),
              ),
            ),
          ),
      ]),
    );
  }

  String? u(WidgetRef ref) => ref.read(utilisateurProvider)?.id;
}

class _Stats extends ConsumerWidget {
  const _Stats();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(statistiquesProvider);
    return AsyncVue<Map<String, dynamic>>(
      s,
      reessayer: () => ref.invalidate(statistiquesProvider),
      donnees: (d) {
        List<Map<String, dynamic>> l(String k) => ((d[k] as List?) ?? []).map((e) => Map<String, dynamic>.from(e)).toList();
        Widget barres(String titre, List<Map<String, dynamic>> lignes, String cle, String val, {Map<String, String>? libelles}) {
          final max = lignes.fold<int>(1, (a, e) => (e[val] as int) > a ? e[val] as int : a);
          return Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(titre, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                const SizedBox(height: 10),
                if (lignes.isEmpty) const Text('Pas encore de données', style: TextStyle(color: C.texteDoux)),
                for (final e in lignes)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(children: [
                      SizedBox(width: 130, child: Text(libelles?[e[cle]] ?? '${e[cle]}', overflow: TextOverflow.ellipsis)),
                      Expanded(
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(6),
                          child: LinearProgressIndicator(value: (e[val] as int) / max, minHeight: 14, backgroundColor: C.vertPale, color: C.vert),
                        ),
                      ),
                      SizedBox(width: 40, child: Text('${e[val]}', textAlign: TextAlign.right, style: const TextStyle(fontWeight: FontWeight.w800))),
                    ]),
                  ),
              ]),
            ),
          );
        }

        final presence = d['taux_presence'];
        return ListView(padding: const EdgeInsets.all(16), children: [
          Centre(
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Card(
                color: C.vertPale,
                child: ListTile(
                  leading: const Icon(Icons.how_to_reg, color: C.vert),
                  title: Text(presence == null ? 'Taux de présence : —' : 'Taux de présence aux rendez-vous : $presence %', style: const TextStyle(fontWeight: FontWeight.w800)),
                ),
              ),
              barres('Dossiers par priorité (en cours)', l('dossiers_par_priorite'), 'priorite', 'n', libelles: libellesStatuts),
              barres('Dossiers par statut', l('dossiers_par_statut'), 'statut', 'n', libelles: libellesStatuts),
              barres('Troubles repérés (enfants)', l('troubles_reperes'), 'trouble', 'enfants', libelles: libellesTroubles),
              barres('Rendez-vous', l('rendez_vous_par_statut'), 'statut', 'n', libelles: libellesStatuts),
              barres('Nouveaux dossiers par mois', l('nouveaux_dossiers_par_mois'), 'mois', 'n'),
              const SizedBox(height: 80),
            ]),
          ),
        ]);
      },
    );
  }
}

class _AjoutMembre extends ConsumerStatefulWidget {
  const _AjoutMembre();
  @override
  ConsumerState<_AjoutMembre> createState() => _AjoutMembreState();
}

class _AjoutMembreState extends ConsumerState<_AjoutMembre> {
  final _form = GlobalKey<FormState>();
  final _prenom = TextEditingController();
  final _nom = TextEditingController();
  final _email = TextEditingController();
  final _tel = TextEditingController(text: '+221');
  final _spec = TextEditingController();
  String _role = 'MEDECIN';
  bool _envoi = false;

  Future<void> _envoyer() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _envoi = true);
    try {
      await Api.instance.post('/admin/membres', {
        'prenom': _prenom.text.trim(),
        'nom': _nom.text.trim(),
        'email': _email.text.trim(),
        'telephone': _tel.text.replaceAll(' ', ''),
        'role': _role,
        if (_spec.text.trim().isNotEmpty) 'specialite': _spec.text.trim(),
      });
      ref.invalidate(membresProvider);
      if (mounted) {
        Navigator.pop(context);
        toast(context, 'Compte créé : un code d’activation a été envoyé');
      }
    } catch (e) {
      if (mounted) toast(context, messageErreur(e), erreur: true);
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    String? requis(String? v) => (v ?? '').trim().isEmpty ? 'Obligatoire' : null;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
      child: Form(
        key: _form,
        child: SingleChildScrollView(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Ajouter un membre', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _role,
              decoration: const InputDecoration(labelText: 'Rôle'),
              items: const [
                DropdownMenuItem(value: 'MEDECIN', child: Text('Médecin')),
                DropdownMenuItem(value: 'THERAPEUTE', child: Text('Thérapeute')),
                DropdownMenuItem(value: 'SECRETAIRE', child: Text('Secrétariat')),
                DropdownMenuItem(value: 'ADMIN_STRUCTURE', child: Text('Administration')),
              ],
              onChanged: (v) => setState(() => _role = v!),
            ),
            const SizedBox(height: 10),
            TextFormField(controller: _prenom, decoration: const InputDecoration(labelText: 'Prénom'), validator: requis),
            const SizedBox(height: 10),
            TextFormField(controller: _nom, decoration: const InputDecoration(labelText: 'Nom'), validator: requis),
            const SizedBox(height: 10),
            TextFormField(controller: _email, decoration: const InputDecoration(labelText: 'E-mail professionnel'), keyboardType: TextInputType.emailAddress,
                validator: (v) => RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch((v ?? '').trim()) ? null : 'E-mail invalide'),
            const SizedBox(height: 10),
            TextFormField(controller: _tel, decoration: const InputDecoration(labelText: 'Téléphone'), keyboardType: TextInputType.phone,
                validator: (v) => RegExp(r'^\+221[0-9]{9}$').hasMatch((v ?? '').replaceAll(' ', '')) ? null : 'Format +221 7X XXX XX XX'),
            const SizedBox(height: 10),
            TextFormField(controller: _spec, decoration: const InputDecoration(labelText: 'Spécialité (ex. orthophoniste, pédopsychiatre)')),
            const SizedBox(height: 16),
            FilledButton(onPressed: _envoi ? null : _envoyer, child: const Text('Créer le compte')),
          ]),
        ),
      ),
    );
  }
}


/// Inviter une VRAIE personne de l'établissement : elle reçoit un lien (SMS, e-mail, Telegram ou WhatsApp)
/// et crée elle-même son compte. Elle n'aura accès qu'à CET établissement.
class _Inviter extends StatefulWidget {
  const _Inviter();
  @override
  State<_Inviter> createState() => _InviterState();
}

class _InviterState extends State<_Inviter> {
  String _role = 'MEDECIN';
  final _dest = TextEditingController();
  String? _lien;
  bool _envoi = false;

  Future<void> _envoyer() async {
    setState(() => _envoi = true);
    try {
      final r = await Api.instance.post('/etablissement/invitations', {'role': _role, 'destinataire': _dest.text.trim()});
      setState(() => _lien = r['lien'] as String?);
    } catch (e) {
      if (mounted) toast(context, messageErreur(e), erreur: true);
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.viewInsetsOf(context).bottom + 24),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Inviter du personnel', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 4),
          const Text('La personne reçoit un lien valable 7 jours et crée elle-même son mot de passe. Elle n’accède qu’à votre établissement.',
              style: TextStyle(color: C.texteDoux)),
          const SizedBox(height: 14),
          if (_lien == null) ...[
            DropdownButtonFormField<String>(
              initialValue: _role,
              decoration: const InputDecoration(labelText: 'Rôle'),
              items: const [
                DropdownMenuItem(value: 'MEDECIN', child: Text('Médecin')),
                DropdownMenuItem(value: 'THERAPEUTE', child: Text('Thérapeute, psychologue, orthophoniste…')),
                DropdownMenuItem(value: 'SECRETAIRE', child: Text('Accueil / secrétariat')),
                DropdownMenuItem(value: 'ADMIN_STRUCTURE', child: Text('Administrateur')),
              ],
              onChanged: (v) => setState(() => _role = v ?? 'MEDECIN'),
            ),
            const SizedBox(height: 12),
            TextField(controller: _dest, keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(labelText: 'Téléphone ou e-mail de la personne', hintText: '77 123 45 67')),
            const SizedBox(height: 16),
            FilledButton(onPressed: _envoi ? null : _envoyer, child: Text(_envoi ? 'Envoi…' : 'Envoyer l’invitation')),
          ] else ...[
            const Icon(Icons.mark_email_read_rounded, color: C.vert, size: 48),
            const SizedBox(height: 8),
            const Text('Invitation créée. Si la personne ne la reçoit pas, envoyez-lui ce lien :', textAlign: TextAlign.center),
            const SizedBox(height: 8),
            SelectableText(_lien!, textAlign: TextAlign.center, style: const TextStyle(fontSize: 12.5, color: C.info)),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: () => launchUrl(Uri.parse('https://wa.me/?text=${Uri.encodeComponent('Invitation SAMA XHEL : $_lien')}'), mode: LaunchMode.externalApplication),
              icon: const Icon(Icons.share_rounded),
              label: const Text('Envoyer par WhatsApp'),
            ),
          ],
        ]),
      );
}
