import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/etat.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';

/// Annuaire des structures de santé mentale (site SAMA XHEL).
/// Le jeu ne transmet rien : il ouvre seulement le navigateur du téléphone.
const adresseAnnuaire = 'https://sama-xhel.onrender.com/#trouver';

/// Version web (servie par le serveur SAMA XHEL sous /jeu/) : l'annuaire est sur le même site.
Uri lienAnnuaire() => kIsWeb ? Uri.base.resolve('/#trouver') : Uri.parse(adresseAnnuaire);

Future<void> trouverStructure(BuildContext context) async {
  final e = EtatScope.lire(context);
  await e.dire('trouver_structure_voix');
  await launchUrl(lienAnnuaire(), mode: kIsWeb ? LaunchMode.platformDefault : LaunchMode.externalApplication);
}

const fiches = ['autisme', 'tdah', 'depression', 'memoire', 'addiction'];
const iconesFiches = {'autisme': 'i_infini', 'tdah': 'j_jouer', 'depression': 'i_lanterne', 'memoire': 'i_cadre', 'addiction': 'c_aide'};

/// Maison des ressources : reconnaître les signes et savoir quand consulter.
class Ressources extends StatefulWidget {
  const Ressources({super.key});
  @override
  State<Ressources> createState() => _RessourcesState();
}

class _RessourcesState extends State<Ressources> {
  String choisie = 'autisme';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => EtatScope.lire(context).dire('lieu_ressources'));
  }

  @override
  Widget build(BuildContext context) {
    final e = EtatScope.of(context);
    final d = D.of(context);
    return Scaffold(
      body: Scene(
        image: 'ressources',
        voile: 0.35,
        child: Column(
          children: [
            Entete(titre: e.t('signes_titre'), image: 'i_maisonI', retour: () => Navigator.of(context).pop(), actions: const []),
            Expanded(
              child: Padding(
                padding: EdgeInsets.all(d.u * 3),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Liste des fiches
                    SizedBox(
                      width: d.u * 55,
                      child: ListView(
                        children: [
                          for (final f in fiches)
                            Padding(
                              padding: EdgeInsets.only(bottom: d.u * 1.5),
                              child: GrosBouton(
                                cle: 's_${f}_t',
                                image: iconesFiches[f],
                                taille: 4.4,
                                fond: choisie == f ? C.ocre : C.blanc,
                                action: () => setState(() => choisie = f),
                              ),
                            ),
                        ],
                      ),
                    ),
                    SizedBox(width: d.u * 3),
                    // Fiche détaillée
                    Expanded(
                      child: Container(
                        decoration: encadre(rayon: d.u * 4, ombre: d.u, trait: d.u * 0.5),
                        padding: EdgeInsets.all(d.u * 3),
                        child: ListView(
                          children: [
                            Row(
                              children: [
                                Image.asset(sprite(iconesFiches[choisie]!), width: d.u * 10),
                                SizedBox(width: d.u * 2),
                                Expanded(child: Txt(e.t('s_${choisie}_t'), taille: 6.5, gras: true)),
                              ],
                            ),
                            SizedBox(height: d.u * 2),
                            _Bloc(titre: 's_signes', cle: 's_${choisie}_s', couleur: C.carte),
                            SizedBox(height: d.u * 2),
                            _Bloc(titre: 's_quand', cle: 's_${choisie}_c', couleur: const Color(0xFFE4EBCB)),
                            SizedBox(height: d.u * 2),
                            Row(
                              children: [
                                Icon(Icons.info_outline_rounded, size: d.u * 6, color: C.encre),
                                SizedBox(width: d.u),
                                Expanded(child: Txt(e.t('signes_avert'), taille: 3.6)),
                                Reecouter('signes_avert', taille: 8),
                              ],
                            ),
                            SizedBox(height: d.u * 2),
                            GrosBouton(
                              cle: 'trouver_structure',
                              image: 'i_maisonI',
                              fond: C.neem,
                              couleurTexte: C.blanc,
                              taille: 4.4,
                              lire: false,
                              action: () => trouverStructure(context),
                            ),
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
    );
  }
}

class _Bloc extends StatelessWidget {
  const _Bloc({required this.titre, required this.cle, required this.couleur});
  final String titre;
  final String cle;
  final Color couleur;
  @override
  Widget build(BuildContext context) {
    final e = EtatScope.of(context);
    final d = D.of(context);
    return Container(
      decoration: encadre(fond: couleur, rayon: d.u * 3, ombre: 0, trait: d.u * 0.35),
      padding: EdgeInsets.all(d.u * 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Txt(e.t(titre), taille: 4.6, gras: true, couleur: C.laterite),
                SizedBox(height: d.u * 0.5),
                Txt(e.t(cle), taille: 4.4),
              ],
            ),
          ),
          SizedBox(width: d.u),
          Reecouter(cle, taille: 9),
        ],
      ),
    );
  }
}
