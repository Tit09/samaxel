import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api.dart';
import 'modeles.dart';
import 'portails.dart';
import 'session.dart';
import 'stockage.dart';

/// La « maison » : l'hôpital dans lequel on se trouve.
///   • personnel : toujours SON établissement (celui de la session, choisi au portail) ;
///   • famille   : l'hôpital où elle est entrée (portail, ou « Mes hôpitaux ») — elle peut
///     en rejoindre plusieurs et passer de l'un à l'autre, comme on change de bâtiment.
/// Toute l'application prend alors la couleur et le logo de cet hôpital.
class MaisonActive extends Notifier<String?> {
  @override
  String? build() {
    Future.microtask(() async {
      final c = await Stockage.lire(Stockage.kMaison);
      if (c != null && c.isNotEmpty && state == null) state = c;
    });
    return null;
  }

  Future<void> entrer(String? code) async {
    state = code;
    await Stockage.ecrire(Stockage.kMaison, code);
  }
}

/// Hôpital à ouvrir dès l'arrivée sur l'accueil (connexion ou inscription par son portail)
String? maisonAOuvrir;

final maisonActiveProvider = NotifierProvider<MaisonActive, String?>(MaisonActive.new);

Color? couleurDe(String? hex) {
  if (hex == null || !RegExp(r'^#[0-9A-Fa-f]{6}$').hasMatch(hex)) return null;
  return Color(int.parse('FF${hex.substring(1)}', radix: 16));
}

/// Couleur de l'application du PERSONNEL : celle de son établissement (toute son appli est « chez lui »).
/// Pour une famille, l'application reste SAMA XHEL ; seul l'espace de chaque hôpital prend ses couleurs.
final teinteActiveProvider = Provider<Color?>((ref) {
  final u = ref.watch(utilisateurProvider);
  if (u == null || !u.estPro) return null;
  return couleurDe(u.structureCouleur);
});

class Soignant {
  Soignant(this.id, this.nom, this.role, this.specialite);
  final String id;
  final String nom;
  final String role;
  final String? specialite;
  String get fonction => specialite?.isNotEmpty == true ? specialite! : (role == 'THERAPEUTE' ? 'thérapeute' : 'médecin');
  factory Soignant.fromJson(Map j) => Soignant(j['id'], j['nom'] ?? '', j['role'] ?? '', j['specialite']);
}

class DossierMaison {
  DossierMaison(this.id, this.numero, this.statut, this.personneId, this.personne, this.referent);
  final String id;
  final String numero;
  final String statut;
  final String personneId;
  final String personne;
  final Soignant? referent;
}

class Tarif {
  Tarif(this.id, this.code, this.libelle, this.montant, this.orientation, this.enLigne);
  final String id;
  final String code;
  final String libelle;
  final int montant;
  final String? orientation;
  final bool enLigne;
  factory Tarif.fromJson(Map j) => Tarif(j['id'], j['code'] ?? '', j['libelle'] ?? '', (j['montant'] as num).toInt(), j['orientation'], j['en_ligne'] != false);
}

String fcfa(int n) {
  final s = n.toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ' ');
  return '$s F';
}

class Ticket {
  Ticket.fromJson(Map j)
      : id = j['id'],
        numero = j['numero'] ?? '',
        statut = j['statut'] ?? '',
        montant = (j['montant'] as num?)?.toInt() ?? 0,
        mode = j['mode_paiement'] ?? '',
        tarif = j['tarif'] ?? j['tarif_libelle'] ?? '',
        orientation = j['orientation'],
        bureau = j['bureau'],
        patient = j['patient'],
        reference = j['reference'],
        qr = j['qr'],
        etablissement = (j['etablissement'] as Map?)?['nom'];
  final String id;
  final String numero;
  final String statut;
  final int montant;
  final String mode;
  final String tarif;
  final String? orientation;
  final String? bureau;
  final String? patient;
  final String? reference;
  final String? qr;
  final String? etablissement;

  String get modeLisible => const {'ESPECES': 'Espèces', 'WAVE': 'Wave', 'ORANGE_MONEY': 'Orange Money', 'GRATUIT': 'Gratuit'}[mode] ?? mode;
  String get statutLisible => const {
        'A_CONFIRMER': 'Paiement à vérifier par la caisse',
        'PAYE': 'Payé · en attente de l’appel',
        'APPELE': 'Appelé : présentez-vous',
        'EN_CONSULTATION': 'En consultation',
        'TERMINE': 'Terminé',
        'ANNULE': 'Annulé',
        'REFUSE': 'Paiement non trouvé',
      }[statut] ??
      statut;
  Color get couleur => switch (statut) {
        'A_CONFIRMER' => const Color(0xFFE07B00),
        'PAYE' => const Color(0xFF1E5AA8),
        'APPELE' => const Color(0xFFB3261E),
        'ANNULE' || 'REFUSE' => Colors.grey,
        _ => const Color(0xFF2E7D32),
      };
}

class Maison {
  Maison(this.etablissement, this.inscription, this.dossiers, this.soignants, this.rdv, this.tickets, this.tarifs, this.services);
  final Etablissement etablissement;
  final String? inscription; // DEMANDEE, ACTIVE, REFUSEE…
  final List<DossierMaison> dossiers;
  final List<Soignant> soignants;
  final List<RendezVous> rdv;
  final List<Ticket> tickets;
  final List<Tarif> tarifs;
  final List<String> services;

  bool get acceptee => inscription == 'ACTIVE';
  /// Soignants à montrer à la famille : référents de ses dossiers d'abord
  List<Soignant> get mesSoignants {
    final refs = <String, Soignant>{for (final d in dossiers) if (d.referent != null) d.referent!.id: d.referent!};
    return [...refs.values, ...soignants.where((s) => !refs.containsKey(s.id))];
  }
}

final maisonProvider = FutureProvider.autoDispose.family<Maison, String>((ref, code) async {
  final r = await Api.instance.get('/moi/etablissements/$code');
  return Maison(
    Etablissement.fromJson(Map<String, dynamic>.from(r['etablissement'])),
    (r['inscription'] as Map?)?['statut'],
    ((r['dossiers'] as List?) ?? []).map((d) => DossierMaison(
          d['id'], d['numero_dossier'] ?? '', d['statut'] ?? '', d['personne_id'], d['personne'] ?? '',
          d['referent'] == null ? null : Soignant.fromJson(d['referent']),
        )).toList(),
    ((r['soignants'] as List?) ?? []).map((s) => Soignant.fromJson(s)).toList(),
    ((r['rendez_vous'] as List?) ?? []).map((x) => RendezVous.fromJson(Map<String, dynamic>.from(x))).toList(),
    ((r['tickets'] as List?) ?? []).map((t) => Ticket.fromJson(t)).toList(),
    ((r['tarifs'] as List?) ?? []).map((t) => Tarif.fromJson(t)).toList(),
    ((r['services'] as List?) ?? []).map((s) => s['nom'] as String).toList(),
  );
});

final mesTicketsProvider = FutureProvider.autoDispose.family<List<Ticket>, String?>((ref, code) async {
  final r = await Api.instance.get('/moi/tickets', query: {'etablissement': ?code});
  return ((r['tickets'] as List?) ?? []).map((t) => Ticket.fromJson(t)).toList();
});
