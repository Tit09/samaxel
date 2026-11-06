import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';

import 'config.dart';
import 'stockage.dart';

/// Erreur de l'API, avec le message en français renvoyé par le serveur.
class ApiException implements Exception {
  ApiException(this.message, {this.code, this.status, this.details});
  final String message;
  final String? code;
  final int? status;
  final dynamic details;

  @override
  String toString() => message;
}

/// Client HTTP unique.
///  • ajoute le jeton (Authorization) et la structure active (X-Structure-Id) ;
///  • renouvelle automatiquement la session quand le jeton de 15 min expire ;
///  • traduit toutes les erreurs en [ApiException] avec un message lisible.
class Api {
  /// Change l'adresse du serveur (mode démonstration).
  void changerServeur() => _dio.options.baseUrl = '${AppConfig.apiUrl}/api';

  Api._() {
    _dio = Dio(BaseOptions(
      baseUrl: '${AppConfig.apiUrl}/api',
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 30),
      headers: {'Accept': 'application/json'},
    ));
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await Stockage.lireSecret(Stockage.kToken);
        if (token != null && options.extra['public'] != true) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        final structure = await Stockage.lire(Stockage.kStructure);
        if (structure != null) options.headers['X-Structure-Id'] = structure;
        handler.next(options);
      },
      onError: (e, handler) async {
        final code = (e.response?.data is Map) ? e.response?.data['code'] : null;
        final dejaRejoue = e.requestOptions.extra['rejoue'] == true;
        if (e.response?.statusCode == 401 && code == 'EXPIRED_TOKEN' && !dejaRejoue) {
          if (await _rafraichir()) {
            final opts = e.requestOptions..extra['rejoue'] = true;
            opts.headers['Authorization'] = 'Bearer ${await Stockage.lireSecret(Stockage.kToken)}';
            try {
              return handler.resolve(await _dio.fetch(opts));
            } on DioException catch (e2) {
              return handler.next(e2);
            }
          }
          sessionExpiree.add(null);
        }
        handler.next(e);
      },
    ));
  }

  static final Api instance = Api._();
  late final Dio _dio;

  /// Émis quand la session ne peut plus être renouvelée (retour à la connexion)
  final StreamController<void> sessionExpiree = StreamController<void>.broadcast();

  Completer<bool>? _refreshEnCours;

  /// Un seul renouvellement à la fois, même si plusieurs requêtes expirent ensemble
  Future<bool> _rafraichir() async {
    if (_refreshEnCours != null) return _refreshEnCours!.future;
    _refreshEnCours = Completer<bool>();
    var ok = false;
    try {
      final refresh = await Stockage.lireSecret(Stockage.kRefresh);
      if (refresh != null) {
        final r = await Dio(BaseOptions(baseUrl: '${AppConfig.apiUrl}/api'))
            .post('/auth/refresh', data: {'refresh_token': refresh});
        await Stockage.ecrireSecret(Stockage.kToken, r.data['token']);
        await Stockage.ecrireSecret(Stockage.kRefresh, r.data['refresh_token']);
        ok = true;
      }
    } catch (_) {
      ok = false;
    }
    _refreshEnCours!.complete(ok);
    _refreshEnCours = null;
    return ok;
  }

  Future<Map<String, dynamic>> get(String path, {Map<String, dynamic>? query, bool public = false}) =>
      _req(() => _dio.get(path, queryParameters: _nettoyer(query), options: Options(extra: {'public': public})));

  Future<Map<String, dynamic>> post(String path, [Object? data]) => _req(() => _dio.post(path, data: data));

  Future<Map<String, dynamic>> put(String path, [Object? data]) => _req(() => _dio.put(path, data: data));

  Future<Map<String, dynamic>> delete(String path) => _req(() => _dio.delete(path));

  /// Envoi d'un fichier audio brut (messages vocaux)
  Future<Map<String, dynamic>> envoyerAudio(String path, Uint8List octets, String type, {Map<String, dynamic>? query}) =>
      _req(() => _dio.post(path,
          data: octets,
          queryParameters: _nettoyer(query),
          options: Options(
            contentType: type,
            sendTimeout: const Duration(seconds: 90),
            receiveTimeout: const Duration(seconds: 90),
          )));

  /// Téléchargement d'un fichier (écoute d'un vocal)
  Future<({Uint8List octets, String type})> telecharger(String path) async {
    try {
      final r = await _dio.get<List<int>>(path, options: Options(responseType: ResponseType.bytes));
      return (octets: Uint8List.fromList(r.data!), type: r.headers.value(Headers.contentTypeHeader) ?? 'audio/wav');
    } on DioException catch (e) {
      throw _traduire(e);
    }
  }

  Map<String, dynamic>? _nettoyer(Map<String, dynamic>? q) =>
      q == null ? null : (Map.of(q)..removeWhere((_, v) => v == null || v == ''));

  Future<Map<String, dynamic>> _req(Future<Response> Function() appel) async {
    try {
      final r = await appel();
      final d = r.data;
      if (d is Map<String, dynamic>) return d;
      return {'data': d};
    } on DioException catch (e) {
      throw _traduire(e);
    }
  }

  ApiException _traduire(DioException e) {
    final d = e.response?.data;
    if (d is Map && d['error'] != null) {
      return ApiException(d['error'].toString(), code: d['code']?.toString(), status: e.response?.statusCode, details: d['details']);
    }
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.connectionError:
        return ApiException(
            'Le serveur SAMA XHEL ne répond pas (${Uri.parse(AppConfig.apiUrl).authority}). '
            'Vérifiez votre connexion. En test sans hébergement : touchez « Serveur de test » sur l’écran d’accueil '
            'et saisissez l’adresse de l’ordinateur (même Wi-Fi).',
            code: 'SERVEUR_INJOIGNABLE');
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.sendTimeout:
        return ApiException('La connexion est trop lente. Vérifiez votre réseau et réessayez.', code: 'TIMEOUT');
      default:
        return ApiException('Une erreur est survenue. Réessayez.', status: e.response?.statusCode);
    }
  }
}
