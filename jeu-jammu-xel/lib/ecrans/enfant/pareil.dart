import 'package:flutter/material.dart';

import '../../core/etat.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';
import 'coin_enfants.dart';
import 'manche.dart';

const objets = ['p_theiere', 'p_mouton', 'p_ballon', 'p_car', 'p_mangue', 'p_poisson', 'p_calebasse', 'p_tambour', 'p_baobab'];

/// Trouver la même image (objets du quotidien sénégalais).
/// Niveau 1 : 2 propositions ; 2 : 3 ; 3 : 4 ; 4 : 5.
class JeuPareil extends StatefulWidget {
  const JeuPareil({super.key});
  @override
  State<JeuPareil> createState() => _JeuPareilState();
}

class _JeuPareilState extends State<JeuPareil> with Manches {
  late String modele;
  List<String> choix = [];

  @override
  String get jeu => 'pareil';
  @override
  String get consigneManche => 'p_consigne';

  @override
  void nouvelleManche() {
    final n = (niveau + 1).clamp(2, 5);
    final melange = [...objets]..shuffle(hasard);
    choix = melange.take(n).toList();
    modele = choix[hasard.nextInt(n)];
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
    final taille = d.u * (choix.length > 3 ? 24 : 30);
    return CadreJeu(
      titre: 'act_pareil',
      consigne: fini ? 'fini' : 'p_consigne',
      fondCouleur: const Color(0xFFE4EBCB),
      child: fini
          ? ecranFin()
          : Row(
              children: [
                // Le modèle, à gauche, dans un cadre doré
                Padding(
                  padding: EdgeInsets.all(d.u * 4),
                  child: GestureDetector(
                    onTap: () => e.dire(modele),
                    child: Container(
                      width: d.u * 40,
                      height: d.u * 40,
                      decoration: encadre(fond: C.ocre, rayon: d.u * 5, ombre: d.u, trait: d.u * 0.6),
                      padding: EdgeInsets.all(d.u * 3),
                      child: Image.asset(sprite(modele), semanticLabel: e.t(modele)),
                    ),
                  ),
                ),
                Expanded(
                  child: Center(
                    child: Wrap(
                      spacing: d.u * 3,
                      runSpacing: d.u * 3,
                      alignment: WrapAlignment.center,
                      children: [
                        for (final o in choix)
                          CarteImage(
                            image: o,
                            libelle: e.t(o),
                            taille: taille,
                            etat: reussi && o == modele
                                ? EtatCarte.juste
                                : aider && o == modele
                                ? EtatCarte.aide
                                : reussi
                                ? EtatCarte.estompe
                                : EtatCarte.normal,
                            onTap: () {
                              e.dire(o);
                              Future<void>.delayed(const Duration(milliseconds: 600), () {
                                if (mounted) repondre(juste: o == modele, nom: o);
                              });
                            },
                          ),
                      ],
                    ),
                  ),
                ),
                if (reussi)
                  Padding(
                    padding: EdgeInsets.only(right: d.u * 3),
                    child: const Bravo(cle: 'bravo'),
                  ),
              ],
            ),
    );
  }
}
