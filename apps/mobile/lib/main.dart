import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';

import 'core/afri_theme.dart';
import 'core/app_state.dart';
import 'screens/creator_apply_screen.dart';
import 'screens/creator_screen.dart';
import 'screens/feed_screen.dart';
import 'screens/go_live_setup_screen.dart';
import 'screens/live_screen.dart';
import 'screens/login_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/wallet_screen.dart';
import 'widgets/afri_ui.dart';

void main() {
  runApp(const AfriStageApp());
}

class AfriStageApp extends StatelessWidget {
  const AfriStageApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => AppState()..restore(),
      child: MaterialApp(
        title: 'AfriStage Live',
        debugShowCheckedModeBanner: false,
        theme: AfriTheme.dark(),
        home: const _AuthGate(),
      ),
    );
  }
}

class _AuthGate extends StatelessWidget {
  const _AuthGate();

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    if (state.isRestoring) {
      return const AfriSplash();
    }
    return state.isAuthenticated ? const HomeShell() : const LoginScreen();
  }
}

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

// Prominent gold "Go Live" center action in the bottom nav (per the mockup).
class _GoLiveButton extends StatelessWidget {
  const _GoLiveButton({required this.icon, required this.isCreator});
  final IconData icon;
  final bool isCreator;
  @override
  Widget build(BuildContext context) {
    final colors = isCreator
        ? const [AfriColors.purple, Color(0xFF8A35E8)]
        : const [AfriColors.orange, AfriColors.gold];
    final glow = isCreator ? AfriColors.purple : AfriColors.orange;
    return Container(
      width: 42,
      height: 42,
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: colors),
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white24),
        boxShadow: [
          BoxShadow(color: glow.withValues(alpha: 0.4), blurRadius: 14)
        ],
      ),
      child: Icon(
        icon,
        color: isCreator ? Colors.white : const Color(0xFF170B02),
        size: 24,
      ),
    );
  }
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  // Tabs match the consumer navigation: Home · Live · Go Live · Wallet · Profile.

  @override
  Widget build(BuildContext context) {
    final isCreator = context.watch<AppState>().isCreator;
    final pages = isCreator
        ? <Widget>[
            const FeedScreen(),
            const CreatorScreen(),
            const GoLiveSetupScreen(),
            const WalletScreen(),
            const ProfileScreen(),
          ]
        : <Widget>[
            const FeedScreen(),
            const LiveScreen(),
            const CreatorApplyScreen(),
            const WalletScreen(),
            const ProfileScreen(),
          ];
    final destinations = <NavigationDestination>[
      const NavigationDestination(
          icon: Icon(CupertinoIcons.house),
          selectedIcon: Icon(CupertinoIcons.house_fill),
          label: 'Home'),
      NavigationDestination(
          icon: Icon(isCreator
              ? CupertinoIcons.chart_bar
              : CupertinoIcons.play_rectangle),
          selectedIcon: Icon(isCreator
              ? CupertinoIcons.chart_bar_fill
              : CupertinoIcons.play_rectangle_fill),
          label: isCreator ? 'Analytics' : 'Live'),
      NavigationDestination(
        icon: _GoLiveButton(
            icon: CupertinoIcons.video_camera, isCreator: isCreator),
        selectedIcon: _GoLiveButton(
          icon: CupertinoIcons.video_camera_solid,
          isCreator: isCreator,
        ),
        label: 'Go Live',
      ),
      NavigationDestination(
          icon: const Icon(CupertinoIcons.creditcard),
          selectedIcon: const Icon(CupertinoIcons.creditcard_fill),
          label: isCreator ? 'Earn' : 'Wallet'),
      const NavigationDestination(
          icon: Icon(CupertinoIcons.person),
          selectedIcon: Icon(CupertinoIcons.person_fill),
          label: 'Profile'),
    ];
    final safeIndex = _index.clamp(0, pages.length - 1);
    return Scaffold(
      body: pages[safeIndex],
      bottomNavigationBar: DecoratedBox(
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: AfriColors.border)),
        ),
        child: NavigationBar(
          selectedIndex: safeIndex,
          onDestinationSelected: (value) => setState(() => _index = value),
          destinations: destinations,
        ),
      ),
    );
  }
}
