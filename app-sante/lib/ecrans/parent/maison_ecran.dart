import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api.dart';
import '../../core/config.dart';
import '../../core/donnees.dart';
import '../../core/maison.dart';
import '../../core/portails.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';
import '../../widgets/logo_etablissement.dart';
import '../portails/etablissements_ecran.dart';

/// L'espace d'un hôpital (plein écran, à ses couleurs) : on y entre depuis l'accueil SAMA XHEL.
class MaisonEcran extends ConsumerStatefulWidget {
  const MaisonEcran({super.key, required this.code});
  final String code;
  @override
  ConsumerState<MaisonEcran> createState() => _MaisonEcranState();
}

class _MaisonEcranState extends ConsumerState<MaisonEcran> {
  @override
  void initState() {
    super.initState();
    // On retient le dernier hôpital visité : il s'affiche en premier à l'accueil
    Future.microtask(() => ref.read(maisonActiveProvider.notifier).entrer(widget.code));
  }

  @override
  Widget build(BuildContext context) {
    final etab = ref.watch(portailProvider(widget.code)).value?.etablissement;
    final notifs = ref.watch(notificationsProvider).value?.nonLues ?? 0;
    final contenu = Scaffold(
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(maisonProvider(widget.code)),
        child: CustomScrollView(slivers: [
          SliverToBoxAdapter(
            child: etab == null
                ? const SizedBox(height: 120, child: Center(child: CircularProgressIndicator()))
                : EnTeteMaison(e: etab, notifs: notifs, retour: true),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 28),
            sliver: SliverToBoxAdapter(
              child: Centre(
                largeur: 900,
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Row(children: [
                    const BoutonVoix('portail'),
                    const Spacer(),
                    TextButton.icon(onPressed: () => context.push('/mes-hopitaux'), icon: const Icon(Icons.swap_horiz_rounded), label: const Text('Changer d’hôpital')),
                  ]),
                  BlocMaison(code: widget.code),
                ]),
              ),
            ),
          ),
        ]),
      ),
    );
    return etab == null ? contenu : Theme(data: construireTheme(accent: etab.teinte), child: contenu);
  }
}

/// En-tête de la maison : la couleur, le logo et le nom de l'hôpital où l'on se trouve.
class EnTeteMaison extends ConsumerWidget {
  const EnTeteMaison({super.key, required this.e, this.notifs = 0, this.sousTitre, this.retour = false});
  final Etablissement e;
  final int notifs;
  final String? sousTitre;
  final bool retour;

  @override
  Widget build(BuildContext context, WidgetRef ref) => Container(
        decoration: BoxDecoration(color: e.teinte, borderRadius: const BorderRadius.vertical(bottom: Radius.circular(28))),
        padding: EdgeInsets.fromLTRB(18, MediaQuery.paddingOf(context).top + 12, 8, 22),
        margin: const EdgeInsets.only(bottom: 8),
        child: Row(children: [
          if (retour)
            IconButton(
              tooltip: 'Retour à l’accueil SAMA XHEL',
              onPressed: () => context.canPop() ? context.pop() : context.go('/accueil'),
              icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
            ),
          LogoEtablissement(e, taille: 58, surFond: true),
          const SizedBox(width: 14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(e.nomCourt, style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w900)),
              Text(sousTitre ?? e.nom, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white70, fontSize: 13.5)),
            ]),
          ),
          IconButton(
            tooltip: 'Notifications',
            onPressed: () => context.push('/notifications'),
            icon: Badge(isLabelVisible: notifs > 0, label: Text('$notifs'), child: const Icon(Icons.notifications_none_rounded, color: Colors.white, size: 28)),
          ),
        ]),
      );
}

/// Ce que la famille a DANS cet hôpital : son statut, son soignant, ses tickets, ses rendez-vous.
class BlocMaison extends ConsumerWidget {
  const BlocMaison({super.key, required this.code});
  final String code;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final m = ref.watch(maisonProvider(code));
    return m.when(
      skipLoadingOnReload: true,
      loading: () => const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator())),
      error: (e, _) => Card(child: ListTile(leading: const Icon(Icons.cloud_off), title: Text(messageErreur(e)), trailing: TextButton(onPressed: () => ref.invalidate(maisonProvider(code)), child: const Text('Réessayer')))),
      data: (m) {
        final e = m.etablissement;
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          // 1. Statut de la famille dans cet hôpital
          if (m.inscription == null || m.inscription == 'REFUSEE' || m.inscription == 'CLOTUREE')
            _Encadre(
              couleur: e.teinte,
              icone: Icons.how_to_reg_rounded,
              titre: 'Vous n’êtes pas encore inscrit chez ${e.nomCourt}',
              texte: 'Dites pour qui (vous, votre enfant ou un proche) : l’accueil ouvre votre dossier et vous indique votre soignant.',
              bouton: FilledButton.icon(
                style: FilledButton.styleFrom(backgroundColor: e.teinte),
                onPressed: () => context.push('/portail/${e.code}'),
                icon: const Icon(Icons.how_to_reg_rounded),
                label: Text('Rejoindre ${e.nomCourt}'),
              ),
            )
          else if (!m.acceptee)
            _Encadre(
              couleur: C.prioritaire,
              icone: Icons.hourglass_top_rounded,
              voix: 'demande_attente',
              titre: 'Demande envoyée : l’accueil va vous répondre',
              texte: 'Dès que votre dossier est accepté, votre soignant s’affiche ici. En attendant, vous pouvez déjà payer votre ticket.',
            ),
          // 2. Le soignant (visible une fois le dossier accepté)
          if (m.acceptee) ...[
            const Titre('Votre soignant', action: BoutonVoix('soignant', compact: true)),
            if (m.mesSoignants.isEmpty)
              const Card(child: ListTile(leading: Icon(Icons.person_search_rounded), title: Text('L’établissement va vous attribuer un soignant.')))
            else
              for (final s in m.mesSoignants.take(3)) _CarteSoignant(s: s, m: m, referent: m.dossiers.any((d) => d.referent?.id == s.id)),
          ],
          // 3. Ticket de caisse
          Titre('Mon ticket', action: TextButton.icon(onPressed: () => payerTicket(context, ref, m), icon: const Icon(Icons.confirmation_number_outlined), label: const Text('Payer un ticket'))),
          if (m.tickets.isEmpty)
            Card(
              child: ListTile(
                leading: Icon(Icons.confirmation_number_rounded, color: e.teinte, size: 32),
                title: const Text('Pas de ticket'),
                subtitle: const Text('Payez à la caisse de l’entrée, ou ici avec Wave ou Orange Money.'),
                onTap: () => payerTicket(context, ref, m),
              ),
            )
          else
            for (final t in m.tickets.take(2)) CarteTicket(t, etablissement: e),
          // 4. Rendez-vous dans cet hôpital
          if (m.rdv.isNotEmpty) ...[
            const Titre('Mes rendez-vous ici'),
            for (final r in m.rdv)
              Card(
                child: ListTile(
                  leading: CircleAvatar(backgroundColor: r.estVisio ? C.infoPale : C.vertPale, child: Icon(r.estVisio ? Icons.videocam_rounded : Icons.event_rounded, color: r.estVisio ? C.info : e.teinte)),
                  title: Text('${r.enfantPrenom ?? ''}${r.professionnelNom != null ? ' · ${r.professionnelNom}' : ''}', style: const TextStyle(fontWeight: FontWeight.w800)),
                  subtitle: Text(r.statut == 'DEMANDE' ? 'En attente de confirmation' : dateLongue(r.date)),
                  trailing: r.estVisio && r.consultationId != null && r.statut == 'CONFIRME'
                      ? FilledButton(style: FilledButton.styleFrom(minimumSize: const Size(0, 40)), onPressed: () => context.push('/visio/${r.consultationId}'), child: const Text('Vidéo'))
                      : BadgeStatut(r.statut),
                ),
              ),
          ],
          if (m.services.isNotEmpty) ...[
            const Titre('Services de l’établissement'),
            Wrap(spacing: 8, runSpacing: 8, children: [for (final s in m.services) Chip(avatar: Icon(Icons.medical_services_outlined, size: 18, color: e.teinte), label: Text(s))]),
          ],
        ]);
      },
    );
  }
}

class _Encadre extends StatelessWidget {
  const _Encadre({required this.couleur, required this.icone, required this.titre, required this.texte, this.bouton, this.voix});
  final Color couleur;
  final IconData icone;
  final String titre;
  final String? voix;
  final String texte;
  final Widget? bouton;
  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(top: 8),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: couleur.withValues(alpha: .08), borderRadius: BorderRadius.circular(18), border: Border.all(color: couleur.withValues(alpha: .35))),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Icon(icone, color: couleur, size: 30),
            const SizedBox(width: 12),
            Expanded(child: Text(titre, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 17))),
            if (voix != null) BoutonVoix(voix!, compact: true),
          ]),
          const SizedBox(height: 6),
          Text(texte, style: const TextStyle(color: C.texteDoux)),
          if (bouton != null) ...[const SizedBox(height: 12), bouton!],
        ]),
      );
}

class _CarteSoignant extends ConsumerWidget {
  const _CarteSoignant({required this.s, required this.m, required this.referent});
  final Soignant s;
  final Maison m;
  final bool referent;

  Future<void> _ecrire(BuildContext context, WidgetRef ref) async {
    try {
      final d = m.dossiers.firstWhere((d) => d.referent?.id == s.id, orElse: () => m.dossiers.first);
      final r = await Api.instance.post('/conversations', {'professionnel_id': s.id, 'structure_id': m.etablissement.id, 'enfant_id': d.personneId});
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
    final t = m.etablissement.teinte;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            CircleAvatar(radius: 26, backgroundColor: t.withValues(alpha: .14), child: Icon(Icons.medical_services_rounded, color: t, size: 28)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(s.role == 'MEDECIN' ? 'Dr ${s.nom}' : s.nom, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 17)),
                Text(s.fonction, style: const TextStyle(color: C.texteDoux)),
              ]),
            ),
            if (referent) Chip(label: const Text('Votre référent'), backgroundColor: t.withValues(alpha: .12), side: BorderSide.none),
          ]),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(
              child: FilledButton.icon(
                style: FilledButton.styleFrom(backgroundColor: t, minimumSize: const Size(0, 48)),
                onPressed: () => demanderRdv(context, ref, m, s),
                icon: const Icon(Icons.event_available_rounded),
                label: const Text('Rendez-vous'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: OutlinedButton.icon(
                style: OutlinedButton.styleFrom(foregroundColor: t, side: BorderSide(color: t, width: 1.4), minimumSize: const Size(0, 48)),
                onPressed: () => _ecrire(context, ref),
                icon: const Icon(Icons.lock_outline_rounded),
                label: const Text('Écrire'),
              ),
            ),
          ]),
          const SizedBox(height: 6),
          const Text('Messages privés et chiffrés : seuls vous et ce soignant les lisez.', style: TextStyle(fontSize: 12.5, color: C.texteDoux)),
        ]),
      ),
    );
  }
}

/// Demande de rendez-vous avec CE soignant (sur place ou en vidéo)
Future<void> demanderRdv(BuildContext context, WidgetRef ref, Maison m, Soignant s) async {
  String? personne = m.dossiers.length == 1 ? m.dossiers.first.personneId : m.dossiers.where((d) => d.referent?.id == s.id).firstOrNull?.personneId;
  String type = 'PRESENTIEL';
  final motif = TextEditingController();
  final ok = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, set) => Padding(
        padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.viewInsetsOf(ctx).bottom + 24),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Expanded(child: Text('Rendez-vous avec ${s.role == 'MEDECIN' ? 'Dr ' : ''}${s.nom}', style: Theme.of(ctx).textTheme.titleLarge)),
            const BoutonVoix('rdv_demande', compact: true),
          ]),
          const SizedBox(height: 12),
          const Text('Pour qui ?', style: TextStyle(fontWeight: FontWeight.w800)),
          Wrap(spacing: 8, children: [
            for (final d in m.dossiers) ChoiceChip(label: Text(d.personne), selected: personne == d.personneId, onSelected: (_) => set(() => personne = d.personneId)),
          ]),
          const SizedBox(height: 10),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'PRESENTIEL', icon: Icon(Icons.local_hospital_outlined), label: Text('Sur place')),
              ButtonSegment(value: 'TELECONSULTATION', icon: Icon(Icons.videocam_outlined), label: Text('En vidéo')),
            ],
            selected: {type},
            onSelectionChanged: (v) => set(() => type = v.first),
          ),
          const SizedBox(height: 10),
          TextField(controller: motif, maxLines: 2, decoration: const InputDecoration(labelText: 'Pourquoi ? (facultatif)')),
          const SizedBox(height: 14),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: m.etablissement.teinte),
            onPressed: personne == null ? null : () => Navigator.pop(ctx, true),
            child: const Text('Envoyer la demande'),
          ),
        ]),
      ),
    ),
  );
  if (ok != true || !context.mounted) return;
  try {
    await Api.instance.post('/rendez-vous', {
      'enfant_id': personne, 'structure_id': m.etablissement.id, 'type': type, 'professionnel_id': s.id,
      if (motif.text.trim().isNotEmpty) 'motif': motif.text.trim(),
    });
    ref.invalidate(maisonProvider(m.etablissement.code));
    ref.invalidate(rdvProvider);
    if (context.mounted) toast(context, 'Demande envoyée. L’établissement confirme la date et l’heure.');
  } catch (e) {
    if (context.mounted) toast(context, messageErreur(e), erreur: true);
  }
}

/// Payer un ticket d'avance : choisir la prestation, payer par Wave / Orange Money, donner la référence.
/// Le ticket est « à vérifier » jusqu'à ce que la caisse de l'entrée confirme le paiement.
Future<void> payerTicket(BuildContext context, WidgetRef ref, Maison m) async {
  final e = m.etablissement;
  final tarifs = m.tarifs.where((t) => t.enLigne).toList();
  if (m.dossiers.isEmpty) {
    toast(context, 'Rejoignez d’abord ${e.nomCourt} (pour vous ou un proche). Vous pouvez aussi payer à la caisse de l’entrée.');
    return;
  }
  if (tarifs.isEmpty) {
    toast(context, 'Cet établissement encaisse seulement à la caisse de l’entrée.');
    return;
  }
  Tarif? tarif = tarifs.first;
  String personne = m.dossiers.first.personneId;
  String mode = 'WAVE';
  final ref_ = TextEditingController();
  final ticket = await showModalBottomSheet<Ticket>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) => StatefulBuilder(builder: (ctx, set) {
      return Padding(
        padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.viewInsetsOf(ctx).bottom + 24),
        child: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              Expanded(child: Text('Ticket ${e.nomCourt}', style: Theme.of(ctx).textTheme.titleLarge)),
              const BoutonVoix('payer_ticket', compact: true),
            ]),
            const SizedBox(height: 10),
            const Text('1. Pour quoi ?', style: TextStyle(fontWeight: FontWeight.w800)),
            RadioGroup<Tarif>(
              groupValue: tarif,
              onChanged: (v) => set(() => tarif = v),
              child: Column(children: [
                for (final t in tarifs)
                  RadioListTile<Tarif>(
                    value: t,
                    contentPadding: EdgeInsets.zero,
                    title: Text(t.libelle),
                    secondary: Text(fcfa(t.montant), style: TextStyle(fontWeight: FontWeight.w900, color: e.teinte)),
                  ),
              ]),
            ),
            if (m.dossiers.length > 1) ...[
              const Text('2. Pour qui ?', style: TextStyle(fontWeight: FontWeight.w800)),
              Wrap(spacing: 8, children: [
                for (final d in m.dossiers) ChoiceChip(label: Text(d.personne), selected: personne == d.personneId, onSelected: (_) => set(() => personne = d.personneId)),
              ]),
              const SizedBox(height: 8),
            ],
            Text('${m.dossiers.length > 1 ? 3 : 2}. Payer', style: const TextStyle(fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            Row(children: [
              Expanded(
                child: _BoutonPaiement(
                  nom: 'Wave', couleur: const Color(0xFF1DC4FF), choisi: mode == 'WAVE',
                  onTap: () { set(() => mode = 'WAVE'); launchUrl(Uri.parse(AppConfig.lienWave), mode: LaunchMode.externalApplication); },
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _BoutonPaiement(
                  nom: 'Orange Money', couleur: const Color(0xFFFF7900), choisi: mode == 'ORANGE_MONEY',
                  onTap: () { set(() => mode = 'ORANGE_MONEY'); launchUrl(Uri.parse('tel:%23144%23')); },
                ),
              ),
            ]),
            const SizedBox(height: 8),
            Text(
              mode == 'WAVE'
                  ? 'Payez ${fcfa(tarif!.montant)} sur la page Wave qui s’ouvre, puis recopiez la référence de la transaction.'
                  : 'Envoyez ${fcfa(tarif!.montant)} au ${AppConfig.numeroOm} (#144#), puis recopiez la référence du SMS de confirmation.',
              style: const TextStyle(color: C.texteDoux),
            ),
            const SizedBox(height: 10),
            TextField(controller: ref_, decoration: const InputDecoration(labelText: 'Référence de la transaction', hintText: 'ex. T-8F2K91')),
            const SizedBox(height: 6),
            const Text('Compte de démonstration : en service réel, l’argent va directement au compte de l’établissement.', style: TextStyle(fontSize: 12, color: C.texteDoux)),
            const SizedBox(height: 14),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: e.teinte),
              onPressed: () async {
                if (ref_.text.trim().length < 4) {
                  toast(ctx, 'Recopiez la référence de la transaction.', erreur: true);
                  return;
                }
                try {
                  final r = await Api.instance.post('/moi/tickets', {
                    'etablissement': e.code, 'tarif_id': tarif!.id, 'personne_id': personne, 'mode_paiement': mode, 'reference': ref_.text.trim(),
                  });
                  if (ctx.mounted) Navigator.pop(ctx, Ticket.fromJson(r['ticket']));
                } catch (err) {
                  if (ctx.mounted) toast(ctx, messageErreur(err), erreur: true);
                }
              },
              child: const Text('J’ai payé : réserver mon ticket'),
            ),
          ]),
        ),
      );
    }),
  );
  if (ticket == null || !context.mounted) return;
  ref.invalidate(maisonProvider(e.code));
  await showDialog<void>(
    context: context,
    builder: (_) => AlertDialog(
      contentPadding: const EdgeInsets.all(16),
      content: SizedBox(width: 360, child: Column(mainAxisSize: MainAxisSize.min, children: [CarteTicket(ticket, etablissement: e), const BoutonVoix('ticket')])),
      actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('OK'))],
    ),
  );
}

class _BoutonPaiement extends StatelessWidget {
  const _BoutonPaiement({required this.nom, required this.couleur, required this.choisi, required this.onTap});
  final String nom;
  final Color couleur;
  final bool choisi;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Material(
        color: choisi ? couleur : couleur.withValues(alpha: .12),
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 14),
            child: Center(child: Text(nom, style: TextStyle(fontWeight: FontWeight.w900, color: choisi ? Colors.white : couleur))),
          ),
        ),
      );
}

/// Le ticket tel qu'on le montre à l'entrée : grand numéro, où aller, QR code vérifiable.
class CarteTicket extends StatelessWidget {
  const CarteTicket(this.t, {super.key, required this.etablissement});
  final Ticket t;
  final Etablissement etablissement;
  @override
  Widget build(BuildContext context) {
    final c = etablissement.teinte;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Container(
          color: c,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          child: Row(children: [
            const Icon(Icons.confirmation_number_rounded, color: Colors.white),
            const SizedBox(width: 8),
            Expanded(child: Text('${etablissement.nomCourt} · ${t.tarif}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800), overflow: TextOverflow.ellipsis)),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.all(14),
          child: Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(t.numero, style: TextStyle(fontSize: 44, fontWeight: FontWeight.w900, color: c, height: 1)),
                const SizedBox(height: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(color: t.couleur.withValues(alpha: .12), borderRadius: BorderRadius.circular(8)),
                  child: Text(t.statutLisible, style: TextStyle(color: t.couleur, fontWeight: FontWeight.w800, fontSize: 12.5)),
                ),
                const SizedBox(height: 6),
                Text('${fcfa(t.montant)} · ${t.modeLisible}', style: const TextStyle(color: C.texteDoux)),
                if (t.bureau != null && t.statut == 'APPELE')
                  Text('→ ${t.bureau}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16))
                else if (t.orientation != null)
                  Text('→ ${t.orientation}', style: const TextStyle(fontWeight: FontWeight.w700)),
              ]),
            ),
            if (t.qr != null) QrImageView(data: t.qr!, size: 92, padding: EdgeInsets.zero),
          ]),
        ),
      ]),
    );
  }
}

/// « Mes hôpitaux » : les maisons rejointes, pour passer de l'une à l'autre.
class MesHopitauxEcran extends ConsumerWidget {
  const MesHopitauxEcran({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final active = ref.watch(maisonActiveProvider);
    final mes = ref.watch(mesEtablissementsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Mes hôpitaux'), actions: const [Padding(padding: EdgeInsets.only(right: 12), child: BoutonVoix('mes_hopitaux', compact: true))]),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Centre(
          largeur: 640,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Text('Chaque hôpital a son espace : votre dossier, vos soignants, vos tickets. Touchez un hôpital pour y entrer.', style: TextStyle(color: C.texteDoux)),
            const SizedBox(height: 12),
            AsyncVue<List<Etablissement>>(
              mes,
              reessayer: () => ref.invalidate(mesEtablissementsProvider),
              donnees: (l) => Column(children: [
                for (final e in l)
                  CarteEtablissement(
                    e,
                    sousTitre: e.code == active ? 'Vous êtes ici' : (e.inscriptionStatut == 'ACTIVE' ? 'Dossier accepté' : 'Demande en attente'),
                    onTap: () => context.push('/maison/${e.code}'),
                  ),
                if (l.isEmpty) const Card(child: ListTile(leading: Icon(Icons.info_outline), title: Text('Vous n’avez encore rejoint aucun hôpital.'))),
              ]),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: () => context.push('/etablissements?en_ligne=true'),
              icon: const Icon(Icons.add_business_rounded),
              label: const Text('Rejoindre un autre hôpital ou centre'),
            ),
            const SizedBox(height: 8),
            TextButton.icon(
              onPressed: () => context.go('/accueil'),
              icon: const Icon(Icons.home_rounded),
              label: const Text('Retour à l’accueil SAMA XHEL'),
            ),
          ]),
        ),
      ]),
    );
  }
}
