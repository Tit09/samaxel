import 'package:flutter/material.dart';

import '../../core/assistant.dart';
import '../../core/etat.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';
import 'ressources.dart';

/// Xel, l'assistant des parents : IA embarquée, hors ligne et explicable.
/// Il retrouve la réponse validée la plus proche de la question posée
/// (écrite, ou touchée parmi les questions proposées pour qui ne lit pas).
class XelEcran extends StatefulWidget {
  const XelEcran({super.key});
  @override
  State<XelEcran> createState() => _XelEcranState();
}

class _Echange {
  _Echange(this.question, this.reponse);
  final String question;
  final ReponseXel reponse;
}

class _XelEcranState extends State<XelEcran> {
  late final Xel xel;
  final _champ = TextEditingController();
  final _defile = ScrollController();
  final _focus = FocusNode();
  final List<_Echange> echanges = [];
  bool _pret = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_pret) return;
    final e = EtatScope.lire(context);
    xel = Xel((cle, l) => e.t(cle, en: Langue.values.firstWhere((x) => x.code == l)));
    _pret = true;
    WidgetsBinding.instance.addPostFrameCallback((_) => e.dire('xel_intro'));
  }

  @override
  void dispose() {
    _champ.dispose();
    _defile.dispose();
    _focus.dispose();
    super.dispose();
  }

  Future<void> poser(String question) async {
    if (question.trim().isEmpty) return;
    final e = EtatScope.lire(context);
    final r = xel.repondre(question);
    setState(() => echanges.add(_Echange(question, r)));
    _champ.clear();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_defile.hasClients) _defile.animateTo(_defile.position.maxScrollExtent, duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
    });
    if (r.question == null) {
      await e.dire('xel_inconnu');
    } else {
      await e.dire(r.question!.reponses.first);
    }
  }

  @override
  Widget build(BuildContext context) {
    final e = EtatScope.of(context);
    final d = D.of(context);
    return Scaffold(
      backgroundColor: const Color(0xFFE4EBCB),
      body: SafeArea(
        child: Column(
          children: [
            Entete(titre: e.t('lieu_xel'), image: 'xel', retour: () => Navigator.of(context).pop()),
            Expanded(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Questions proposées : on les touche pour les entendre et les poser
                  SizedBox(
                    width: d.u * 62,
                    child: ListView(
                      padding: EdgeInsets.all(d.u * 3),
                      children: [
                        for (final q in questionsXel)
                          Padding(
                            padding: EdgeInsets.only(bottom: d.u * 1.2),
                            child: Semantics(
                              button: true,
                              label: e.t(q.cle),
                              child: InkWell(
                                onTap: () {
                                  e.dire(q.cle);
                                  Future<void>.delayed(const Duration(milliseconds: 1600), () {
                                    if (mounted) poser(e.t(q.cle));
                                  });
                                },
                                child: Container(
                                  decoration: encadre(fond: C.blanc, rayon: d.u * 3, ombre: d.u * 0.5, trait: d.u * 0.35),
                                  padding: EdgeInsets.symmetric(horizontal: d.u * 2, vertical: d.u * 1.3),
                                  child: Row(
                                    children: [
                                      Container(
                                width: d.u * 6,
                                height: d.u * 6,
                                decoration: BoxDecoration(color: C.ocre, shape: BoxShape.circle, border: Border.all(color: C.encre, width: d.u * 0.3)),
                                padding: EdgeInsets.all(d.u),
                                child: Image.asset(sprite('i_hp')),
                              ),
                                      SizedBox(width: d.u),
                                      Expanded(child: Txt(e.t(q.cle), taille: 3.8, gras: true)),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                  // Conversation
                  Expanded(
                    child: Padding(
                      padding: EdgeInsets.fromLTRB(0, d.u * 3, d.u * 3, d.u * 3),
                      child: Container(
                        decoration: encadre(rayon: d.u * 4, ombre: d.u * 0.8, trait: d.u * 0.45),
                        child: Column(
                          children: [
                            Expanded(
                              child: ListView(
                                controller: _defile,
                                padding: EdgeInsets.all(d.u * 2.5),
                                children: [
                                  _Bulle(texte: e.t('xel_intro'), cle: 'xel_intro'),
                                  for (final ex in echanges) ...[
                                    _Bulle(texte: ex.question, deXel: false),
                                    if (ex.reponse.question == null)
                                      _Bulle(texte: e.t('xel_inconnu'), cle: 'xel_inconnu', lien: true)
                                    else
                                      _Bulle(
                                        texte: ex.reponse.question!.reponses.map(e.t).join(' '),
                                        cle: ex.reponse.question!.reponses.first,
                                        lien: ex.reponse.question!.cle == 'xq_ou' || ex.reponse.question!.cle == 'xq_autiste',
                                        pourquoi:
                                            '${e.t('xel_pourquoi')} : « ${e.t(ex.reponse.question!.cle)} » · ${ex.reponse.motsTrouves.join(', ')} · ${(ex.reponse.score * 100).round()} %',
                                      ),
                                  ],
                                ],
                              ),
                            ),
                            Padding(
                              padding: EdgeInsets.all(d.u * 2),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: TextField(
                                      controller: _champ,
                                focusNode: _focus,
                                      onSubmitted: poser,
                                onEditingComplete: () {}, // garde le clavier ouvert pour la question suivante
                                      textInputAction: TextInputAction.send,
                                      style: TextStyle(fontFamily: 'Andika', fontSize: d.t(4.4)),
                                      decoration: InputDecoration(
                                        hintText: e.t('xel_ecrire'),
                                        filled: true,
                                        fillColor: C.carte,
                                        border: OutlineInputBorder(
                                          borderRadius: BorderRadius.circular(d.u * 3),
                                          borderSide: const BorderSide(color: C.encre, width: 2),
                                        ),
                                        contentPadding: EdgeInsets.symmetric(horizontal: d.u * 2.5, vertical: d.u * 1.5),
                                      ),
                                    ),
                                  ),
                                  SizedBox(width: d.u * 1.5),
                                  BoutonRond(image: 'xel', libelle: e.t('xel_ecrire'), taille: 11, action: () => poser(_champ.text)),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Bulle extends StatelessWidget {
  const _Bulle({required this.texte, this.cle, this.deXel = true, this.lien = false, this.pourquoi});
  final String texte;
  final String? cle;
  final bool deXel;
  final bool lien;
  final String? pourquoi;
  @override
  Widget build(BuildContext context) {
    final d = D.of(context);
    final bulle = Container(
      margin: EdgeInsets.only(bottom: d.u * 1.5, left: deXel ? 0 : d.u * 12, right: deXel ? d.u * 6 : 0),
      decoration: encadre(fond: deXel ? const Color(0xFFDCE8D0) : C.carte, rayon: d.u * 3, ombre: 0, trait: d.u * 0.35),
      padding: EdgeInsets.all(d.u * 1.8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (deXel) ...[Image.asset(sprite('xel'), width: d.u * 7), SizedBox(width: d.u)],
              Expanded(child: Txt(texte, taille: 4.1)),
              if (cle != null) Reecouter(cle!, taille: 7.5),
            ],
          ),
          if (lien) ...[
            SizedBox(height: d.u),
            GrosBouton(
              cle: 'trouver_structure',
              image: 'i_maisonI',
              fond: C.neem,
              couleurTexte: C.blanc,
              taille: 3.8,
              lire: false,
              action: () => trouverStructure(context),
            ),
          ],
          if (pourquoi != null) ...[SizedBox(height: d.u * 0.8), Txt(pourquoi!, taille: 3, couleur: C.encre.withValues(alpha: 0.65))],
        ],
      ),
    );
    return Align(alignment: deXel ? Alignment.centerLeft : Alignment.centerRight, child: bulle);
  }
}
