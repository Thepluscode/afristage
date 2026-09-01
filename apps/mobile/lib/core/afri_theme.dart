import 'package:flutter/material.dart';

/// Colour is named by the JOB IT DOES, not by what it looks like. A palette of
/// `orange` / `gold` / `purple` / `teal` cannot tell anyone which one to reach
/// for, so every screen picked whatever looked good locally: 78 distinct
/// colours across 111 literals, and the accent the theme declared primary
/// (`orange`) was only the third most used.
///
/// `action` is gold because that is what the landing page's CTA already is
/// (`--gold-hot: #ffc857` in apps/landing/index.html). A visitor who taps
/// "Claim your stage" and installs should meet the same colour, doing the same
/// job, on the other side.
class AfriColors {
  // ---- surfaces ----
  static const stage = Color(0xFF07070A);
  static const surface = Color(0xFF0E0E13);
  static const elevated = Color(0xFF17171F);
  static const soft = Color(0xFF20202B);
  static const border = Color(0xFF242433);
  static const borderStrong = Color(0xFF343445);

  // ---- roles ----
  /// The one filled call-to-action on a screen. If two things are `action`,
  /// one of them is wrong.
  static const action = Color(0xFFFFC857);

  /// Foreground on [action]. Dark, because gold cannot carry white text.
  static const onAction = Color(0xFF170B02);

  /// Coins, balances, earnings. Same hue as [action] on purpose — this is a
  /// gold economy, and money *is* the primary action here.
  static const money = action;

  /// Going live, following, creator growth. A real second role, not drift:
  /// used consistently for broadcast actions across five screens and the nav
  /// FAB. `action` and `broadcast` may both appear on a screen — they are
  /// different jobs — but only one of them may be the loud one.
  static const broadcast = Color(0xFF7C3AED);

  static const success = Color(0xFF22C55E);
  static const danger = Color(0xFFEF4444);

  /// Amber, deliberately far enough from [action] that a warning cannot be
  /// mistaken for the button you are supposed to press. The old `warning`
  /// (0xFFF97316) sat inside the same orange family as the old primary.
  static const warning = Color(0xFFF59E0B);

  /// Focus rings. The same colour as [action]: focus and primary are the same
  /// idea — "this one" — and used to be two different colours.
  static const focus = action;

  // ---- text ----
  static const text = Color(0xFFFAFAFA);
  static const secondaryText = Color(0xFFD4D4D8);
  static const mutedText = Color(0xFFA1A1AA);

  // ---- retired appearance names ----
  // Kept as aliases so this change stays one file instead of 454 call sites.
  // `orange` and `premium` collapse into [action]; the app now has one primary.
  // `teal` and `purple` are still generic accent tints across 20+ screens and
  // are retired in a later pass, not blanket-remapped here — that would turn a
  // stat card red and a settings icon gold.
  @Deprecated('use AfriColors.action')
  static const orange = action;
  @Deprecated('use AfriColors.action')
  static const premium = action;
  @Deprecated('use AfriColors.action or AfriColors.money')
  static const gold = action;
  @Deprecated('use AfriColors.broadcast')
  static const purple = broadcast;

  /// Not retired, because it is currently doing two unrelated jobs: the LIVE
  /// badge on cards and in the room (a documented mockup decision — red is
  /// reserved for the hero-only [AfriLiveNowPill], which uses [danger]), and a
  /// generic icon tint on ~20 settings/profile screens. Splitting those two is
  /// its own pass; aliasing it here would recolour one of them wrongly.
  static const teal = Color(0xFF14B8A6);
}

class AfriTheme {
  static ThemeData dark() {
    final scheme = ColorScheme.fromSeed(
      seedColor: AfriColors.action,
      brightness: Brightness.dark,
      primary: AfriColors.action,
      secondary: AfriColors.teal,
      tertiary: AfriColors.money,
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
          backgroundColor: AfriColors.action,
          foregroundColor: AfriColors.onAction,
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
            borderSide: const BorderSide(color: AfriColors.focus, width: 1.4)),
        labelStyle: const TextStyle(color: AfriColors.secondaryText),
        hintStyle: const TextStyle(color: AfriColors.mutedText),
      ),
      navigationBarTheme: NavigationBarThemeData(
        height: 62,
        backgroundColor: AfriColors.surface,
        // Selected used to be signalled by colour alone — and by two colours
        // that disagreed: a gold icon above a white label. A pill behind the
        // selected item carries the state without relying on hue, which is
        // also the only version that survives a colour-vision deficiency.
        indicatorColor: AfriColors.action.withValues(alpha: 0.14),
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => TextStyle(
            fontSize: 10,
            fontWeight: states.contains(WidgetState.selected)
                ? FontWeight.w800
                : FontWeight.w600,
            color: states.contains(WidgetState.selected)
                ? AfriColors.action
                : AfriColors.mutedText,
          ),
        ),
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            size: 21,
            color: states.contains(WidgetState.selected)
                ? AfriColors.action
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
        selectedColor: AfriColors.action.withValues(alpha: 0.16),
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
