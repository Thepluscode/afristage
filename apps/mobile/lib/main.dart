import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'core/afri_theme.dart';
import 'core/app_state.dart';
import 'screens/creator_apply_screen.dart';
import 'screens/creator_screen.dart';
import 'screens/feed_screen.dart';
import 'screens/login_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/support_screen.dart';
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

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final isCreator = context.watch<AppState>().isCreator;
    final pages = <Widget>[
      const FeedScreen(),
      isCreator ? const CreatorScreen() : const CreatorApplyScreen(),
      const WalletScreen(),
      const SupportScreen(),
      const ProfileScreen(),
    ];
    final destinations = <NavigationDestination>[
      const NavigationDestination(
          icon: Icon(Icons.home_outlined),
          selectedIcon: Icon(Icons.home),
          label: 'Home'),
      NavigationDestination(
        icon: Container(
          width: 38,
          height: 38,
          decoration: BoxDecoration(
            gradient: const LinearGradient(
                colors: [AfriColors.orange, AfriColors.gold]),
            borderRadius: BorderRadius.circular(16),
          ),
          child: const Icon(Icons.add, color: Color(0xFF170B02)),
        ),
        selectedIcon: Container(
          width: 38,
          height: 38,
          decoration: BoxDecoration(
            gradient: const LinearGradient(
                colors: [AfriColors.orange, AfriColors.gold]),
            borderRadius: BorderRadius.circular(16),
          ),
          child: const Icon(Icons.mic, color: Color(0xFF170B02)),
        ),
        label: 'Create',
      ),
      const NavigationDestination(
          icon: Icon(Icons.account_balance_wallet_outlined),
          selectedIcon: Icon(Icons.account_balance_wallet),
          label: 'Wallet'),
      const NavigationDestination(
          icon: Icon(Icons.support_agent_outlined),
          selectedIcon: Icon(Icons.support_agent),
          label: 'Support'),
      const NavigationDestination(
          icon: Icon(Icons.person_outline),
          selectedIcon: Icon(Icons.person),
          label: 'Profile'),
    ];
    final safeIndex = _index.clamp(0, pages.length - 1);
    return Scaffold(
      body: pages[safeIndex],
      bottomNavigationBar: NavigationBar(
        selectedIndex: safeIndex,
        onDestinationSelected: (value) => setState(() => _index = value),
        destinations: destinations,
      ),
    );
  }
}
