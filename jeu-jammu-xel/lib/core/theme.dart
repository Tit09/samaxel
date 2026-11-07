import 'package:flutter/material.dart';

/// Palette « sous-verre doux » (voir l'étude, § 5.4).
class C {
  static const encre = Color(0xFF22243A);
  static const papier = Color(0xFFF2E2BF);
  static const blanc = Color(0xFFFFF8EA);
  static const laterite = Color(0xFFB4532E);
  static const ocre = Color(0xFFDDA23B);
  static const neem = Color(0xFF557A46);
  static const lagune = Color(0xFF4D84A3);
  static const sable = Color(0xFFE8CF9B);
  static const crepuscule = Color(0xFF6C5A8C);
  static const carte = Color(0xFFFBF1DB);
}

/// Dimensions proportionnelles à l'écran : 1 u = 1 % de la hauteur utile
/// (téléphone en paysage, tablette, ordinateur).
class D {
  final double u;
  final double texte; // multiplicateur « texte plus grand »
  const D(this.u, this.texte);
  static D of(BuildContext context, {double texte = 1}) {
    final s = MediaQuery.sizeOf(context);
    final h = s.height < s.width * 0.5625 ? s.height : s.width * 0.5625;
    return D(h / 100, texte);
  }

  double t(double taille) => taille * u * texte;
}

ThemeData themeJammu() => ThemeData(
  useMaterial3: true,
  fontFamily: 'Andika',
  scaffoldBackgroundColor: C.papier,
  colorScheme: ColorScheme.fromSeed(seedColor: C.laterite, surface: C.papier),
  textTheme: const TextTheme().apply(bodyColor: C.encre, displayColor: C.encre),
  pageTransitionsTheme: const PageTransitionsTheme(
    builders: {TargetPlatform.android: FadeUpwardsPageTransitionsBuilder(), TargetPlatform.windows: FadeUpwardsPageTransitionsBuilder()},
  ),
);

/// Bordure « à l'encre » commune aux cartes et boutons.
BoxDecoration encadre({Color fond = C.blanc, double rayon = 18, double ombre = 5, double trait = 3}) => BoxDecoration(
  color: fond,
  borderRadius: BorderRadius.circular(rayon),
  border: Border.all(color: C.encre, width: trait),
  boxShadow: ombre > 0 ? [BoxShadow(color: C.encre, offset: Offset(0, ombre), blurRadius: 0)] : null,
);
