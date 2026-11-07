import 'dart:math';

import 'package:flame/components.dart';
import 'package:flame/game.dart';
import 'package:flutter/material.dart';

import '../../core/etat.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';
import '../enfant/respirer.dart';
import '../reglages.dart';
import 'carnet.dart';
import 'histoires.dart';
import 'recit.dart';
import 'ressources.dart';
import 'xel.dart';

/// Un lieu du Pénc : position dans l'illustration (1600 × 900), icône, phrase.
class Lieu {
  const Lieu(this.cle, this.icone, this.x, this.y, this.page, {this.etiquetteX, this.etiquetteY});
  final String cle;
  final String icone;
  final double x, y; // point chaud dans l'image
  final double? etiquetteX, etiquetteY; // position de l'étiquette (sinon au-dessus)
  final Widget Function() page;
}

final lieux = <Lieu>[
  Lieu('lieu_awa', 'i_infini', 210, 330, () => RecitEcran(recit: missionAwa), etiquetteX: 140, etiquetteY: 420),
  Lieu('lieu_modou', 'i_lanterne', 1050, 300, () => RecitEcran(recit: prologueModou), etiquetteX: 1000, etiquetteY: 150),
  Lieu('lieu_maam', 'i_cadre', 1390, 330, () => RecitEcran(recit: prologueMaam), etiquetteX: 1230, etiquetteY: 420),
  Lieu('lieu_xel', 'xel', 800, 470, () => const XelEcran(), etiquetteX: 860, etiquetteY: 560),
  Lieu('lieu_jardin', 'i_feuille', 150, 790, () => const Respirer(), etiquetteX: 40, etiquetteY: 650),
  Lieu('lieu_ressources', 'i_maisonI', 1440, 760, () => const Ressources(), etiquetteX: 1190, etiquetteY: 700),
];

/// Le Pénc : lieu central de l'espace parents, d'où partent les chemins.
/// La scène est animée par Flame (lieux qui « respirent » doucement) ;
/// les étiquettes sont des boutons Flutter, lisibles par TalkBack.
class Penc extends StatefulWidget {
  const Penc({super.key});
  @override
  State<Penc> createState() => _PencState();
}

class _PencState extends State<Penc> {
  late final ScenePenc jeu = ScenePenc();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => EtatScope.lire(context).dire('penc_intro'));
  }

  void ouvrir(Lieu l) {
    final e = EtatScope.lire(context);
    e.dire(l.cle);
    Future<void>.delayed(const Duration(milliseconds: 350), () {
      if (mounted) Navigator.of(context).push(versPage(context, l.page()));
    });
  }

  @override
  Widget build(BuildContext context) {
    final e = EtatScope.of(context);
    final d = D.of(context);
    jeu.calme = e.moinsMouvement;
    return Scaffold(
      body: LayoutBuilder(
        builder: (context, c) {
          final s = max(c.maxWidth / 1600, c.maxHeight / 900);
          final ox = (c.maxWidth - 1600 * s) / 2;
          final oy = (c.maxHeight - 900 * s) / 2;
          Offset place(double x, double y) => Offset(ox + x * s, oy + y * s);
          return Stack(
            children: [
              Positioned.fill(child: GameWidget(game: jeu)),
              // Zones à toucher sur l'illustration
              for (final l in lieux)
                Positioned(
                  left: place(l.x, l.y).dx - 70 * s,
                  top: place(l.x, l.y).dy - 70 * s,
                  width: 140 * s,
                  height: 140 * s,
                  child: GestureDetector(behavior: HitTestBehavior.opaque, onTap: () => ouvrir(l), child: const SizedBox()),
                ),
              // Étiquettes : icône + nom + description, jamais la couleur seule
              for (final l in lieux)
                Positioned(
                  left: place(l.etiquetteX ?? l.x, 0).dx.clamp(d.u * 2, c.maxWidth - d.u * 60),
                  top: place(0, l.etiquetteY ?? l.y).dy.clamp(d.u * 18, c.maxHeight - d.u * 21),
                  child: _Etiquette(lieu: l, onTap: () => ouvrir(l)),
                ),
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                child: SafeArea(
                  child: Entete(
                    titre: e.t('penc_intro'),
                    image: 'i_infini',
                    retour: () => Navigator.of(context).pop(),
                    actions: [
                      BoutonRond(
                        image: 'i_carnet',
                        libelle: e.t('carnet_titre'),
                        taille: 11,
                        action: () => Navigator.of(context).push(versPage(context, const Carnet())),
                      ),
                      BoutonRond(image: 'i_langue', libelle: e.t('reglages'), taille: 11, action: () => ouvrirReglages(context)),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _Etiquette extends StatelessWidget {
  const _Etiquette({required this.lieu, required this.onTap});
  final Lieu lieu;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final e = EtatScope.of(context);
    final d = D.of(context);
    final parties = e.t(lieu.cle).split('. ');
    final fini = switch (lieu.cle) {
      'lieu_awa' => e.histoiresFinies.contains('awa'),
      'lieu_modou' => e.histoiresFinies.contains('modou'),
      'lieu_maam' => e.histoiresFinies.contains('maam'),
      _ => false,
    };
    return Semantics(
      button: true,
      label: e.t(lieu.cle),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          constraints: BoxConstraints(maxWidth: d.u * 58),
          decoration: encadre(rayon: d.u * 6, ombre: d.u * 0.8, trait: d.u * 0.45),
          padding: EdgeInsets.fromLTRB(d.u * 1.5, d.u * 1, d.u * 3, d.u * 1),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Image.asset(sprite(lieu.icone), width: d.u * 8),
              SizedBox(width: d.u * 1.5),
              Flexible(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Txt(parties.first.replaceAll('.', ''), taille: 4.2, gras: true, max: 2),
                    if (parties.length > 1) Txt(parties.sublist(1).join('. ').replaceAll(RegExp(r'\.$'), ''), taille: 3.4, max: 2),
                  ],
                ),
              ),
              if (fini) ...[SizedBox(width: d.u), Icon(Icons.check_circle_rounded, color: C.neem, size: d.u * 6)],
            ],
          ),
        ),
      ),
    );
  }
}

/// Scène Flame : l'illustration du Pénc et des halos doux sur les lieux.
class ScenePenc extends FlameGame {
  bool calme = false;
  late final SpriteComponent _fond;
  final List<_Halo> _halos = [];

  @override
  Future<void> onLoad() async {
    final image = await images.load('fonds/penc.jpg');
    _fond = SpriteComponent(sprite: Sprite(image), size: Vector2(1600, 900));
    add(_fond);
    for (final l in lieux) {
      final h = _Halo(Vector2(l.x, l.y));
      _halos.add(h);
      add(h);
    }
    _cadrer();
  }

  void _cadrer() {
    if (!isLoaded && _halos.isEmpty) return;
    final s = max(size.x / 1600, size.y / 900);
    final o = Vector2((size.x - 1600 * s) / 2, (size.y - 900 * s) / 2);
    _fond
      ..scale = Vector2.all(s)
      ..position = o;
    for (final h in _halos) {
      h
        ..echelle = s
        ..position = o + h.ancre * s;
    }
  }

  @override
  void onGameResize(Vector2 size) {
    super.onGameResize(size);
    if (_halos.isNotEmpty) _cadrer();
  }

  @override
  void update(double dt) {
    super.update(dt);
    for (final h in _halos) {
      h.calme = calme;
    }
  }
}

class _Halo extends PositionComponent {
  _Halo(this.ancre);
  final Vector2 ancre;
  double echelle = 1;
  bool calme = false;
  double _t = Random().nextDouble() * 3;
  final _p = Paint()
    ..style = PaintingStyle.stroke
    ..color = const Color(0xFFFFF8EA);

  @override
  void update(double dt) {
    _t += dt;
  }

  @override
  void render(Canvas canvas) {
    final v = calme ? 0.5 : (sin(_t * 2 * pi / 3) + 1) / 2; // cycle lent de 3 s, sans clignotement
    _p
      ..strokeWidth = 5 * echelle
      ..color = const Color(0xFFFFF8EA).withValues(alpha: 0.35 + 0.35 * v);
    canvas.drawCircle(Offset.zero, (46 + 10 * v) * echelle, _p);
  }
}
