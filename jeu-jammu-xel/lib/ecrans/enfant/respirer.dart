import 'dart:math';

import 'package:flame/components.dart';
import 'package:flame/game.dart';
import 'package:flutter/material.dart';

import '../../core/etat.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';

/// Jardin calme : une fleur de feuilles de baobab s'ouvre à l'inspiration
/// (4 s) et se ferme à l'expiration (6 s). Pas de chrono, pas de score.
class Respirer extends StatefulWidget {
  const Respirer({super.key, this.fondImage});
  final String? fondImage;
  @override
  State<Respirer> createState() => _RespirerState();
}

enum ModeRespiration { voix, mer, silence }

class _RespirerState extends State<Respirer> {
  late final FleurRespiration jeu = FleurRespiration(onPhase: _phase);
  ModeRespiration mode = ModeRespiration.voix;
  bool inspire = true;

  void _phase(bool ins) {
    if (!mounted) return;
    setState(() => inspire = ins);
    if (mode == ModeRespiration.voix) EtatScope.lire(context).dire(ins ? 'r_inspire' : 'r_expire');
  }

  Etat? _etat;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => EtatScope.lire(context).dire('r_intro'));
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _etat = EtatScope.lire(context);
  }

  @override
  void dispose() {
    _etat?.mer(false);
    super.dispose();
  }

  void choisir(ModeRespiration m) {
    final e = EtatScope.lire(context);
    setState(() => mode = m);
    e.dire(switch (m) {
      ModeRespiration.voix => 'r_voix',
      ModeRespiration.mer => 'r_mer',
      ModeRespiration.silence => 'r_silence',
    });
    e.mer(m == ModeRespiration.mer);
  }

  @override
  Widget build(BuildContext context) {
    final e = EtatScope.of(context);
    final d = D.of(context);
    jeu.lent = e.moinsMouvement;
    return Scaffold(
      body: Scene(
        image: 'jardin',
        child: Stack(
          children: [
            Positioned.fill(child: GameWidget(game: jeu)),
            Positioned(left: d.u * 3, top: d.u * 3, child: const BoutonRetour()),
            Positioned(
              left: d.u * 3,
              top: d.u * 20,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final (m, cle) in [(ModeRespiration.voix, 'r_voix'), (ModeRespiration.mer, 'r_mer'), (ModeRespiration.silence, 'r_silence')])
                    Padding(
                      padding: EdgeInsets.only(bottom: d.u * 2),
                      child: GrosBouton(cle: cle, lire: false, fond: mode == m ? C.ocre : C.blanc, taille: 4.6, action: () => choisir(m)),
                    ),
                ],
              ),
            ),
            Positioned(
              right: d.u * 3,
              top: d.u * 22,
              width: d.u * 44,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Txt(e.t(inspire ? 'r_inspire' : 'r_expire'), taille: 9, gras: true, couleur: C.neem),
                  SizedBox(height: d.u),
                  Txt(e.t('r_intro'), taille: 4.4),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Le jeu Flame : la fleur respire.
class FleurRespiration extends FlameGame {
  FleurRespiration({required this.onPhase});
  final void Function(bool inspire) onPhase;
  bool lent = false;
  double _t = 0;
  bool _inspire = true;
  late final _Fleur _fleur;

  @override
  Color backgroundColor() => const Color(0x00000000);

  @override
  Future<void> onLoad() async {
    _fleur = _Fleur();
    add(_fleur);
    onPhase(true);
  }

  @override
  void onGameResize(Vector2 size) {
    super.onGameResize(size);
    if (isLoaded) _fleur.position = Vector2(size.x * 0.46, size.y * 0.52);
  }

  @override
  void onMount() {
    super.onMount();
    _fleur.position = Vector2(size.x * 0.46, size.y * 0.52);
  }

  @override
  void update(double dt) {
    super.update(dt);
    final dIn = lent ? 5.0 : 4.0;
    final dOut = lent ? 7.0 : 6.0;
    _t += dt;
    if (_inspire && _t >= dIn) {
      _inspire = false;
      _t = 0;
      onPhase(false);
    } else if (!_inspire && _t >= dOut) {
      _inspire = true;
      _t = 0;
      onPhase(true);
    }
    final p = _inspire ? Curves.easeInOut.transform((_t / dIn).clamp(0, 1)) : 1 - Curves.easeInOut.transform((_t / dOut).clamp(0, 1));
    _fleur.ouverture = p;
    _fleur.rayon = size.y * 0.26;
  }
}

class _Fleur extends PositionComponent {
  double ouverture = 0;
  double rayon = 120;
  final _encre = Paint()
    ..color = C.encre
    ..style = PaintingStyle.stroke
    ..strokeWidth = 3
    ..strokeJoin = StrokeJoin.round;
  final _feuille = Paint()..color = C.neem;
  final _coeur = Paint()..color = C.ocre;
  final _halo = Paint()..color = const Color(0xFFEFF2DC);
  final _halo2 = Paint()..color = const Color(0xFFC9DDA9);

  @override
  void render(Canvas canvas) {
    canvas.drawCircle(Offset.zero, rayon * 1.25, _halo);
    canvas.drawCircle(Offset.zero, rayon * 1.25, _encre);
    canvas.drawCircle(Offset.zero, rayon * (0.55 + 0.45 * ouverture), _halo2);
    final longueur = rayon * (0.45 + 0.55 * ouverture);
    final largeur = longueur * 0.32;
    for (var i = 0; i < 5; i++) {
      canvas.save();
      canvas.rotate(i * 2 * pi / 5 + ouverture * 0.25);
      final chemin = Path()
        ..moveTo(0, 0)
        ..cubicTo(-largeur, -longueur * 0.3, -largeur * 0.9, -longueur * 0.85, 0, -longueur)
        ..cubicTo(largeur * 0.9, -longueur * 0.85, largeur, -longueur * 0.3, 0, 0)
        ..close();
      canvas.drawPath(chemin, _feuille);
      canvas.drawPath(chemin, _encre);
      canvas.drawLine(Offset.zero, Offset(0, -longueur * 0.85), _encre..strokeWidth = 2);
      _encre.strokeWidth = 3;
      canvas.restore();
    }
    canvas.drawCircle(Offset.zero, rayon * 0.14, _coeur);
    canvas.drawCircle(Offset.zero, rayon * 0.14, _encre);
  }
}
