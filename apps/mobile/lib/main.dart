import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'core/afri_theme.dart';
import 'core/app_state.dart';
import 'screens/creator_apply_screen.dart';
import 'screens/creator_screen.dart';
import 'screens/feed_screen.dart';
import 'screens/live_screen.dart';
import 'screens/login_screen.dart';
import 'screens/notifications_screen.dart';
import 'screens/profile_screen.dart';
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
  const _GoLiveButton({required this.icon});
  final IconData icon;
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 46,
      height: 46,
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [AfriColors.orange, AfriColors.gold]),
        shape: BoxShape.circle,
        boxShadow: [BoxShadow(color: AfriColors.orange.withValues(alpha: 0.4), blurRadius: 14)],
      ),
      child: Icon(icon, color: const Color(0xFF170B02), size: 24),
    );
  }
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  // Tabs match the mockup: Home · Live · Go Live · Activity · Profile.
  // Go Live (index 2) is an action, not a page — it pushes the go-live flow.
  static const _goLiveIndex = 2;

  @override
  Widget build(BuildContext context) {
    final pages = <Widget>[
      const FeedScreen(),
      const LiveScreen(),
      const SizedBox.shrink(), // Go Live is a push action, never shown as a page
      const NotificationsScreen(),
      const ProfileScreen(),
    ];
    final destinations = <NavigationDestination>[
      const NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
      const NavigationDestination(icon: Icon(Icons.live_tv_outlined), selectedIcon: Icon(Icons.live_tv), label: 'Live'),
      const NavigationDestination(
        icon: _GoLiveButton(icon: Icons.videocam),
        selectedIcon: _GoLiveButton(icon: Icons.videocam),
        label: 'Go Live',
      ),
      const NavigationDestination(icon: Icon(Icons.notifications_none), selectedIcon: Icon(Icons.notifications), label: 'Activity'),
      const NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Profile'),
    ];
    final safeIndex = _index.clamp(0, pages.length - 1);
    return Scaffold(
      body: pages[safeIndex],
      bottomNavigationBar: NavigationBar(
        selectedIndex: safeIndex,
        onDestinationSelected: (value) {
          if (value == _goLiveIndex) {
            final isCreator = context.read<AppState>().isCreator;
            Navigator.push(context, MaterialPageRoute(
              builder: (_) => isCreator ? const CreatorScreen() : const CreatorApplyScreen(),
            ));
            return;
          }
          setState(() => _index = value);
        },
        destinations: destinations,
      ),
    );
  }
}
