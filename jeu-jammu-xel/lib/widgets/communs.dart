import 'dart:async';

import 'package:flutter/material.dart';

import '../core/etat.dart';
import '../core/theme.dart';

String sprite(String nom) => 'assets/images/sprites/$nom.png';
String fond(String nom) => 'assets/images/fonds/$nom.jpg';

/// Texte de l'application, à la taille choisie (« texte plus grand »).
class Txt extends StatelessWidget {
  const Txt(this.texte, {super.key, this.taille = 5, this.gras = false, this.couleur = C.encre, this.centre = false, this.max});
  final String texte;
  final double taille; // en u
  final bool gras;
  final Color couleur;
  final bool centre;
  final int? max;
  @override
  Widget build(BuildContext context) {
    final e = EtatScope.of(context);
    final d = D.of(context, texte: e.texteGrand ? 1.25 : 1);
    return Text(
      texte,
      textAlign: centre ? TextAlign.center : TextAlign.start,
      maxLines: max,
      overflow: max != null ? TextOverflow.ellipsis : null,
      style: TextStyle(fontFamily: 'Andika', fontSize: d.t(taille), height: 1.3, fontWeight: gras ? FontWeight.w700 : FontWeight.w400, color: couleur),
    );
  }
}

/// Gros bouton « carte peinte » : lit son libellé à voix haute au toucher
/// (sauf si [lire] est faux), puis exécute [action].
class GrosBouton extends StatelessWidget {
  const GrosBouton({
    super.key,
    required this.cle,
    this.action,
    this.image,
    this.fond = C.blanc,
    this.couleurTexte = C.encre,
    this.taille = 5.2,
    this.sous,
    this.lire = true,
    this.texte,
  });
  final String cle;
  final String? texte;
  final VoidCallback? action;
  final String? image;
  final Color fond;
  final Color couleurTexte;
  final double taille;
  final String? sous;
  final bool lire;
  @override
  Widget build(BuildContext context) {
    final e = EtatScope.of(context);
    final d = D.of(context);
    final libelle = texte ?? e.t(cle);
    return Semantics(
      button: true,
      label: libelle,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(d.u * 3),
          onTap: action == null
              ? null
              : () {
                  if (lire) e.dire(cle);
                  action!();
                },
          child: Ink(
            decoration: encadre(fond: fond, rayon: d.u * 3, ombre: d.u * 0.9, trait: d.u * 0.5),
            padding: EdgeInsets.symmetric(horizontal: d.u * 3, vertical: d.u * 1.8),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (image != null) ...[Image.asset(sprite(image!), width: d.u * 9, height: d.u * 9), SizedBox(width: d.u * 2)],
                Flexible(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Txt(libelle, taille: taille, gras: true, couleur: couleurTexte),
                      if (sous != null) Txt(e.t(sous!), taille: taille * 0.72, couleur: couleurTexte),
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

/// Bouton rond avec image (pause, carnet, langue, haut-parleur…).
class BoutonRond extends StatelessWidget {
  const BoutonRond({super.key, required this.image, required this.libelle, required this.action, this.taille = 13, this.fond = C.blanc});
  final String image;
  final String libelle;
  final VoidCallback action;
  final double taille;
  final Color fond;
  @override
  Widget build(BuildContext context) {
    final d = D.of(context);
    return Semantics(
      button: true,
      label: libelle,
      child: GestureDetector(
        onTap: action,
        child: Container(
          width: d.u * taille,
          height: d.u * taille,
          decoration: BoxDecoration(
            color: fond,
            shape: BoxShape.circle,
            border: Border.all(color: C.encre, width: d.u * 0.5),
            boxShadow: [BoxShadow(color: C.encre, offset: Offset(0, d.u * 0.8))],
          ),
          padding: EdgeInsets.all(d.u * taille * 0.18),
          child: Image.asset(sprite(image)),
        ),
      ),
    );
  }
}

/// Bouton « réécouter » : relit la phrase [cle].
class Reecouter extends StatelessWidget {
  const Reecouter(this.cle, {super.key, this.taille = 10});
  final String cle;
  final double taille;
  @override
  Widget build(BuildContext context) {
    final e = EtatScope.of(context);
    return BoutonRond(image: 'i_hp', libelle: e.t('reecouter'), fond: C.ocre, taille: taille, action: () => e.dire(cle, forcer: true));
  }
}

/// Sortie protégée : il faut garder le doigt appuyé 1,5 s (évite qu'un enfant
/// quitte le jeu par accident).
class MaintenirPourQuitter extends StatefulWidget {
  const MaintenirPourQuitter({super.key, required this.quitter});
  final VoidCallback quitter;
  @override
  State<MaintenirPourQuitter> createState() => _MaintenirPourQuitterState();
}

class _MaintenirPourQuitterState extends State<MaintenirPourQuitter> with SingleTickerProviderStateMixin {
  late final AnimationController _a = AnimationController(vsync: this, duration: const Duration(milliseconds: 1500))
    ..addStatusListener((s) {
      if (s == AnimationStatus.completed) widget.quitter();
    });
  @override
  void dispose() {
    _a.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final e = EtatScope.of(context);
    final d = D.of(context);
    return Semantics(
      button: true,
      label: e.t('maintenir_quitter'),
      onLongPress: widget.quitter,
      child: GestureDetector(
        onTapDown: (_) => _a.forward(from: 0),
        onTapUp: (_) => _a.reverse(),
        onTapCancel: () => _a.reverse(),
        onTap: () => e.dire('maintenir_quitter'),
        child: SizedBox(
          width: d.u * 13,
          height: d.u * 13,
          child: Stack(
            alignment: Alignment.center,
            children: [
              AnimatedBuilder(
                animation: _a,
                builder: (_, _) => CircularProgressIndicator(value: _a.value, strokeWidth: d.u, color: C.laterite, backgroundColor: C.blanc),
              ),
              Container(
                width: d.u * 10,
                height: d.u * 10,
                decoration: BoxDecoration(
                  color: C.blanc,
                  shape: BoxShape.circle,
                  border: Border.all(color: C.encre, width: d.u * 0.4),
                ),
                child: Icon(Icons.home_rounded, color: C.encre, size: d.u * 6),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Encadré de récompense douce (pas de score, pas de classement).
class Bravo extends StatefulWidget {
  const Bravo({super.key, required this.cle});
  final String cle;
  @override
  State<Bravo> createState() => _BravoState();
}

class _BravoState extends State<Bravo> {
  double _echelle = 0.6;
  @override
  void initState() {
    super.initState();
    Timer(const Duration(milliseconds: 30), () {
      if (mounted) setState(() => _echelle = 1);
    });
  }

  @override
  Widget build(BuildContext context) {
    final e = EtatScope.of(context);
    final d = D.of(context);
    return AnimatedScale(
      scale: e.moinsMouvement ? 1 : _echelle,
      duration: const Duration(milliseconds: 500),
      curve: Curves.easeOutBack,
      child: Container(
        decoration: encadre(fond: C.ocre, rayon: d.u * 4, ombre: d.u),
        padding: EdgeInsets.symmetric(horizontal: d.u * 5, vertical: d.u * 2),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.star_rounded, color: C.blanc, size: d.u * 9),
            SizedBox(width: d.u * 2),
            Txt(e.t(widget.cle), taille: 7, gras: true),
          ],
        ),
      ),
    );
  }
}

/// Barre du haut : objectif courant + boutons.
class Entete extends StatelessWidget {
  const Entete({super.key, required this.titre, this.image, this.actions = const [], this.retour});
  final String titre;
  final String? image;
  final List<Widget> actions;
  final VoidCallback? retour;
  @override
  Widget build(BuildContext context) {
    final d = D.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(d.u * 3, d.u * 3, d.u * 3, 0),
      child: Row(
        children: [
          if (retour != null) ...[const BoutonRetour(), SizedBox(width: d.u * 2)],
          Flexible(
            child: Container(
              decoration: encadre(rayon: d.u * 6, ombre: d.u * 0.8, trait: d.u * 0.45),
              padding: EdgeInsets.symmetric(horizontal: d.u * 3, vertical: d.u * 1.4),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (image != null) ...[Image.asset(sprite(image!), width: d.u * 7), SizedBox(width: d.u * 1.5)],
                  Flexible(child: Txt(titre, taille: 5, gras: true, max: 2)),
                ],
              ),
            ),
          ),
          const Spacer(),
          for (final a in actions)
            Padding(
              padding: EdgeInsets.only(left: d.u * 2),
              child: a,
            ),
        ],
      ),
    );
  }
}

/// Fond d'écran illustré, recadré pour remplir l'écran.
class Scene extends StatelessWidget {
  const Scene({super.key, required this.image, required this.child, this.voile = 0});
  final String image;
  final Widget child;
  final double voile;
  @override
  Widget build(BuildContext context) => Stack(
    fit: StackFit.expand,
    children: [
      Image.asset(fond(image), fit: BoxFit.cover, gaplessPlayback: true),
      if (voile > 0) ColoredBox(color: C.papier.withValues(alpha: voile)),
      SafeArea(child: child),
    ],
  );
}

Route<T> versPage<T>(BuildContext context, Widget page) {
  final e = EtatScope.lire(context);
  if (e.moinsMouvement) return PageRouteBuilder<T>(pageBuilder: (_, _, _) => page, transitionDuration: Duration.zero);
  return PageRouteBuilder<T>(
    pageBuilder: (_, _, _) => page,
    transitionDuration: const Duration(milliseconds: 350),
    transitionsBuilder: (_, a, _, c) => FadeTransition(opacity: a, child: c),
  );
}

/// Gros bouton retour (flèche), pour revenir à l'écran précédent.
class BoutonRetour extends StatelessWidget {
  const BoutonRetour({super.key, this.taille = 11});
  final double taille;
  @override
  Widget build(BuildContext context) {
    final d = D.of(context);
    return Semantics(
      button: true,
      label: EtatScope.of(context).t('retour'),
      child: GestureDetector(
        onTap: () => Navigator.of(context).maybePop(),
        child: Container(
          width: d.u * taille,
          height: d.u * taille,
          decoration: BoxDecoration(
            color: C.blanc,
            shape: BoxShape.circle,
            border: Border.all(color: C.encre, width: d.u * 0.5),
            boxShadow: [BoxShadow(color: C.encre, offset: Offset(0, d.u * 0.8))],
          ),
          child: Icon(Icons.arrow_back_rounded, size: d.u * taille * 0.6, color: C.encre),
        ),
      ),
    );
  }
}
