import 'package:flutter/material.dart';

import '../../core/etat.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';
import 'emotions.dart';
import 'je_parle.dart';
import 'journee.dart';
import 'pareil.dart';
import 'respirer.dart';

/// Espace enfant : cinq jeux, tout se comprend à la voix et en images.
/// On n'en sort qu'en gardant le doigt appuyé (protection contre les sorties
/// accidentelles), comme sur les applications d'éducation spécialisée.
class CoinEnfants extends StatefulWidget {
  const CoinEnfants({super.key});
  @override
  State<CoinEnfants> createState() => _CoinEnfantsState();
}

class _CoinEnfantsState extends State<CoinEnfants> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => EtatScope.lire(context).dire('enfant_accueil'));
  }

  @override
  Widget build(BuildContext context) {
    final e = EtatScope.of(context);
    final d = D.of(context);
    final jeux = <(String, String, Widget)>[
      ('act_emotions', 't_emotions', const JeuEmotions()),
      ('act_journee', 't_journee', const JeuJournee()),
      ('act_pareil', 't_pareil', const JeuPareil()),
      ('act_parler', 't_parler', const JeParle()),
      ('act_respirer', 't_respirer', const Respirer()),
    ];
    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: const Color(0xFFDCE3C2),
        body: SafeArea(
          child: Column(
            children: [
              Padding(
                padding: EdgeInsets.fromLTRB(d.u * 3, d.u * 3, d.u * 3, 0),
                child: Row(
                  children: [
                    MaintenirPourQuitter(quitter: () => Navigator.of(context).pop()),
                    SizedBox(width: d.u * 3),
                    Expanded(child: Txt(e.t('enfant_accueil'), taille: 7, gras: true)),
                    Reecouter('enfant_accueil', taille: 12),
                  ],
                ),
              ),
              Expanded(
                child: Center(
                  child: Wrap(
                    alignment: WrapAlignment.center,
                    spacing: d.u * 4,
                    runSpacing: d.u * 3,
                    children: [
                      for (final (cle, image, page) in jeux)
                        Semantics(
                          button: true,
                          label: e.t(cle),
                          child: GestureDetector(
                            onTap: () {
                              e.dire(cle);
                              Navigator.of(context).push(versPage(context, page));
                            },
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Container(
                                  width: d.u * 30,
                                  height: d.u * 30,
                                  decoration: encadre(fond: C.blanc, rayon: d.u * 6, ombre: d.u, trait: d.u * 0.5),
                                  padding: EdgeInsets.all(d.u * 2),
                                  child: Image.asset(sprite(image)),
                                ),
                                SizedBox(height: d.u * 1.5),
                                Txt(e.t(cle), taille: 5.5, gras: true),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Cadre commun des jeux de l'espace enfant.
class CadreJeu extends StatelessWidget {
  const CadreJeu({super.key, required this.titre, required this.consigne, required this.child, this.fondCouleur = const Color(0xFFF3E7C9)});
  final String titre;
  final String consigne;
  final Widget child;
  final Color fondCouleur;
  @override
  Widget build(BuildContext context) {
    final e = EtatScope.of(context);
    final d = D.of(context);
    return Scaffold(
      backgroundColor: fondCouleur,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: EdgeInsets.fromLTRB(d.u * 3, d.u * 2.5, d.u * 3, 0),
              child: Row(
                children: [
                  const BoutonRetour(),
                  SizedBox(width: d.u * 3),
                  Expanded(child: Txt(e.t(consigne), taille: 6, gras: true, max: 2)),
                  Reecouter(consigne, taille: 11),
                ],
              ),
            ),
            Expanded(child: child),
          ],
        ),
      ),
    );
  }
}
