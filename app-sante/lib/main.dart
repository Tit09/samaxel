import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'core/config.dart';
import 'core/maison.dart';
import 'core/routeur.dart';
import 'core/stockage.dart';
import 'core/theme.dart';
import 'widgets/appel_entrant.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('fr_FR');
  AppConfig.serveurPersonnalise = await Stockage.lire(Stockage.kServeur);
  runApp(const ProviderScope(child: SamaXhelApp()));
}

class SamaXhelApp extends ConsumerWidget {
  const SamaXhelApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'SAMA XHEL Santé',
      debugShowCheckedModeBanner: false,
      // Chaque hôpital a sa couleur : on « sent » dans quelle maison on se trouve
      theme: construireTheme(accent: ref.watch(teinteActiveProvider) ?? C.vert),
      routerConfig: ref.watch(routeurProvider),
      locale: const Locale('fr', 'FR'),
      supportedLocales: const [Locale('fr', 'FR'), Locale('en')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      // Respecte la taille de texte choisie par l'utilisateur, avec une limite
      builder: (context, child) {
        final mq = MediaQuery.of(context);
        return MediaQuery(
          data: mq.copyWith(textScaler: mq.textScaler.clamp(minScaleFactor: 1.0, maxScaleFactor: 1.4)),
          // Appels audio/vidéo entrants : la sonnerie s'affiche par-dessus n'importe quel écran
          child: AppelsEntrants(child: child!),
        );
      },
    );
  }
}
