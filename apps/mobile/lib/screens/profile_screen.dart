import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/afri_theme.dart';
import '../core/app_state.dart';
import '../widgets/afri_ui.dart';
import 'beta_accept_screen.dart';
import 'creator_apply_screen.dart';
import 'history_screen.dart';
import 'support_screen.dart';
import 'wallet_screen.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool _dataSaver = false;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();

    void go(Widget screen) =>
        Navigator.push(context, MaterialPageRoute(builder: (_) => screen));

    return AfriScaffold(
      title: 'Profile',
      children: [
        AfriProfileHeader(
          role: state.role,
          userId: state.userId,
          isCreator: state.isCreator,
        ),
        const SizedBox(height: 16),
        AfriActionRow(
          icon: Icons.mic,
          title: state.isCreator ? 'Creator status' : 'Become a creator',
          body: state.isCreator
              ? 'Review your creator application and live access.'
              : 'Apply to host rooms and earn from gifts.',
          accent: AfriColors.purple,
          onTap: () => go(const CreatorApplyScreen()),
        ),
        const SizedBox(height: 10),
        AfriActionRow(
          icon: Icons.account_balance_wallet,
          title: 'Wallet',
          body: 'Buy coins, review earnings, and open ledger history.',
          accent: AfriColors.gold,
          onTap: () => go(const WalletScreen()),
        ),
        const SizedBox(height: 10),
        AfriActionRow(
          icon: Icons.confirmation_number,
          title: 'Enter beta invite',
          body: 'Unlock staged access from an invite code.',
          accent: AfriColors.gold,
          onTap: () => go(const BetaAcceptScreen()),
        ),
        const SizedBox(height: 10),
        AfriActionRow(
          icon: Icons.receipt_long,
          title: 'Transaction history',
          body: 'Review coin purchases, gifts, and payout movements.',
          accent: AfriColors.success,
          onTap: () => go(const HistoryScreen()),
        ),
        const SizedBox(height: 10),
        AfriActionRow(
          icon: Icons.support_agent,
          title: 'Support',
          body: 'Open payment, account, moderation, or creator tickets.',
          accent: AfriColors.teal,
          onTap: () => go(const SupportScreen()),
        ),
        const SizedBox(height: 16),
        const AfriSectionHeader(
          title: 'Settings',
          subtitle: 'Control safety, bandwidth, and session behaviour',
        ),
        const SizedBox(height: 10),
        AfriCard(
          child: SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: _dataSaver,
            onChanged: (value) => setState(() => _dataSaver = value),
            title: const Text('Data saver mode'),
            subtitle:
                const Text('Reduce visual load for lower bandwidth rooms.'),
          ),
        ),
        const SizedBox(height: 10),
        AfriActionRow(
          icon: Icons.block,
          title: 'Blocked users',
          body: 'Manage accounts you do not want to interact with.',
          accent: AfriColors.warning,
          onTap: () =>
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Blocked users management is coming soon.'),
          )),
        ),
        const SizedBox(height: 10),
        AfriActionRow(
          icon: Icons.security,
          title: 'Security and session',
          body: 'Review login state and end this device session.',
          accent: AfriColors.teal,
          onTap: () =>
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('You are signed in on this device.'),
          )),
        ),
        const SizedBox(height: 16),
        FilledButton.tonalIcon(
          onPressed: () => context.read<AppState>().logout(),
          icon: const Icon(Icons.logout),
          label: const Text('Log out'),
        ),
      ],
    );
  }
}
