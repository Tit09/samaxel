import 'package:dio/dio.dart';
import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/config.dart';
import '../core/stockage.dart';
import '../core/theme.dart';
import 'communs.dart';

/// Vrai pour une version de démonstration (aucune adresse de production compilée dans l'app).
bool get modeDemonstration => const String.fromEnvironment('API_URL').isEmpty;

/// Saisie de l'adresse du serveur pour tester sans hébergement :
/// le backend tourne sur l'ordinateur, le téléphone est sur le même Wi-Fi.
Future<void> choisirServeur(BuildContext context) async {
  final ctrl = TextEditingController(text: AppConfig.apiUrl);
  final r = await showDialog<String>(
    context: context,
    builder: (ctx) => _DialogueServeur(ctrl: ctrl),
  );
  if (r == null) return;
  final valide = r.isEmpty || RegExp(r'^https?://[^\s/]+(:\d+)?$').hasMatch(r);
  if (!valide) {
    if (context.mounted) toast(context, 'Adresse invalide (ex. http://192.168.1.20:3001)', erreur: true);
    return;
  }
  AppConfig.serveurPersonnalise = r.isEmpty ? null : r;
  await Stockage.ecrire(Stockage.kServeur, r.isEmpty ? null : r);
  Api.instance.changerServeur();
  if (context.mounted) toast(context, 'Serveur : ${AppConfig.apiUrl}');
}

class _DialogueServeur extends StatefulWidget {
  const _DialogueServeur({required this.ctrl});
  final TextEditingController ctrl;
  @override
  State<_DialogueServeur> createState() => _DialogueServeurState();
}

class _DialogueServeurState extends State<_DialogueServeur> {
  String? _resultat;
  bool _ok = false;
  bool _test = false;

  Future<void> _tester() async {
    setState(() { _test = true; _resultat = null; });
    final url = widget.ctrl.text.trim().replaceAll(RegExp(r'/+$'), '');
    try {
      final r = await Dio(BaseOptions(connectTimeout: const Duration(seconds: 5), receiveTimeout: const Duration(seconds: 5))).get('$url/health');
      _ok = r.statusCode == 200;
      _resultat = _ok ? 'Le serveur répond.' : 'Réponse inattendue (${r.statusCode}).';
    } catch (_) {
      _ok = false;
      _resultat = 'Aucune réponse. Vérifiez que le backend tourne sur l’ordinateur, que le téléphone est sur le même Wi-Fi et que le pare-feu autorise le port 3001.';
    }
    if (mounted) setState(() => _test = false);
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Adresse du serveur'),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Test sans hébergement : tapez l’adresse de l’ordinateur où tourne SAMA XHEL (affichée par le script de démarrage), sur le même Wi-Fi.'),
          const SizedBox(height: 12),
          TextField(
            controller: widget.ctrl,
            keyboardType: TextInputType.url,
            decoration: const InputDecoration(hintText: 'http://192.168.1.20:3001'),
          ),
          const SizedBox(height: 8),
          if (_test) const LinearProgressIndicator(),
          if (_resultat != null)
            Text(_resultat!, style: TextStyle(color: _ok ? C.vert : Colors.red.shade700, fontWeight: FontWeight.w700)),
        ]),
        actions: [
          TextButton(onPressed: _test ? null : _tester, child: const Text('Tester')),
          TextButton(onPressed: () => Navigator.pop(context, ''), child: const Text('Par défaut')),
          FilledButton(onPressed: () => Navigator.pop(context, widget.ctrl.text.trim().replaceAll(RegExp(r'/+$'), '')), child: const Text('Enregistrer')),
        ],
      );
}
