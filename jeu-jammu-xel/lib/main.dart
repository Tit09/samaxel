import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'core/etat.dart';
import 'core/theme.dart';
import 'ecrans/accueil.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (!kIsWeb) {
    await SystemChrome.setPreferredOrientations([DeviceOrientation.landscapeLeft, DeviceOrientation.landscapeRight]);
    await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  }
  final etat = await Etat.charger();
  runApp(JammuXel(etat: etat));
}

class JammuXel extends StatelessWidget {
  const JammuXel({super.key, required this.etat});
  final Etat etat;
  @override
  Widget build(BuildContext context) => EtatScope(
    etat: etat,
    child: MaterialApp(title: 'JÀMMU XEL', debugShowCheckedModeBanner: false, theme: themeJammu(), home: const Accueil()),
  );
}
