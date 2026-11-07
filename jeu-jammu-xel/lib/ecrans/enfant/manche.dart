import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';

import '../../core/etat.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';

/// Logique commune aux jeux « choisir la bonne image » : manches successives,
/// aide après deux erreurs (la bonne réponse est montrée), récompense douce,
/// difficulté ajustée par l'IA adaptative. Aucun échec, aucun score affiché.
mixin Manches<T extends StatefulWidget> on State<T> {
  final Random hasard = Random();
  int manche = 0;
  int erreurs = 0;
  bool reussi = false;
  bool fini = false;
  static const nbManches = 5;

  String get jeu; // clé du moteur adaptatif
  void nouvelleManche(); // prépare la manche selon le niveau
  String get consigneManche; // phrase lue au début de la manche

  Etat get etat => EtatScope.lire(context);
  int get niveau => etat.adaptatif[jeu]!.niveau;

  void demarrer() {
    manche = 0;
    fini = false;
    _suivante();
  }

  void _suivante() {
    erreurs = 0;
    reussi = false;
    nouvelleManche();
    setState(() {});
    Future<void>.delayed(const Duration(milliseconds: 400), () {
      if (mounted) etat.dire(consigneManche);
    });
  }

  /// Le joueur a touché une proposition.
  void repondre({required bool juste, required String nom}) {
    if (reussi || fini) return;
    if (juste) {
      reussi = true;
      etat.ding();
      etat.adaptatif[jeu]!.enregistrer(erreurs: erreurs);
      etat.sauverNiveaux();
      setState(() {});
      Future<void>.delayed(const Duration(milliseconds: 500), () => etat.dire('bravo'));
      Timer(const Duration(milliseconds: 2200), () {
        if (!mounted) return;
        manche++;
        if (manche >= nbManches) {
          setState(() => fini = true);
          etat.dire('fini');
        } else {
          _suivante();
        }
      });
    } else {
      erreurs++;
      setState(() {});
      etat.dire(erreurs >= 2 ? consigneManche : 'encore');
    }
  }

  /// La bonne réponse est mise en évidence après deux erreurs.
  bool get aider => erreurs >= 2 && !reussi;

  Widget ecranFin() {
    final d = D.of(context);
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Bravo(cle: 'fini'),
          SizedBox(height: d.u * 5),
          GrosBouton(cle: 'rejouer', fond: C.neem, couleurTexte: C.blanc, taille: 6, action: () => setState(demarrer)),
        ],
      ),
    );
  }
}

/// Carte image à toucher (grande zone tactile, contour épais).
class CarteImage extends StatelessWidget {
  const CarteImage({super.key, required this.image, required this.libelle, required this.taille, required this.onTap, this.etat = EtatCarte.normal});
  final String image;
  final String libelle;
  final double taille;
  final VoidCallback onTap;
  final EtatCarte etat;
  @override
  Widget build(BuildContext context) {
    final d = D.of(context);
    final e = EtatScope.of(context);
    final couleur = switch (etat) {
      EtatCarte.juste => C.neem,
      EtatCarte.aide => C.ocre,
      EtatCarte.estompe => C.carte,
      EtatCarte.normal => C.blanc,
    };
    final carte = AnimatedContainer(
      duration: Duration(milliseconds: e.moinsMouvement ? 0 : 300),
      width: taille,
      height: taille,
      decoration: BoxDecoration(
        color: couleur,
        borderRadius: BorderRadius.circular(d.u * 4),
        border: Border.all(color: C.encre, width: etat == EtatCarte.aide ? d.u * 1.1 : d.u * 0.5),
        boxShadow: [BoxShadow(color: C.encre, offset: Offset(0, d.u * 0.9))],
      ),
      padding: EdgeInsets.all(taille * 0.06),
      child: Opacity(opacity: etat == EtatCarte.estompe ? 0.45 : 1, child: Image.asset(sprite(image))),
    );
    return Semantics(
      button: true,
      label: libelle,
      child: GestureDetector(onTap: onTap, child: carte),
    );
  }
}

enum EtatCarte { normal, juste, aide, estompe }
