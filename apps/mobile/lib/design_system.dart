import 'package:flutter/material.dart';

import 'core/afri_theme.dart';
import 'widgets/afri_ui.dart';

export 'core/afri_theme.dart';
export 'widgets/afri_ui.dart';

class AfriStageTheme {
  static ThemeData get darkTheme => AfriTheme.dark();
}

class AfriGradientShell extends StatelessWidget {
  const AfriGradientShell({super.key, required this.child, this.padding});

  final Widget child;
  final EdgeInsets? padding;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: RadialGradient(
          center: Alignment.topLeft,
          radius: 1,
          colors: [Color(0x22FFC857), AfriColors.stage],
        ),
      ),
      child: Padding(
        padding: padding ?? EdgeInsets.zero,
        child: child,
      ),
    );
  }
}

class AfriLogoMark extends StatelessWidget {
  const AfriLogoMark({super.key, this.size = 52});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        gradient:
            const LinearGradient(colors: [AfriColors.orange, AfriColors.gold]),
        borderRadius: BorderRadius.circular(size * 0.3),
        boxShadow: [
          BoxShadow(
            color: AfriColors.orange.withValues(alpha: 0.24),
            blurRadius: size * 0.42,
          )
        ],
      ),
      child: Center(
        child: Text(
          'A',
          style: TextStyle(
            color: const Color(0xFF170B02),
            fontSize: size * 0.46,
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
    );
  }
}

class AfriPill extends AfriChip {
  const AfriPill({super.key, required super.label, super.selected});
}
