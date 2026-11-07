import 'package:flutter/material.dart';

import '../../core/etat.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';
import 'coin_enfants.dart';

const pictos = ['c_oui', 'c_non', 'c_faim', 'c_soif', 'c_toilettes', 'c_mal', 'c_pause', 'c_aide', 'c_jouer', 'c_fatigue', 'c_peur', 'c_bruit'];

/// Tableau de communication (communication alternative et améliorée) :
/// l'enfant qui ne parle pas touche une image, le téléphone dit la phrase
/// dans la langue de la famille.
class JeParle extends StatefulWidget {
  const JeParle({super.key});
  @override
  State<JeParle> createState() => _JeParleState();
}

class _JeParleState extends State<JeParle> {
  String? dernier;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => EtatScope.lire(context).dire('c_consigne'));
  }

  @override
  Widget build(BuildContext context) {
    final e = EtatScope.of(context);
    final d = D.of(context);
    return CadreJeu(
      titre: 'act_parler',
      consigne: 'c_consigne',
      fondCouleur: const Color(0xFFE3EDF1),
      child: Column(
        children: [
          // La phrase dite, en grand (pour l'adulte qui l'entend et la lit)
          AnimatedOpacity(
            opacity: dernier == null ? 0 : 1,
            duration: const Duration(milliseconds: 200),
            child: Container(
              margin: EdgeInsets.symmetric(vertical: d.u * 1.5),
              padding: EdgeInsets.symmetric(horizontal: d.u * 4, vertical: d.u * 1.2),
              decoration: encadre(fond: C.blanc, rayon: d.u * 4, ombre: d.u * 0.6, trait: d.u * 0.4),
              child: Txt(dernier == null ? ' ' : e.t(dernier!), taille: 7, gras: true),
            ),
          ),
          Expanded(
            child: LayoutBuilder(
              builder: (context, c) {
                const cols = 6;
                final cote = ((c.maxWidth - d.u * 6) / cols - d.u * 2).clamp(0.0, (c.maxHeight - d.u * 4) / 2 - d.u * 10);
                return Center(
                  child: Wrap(
                    spacing: d.u * 2,
                    runSpacing: d.u * 1.2,
                    alignment: WrapAlignment.center,
                    children: [
                      for (final p in pictos)
                        Semantics(
                          button: true,
                          label: e.t(p),
                          child: GestureDetector(
                            onTap: () {
                              setState(() => dernier = p);
                              e.dire(p, forcer: true); // ce tableau parle toujours, même voix coupée
                            },
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Container(
                                  width: cote,
                                  height: cote,
                                  decoration: encadre(fond: dernier == p ? C.ocre : C.blanc, rayon: d.u * 3, ombre: d.u * 0.7, trait: d.u * 0.45),
                                  padding: EdgeInsets.all(d.u),
                                  child: Image.asset(sprite(p)),
                                ),
                                SizedBox(width: cote, child: Txt(e.t(p), taille: 3.6, gras: true, centre: true, max: 2)),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
