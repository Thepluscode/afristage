import 'package:flutter/material.dart';

class AfriColors {
  static const stage = Color(0xFF07070A);
  static const surface = Color(0xFF0E0E13);
  static const elevated = Color(0xFF17171F);
  static const soft = Color(0xFF20202B);
  static const border = Color(0xFF242433);
  static const borderStrong = Color(0xFF343445);
  static const orange = Color(0xFFFF8A1F);
  static const gold = Color(0xFFFFC857);
  static const premium = Color(0xFFFFB000);
  static const purple = Color(0xFF7C3AED);
  static const teal = Color(0xFF14B8A6);
  static const success = Color(0xFF22C55E);
  static const danger = Color(0xFFEF4444);
  static const warning = Color(0xFFF97316);
  static const text = Color(0xFFFAFAFA);
  static const secondaryText = Color(0xFFD4D4D8);
  static const mutedText = Color(0xFFA1A1AA);
}

class AfriTheme {
  static ThemeData dark() {
    final scheme = ColorScheme.fromSeed(
      seedColor: AfriColors.orange,
      brightness: Brightness.dark,
      primary: AfriColors.orange,
      secondary: AfriColors.teal,
      tertiary: AfriColors.gold,
      error: AfriColors.danger,
      surface: AfriColors.surface,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: scheme,
      scaffoldBackgroundColor: AfriColors.stage,
      appBarTheme: const AppBarTheme(
        elevation: 0,
        scrolledUnderElevation: 0,
        toolbarHeight: 56,
        centerTitle: false,
        backgroundColor: AfriColors.stage,
        surfaceTintColor: Colors.transparent,
        foregroundColor: AfriColors.text,
        titleTextStyle: TextStyle(
            fontSize: 19, fontWeight: FontWeight.w700, color: AfriColors.text),
      ),
      cardTheme: CardThemeData(
        color: AfriColors.elevated.withValues(alpha: 0.96),
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: AfriColors.border),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(44),
          backgroundColor: AfriColors.orange,
          foregroundColor: const Color(0xFF170B02),
          disabledBackgroundColor: AfriColors.elevated,
          disabledForegroundColor: AfriColors.mutedText,
          textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(44),
          foregroundColor: AfriColors.secondaryText,
          side: const BorderSide(color: AfriColors.border),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AfriColors.surface,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 15, vertical: 14),
        border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: AfriColors.border)),
        enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: AfriColors.border)),
        focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: AfriColors.teal, width: 1.4)),
        labelStyle: const TextStyle(color: AfriColors.secondaryText),
        hintStyle: const TextStyle(color: AfriColors.mutedText),
      ),
      navigationBarTheme: NavigationBarThemeData(
        height: 62,
        backgroundColor: AfriColors.surface,
        indicatorColor: Colors.transparent,
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => TextStyle(
            fontSize: 10,
            fontWeight: states.contains(WidgetState.selected)
                ? FontWeight.w800
                : FontWeight.w600,
            color: states.contains(WidgetState.selected)
                ? AfriColors.text
                : AfriColors.mutedText,
          ),
        ),
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            size: 21,
            color: states.contains(WidgetState.selected)
                ? AfriColors.gold
                : AfriColors.mutedText,
          ),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: AfriColors.elevated,
        contentTextStyle: const TextStyle(color: AfriColors.text),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      dividerTheme: const DividerThemeData(
        color: AfriColors.border,
        thickness: 1,
        space: 1,
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: AfriColors.elevated,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(24),
          side: const BorderSide(color: AfriColors.borderStrong),
        ),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: AfriColors.elevated,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        dragHandleColor: AfriColors.borderStrong,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: AfriColors.surface,
        selectedColor: AfriColors.orange.withValues(alpha: 0.16),
        side: const BorderSide(color: AfriColors.border),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(999),
        ),
        labelStyle: const TextStyle(
          color: AfriColors.secondaryText,
          fontSize: 13,
          fontWeight: FontWeight.w700,
        ),
      ),
      textTheme: const TextTheme(
        headlineMedium: TextStyle(
            fontSize: 29,
            height: 1.08,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.8,
            color: AfriColors.text),
        headlineSmall: TextStyle(
            fontSize: 26,
            height: 1.12,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.5,
            color: AfriColors.text),
        titleLarge: TextStyle(
            fontSize: 22,
            height: 1.18,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.3,
            color: AfriColors.text),
        titleMedium: TextStyle(
            fontSize: 18,
            height: 1.2,
            fontWeight: FontWeight.w700,
            color: AfriColors.text),
        bodyLarge: TextStyle(
            fontSize: 16, height: 1.45, color: AfriColors.secondaryText),
        bodyMedium: TextStyle(
            fontSize: 14, height: 1.45, color: AfriColors.secondaryText),
        labelMedium: TextStyle(
            fontSize: 12,
            height: 1.2,
            fontWeight: FontWeight.w800,
            color: AfriColors.mutedText),
      ),
    );
  }
}
