import 'package:flutter/material.dart';

import '../../core/etat.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';
import 'coin_enfants.dart';
import 'manche.dart';

const journee = ['j_reveil', 'j_laver', 'j_habiller', 'j_manger', 'j_ecole', 'j_jouer', 'j_dormir'];

/// Remettre les moments de la journée dans l'ordre (emploi du temps visuel,
/// très utilisé avec les enfants autistes). On touche les images une à une :
/// pas de glisser-déposer, plus facile pour la motricité fine.
/// Niveau 1 : 2 images ; 2 : 3 ; 3 : 4 ; 4 : 5.
class JeuJournee extends StatefulWidget {
  const JeuJournee({super.key});
  @override
  State<JeuJournee> createState() => _JeuJourneeState();
}

class _JeuJourneeState extends State<JeuJournee> with Manches {
  List<String> suite = [];
  List<String> cartes = [];
  final List<String> placees = [];
  int erreursManche = 0;

  @override
  String get jeu => 'journee';
  @override
  String get consigneManche => placees.isEmpty ? 'j_consigne' : 'j_ensuite';

  @override
  void nouvelleManche() {
    final n = (niveau + 1).clamp(2, 5);
    final debut = hasard.nextInt(journee.length - n + 1);
    suite = journee.sublist(debut, debut + n);
    cartes = [...suite]..shuffle(hasard);
    if (cartes.join() == suite.join() && n > 1) cartes = cartes.reversed.toList();
    placees.clear();
    erreursManche = 0;
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => demarrer());
  }

  void toucher(String c) {
    final e = EtatScope.lire(context);
    if (reussi || placees.contains(c)) return;
    e.dire(c);
    final attendu = suite[placees.length];
    if (c == attendu) {
      setState(() {
        placees.add(c);
        erreurs = 0;
      });
      e.ding();
      if (placees.length == suite.length) {
        erreurs = erreursManche; // l'IA adaptative compte les erreurs de toute la manche
        Future<void>.delayed(const Duration(milliseconds: 700), () {
          if (mounted) repondre(juste: true, nom: c);
        });
      } else {
        Future<void>.delayed(const Duration(milliseconds: 1300), () {
          if (mounted && !reussi) e.dire('j_ensuite');
        });
      }
    } else {
      erreursManche++;
      Future<void>.delayed(const Duration(milliseconds: 900), () {
        if (mounted) repondre(juste: false, nom: c);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final e = EtatScope.of(context);
    final d = D.of(context);
    if (suite.isEmpty) return const SizedBox();
    final taille = d.u * (suite.length > 3 ? 22 : 27);
    final attendu = placees.length < suite.length ? suite[placees.length] : null;
    return CadreJeu(
      titre: 'act_journee',
      consigne: fini ? 'fini' : 'j_consigne',
      fondCouleur: const Color(0xFFF3E7C9),
      child: fini
          ? ecranFin()
          : Column(
              children: [
                // Les cases de la journée, dans l'ordre, reliées par des flèches
                Padding(
                  padding: EdgeInsets.symmetric(vertical: d.u * 2),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      for (var i = 0; i < suite.length; i++) ...[
                        if (i > 0) Icon(Icons.arrow_forward_rounded, size: d.u * 7, color: C.encre),
                        Container(
                          width: taille * 0.8,
                          height: taille * 0.8,
                          decoration: BoxDecoration(
                            color: i < placees.length ? C.blanc : C.carte,
                            borderRadius: BorderRadius.circular(d.u * 3),
                            border: Border.all(color: C.encre, width: d.u * 0.45, style: i < placees.length ? BorderStyle.solid : BorderStyle.solid),
                          ),
                          padding: EdgeInsets.all(d.u),
                          child: i < placees.length
                              ? Image.asset(sprite(placees[i]))
                              : Center(child: Txt('${i + 1}', taille: 9, gras: true, couleur: C.encre.withValues(alpha: 0.35))),
                        ),
                      ],
                    ],
                  ),
                ),
                Expanded(
                  child: Center(
                    child: Wrap(
                      spacing: d.u * 3,
                      runSpacing: d.u * 2,
                      alignment: WrapAlignment.center,
                      children: [
                        for (final c in cartes)
                          if (!placees.contains(c))
                            CarteImage(
                              image: c,
                              libelle: e.t(c),
                              taille: taille,
                              etat: aider && c == attendu ? EtatCarte.aide : EtatCarte.normal,
                              onTap: () => toucher(c),
                            ),
                        if (reussi) const Bravo(cle: 'bravo'),
                      ],
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}
