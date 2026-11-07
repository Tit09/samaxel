import 'package:flutter/material.dart';

import '../../core/etat.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';
import 'coin_enfants.dart';
import 'manche.dart';

const emotions = ['content', 'triste', 'fache', 'peur'];
const visages = ['amadou', 'awa', 'modou'];

/// Reconnaître une émotion sur un visage.
/// Niveau 1 : 2 visages ; niveau 2 : 3 ; niveaux 3-4 : 4.
class JeuEmotions extends StatefulWidget {
  const JeuEmotions({super.key});
  @override
  State<JeuEmotions> createState() => _JeuEmotionsState();
}

class _JeuEmotionsState extends State<JeuEmotions> with Manches {
  late String cible;
  late String qui;
  List<String> choix = [];
  String? touche;

  @override
  String get jeu => 'emotions';
  @override
  String get consigneManche => 'emo_trouve_$cible';

  @override
  void nouvelleManche() {
    final n = (niveau + 1).clamp(2, 4);
    final melange = [...emotions]..shuffle(hasard);
    choix = melange.take(n).toList();
    cible = choix[hasard.nextInt(n)];
    qui = visages[hasard.nextInt(visages.length)];
    touche = null;
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => demarrer());
  }

  @override
  Widget build(BuildContext context) {
    final e = EtatScope.of(context);
    final d = D.of(context);
    if (choix.isEmpty) return const SizedBox();
    return CadreJeu(
      titre: 'act_emotions',
      consigne: fini ? 'fini' : consigneManche,
      fondCouleur: const Color(0xFFF7E6BE),
      child: fini
          ? ecranFin()
          : Column(
              children: [
                Expanded(
                  child: Center(
                    child: Wrap(
                      spacing: d.u * 4,
                      runSpacing: d.u * 3,
                      alignment: WrapAlignment.center,
                      children: [
                        for (final emo in choix)
                          Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              CarteImage(
                                image: 'v_${qui}_$emo',
                                libelle: e.t('emo_nom_$emo'),
                                taille: d.u * (choix.length > 3 ? 30 : 36),
                                etat: reussi && emo == cible
                                    ? EtatCarte.juste
                                    : aider && emo == cible
                                    ? EtatCarte.aide
                                    : reussi
                                    ? EtatCarte.estompe
                                    : EtatCarte.normal,
                                onTap: () {
                                  setState(() => touche = emo);
                                  e.dire('emo_nom_$emo');
                                  Future<void>.delayed(const Duration(milliseconds: 700), () {
                                    if (mounted) repondre(juste: emo == cible, nom: emo);
                                  });
                                },
                              ),
                              SizedBox(height: d.u),
                              if (reussi && emo == cible || touche == emo) Txt(e.t('emo_nom_$emo'), taille: 5, gras: true),
                            ],
                          ),
                      ],
                    ),
                  ),
                ),
                if (reussi)
                  Padding(
                    padding: EdgeInsets.only(bottom: d.u * 3),
                    child: const Bravo(cle: 'bravo'),
                  ),
              ],
            ),
    );
  }
}
