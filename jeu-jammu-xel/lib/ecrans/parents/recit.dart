import 'package:flutter/material.dart';

import '../../core/etat.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';
import 'carnet.dart';
import 'histoires.dart';
import 'ressources.dart';

/// Moteur de récit : joue une histoire (intro, étapes, choix, bilan).
/// Un choix maladroit n'est jamais puni : le personnage explique, on reprend.
class RecitEcran extends StatefulWidget {
  const RecitEcran({super.key, required this.recit});
  final Recit recit;
  @override
  State<RecitEcran> createState() => _RecitEcranState();
}

enum _Phase { intro, parole, reponse, bilan }

class _RecitEcranState extends State<RecitEcran> {
  _Phase phase = _Phase.intro;
  int i = 0;
  Choix? choisi;

  Etat get e => EtatScope.lire(context);
  Etape get etape => widget.recit.etapes[i];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => e.dire(widget.recit.intro));
  }

  void _parole() {
    setState(() {
      phase = _Phase.parole;
      choisi = null;
    });
    e.noter(etape.observations);
    e.dire(etape.texte);
  }

  void _choisir(Choix c) {
    setState(() {
      choisi = c;
      phase = _Phase.reponse;
    });
    e.noter(c.observations);
    if (!c.reprendre) e.ding();
    e.dire(c.reponse);
  }

  void _suite() {
    if (choisi?.reprendre ?? false) {
      _parole();
      return;
    }
    if (i + 1 < widget.recit.etapes.length) {
      i++;
      _parole();
    } else {
      setState(() => phase = _Phase.bilan);
      e.terminer(widget.recit.id);
      e.dire(widget.recit.bilan);
    }
  }

  String _nom(String orateur) {
    final t = e.t(orateur);
    return t == orateur ? orateur : t;
  }

  @override
  Widget build(BuildContext context) {
    final et = EtatScope.of(context);
    final d = D.of(context);
    final r = widget.recit;
    final image = switch (phase) {
      _Phase.intro => r.etapes.first.fond,
      _Phase.bilan => r.bilanFond,
      _ => etape.fond,
    };
    return Scaffold(
      body: Scene(
        image: image,
        voile: phase == _Phase.bilan ? 0.55 : 0,
        child: Column(
          children: [
            Entete(
              titre: et.t(r.titre),
              image: r.icone,
              retour: () => Navigator.of(context).pop(),
              actions: [
                if (r.carnet)
                  BoutonRond(
                    image: 'i_carnet',
                    libelle: et.t('carnet_titre'),
                    taille: 11,
                    action: () => Navigator.of(context).push(versPage(context, const Carnet())),
                  ),
              ],
            ),
            const Spacer(),
            switch (phase) {
              _Phase.intro => _Panneau(
                portrait: r.etapes.first.portrait,
                nom: '',
                cleTexte: r.intro,
                bas: [GrosBouton(cle: 'continuer', fond: C.neem, couleurTexte: C.blanc, action: _parole)],
              ),
              _Phase.parole => _Panneau(
                portrait: etape.portrait,
                nom: _nom(etape.orateur),
                cleTexte: etape.texte,
                bas: etape.choix.isEmpty
                    ? [GrosBouton(cle: 'continuer', fond: C.neem, couleurTexte: C.blanc, action: _suite)]
                    : [
                        for (final c in etape.choix)
                          Expanded(
                            child: Padding(
                              padding: EdgeInsets.only(right: d.u * 1.5),
                              child: _BoutonChoix(cle: c.texte, onTap: () => _choisir(c)),
                            ),
                          ),
                      ],
              ),
              _Phase.reponse => _Panneau(
                portrait: etape.portrait,
                nom: _nom(etape.orateur),
                cleTexte: choisi!.reponse,
                bas: [
                  if (choisi!.observations.isNotEmpty)
                    Padding(
                      padding: EdgeInsets.only(right: d.u * 2),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Image.asset(sprite('i_carnet'), width: d.u * 7),
                          Txt(' +${choisi!.observations.length}', taille: 5, gras: true),
                        ],
                      ),
                    ),
                  GrosBouton(
                    cle: choisi!.reprendre ? 'rejouer' : 'continuer',
                    fond: choisi!.reprendre ? C.ocre : C.neem,
                    couleurTexte: choisi!.reprendre ? C.encre : C.blanc,
                    action: _suite,
                  ),
                ],
              ),
              _Phase.bilan => _Bilan(recit: r),
            },
          ],
        ),
      ),
    );
  }
}

class _Panneau extends StatelessWidget {
  const _Panneau({required this.portrait, required this.nom, required this.cleTexte, required this.bas});
  final String portrait;
  final String nom;
  final String cleTexte;
  final List<Widget> bas;
  @override
  Widget build(BuildContext context) {
    final e = EtatScope.of(context);
    final d = D.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(d.u * 3, 0, d.u * 3, d.u * 3),
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
            width: double.infinity,
            decoration: encadre(rayon: d.u * 4, ombre: d.u, trait: d.u * 0.5),
            padding: EdgeInsets.fromLTRB(d.u * 26, d.u * 2.5, d.u * 3, d.u * 2.5),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    if (nom.isNotEmpty) Expanded(child: Txt(nom, taille: 4.8, gras: true, couleur: C.laterite)) else const Spacer(),
                    Reecouter(cleTexte, taille: 9),
                  ],
                ),
                SizedBox(height: d.u * 0.5),
                Txt(e.t(cleTexte), taille: 4.8),
                SizedBox(height: d.u * 2),
                Row(crossAxisAlignment: CrossAxisAlignment.center, mainAxisAlignment: MainAxisAlignment.end, children: bas),
              ],
            ),
          ),
          Positioned(
            left: d.u * 2,
            top: -d.u * 6,
            child: Container(
              width: d.u * 22,
              height: d.u * 22,
              decoration: BoxDecoration(
                color: C.ocre,
                shape: BoxShape.circle,
                border: Border.all(color: C.encre, width: d.u * 0.5),
              ),
              clipBehavior: Clip.antiAlias,
              child: Image.asset(sprite(portrait), fit: BoxFit.cover),
            ),
          ),
        ],
      ),
    );
  }
}

class _BoutonChoix extends StatelessWidget {
  const _BoutonChoix({required this.cle, required this.onTap});
  final String cle;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final e = EtatScope.of(context);
    final d = D.of(context);
    return Semantics(
      button: true,
      label: e.t(cle),
      child: Row(
        children: [
          // Écouter le choix avant de le toucher (pour qui ne lit pas)
          GestureDetector(
            onTap: () => e.dire(cle, forcer: true),
            child: Padding(
              padding: EdgeInsets.only(right: d.u),
              child: Container(
                width: d.u * 7.5,
                height: d.u * 7.5,
                decoration: BoxDecoration(
                  color: C.ocre,
                  shape: BoxShape.circle,
                  border: Border.all(color: C.encre, width: d.u * 0.35),
                ),
                padding: EdgeInsets.all(d.u * 1.2),
                child: Image.asset(sprite('i_hp')),
              ),
            ),
          ),
          Expanded(
            child: Material(
              color: Colors.transparent,
              child: InkWell(
                onTap: onTap,
                borderRadius: BorderRadius.circular(d.u * 3),
                child: Ink(
                  decoration: encadre(fond: C.carte, rayon: d.u * 3, ombre: d.u * 0.6, trait: d.u * 0.45),
                  padding: EdgeInsets.symmetric(horizontal: d.u * 2, vertical: d.u * 1.6),
                  child: Txt(e.t(cle), taille: 4, gras: true),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Bilan extends StatelessWidget {
  const _Bilan({required this.recit});
  final Recit recit;
  @override
  Widget build(BuildContext context) {
    final e = EtatScope.of(context);
    final d = D.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(d.u * 3, 0, d.u * 3, d.u * 3),
      child: Container(
        width: double.infinity,
        decoration: encadre(rayon: d.u * 4, ombre: d.u, trait: d.u * 0.5),
        padding: EdgeInsets.all(d.u * 3),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Icon(Icons.star_rounded, color: C.ocre, size: d.u * 8),
                SizedBox(width: d.u),
                Expanded(child: Txt(e.t(recit.bilan), taille: 4.5)),
                Reecouter(recit.bilan, taille: 9),
              ],
            ),
            if (recit.urgence) ...[
              SizedBox(height: d.u * 1.5),
              Container(
                decoration: encadre(fond: const Color(0xFFF6D9CF), rayon: d.u * 2, ombre: 0, trait: d.u * 0.4),
                padding: EdgeInsets.all(d.u * 1.5),
                child: Row(
                  children: [
                    Icon(Icons.favorite_rounded, color: C.laterite, size: d.u * 7),
                    SizedBox(width: d.u),
                    Expanded(child: Txt(e.t('urgence'), taille: 4.2, gras: true)),
                    Reecouter('urgence', taille: 8),
                  ],
                ),
              ),
            ],
            SizedBox(height: d.u * 2),
            Wrap(
              spacing: d.u * 2,
              runSpacing: d.u * 1.5,
              children: [
                if (recit.carnet)
                  GrosBouton(cle: 'carnet_titre', image: 'i_carnet', taille: 4.4, action: () => Navigator.of(context).push(versPage(context, const Carnet()))),
                GrosBouton(
                  cle: 'trouver_structure',
                  image: 'i_maisonI',
                  fond: C.neem,
                  couleurTexte: C.blanc,
                  taille: 4.4,
                  lire: false,
                  action: () => trouverStructure(context),
                ),
                GrosBouton(cle: 'retour', taille: 4.4, action: () => Navigator.of(context).pop()),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
