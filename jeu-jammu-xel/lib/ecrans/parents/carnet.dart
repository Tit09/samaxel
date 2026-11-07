import 'package:flutter/material.dart';

import '../../core/etat.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';
import 'ressources.dart';

const iconesObs = {'obs_voitures': 'p_car', 'obs_prenom': 'c_oui', 'obs_bruit': 'c_bruit', 'obs_mots': 't_parler'};

/// Carnet de l'accompagnant : des faits, pas des étiquettes.
/// Il reste sur le téléphone et s'efface d'un geste.
class Carnet extends StatelessWidget {
  const Carnet({super.key});
  @override
  Widget build(BuildContext context) {
    final e = EtatScope.of(context);
    final d = D.of(context);
    final obs = iconesObs.keys.where(e.carnet.contains).toList();
    return Scaffold(
      backgroundColor: const Color(0xFFC98B47),
      body: SafeArea(
        child: Padding(
          padding: EdgeInsets.all(d.u * 3),
          child: Container(
            decoration: encadre(fond: C.laterite, rayon: d.u * 4, ombre: 0, trait: d.u * 0.5),
            padding: EdgeInsets.all(d.u * 2),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Page de gauche : les observations
                Expanded(
                  child: _Page(
                    children: [
                      Row(
                        children: [
                          const BoutonRetour(taille: 9),
                          SizedBox(width: d.u * 2),
                          Expanded(child: Txt(e.t('carnet_titre'), taille: 6, gras: true)),
                        ],
                      ),
                      SizedBox(height: d.u * 2),
                      if (obs.isEmpty)
                        Row(
                          children: [
                            Expanded(child: Txt(e.t('carnet_vide'), taille: 4.6)),
                            Reecouter('carnet_vide', taille: 8),
                          ],
                        )
                      else
                        for (final o in obs)
                          Padding(
                            padding: EdgeInsets.only(bottom: d.u * 1.5),
                            child: Container(
                              decoration: encadre(rayon: d.u * 2.5, ombre: 0, trait: d.u * 0.4),
                              padding: EdgeInsets.all(d.u * 1.4),
                              child: Row(
                                children: [
                                  Image.asset(sprite(iconesObs[o]!), width: d.u * 10),
                                  SizedBox(width: d.u * 1.5),
                                  Expanded(child: Txt(e.t(o), taille: 4.3)),
                                  Reecouter(o, taille: 8),
                                ],
                              ),
                            ),
                          ),
                    ],
                  ),
                ),
                Container(width: d.u * 2, color: C.encre),
                // Page de droite : préparer le rendez-vous
                Expanded(
                  child: _Page(
                    children: [
                      Container(
                        decoration: encadre(fond: C.papier, rayon: d.u * 2.5, ombre: 0, trait: d.u * 0.4),
                        padding: EdgeInsets.all(d.u * 2),
                        child: Row(
                          children: [
                            Icon(Icons.search_rounded, size: d.u * 8, color: C.encre),
                            SizedBox(width: d.u * 1.5),
                            Expanded(child: Txt(e.t('carnet_avertissement'), taille: 4.3, gras: true)),
                            Reecouter('carnet_avertissement', taille: 8),
                          ],
                        ),
                      ),
                      SizedBox(height: d.u * 2),
                      GrosBouton(
                        cle: 'trouver_structure',
                        image: 'i_maisonI',
                        fond: C.neem,
                        couleurTexte: C.blanc,
                        taille: 4.6,
                        lire: false,
                        action: () => trouverStructure(context),
                      ),
                      SizedBox(height: d.u * 2),
                      Row(
                        children: [
                          Expanded(child: Txt(e.t('carnet_local'), taille: 3.8)),
                          Reecouter('carnet_local', taille: 8),
                        ],
                      ),
                      SizedBox(height: d.u * 1.5),
                      if (obs.isNotEmpty)
                        Align(
                          alignment: Alignment.centerLeft,
                          child: TextButton.icon(
                            onPressed: () {
                              e.dire('carnet_effacer');
                              e.effacerCarnet();
                            },
                            icon: Icon(Icons.delete_outline_rounded, color: C.laterite, size: d.u * 6),
                            label: Txt(e.t('carnet_effacer'), taille: 4.2, gras: true, couleur: C.laterite),
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Page extends StatelessWidget {
  const _Page({required this.children});
  final List<Widget> children;
  @override
  Widget build(BuildContext context) {
    final d = D.of(context);
    return Container(
      decoration: BoxDecoration(
        color: C.carte,
        borderRadius: BorderRadius.circular(d.u * 2),
        border: Border.all(color: C.encre, width: d.u * 0.4),
      ),
      padding: EdgeInsets.all(d.u * 2.5),
      child: ListView(children: children),
    );
  }
}
