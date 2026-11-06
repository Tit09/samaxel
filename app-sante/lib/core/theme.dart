import 'package:flutter/material.dart';

/// Palette SAMA XHEL — inspirée du logo (baobab vert) et du drapeau (or).
abstract class C {
  static const vertFonce = Color(0xFF0F3D24);
  static const vert = Color(0xFF187A3B);
  static const vertClair = Color(0xFF2E9E56);
  static const vertPale = Color(0xFFE6F4EA);
  static const or = Color(0xFFE0A016);
  static const orPale = Color(0xFFFFF4D6);
  static const fond = Color(0xFFF6F7F2);
  static const surface = Colors.white;
  static const texte = Color(0xFF1B2B21);
  static const texteDoux = Color(0xFF5F6B63);
  static const bordure = Color(0xFFDDE5DA);

  // Priorités de l'IA de tri
  static const urgent = Color(0xFFC62828);
  static const urgentPale = Color(0xFFFDECEA);
  static const prioritaire = Color(0xFFE07B00);
  static const prioritairePale = Color(0xFFFFF1E0);
  static const normal = Color(0xFF2E7D32);
  static const normalPale = Color(0xFFE8F5E9);
  static const info = Color(0xFF1E5AA8);
  static const infoPale = Color(0xFFE7F0FB);
}

/// [accent] : couleur de l'établissement où l'on se trouve (sa « maison »), sinon le vert SAMA XHEL.
ThemeData construireTheme({Color accent = C.vert}) {
  final base = ThemeData(
    useMaterial3: true,
    fontFamily: 'Nunito',
    colorScheme: ColorScheme.fromSeed(
      seedColor: accent,
      primary: accent,
      secondary: C.or,
      surface: C.surface,
      error: C.urgent,
    ),
    scaffoldBackgroundColor: C.fond,
  );
  final texte = base.textTheme.apply(
    fontFamily: 'Nunito',
    bodyColor: C.texte,
    displayColor: C.texte,
  );
  return base.copyWith(
    textTheme: texte.copyWith(
      headlineSmall: texte.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
      titleLarge: texte.titleLarge?.copyWith(fontWeight: FontWeight.w800),
      titleMedium: texte.titleMedium?.copyWith(fontWeight: FontWeight.w700),
      bodyLarge: texte.bodyLarge?.copyWith(fontSize: 17, height: 1.35),
      bodyMedium: texte.bodyMedium?.copyWith(fontSize: 15.5, height: 1.35),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: C.fond,
      foregroundColor: C.texte,
      elevation: 0,
      scrolledUnderElevation: 0.5,
      centerTitle: false,
      titleTextStyle: TextStyle(fontFamily: 'Nunito', fontSize: 20, fontWeight: FontWeight.w800, color: C.texte),
    ),
    cardTheme: CardThemeData(
      color: C.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: const BorderSide(color: C.bordure),
      ),
    ),
    // Grands boutons : public peu familier du numérique (cible tactile ≥ 56 px)
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(56),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        textStyle: TextStyle(fontFamily: 'Nunito', fontSize: 17, fontWeight: FontWeight.w800),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        side: BorderSide(color: accent, width: 1.4),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        textStyle: TextStyle(fontFamily: 'Nunito', fontSize: 16, fontWeight: FontWeight.w700),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: C.bordure)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: C.bordure)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: accent, width: 2)),
    ),
    chipTheme: base.chipTheme.copyWith(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      side: const BorderSide(color: C.bordure),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      indicatorColor: accent.withValues(alpha: .16),
      height: 70,
      labelTextStyle: WidgetStatePropertyAll(TextStyle(fontFamily: 'Nunito', fontSize: 12.5, fontWeight: FontWeight.w700)),
    ),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
  );
}
