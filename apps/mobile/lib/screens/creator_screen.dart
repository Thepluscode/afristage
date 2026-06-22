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
          final stageName = creator?['stageName'] as String? ?? 'Creator';
          final earnings = '${data?['earnings'] ?? 0}';
          final supporters = (data?['topSupporters'] as List?)
                  ?.cast<Map<String, dynamic>>() ??
              const <Map<String, dynamic>>[];
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _CreatorHeader(stageName: stageName, approved: status == 'APPROVED'),
              const SizedBox(height: 14),
              AfriCreatorStatusBanner(
                status: status,
                message: status == 'APPROVED'
                    ? "You're approved to go live and receive gifts."
                    : 'Your creator profile is under review. Go Live unlocks once approved.',
              ),
              const SizedBox(height: 16),
              // Earnings + actions hero.
              AfriGradientPanel(
                colors: const [Color(0xFF1B2A18), Color(0xFF17171F)],
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Available balance',
                        style: Theme.of(context).textTheme.bodyMedium),
                    const SizedBox(height: 4),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.baseline,
                      textBaseline: TextBaseline.alphabetic,
                      children: [
                        Text(earnings,
                            style: Theme.of(context)
                                .textTheme
                                .headlineMedium
                                ?.copyWith(
                                    color: AfriColors.success,
                                    fontWeight: FontWeight.w900)),
                        const SizedBox(width: 6),
                        Text('coins',
                            style: Theme.of(context).textTheme.bodyMedium),
                      ],
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: FilledButton.icon(
                            onPressed: _goLive,
                            icon: const Icon(Icons.live_tv),
                            label: const Text('Go Live'),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: _requestPayout,
                            icon: const Icon(Icons.payments_outlined),
                            label: const Text('Request payout'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              const AfriSectionHeader(
                title: 'Overview',
                subtitle: 'Your stage performance so far',
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: AfriStatCard(
                        label: 'Earnings (coins)',
                        value: earnings,
                        icon: Icons.payments_outlined,
                        accent: AfriColors.success),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: AfriStatCard(
                        label: 'Gifts received',
                        value: '${data?['totalGiftTransactions'] ?? 0}',
                        icon: Icons.card_giftcard,
                        accent: AfriColors.gold),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: AfriStatCard(
                        label: 'Live sessions',
                        value: '${data?['totalRooms'] ?? 0}',
                        icon: Icons.mic,
                        accent: AfriColors.purple),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: AfriStatCard(
                        label: 'Followers',
                        value: '${data?['followers'] ?? 0}',
                        icon: Icons.group_outlined,
                        accent: AfriColors.teal),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              const AfriSectionHeader(
                title: 'Top supporters',
                subtitle: 'Viewers who gifted you the most',
              ),
              const SizedBox(height: 10),
              if (supporters.isEmpty)
                const AfriEmptyState(
                  icon: Icons.volunteer_activism,
                  title: 'No supporters yet',
                  body:
                      'When viewers send gifts in your rooms, your top supporters appear here.',
                )
              else
                for (final s in supporters) ...[
                  _SupporterRow(
                    name: s['displayName'] as String? ?? 'Supporter',
                    avatarUrl: s['avatarUrl'] as String?,
                    coins: (s['coins'] as num?)?.toInt() ?? 0,
                  ),
                  const SizedBox(height: 8),
                ],
              const SizedBox(height: 16),
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
            ],
          );
        },
      ),
    );
  }
}

class _CreatorHeader extends StatelessWidget {
  const _CreatorHeader({required this.stageName, required this.approved});

  final String stageName;
  final bool approved;

  @override
  Widget build(BuildContext context) {
    final initial =
        stageName.trim().isEmpty ? 'C' : stageName.trim()[0].toUpperCase();
    return Row(
      children: [
        Container(
          width: 52,
          height: 52,
          decoration: BoxDecoration(
            gradient: const LinearGradient(
                colors: [AfriColors.purple, AfriColors.orange]),
            borderRadius: BorderRadius.circular(18),
          ),
          alignment: Alignment.center,
          child: Text(initial,
              style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w900,
                  fontSize: 22)),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Welcome back,',
                  style: Theme.of(context).textTheme.bodyMedium),
              Row(
                children: [
                  Flexible(
                    child: Text(stageName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.titleLarge),
                  ),
                  if (approved) ...[
                    const SizedBox(width: 6),
                    const Icon(Icons.verified,
                        color: AfriColors.teal, size: 18),
                  ],
                ],
              ),
              Text('Creator dashboard',
                  style: Theme.of(context)
                      .textTheme
                      .labelMedium
                      ?.copyWith(color: AfriColors.mutedText)),
            ],
          ),
        ),
      ],
    );
  }
}

class _SupporterRow extends StatelessWidget {
  const _SupporterRow(
      {required this.name, required this.coins, this.avatarUrl});

  final String name;
  final int coins;
  final String? avatarUrl;

  @override
  Widget build(BuildContext context) {
    final initial = name.trim().isEmpty ? 'S' : name.trim()[0].toUpperCase();
    final hasAvatar = avatarUrl != null && avatarUrl!.isNotEmpty;
    return AfriCard(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          CircleAvatar(
            radius: 18,
            backgroundColor: AfriColors.gold.withValues(alpha: 0.16),
            backgroundImage: hasAvatar ? NetworkImage(avatarUrl!) : null,
            child: hasAvatar
                ? null
                : Text(initial,
                    style: const TextStyle(
                        color: AfriColors.gold, fontWeight: FontWeight.w800)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.titleMedium),
          ),
          Text('$coins coins',
              style: Theme.of(context)
                  .textTheme
                  .labelMedium
                  ?.copyWith(color: AfriColors.gold)),
        ],
      ),
    );
  }
}
