import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api.dart';
import 'modeles.dart';
import 'session.dart';

final _api = Api.instance;

List<T> _liste<T>(dynamic l, T Function(Map<String, dynamic>) f) =>
    ((l as List?) ?? []).map((e) => f(Map<String, dynamic>.from(e))).toList();

/// Les données dépendent de l'utilisateur et de sa structure active :
/// un changement de session invalide automatiquement tout le cache.
final _cleSession = Provider<String>((ref) {
  final u = ref.watch(utilisateurProvider);
  return '${u?.id}:${u?.structureId}:${u?.role}';
});

/// Battement de 30 s : les listes qui changent du fait des AUTRES (messages, notifications,
/// rendez-vous) se rafraîchissent seules, sans tirer l'écran vers le bas.
/// Économie de batterie et de données : AUCUN rafraîchissement quand l'application est en arrière-plan
/// (écran éteint, autre application) ; les rappels importants arrivent alors par notification / SMS.
final _battement = StreamProvider<int>((ref) => Stream.periodic(const Duration(seconds: 30), (i) => i)
    .where((_) => WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed));

// ── Parent / commun ─────────────────────────────────────────────────────────
final enfantsProvider = FutureProvider.autoDispose<List<Enfant>>((ref) async {
  ref.watch(_cleSession);
  final r = await _api.get('/enfants');
  return _liste(r['enfants'], Enfant.fromJson);
});

final enfantDetailProvider = FutureProvider.autoDispose.family<({Enfant enfant, List<Suivi> suivis}), String>((ref, id) async {
  ref.watch(_cleSession);
  final r = await _api.get('/enfants/$id');
  return (enfant: Enfant.fromJson(r['enfant']), suivis: _liste(r['suivis'], Suivi.fromJson));
});

final depistagesProvider = FutureProvider.autoDispose.family<List<Depistage>, String?>((ref, enfantId) async {
  ref.watch(_cleSession);
  final r = await _api.get('/depistages', query: {'enfant_id': enfantId});
  return _liste(r['depistages'], Depistage.fromJson);
});

final consultationsProvider = FutureProvider.autoDispose.family<List<Consultation>, String?>((ref, enfantId) async {
  ref.watch(_cleSession);
  final r = await _api.get('/consultations', query: {'enfant_id': enfantId});
  return _liste(r['consultations'], Consultation.fromJson);
});

final questionnairesProvider = FutureProvider.autoDispose.family<List<Questionnaire>, int?>((ref, ageMois) async {
  final r = await _api.get('/questionnaires', query: {'age_mois': ageMois}, public: true);
  return _liste(r['questionnaires'], Questionnaire.fromJson);
});

final questionnaireProvider = FutureProvider.autoDispose.family<Questionnaire, String>((ref, code) async {
  final r = await _api.get('/questionnaires/$code', public: true);
  return Questionnaire.fromJson(r['questionnaire']);
});

typedef FiltreStructures = ({String? q, String? trouble, String? region, String? type, double? lat, double? lng});

final structuresProvider = FutureProvider.autoDispose.family<List<Structure>, FiltreStructures>((ref, f) async {
  final r = await _api.get('/structures', query: {
    'q': f.q, 'trouble': f.trouble, 'region': f.region, 'type': f.type, 'lat': f.lat, 'lng': f.lng, 'limit': 200,
  }, public: true);
  return _liste(r['structures'], Structure.fromJson);
});

final structureProvider = FutureProvider.autoDispose.family<Structure, String>((ref, id) async {
  final r = await _api.get('/structures/$id', public: true);
  return Structure.fromJson(r['structure']);
});

final regionsProvider = FutureProvider<List<String>>((ref) async {
  final r = await _api.get('/structures/meta', public: true);
  return ((r['regions'] as List?) ?? []).map((e) => e.toString()).toList();
});

final professionnelsProvider = FutureProvider.autoDispose.family<List<Map<String, dynamic>>, String>((ref, structureId) async {
  final r = await _api.get('/structures/$structureId/professionnels');
  return ((r['professionnels'] as List?) ?? []).map((e) => Map<String, dynamic>.from(e)).toList();
});

final suivisProvider = FutureProvider.autoDispose<({List<Suivi> suivis, Map<String, dynamic> resume})>((ref) async {
  ref.watch(_cleSession);
  final r = await _api.get('/suivis');
  return (suivis: _liste(r['suivis'], Suivi.fromJson), resume: Map<String, dynamic>.from(r['resume'] ?? {}));
});

final suiviDetailProvider = FutureProvider.autoDispose.family<Map<String, dynamic>, String>((ref, id) async {
  ref.watch(_cleSession);
  return _api.get('/suivis/$id');
});

final rdvProvider = FutureProvider.autoDispose<List<RendezVous>>((ref) async {
  ref.watch(_cleSession);
  ref.watch(_battement);
  final r = await _api.get('/rendez-vous');
  return _liste(r['rendez_vous'], RendezVous.fromJson);
});

final conversationsProvider = FutureProvider.autoDispose<List<Conversation>>((ref) async {
  ref.watch(_cleSession);
  ref.watch(_battement);
  final r = await _api.get('/conversations');
  return _liste(r['conversations'], Conversation.fromJson);
});

final notificationsProvider = FutureProvider.autoDispose<({List<Notif> liste, int nonLues})>((ref) async {
  ref.watch(_cleSession);
  ref.watch(_battement);
  final r = await _api.get('/notifications');
  return (liste: _liste(r['notifications'], Notif.fromJson), nonLues: (r['non_lues'] as int?) ?? 0);
});

final humeurProvider = FutureProvider.autoDispose.family<List<Map<String, dynamic>>, String?>((ref, enfantId) async {
  ref.watch(_cleSession);
  final r = await _api.get('/humeur', query: {'enfant_id': enfantId});
  return ((r['entrees'] as List?) ?? []).map((e) => Map<String, dynamic>.from(e)).toList();
});

/// Fil des messages vocaux (parent : son fil ; clinicien : vocaux d'un parent pour sa structure)
final vocauxProvider = FutureProvider.autoDispose.family<List<Map<String, dynamic>>, ({String? enfantId, String? parentId})>((ref, f) async {
  ref.watch(_cleSession);
  ref.watch(_battement);
  final r = await _api.get('/vocaux', query: {'enfant_id': f.enfantId, 'parent_id': f.parentId});
  return ((r['vocaux'] as List?) ?? []).map((e) => Map<String, dynamic>.from(e)).toList();
});

// ── Professionnels ──────────────────────────────────────────────────────────
final tableauDeBordProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  ref.watch(_cleSession);
  return _api.get('/ia/tableau-de-bord');
});

final membresProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  ref.watch(_cleSession);
  final r = await _api.get('/admin/membres');
  return ((r['membres'] as List?) ?? []).map((e) => Map<String, dynamic>.from(e)).toList();
});

final statistiquesProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  ref.watch(_cleSession);
  final r = await _api.get('/admin/statistiques');
  return Map<String, dynamic>.from(r['statistiques']);
});
