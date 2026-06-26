import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../core/afri_theme.dart';
import '../core/api_client.dart';
import '../core/app_state.dart';
import '../widgets/afri_live.dart';
import '../widgets/afri_ui.dart';
import 'beta_accept_screen.dart';
import 'blocked_users_screen.dart';
import 'creator_apply_screen.dart';
import 'history_screen.dart';
import 'support_screen.dart';
import 'wallet_screen.dart';

const _avatarContentTypes = <String, String>{
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'webp': 'image/webp',
  'gif': 'image/gif',
};

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool _dataSaver = false;
  String? _avatarUrl;
  bool _uploadingAvatar = false;

  @override
  void initState() {
    super.initState();
    _loadAvatar();
  }

  Future<void> _loadAvatar() async {
    try {
      final me = await context.read<AppState>().api.get('/users/me');
      final profile = me['profile'] as Map<String, dynamic>?;
      if (mounted) {
        setState(() => _avatarUrl = profile?['avatarUrl'] as String?);
      }
    } on ApiException {
      // non-critical: header just falls back to the default avatar
    }
  }

  // Revoke every refresh token server-side, then drop this device's session.
  Future<void> _signOutEverywhere() async {
    final state = context.read<AppState>();
    final messenger = ScaffoldMessenger.of(context);
    try {
      await state.api.post('/auth/logout-all');
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
      // Still drop the local session even if the server call failed.
    }
    await state.logout();
  }

  // Pick -> presign -> PUT straight to object storage -> save the URL on the
  // profile. The image never passes through the API or the database.
  Future<void> _changeAvatar() async {
    final api = context.read<AppState>().api;
    final messenger = ScaffoldMessenger.of(context);
    final XFile? picked = await ImagePicker().pickImage(
        source: ImageSource.gallery, maxWidth: 1024, imageQuality: 85);
    if (picked == null) return;

    final ext = picked.name.split('.').last.toLowerCase();
    final contentType = _avatarContentTypes[ext];
    if (contentType == null) {
      messenger.showSnackBar(const SnackBar(
          content: Text('Pick a JPG, PNG, WebP, or GIF image.')));
      return;
    }

    setState(() => _uploadingAvatar = true);
    try {
      final bytes = await picked.readAsBytes();
      final presign = await api.post(
          '/uploads/presign', {'contentType': contentType, 'kind': 'avatar'});
      await api.putBytes(presign['uploadUrl'] as String, bytes, contentType);
      final fileUrl = presign['fileUrl'] as String;
      await api.patch('/users/me', {'avatarUrl': fileUrl});
      if (mounted) setState(() => _avatarUrl = fileUrl);
      messenger.showSnackBar(
          const SnackBar(content: Text('Profile photo updated.')));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _uploadingAvatar = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final wallet = state.wallet;

    void go(Widget screen) =>
        Navigator.push(context, MaterialPageRoute(builder: (_) => screen));

    return AfriScaffold(
      title: 'Profile',
      children: [
        AfriProfileHeader(
          role: state.role,
          userId: state.userId,
          isCreator: state.isCreator,
          avatarUrl: _avatarUrl,
          uploading: _uploadingAvatar,
          onEditAvatar: _changeAvatar,
        ),
        const SizedBox(height: 16),
        // Glanceable identity strip — same stat-tile pattern as wallet/dashboard.
        Row(children: [
          Expanded(
              child: AfriStatTile(
                  label: 'Coins',
                  value: '${wallet.coinBalance}',
                  icon: Icons.monetization_on,
                  accent: AfriColors.teal)),
          const SizedBox(width: 12),
          Expanded(
              child: AfriStatTile(
                  label: 'Available',
                  value: usd(wallet.earningBalance),
                  icon: Icons.trending_up,
                  accent: AfriColors.success)),
          const SizedBox(width: 12),
          Expanded(
              child: AfriStatTile(
                  label: 'Account',
                  value: state.isCreator ? 'Creator' : 'Member',
                  icon: state.isCreator ? Icons.verified : Icons.person,
                  accent: AfriColors.purple)),
        ]),
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
          onTap: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const BlockedUsersScreen()),
          ),
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
        const SizedBox(height: 8),
        TextButton.icon(
          onPressed: _signOutEverywhere,
          icon: const Icon(Icons.devices_outlined),
          label: const Text('Sign out of all devices'),
        ),
      ],
    );
  }
}
