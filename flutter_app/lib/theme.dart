import 'package:flutter/material.dart';

/// Identity: sunset gradient, glass panels, gold accents, Arabic-first RTL.
class AppColors {
  static const bgDeep = Color(0xFF2B1533);
  static const bgMid = Color(0xFF6B2A12);
  static const bgWarm = Color(0xFFC06214);
  static const gold = Color(0xFFF4C662);
  static const goldDeep = Color(0xFFB8860B);
  static const accent = Color(0xFF7C5CFF);
  static const ok = Color(0xFF48D18A);
  static const danger = Color(0xFFFF6B6B);
  static const text = Color(0xFFFDF7EE);
  static const muted = Color(0xFFC9BCD0);

  static const sunset = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0xFF3A1A2C), bgMid, bgWarm],
  );

  static const roomBackgrounds = <String, List<Color>>{
    'sunset': [Color(0xFF3A1A2C), Color(0xFFC06214)],
    'night': [Color(0xFF0F1024), Color(0xFF3A2A6B)],
    'desert': [Color(0xFF40230F), Color(0xFFD79B4A)],
    'sea': [Color(0xFF08283A), Color(0xFF2E8FA8)],
    'royal': [Color(0xFF1E0F3B), Color(0xFF7C5CFF)],
    'aurora': [Color(0xFF10222E), Color(0xFF48D18A)],
  };
}

ThemeData buildTheme() {
  final base = ThemeData.dark(useMaterial3: true);
  return base.copyWith(
    scaffoldBackgroundColor: Colors.transparent,
    colorScheme: base.colorScheme.copyWith(
      primary: AppColors.gold,
      secondary: AppColors.accent,
      surface: const Color(0xFF1A1224),
    ),
    textTheme: base.textTheme.apply(bodyColor: AppColors.text, displayColor: AppColors.text),
    appBarTheme: const AppBarTheme(backgroundColor: Colors.transparent, elevation: 0, centerTitle: true),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: const Color(0xCC120C1A),
      indicatorColor: AppColors.accent.withValues(alpha: 0.4),
      labelTextStyle: WidgetStatePropertyAll(TextStyle(fontSize: 11, color: AppColors.text)),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.black.withValues(alpha: 0.35),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
      labelStyle: const TextStyle(color: AppColors.muted),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.accent,
        foregroundColor: Colors.white,
        minimumSize: const Size(0, 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.text,
        side: const BorderSide(color: Color(0x33FFFFFF)),
        minimumSize: const Size(0, 46),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
  );
}

/// Frosted panel used for every card in the app.
class GlassPanel extends StatelessWidget {
  const GlassPanel({super.key, required this.child, this.padding = const EdgeInsets.all(16), this.radius = 18});

  final Widget child;
  final EdgeInsetsGeometry padding;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: const Color(0x9E120C1A),
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: const Color(0x24FFFFFF)),
      ),
      child: child,
    );
  }
}

/// App-wide background gradient.
class SunsetScaffold extends StatelessWidget {
  const SunsetScaffold({super.key, required this.child, this.colors});

  final Widget child;
  final List<Color>? colors;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: colors == null ? AppColors.sunset : LinearGradient(colors: colors!, begin: Alignment.topCenter, end: Alignment.bottomCenter),
      ),
      child: child,
    );
  }
}
