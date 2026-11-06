import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../core/api.dart';
import '../core/phrases.dart';
import '../core/theme.dart';
import '../core/voix.dart';
import 'serveur.dart';

// ─── Formats ────────────────────────────────────────────────────────────────
String dateLongue(DateTime? d) => d == null ? 'Date à confirmer' : DateFormat("EEEE d MMMM 'à' HH'h'mm", 'fr_FR').format(d);
String dateCourte(DateTime? d) => d == null ? '—' : DateFormat('d MMM yyyy', 'fr_FR').format(d);
String heure(DateTime? d) => d == null ? '' : DateFormat('HH:mm', 'fr_FR').format(d);

void toast(BuildContext context, String message, {bool erreur = false}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      content: Text(message, style: const TextStyle(fontSize: 15.5)),
      backgroundColor: erreur ? C.urgent : C.vertFonce,
    ));
}

String messageErreur(Object e) => e is ApiException ? e.message : 'Une erreur est survenue. Réessayez.';

// ─── Bouton du guide vocal (🔊) ─────────────────────────────────────────────
class BoutonVoix extends ConsumerStatefulWidget {
  const BoutonVoix(this.cle, {super.key, this.texte, this.compact = false, this.auto = true});
  final String cle;
  final String? texte; // texte dynamique (ex. question) ; sinon phrase du catalogue
  final bool compact;
  /// L'écran se présente tout seul à voix haute à son ouverture (une fois par session),
  /// pour les parents qui ne lisent pas (guide automatique, réglable dans Profil).
  final bool auto;

  @override
  ConsumerState<BoutonVoix> createState() => _BoutonVoixState();
}

class _BoutonVoixState extends ConsumerState<BoutonVoix> {
  static final _dejaPresentes = <String>{};
  bool _lecture = false;

  @override
  void initState() {
    super.initState();
    if (widget.auto && !_dejaPresentes.contains(widget.cle)) {
      WidgetsBinding.instance.addPostFrameCallback((_) async {
        await Future<void>.delayed(const Duration(milliseconds: 600));
        if (!mounted) return;
        final langue = ref.read(langueProvider);
        if (!await GuideVocal.instance.guideAuto(langue) || !mounted) return;
        if (!await GuideVocal.instance.aUneVoix(widget.cle, langue) && langue != 'fr') return;
        _dejaPresentes.add(widget.cle);
        _lire(silencieux: true);
      });
    }
  }

  Future<void> _lire({bool silencieux = false}) async {
    final langue = ref.read(langueProvider);
    final p = phrases[widget.cle];
    setState(() => _lecture = true);
    final ok = await GuideVocal.instance.lire(
      cle: widget.cle,
      texteFr: widget.texte ?? p?.fr ?? '',
      texteEn: widget.texte == null ? p?.en : null,
      langue: langue,
    );
    if (!mounted) return;
    setState(() => _lecture = false);
    if (!ok && !silencieux) {
      toast(context, 'La voix en ${langueParCode(langue).nom} arrive bientôt. Lecture en français.');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.compact) {
      return IconButton.filledTonal(
        tooltip: 'Écouter',
        onPressed: () => _lire(),
        icon: Icon(_lecture ? Icons.graphic_eq : Icons.volume_up_rounded),
        style: IconButton.styleFrom(backgroundColor: C.orPale, foregroundColor: C.vertFonce),
      );
    }
    return Material(
      color: C.orPale,
      borderRadius: BorderRadius.circular(30),
      child: InkWell(
        borderRadius: BorderRadius.circular(30),
        onTap: () => _lire(),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(_lecture ? Icons.graphic_eq : Icons.volume_up_rounded, color: C.vertFonce),
            const SizedBox(width: 8),
            const Text('Écouter', style: TextStyle(fontWeight: FontWeight.w800, color: C.vertFonce)),
          ]),
        ),
      ),
    );
  }
}

// ─── Badge de priorité (IA de tri) ──────────────────────────────────────────
class BadgePriorite extends StatelessWidget {
  const BadgePriorite(this.priorite, {super.key, this.grand = false});
  final String priorite;
  final bool grand;

  @override
  Widget build(BuildContext context) {
    final (couleur, fond, libelle, icone) = switch (priorite) {
      'URGENT' => (C.urgent, C.urgentPale, 'Urgent', Icons.priority_high_rounded),
      'PRIORITAIRE' => (C.prioritaire, C.prioritairePale, 'Prioritaire', Icons.schedule_rounded),
      _ => (C.normal, C.normalPale, 'Normal', Icons.check_circle_outline),
    };
    return Container(
      padding: EdgeInsets.symmetric(horizontal: grand ? 12 : 8, vertical: grand ? 6 : 3),
      decoration: BoxDecoration(color: fond, borderRadius: BorderRadius.circular(20), border: Border.all(color: couleur.withValues(alpha: .35))),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icone, size: grand ? 18 : 14, color: couleur),
        const SizedBox(width: 4),
        Text(libelle, style: TextStyle(color: couleur, fontWeight: FontWeight.w800, fontSize: grand ? 14 : 12)),
      ]),
    );
  }
}

const libellesStatuts = {
  'DEMANDE': 'En attente', 'ACTIF': 'Suivi en cours', 'REFUSE': 'Refusé', 'CLOS': 'Clôturé', 'ARCHIVE': 'Archivé',
  'CONFIRME': 'Confirmé', 'ANNULE': 'Annulé', 'TERMINE': 'Terminé', 'ABSENT': 'Absent',
  'PLANIFIEE': 'Planifiée', 'EN_COURS': 'En cours', 'TERMINEE': 'Terminée', 'ANNULEE': 'Annulée',
  'EN_ATTENTE': 'À valider', 'SUSPENDU': 'Suspendu',
  'URGENT': 'Urgent', 'PRIORITAIRE': 'Prioritaire', 'NORMAL': 'Normal',
};

class BadgeStatut extends StatelessWidget {
  const BadgeStatut(this.statut, {super.key, this.membre = false});
  final String statut;

  /// true pour le statut d'un membre d'équipe (ACTIF = « Actif », pas « Suivi en cours »)
  final bool membre;

  @override
  Widget build(BuildContext context) {
    final couleur = switch (statut) {
      'ACTIF' || 'CONFIRME' || 'TERMINEE' || 'TERMINE' => C.normal,
      'DEMANDE' || 'PLANIFIEE' || 'EN_ATTENTE' => C.info,
      'REFUSE' || 'ANNULE' || 'ANNULEE' || 'ABSENT' || 'SUSPENDU' => C.urgent,
      _ => C.texteDoux,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: couleur.withValues(alpha: .1), borderRadius: BorderRadius.circular(20)),
      child: Text(membre && statut == 'ACTIF' ? 'Actif' : (libellesStatuts[statut] ?? statut),
          style: TextStyle(color: couleur, fontWeight: FontWeight.w800, fontSize: 12)),
    );
  }
}

// ─── États ──────────────────────────────────────────────────────────────────
class Chargement extends StatelessWidget {
  const Chargement({super.key});
  @override
  Widget build(BuildContext context) => const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator()));
}

class VueErreur extends StatelessWidget {
  const VueErreur(this.erreur, {super.key, this.reessayer});
  final Object erreur;
  final VoidCallback? reessayer;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.wifi_off_rounded, size: 48, color: C.texteDoux),
            const SizedBox(height: 12),
            Text(messageErreur(erreur), textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyLarge),
            if (reessayer != null) ...[
              const SizedBox(height: 16),
              OutlinedButton.icon(onPressed: reessayer, icon: const Icon(Icons.refresh), label: const Text('Réessayer')),
            ],
            if (erreur is ApiException && (erreur as ApiException).code == 'SERVEUR_INJOIGNABLE' && modeDemonstration)
              TextButton.icon(onPressed: () => choisirServeur(context), icon: const Icon(Icons.dns_outlined), label: const Text('Adresse du serveur')),
          ]),
        ),
      );
}

class Vide extends StatelessWidget {
  const Vide({super.key, required this.icone, required this.titre, this.texte, this.action});
  final IconData icone;
  final String titre;
  final String? texte;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: const BoxDecoration(color: C.vertPale, shape: BoxShape.circle),
              child: Icon(icone, size: 40, color: C.vert),
            ),
            const SizedBox(height: 16),
            Text(titre, textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleMedium),
            if (texte != null) ...[
              const SizedBox(height: 6),
              Text(texte!, textAlign: TextAlign.center, style: const TextStyle(color: C.texteDoux)),
            ],
            if (action != null) ...[const SizedBox(height: 18), action!],
          ]),
        ),
      );
}

/// Affiche un AsyncValue avec chargement / erreur / données
class AsyncVue<T> extends StatelessWidget {
  const AsyncVue(this.valeur, {super.key, required this.donnees, this.reessayer});
  final AsyncValue<T> valeur;
  final Widget Function(T) donnees;
  final VoidCallback? reessayer;

  @override
  Widget build(BuildContext context) => valeur.when(
        skipLoadingOnReload: true,
        data: donnees,
        loading: () => const Chargement(),
        error: (e, _) => VueErreur(e, reessayer: reessayer),
      );
}

// ─── Grande tuile d'action (accueil) ────────────────────────────────────────
class TuileAction extends StatelessWidget {
  const TuileAction({super.key, required this.icone, required this.titre, required this.sousTitre, required this.couleur, required this.onTap});
  final IconData icone;
  final String titre;
  final String sousTitre;
  final Color couleur;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: couleur.withValues(alpha: .12), borderRadius: BorderRadius.circular(14)),
                child: Icon(icone, color: couleur, size: 30),
              ),
              const SizedBox(height: 12),
              Text(titre, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 2),
              Text(sousTitre, style: const TextStyle(color: C.texteDoux, fontSize: 13.5), maxLines: 2, overflow: TextOverflow.ellipsis),
            ]),
          ),
        ),
      );
}

/// En-tête de section
class Titre extends StatelessWidget {
  const Titre(this.texte, {super.key, this.action});
  final String texte;
  final Widget? action;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 20, bottom: 10),
        child: Row(children: [
          Expanded(child: Text(texte, style: Theme.of(context).textTheme.titleLarge)),
          ?action,
        ]),
      );
}

/// Contenu centré et limité en largeur (tablette, ordinateur)
class Centre extends StatelessWidget {
  const Centre({super.key, required this.child, this.largeur = 760});
  final Widget child;
  final double largeur;
  @override
  Widget build(BuildContext context) => Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(constraints: BoxConstraints(maxWidth: largeur), child: child),
      );
}

/// Carte d'urgence SAMU
class CarteUrgence extends StatelessWidget {
  const CarteUrgence({super.key, required this.message, required this.onAppeler});
  final String message;
  final VoidCallback onAppeler;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: C.urgentPale, borderRadius: BorderRadius.circular(16), border: Border.all(color: C.urgent.withValues(alpha: .4))),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Row(children: [
            Icon(Icons.emergency_rounded, color: C.urgent),
            SizedBox(width: 8),
            Text('Besoin d’aide urgente', style: TextStyle(fontWeight: FontWeight.w900, color: C.urgent, fontSize: 16)),
          ]),
          const SizedBox(height: 8),
          Text(message),
          const SizedBox(height: 12),
          FilledButton.icon(
            style: FilledButton.styleFrom(backgroundColor: C.urgent),
            onPressed: onAppeler,
            icon: const Icon(Icons.call),
            label: const Text('Appeler le SAMU — 1515'),
          ),
        ]),
      );
}

const libellesTroubles = {
  'TSA': 'Autisme', 'TDAH': 'TDAH', 'DI': 'Déficience intellectuelle', 'LANGAGE': 'Langage', 'DYS': 'Dys',
  'MOTEUR': 'Moteur', 'EPILEPSIE': 'Épilepsie', 'DEPRESSION': 'Dépression', 'ANXIETE': 'Anxiété',
  'ADDICTION': 'Addictions', 'PSYCHIATRIE_ADULTE': 'Psychiatrie adulte',
};

const libellesTypes = {
  'HOPITAL': 'Hôpital', 'CENTRE_SANTE': 'Centre de santé', 'CENTRE_SPECIALISE': 'Centre spécialisé',
  'ECOLE_INCLUSIVE': 'École inclusive', 'ECOLE_SPECIALISEE': 'École spécialisée', 'CABINET': 'Cabinet',
  'ASSOCIATION': 'Association', 'CENTRE_ADDICTOLOGIE': 'Addictologie',
};
