import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api.dart';
import 'config.dart';
import 'session.dart';

/// Établissement vu par son portail (API /portails).
class Etablissement {
  Etablissement({
    this.id,
    required this.code,
    required this.nom,
    this.sigle,
    required this.type,
    required this.region,
    this.commune,
    this.adresse,
    this.telephone,
    this.horaires,
    this.logoUrl,
    this.couleur,
    required this.enLigne,
    this.parentCode,
    this.parentNom,
    this.distanceKm,
    this.publics = const [],
    this.troubles = const [],
    this.fiabilite,
    this.latitude,
    this.longitude,
    this.inscriptionStatut,
    this.inscriptionService,
  });

  final String? id;
  final String code;
  final String nom;
  final String? sigle;
  final String type;
  final String region;
  final String? commune;
  final String? adresse;
  final String? telephone;
  final String? horaires;
  final String? logoUrl;
  final String? couleur;
  final bool enLigne;
  final String? parentCode;
  final String? parentNom;
  final double? distanceKm;
  final List<String> publics;
  final List<String> troubles;
  final String? fiabilite;
  final double? latitude;
  final double? longitude;
  final String? inscriptionStatut;
  final String? inscriptionService;

  String get nomCourt => sigle != null && sigle!.length <= 14 ? sigle! : nom;

  /// Couleur de l'établissement (sinon le vert SAMA XHEL ; gris pour l'annuaire)
  Color get teinte {
    final c = couleur;
    if (c != null && RegExp(r'^#[0-9A-Fa-f]{6}$').hasMatch(c)) return Color(int.parse('FF${c.substring(1)}', radix: 16));
    return enLigne ? const Color(0xFF187A3B) : const Color(0xFF6B7A70);
  }

  /// Adresse complète du logo (servi par le backend sous /media)
  String? get logo {
    if (logoUrl == null) return null;
    if (logoUrl!.startsWith('http')) return logoUrl;
    final base = AppConfig.apiUrl.replaceFirst(RegExp(r'/api/?$'), '');
    return '$base$logoUrl';
  }

  static double? _d(dynamic v) => v == null ? null : (v is num ? v.toDouble() : double.tryParse('$v'));

  factory Etablissement.fromJson(Map<String, dynamic> j) {
    final parent = j['parent'] as Map?;
    final ins = j['inscription'] as Map?;
    return Etablissement(
      id: j['id'] as String?,
      code: j['code'] as String,
      nom: j['nom'] as String,
      sigle: j['sigle'] as String?,
      type: (j['type'] ?? '') as String,
      region: (j['region'] ?? '') as String,
      commune: j['commune'] as String?,
      adresse: j['adresse'] as String?,
      telephone: j['telephone'] as String?,
      horaires: j['horaires'] as String?,
      logoUrl: j['logo_url'] as String?,
      couleur: j['couleur'] as String?,
      enLigne: j['en_ligne'] == true,
      parentCode: parent?['code'] as String?,
      parentNom: parent?['nom'] as String?,
      distanceKm: _d(j['distance_km']),
      publics: List<String>.from(j['publics'] ?? const []),
      troubles: List<String>.from(j['troubles'] ?? const []),
      fiabilite: j['fiabilite'] as String?,
      latitude: _d(j['latitude']),
      longitude: _d(j['longitude']),
      inscriptionStatut: ins?['statut'] as String?,
      inscriptionService: ins?['service'] as String?,
    );
  }
}

class ServiceEtab {
  ServiceEtab(this.code, this.nom, this.specialite);
  final String code;
  final String nom;
  final String? specialite;
}

class Portail {
  Portail(this.etablissement, this.services, this.rattaches, this.actions);
  final Etablissement etablissement;
  final List<ServiceEtab> services;
  final List<Etablissement> rattaches;
  final Map<String, dynamic> actions;
}

/// Filtres de la recherche « Où êtes-vous suivi ? »
typedef FiltresPortails = ({String q, String? public, bool? enLigne, double? lat, double? lng});

final portailsProvider = FutureProvider.autoDispose.family<List<Etablissement>, FiltresPortails>((ref, f) async {
  final r = await Api.instance.get('/portails', public: true, query: {
    if (f.q.isNotEmpty) 'q': f.q,
    'public': f.public,
    if (f.enLigne != null) 'en_ligne': '${f.enLigne}',
    'lat': f.lat,
    'lng': f.lng,
    'limit': 100,
  });
  return ((r['etablissements'] as List?) ?? []).map((e) => Etablissement.fromJson(Map<String, dynamic>.from(e))).toList();
});

final portailProvider = FutureProvider.autoDispose.family<Portail, String>((ref, code) async {
  final r = await Api.instance.get('/portails/$code', public: true);
  return Portail(
    Etablissement.fromJson(Map<String, dynamic>.from(r['etablissement'])),
    ((r['services'] as List?) ?? []).map((s) => ServiceEtab(s['code'], s['nom'], s['specialite'])).toList(),
    ((r['rattaches'] as List?) ?? []).map((e) => Etablissement.fromJson(Map<String, dynamic>.from(e))).toList(),
    Map<String, dynamic>.from(r['actions'] ?? {}),
  );
});

/// Les établissements de la famille connectée (« abonnements »)
/// Établissements partenaires (pour « Où ? » dans les demandes de rendez-vous)
final partenairesProvider = FutureProvider.autoDispose<List<Etablissement>>((ref) async {
  final r = await Api.instance.get('/portails', public: true, query: {'en_ligne': 'true', 'limit': 100});
  return ((r['etablissements'] as List?) ?? []).map((e) => Etablissement.fromJson(Map<String, dynamic>.from(e))).toList();
});

final mesEtablissementsProvider = FutureProvider.autoDispose<List<Etablissement>>((ref) async {
  final u = ref.watch(utilisateurProvider);
  if (u == null || !u.estParent) return [];
  final r = await Api.instance.get('/moi/etablissements');
  return ((r['etablissements'] as List?) ?? []).map((e) => Etablissement.fromJson(Map<String, dynamic>.from(e))).toList();
});

/// État des canaux de notification (Profil > Notifications)
final canauxProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  ref.watch(utilisateurProvider);
  return Api.instance.get('/moi/canaux');
});
