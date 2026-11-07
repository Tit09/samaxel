import 'package:flutter/material.dart';

import '../core/etat.dart';
import '../core/theme.dart';
import '../widgets/communs.dart';
import 'enfant/coin_enfants.dart';
import 'parents/penc.dart';
import 'reglages.dart';

class Accueil extends StatefulWidget {
  const Accueil({super.key});
  @override
  State<Accueil> createState() => _AccueilState();
}

class _AccueilState extends State<Accueil> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => EtatScope.lire(context).dire('accueil_bienvenue'));
  }

  @override
  Widget build(BuildContext context) {
    final e = EtatScope.of(context);
    final d = D.of(context);
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: EdgeInsets.all(d.u * 3),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Tableau « sous-verre » : cadre à l'encre et clous dorés
              Expanded(
                flex: 7,
                child: Container(
                  decoration: BoxDecoration(color: C.encre, borderRadius: BorderRadius.circular(d.u * 1.5)),
                  padding: EdgeInsets.all(d.u * 2),
                  child: ClipRect(
                    child: Image.asset(fond('penc'), fit: BoxFit.cover, alignment: const Alignment(0, 0.3)),
                  ),
                ),
              ),
              SizedBox(width: d.u * 4),
              Expanded(
                flex: 11,
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        'JÀMMU XEL',
                        style: TextStyle(
                          fontFamily: 'Andika',
                          fontWeight: FontWeight.w700,
                          fontSize: d.u * 13,
                          height: 1,
                          color: C.laterite,
                          shadows: [Shadow(color: C.encre, offset: Offset(d.u * 0.7, d.u * 0.7))],
                        ),
                      ),
                      SizedBox(height: d.u),
                      Row(
                        children: [
                          Expanded(child: Txt(e.t('qui_joue'), taille: 4.6)),
                          BoutonRond(
                            image: 'i_hp',
                            libelle: e.t('reecouter'),
                            taille: 9,
                            fond: C.ocre,
                            action: () => e.dire('accueil_bienvenue', forcer: true),
                          ),
                        ],
                      ),
                      SizedBox(height: d.u * 2),
                      // Choix de la langue en écoutant
                      Wrap(
                        spacing: d.u * 2,
                        runSpacing: d.u * 2,
                        children: [
                          for (final l in Langue.values) _BoutonLangue(langue: l),
                          Opacity(
                            opacity: 0.55,
                            child: Container(
                              decoration: encadre(fond: C.carte, rayon: d.u * 3, ombre: 0, trait: d.u * 0.4),
                              padding: EdgeInsets.symmetric(horizontal: d.u * 3, vertical: d.u * 2),
                              child: Txt('Pulaar · ${e.t('bientot')}', taille: 4.4),
                            ),
                          ),
                        ],
                      ),
                      SizedBox(height: d.u * 4),
                      Row(
                        children: [
                          Expanded(
                            child: GrosBouton(
                              cle: 'choix_enfant',
                              sous: 'choix_enfant_sous',
                              image: 't_emotions',
                              fond: C.neem,
                              couleurTexte: C.blanc,
                              taille: 5.6,
                              action: () => Navigator.of(context).push(versPage(context, const CoinEnfants())),
                            ),
                          ),
                          SizedBox(width: d.u * 3),
                          Expanded(
                            child: GrosBouton(
                              cle: 'choix_parent',
                              sous: 'choix_parent_sous',
                              image: 'xel',
                              taille: 5.6,
                              action: () => Navigator.of(context).push(versPage(context, const Penc())),
                            ),
                          ),
                        ],
                      ),
                      SizedBox(height: d.u * 3),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: TextButton.icon(
                          onPressed: () => ouvrirReglages(context),
                          icon: Icon(Icons.tune_rounded, size: d.u * 6, color: C.encre),
                          label: Txt(e.t('reglages'), taille: 4.5, gras: true),
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

class _BoutonLangue extends StatelessWidget {
  const _BoutonLangue({required this.langue});
  final Langue langue;
  @override
  Widget build(BuildContext context) {
    final e = EtatScope.of(context);
    final d = D.of(context);
    final choisi = e.langue == langue;
    return Semantics(
      button: true,
      selected: choisi,
      label: langue.nom,
      child: GestureDetector(
        onTap: () async {
          e.choisirLangue(langue);
          await e.dire('langue_nom', en: langue);
          await Future<void>.delayed(const Duration(milliseconds: 900));
          e.dire('qui_joue');
        },
        child: Container(
          decoration: encadre(fond: choisi ? C.ocre : C.blanc, rayon: d.u * 3, ombre: d.u * 0.8, trait: d.u * 0.45),
          padding: EdgeInsets.symmetric(horizontal: d.u * 3, vertical: d.u * 1.6),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Image.asset(sprite('i_hp'), width: d.u * 6),
              SizedBox(width: d.u * 1.5),
              Txt(langue.nom, taille: 5.4, gras: true),
              if (choisi) ...[SizedBox(width: d.u), Icon(Icons.check_rounded, size: d.u * 6, color: C.encre)],
            ],
          ),
        ),
      ),
    );
  }
}
