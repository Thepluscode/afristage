import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/afri_theme.dart';
import '../core/app_state.dart';
import '../widgets/afri_ui.dart';
import 'go_live_setup_screen.dart';
import 'payout_history_screen.dart';

class CreatorScreen extends StatefulWidget {
  const CreatorScreen({super.key});

  @override
  State<CreatorScreen> createState() => _CreatorScreenState();
}

class _CreatorScreenState extends State<CreatorScreen> {
  late Future<Map<String, dynamic>> _dashboard;

  @override
  void initState() {
    super.initState();
    _dashboard = _load();
  }

  Future<Map<String, dynamic>> _load() =>
      context.read<AppState>().api.get('/creators/me/dashboard');

  void _reload() => setState(() => _dashboard = _load());

  Future<void> _goLive() async {
    await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const GoLiveSetupScreen()),
    );
    _reload();
  }

  Future<void> _requestPayout() async {
    final state = context.read<AppState>();
    final messenger = ScaffoldMessenger.of(context);
    final raw = await _prompt('Payout amount (coins)', '500',
        confirmLabel: 'Request Payout');
    final coins = int.tryParse(raw ?? '');
    if (coins == null) return;
    try {
      final res = await state.api.post('/payouts/request', {
        'coinAmount': coins,
        'idempotencyKey': 'payout-${DateTime.now().microsecondsSinceEpoch}',
      });
      messenger
          .showSnackBar(SnackBar(content: Text('Payout ${res['status']}')));
      _reload();
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<String?> _prompt(String label, String initial,
      {required String confirmLabel}) {
    final controller = TextEditingController(text: initial);
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(label),
        content: TextField(controller: controller, autofocus: true),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, controller.text.trim()),
              child: Text(confirmLabel)),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Create')),
      body: FutureBuilder<Map<String, dynamic>>(
        future: _dashboard,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const SizedBox(height: 80),
                AfriEmptyState(
                  icon: Icons.wifi_off,
                  title: 'Creator hub unavailable',
                  body:
                      'Check your connection and retry. If the problem continues, contact support.',
                  action: FilledButton(
                    onPressed: _reload,
                    child: const Text('Retry creator hub'),
                  ),
                ),
              ],
            );
          }
          final data = snapshot.data;
          final creator = data?['creator'] as Map<String, dynamic>?;
          final status = creator?['status'] as String? ??
              (creator == null ? 'PENDING' : 'APPROVED');
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              AfriCreatorStatusBanner(
                status: status,
                message: status == 'APPROVED'
                    ? 'You can go live and receive gifts.'
                    : 'Your creator profile is under review. Go Live unlocks once approved.',
              ),
              const SizedBox(height: 12),
              AfriGradientPanel(
                colors: const [Color(0xFF211135), Color(0xFF17171F)],
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const AfriIconBadge(
                            icon: Icons.graphic_eq, accent: AfriColors.purple),
                        const Spacer(),
                        AfriChip(
                            label: creator == null ? 'Setup needed' : 'Creator',
                            selected: creator != null),
                      ],
                    ),
                    const SizedBox(height: 18),
                    Text(creator?['stageName'] as String? ?? 'Your studio',
                        style: Theme.of(context).textTheme.headlineSmall),
                    const SizedBox(height: 8),
                    Text(
                        'Set up your stage, track gifts, and request payouts from one creator hub.',
                        style: Theme.of(context).textTheme.bodyMedium),
                    const SizedBox(height: 18),
                    FilledButton.icon(
                      onPressed: _goLive,
                      icon: const Icon(Icons.live_tv),
                      label: const Text('Go Live'),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              AfriStatCard(
                  label: 'Earnings (coins)',
                  value: '${data?['earnings'] ?? '—'}',
                  icon: Icons.payments_outlined,
                  accent: AfriColors.success),
              const SizedBox(height: 12),
              AfriStatCard(
                  label: 'Gifts received',
                  value: '${data?['totalGiftTransactions'] ?? '—'}',
                  icon: Icons.card_giftcard,
                  accent: AfriColors.gold),
              const SizedBox(height: 12),
              AfriStatCard(
                  label: 'Rooms hosted',
                  value: '${data?['totalRooms'] ?? '—'}',
                  icon: Icons.mic,
                  accent: AfriColors.purple),
              const SizedBox(height: 12),
              AfriStatCard(
                  label: 'Followers',
                  value: '${data?['followers'] ?? '—'}',
                  icon: Icons.group_outlined,
                  accent: AfriColors.teal),
              const SizedBox(height: 12),
              AfriStatCard(
                  label: 'Live minutes',
                  value: '${data?['liveMinutes'] ?? '—'}',
                  icon: Icons.timer_outlined,
                  accent: AfriColors.orange),
              const SizedBox(height: 20),
              const AfriSectionHeader(
                title: 'Creator actions',
                subtitle: 'Manage the work around every live stage',
              ),
              const SizedBox(height: 10),
              AfriActionRow(
                icon: Icons.payments,
                title: 'Request payout',
                body: 'Move cleared creator earnings into payout review.',
                accent: AfriColors.success,
                onTap: _requestPayout,
              ),
              const SizedBox(height: 10),
              AfriActionRow(
                icon: Icons.history,
                title: 'Payout history',
                body: 'Track every payout request from review to paid.',
                accent: AfriColors.gold,
                onTap: () => Navigator.push(context,
                    MaterialPageRoute(builder: (_) => const PayoutHistoryScreen())),
              ),
              const SizedBox(height: 10),
              AfriActionRow(
                icon: Icons.tune,
                title: 'Prepare next room',
                body: 'Set title, region, language, and viewer defaults.',
                accent: AfriColors.teal,
                onTap: _goLive,
              ),
              const SizedBox(height: 20),
              const AfriSectionHeader(
                title: 'Recent activity',
                subtitle: 'Latest gifts, streams, and payouts will appear here',
              ),
              const SizedBox(height: 10),
              const AfriEmptyState(
                icon: Icons.bolt,
                title: 'No recent activity yet',
                body:
                    'After your next room, gifts and payout movements will show here.',
              ),
            ],
          );
        },
      ),
    );
  }
}
