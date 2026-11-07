import 'package:flutter/material.dart';

import '../core/etat.dart';
import '../core/theme.dart';
import '../widgets/communs.dart';

/// Réglages d'accessibilité, accessibles partout.
void ouvrirReglages(BuildContext context) {
  showModalBottomSheet<void>(context: context, backgroundColor: C.papier, isScrollControlled: true, builder: (_) => const _Reglages());
}

class _Reglages extends StatelessWidget {
  const _Reglages();
  @override
  Widget build(BuildContext context) {
    final e = EtatScope.of(context);
    final d = D.of(context);
    Widget ligne(String cle, bool valeur, void Function(bool) changer) => SwitchListTile(
      value: valeur,
      onChanged: (v) {
        e.dire(cle);
        changer(v);
      },
      activeTrackColor: C.neem,
      title: Txt(e.t(cle), taille: 5, gras: true),
    );
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.all(d.u * 3),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Txt(e.t('reglages'), taille: 6, gras: true),
            Wrap(
              spacing: d.u * 2,
              children: [
                for (final l in Langue.values)
                  ChoiceChip(
                    label: Txt(l.nom, taille: 4.5, gras: true),
                    selected: e.langue == l,
                    selectedColor: C.ocre,
                    onSelected: (_) {
                      e.choisirLangue(l);
                      e.dire('langue_nom', en: l);
                    },
                  ),
              ],
            ),
            ligne('voix_active', e.voixActive, (v) => e.regler(voix: v)),
            ligne('sons_doux', e.sonsDoux, (v) => e.regler(doux: v)),
            ligne('texte_grand', e.texteGrand, (v) => e.regler(grand: v)),
            ligne('moins_mouvement', e.moinsMouvement, (v) => e.regler(mouvement: v)),
          ],
        ),
      ),
    );
  }
}
