import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/afri_theme.dart';
import '../core/app_state.dart';
import '../widgets/afri_live.dart';
import '../widgets/afri_ui.dart';
import 'creator_rooms_screen.dart';
import 'go_live_setup_screen.dart';
import 'payout_history_screen.dart';
import 'payout_methods_screen.dart';

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

  void _reload() => setState(() {
        _dashboard = _load();
      });

  Future<void> _refresh() async {
    final f = _load();
    setState(() {
      _dashboard = f;
    });
    await f;
  }

  // totalWatchSeconds is a BigInt server-side; it may arrive as a number or a
  // string, so parse defensively. Render as the largest sensible unit.
  String _formatWatch(dynamic raw) {
    final secs = num.tryParse('${raw ?? 0}')?.toInt() ?? 0;
    if (secs < 60) return '${secs}s';
    final minutes = secs ~/ 60;
    if (minutes < 60) return '${minutes}m';
    final hours = minutes ~/ 60;
    return '${hours}h ${minutes % 60}m';
  }

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
    final navigator = Navigator.of(context);
    // A payout needs a destination. If the creator has none, send them to add
    // one rather than creating a payout that can never be settled.
    final methods = await state.api.getList('/payouts/methods');
    if (methods.isEmpty) {
      messenger.showSnackBar(const SnackBar(
          content: Text('Add a payout method first so earnings can settle.')));
      await navigator
          .push(MaterialPageRoute(builder: (_) => const PayoutMethodsScreen()));
      return;
    }
    final defaultMethod = methods.cast<Map<String, dynamic>>().firstWhere(
        (m) => m['isDefault'] == true,
        orElse: () => methods.first as Map<String, dynamic>);
    final raw = await _prompt('Payout amount (coins)', '500',
        confirmLabel: 'Request Payout');
    final coins = int.tryParse(raw ?? '');
    if (coins == null) return;
    try {
      final res = await state.api.post('/payouts/request', {
        'coinAmount': coins,
        'idempotencyKey': 'payout-${DateTime.now().microsecondsSinceEpoch}',
        'payoutMethodId': defaultMethod['id'],
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
    // The controller lives in _PromptDialog's State so it's disposed only after
    // the dialog route is fully removed — never read mid-exit-animation.
    return showDialog<String>(
      context: context,
      builder: (_) => _PromptDialog(
          label: label, initial: initial, confirmLabel: confirmLabel),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Create'),
        actions: [
          IconButton(
            tooltip: 'Creator settings',
            onPressed: () => Navigator.push(context,
                MaterialPageRoute(builder: (_) => const CreatorRoomsScreen())),
            icon: const Icon(Icons.settings_outlined),
          ),
          IconButton(
            tooltip: 'Creator alerts',
            onPressed: _reload,
            icon: const Icon(Icons.notifications_none),
          ),
          const SizedBox(width: 6),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<Map<String, dynamic>>(
          future: _dashboard,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              return ListView(
                physics: const AlwaysScrollableScrollPhysics(),
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
            final earnings = usd((data?['earnings'] as num?) ?? 0);
            final supporters = (data?['topSupporters'] as List?)
                    ?.cast<Map<String, dynamic>>() ??
                const <Map<String, dynamic>>[];
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16),
              children: [
                _CreatorHeader(
                    stageName: stageName,
                    approved: status == 'APPROVED',
                    avatarUrl: data?['avatarUrl'] as String?),
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
                          Text('available',
                              style: Theme.of(context).textTheme.bodyMedium),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          Expanded(
                            child: FilledButton.icon(
                              onPressed: _goLive,
                              style: FilledButton.styleFrom(
                                backgroundColor: AfriColors.purple,
                                foregroundColor: Colors.white,
                              ),
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
                      child: AfriStatTile(
                          label: 'Earnings',
                          value: earnings,
                          icon: Icons.payments_outlined,
                          accent: AfriColors.success),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: AfriStatTile(
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
                      child: AfriStatTile(
                          label: 'Live sessions',
                          value: '${data?['totalRooms'] ?? 0}',
                          icon: Icons.mic,
                          accent: AfriColors.purple),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: AfriStatTile(
                          label: 'Followers',
                          value: '${data?['followers'] ?? 0}',
                          icon: Icons.group_outlined,
                          accent: AfriColors.teal),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: AfriStatTile(
                          label: 'Watch time',
                          value: _formatWatch(data?['totalWatchSeconds']),
                          icon: Icons.schedule,
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
                  icon: Icons.account_balance,
                  title: 'Payout methods',
                  body:
                      'Add a bank or mobile-money destination for your earnings.',
                  accent: AfriColors.teal,
                  onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                          builder: (_) => const PayoutMethodsScreen())),
                ),
                const SizedBox(height: 10),
                AfriActionRow(
                  icon: Icons.history,
                  title: 'Payout history',
                  body: 'Track every payout request from review to paid.',
                  accent: AfriColors.gold,
                  onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                          builder: (_) => const PayoutHistoryScreen())),
                ),
                const SizedBox(height: 10),
                AfriActionRow(
                  icon: Icons.insights,
                  title: 'Show performance',
                  body: 'Peak viewers, watch time, and gifts for each room.',
                  accent: AfriColors.purple,
                  onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                          builder: (_) => const CreatorRoomsScreen())),
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
      ),
    );
  }
}

class _CreatorHeader extends StatelessWidget {
  const _CreatorHeader(
      {required this.stageName, required this.approved, this.avatarUrl});

  final String stageName;
  final bool approved;
  final String? avatarUrl;

  @override
  Widget build(BuildContext context) {
    final initial =
        stageName.trim().isEmpty ? 'C' : stageName.trim()[0].toUpperCase();
    final hasPhoto = avatarUrl != null && avatarUrl!.isNotEmpty;
    return Row(
      children: [
        Container(
          width: 56,
          height: 56,
          padding: const EdgeInsets.all(2.5),
          decoration: const BoxDecoration(
            shape: BoxShape.circle,
            gradient:
                LinearGradient(colors: [AfriColors.purple, AfriColors.orange]),
          ),
          child: CircleAvatar(
            backgroundColor: AfriColors.elevated,
            backgroundImage: hasPhoto ? NetworkImage(avatarUrl!) : null,
            child: hasPhoto
                ? null
                : Text(initial,
                    style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w900,
                        fontSize: 22)),
          ),
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
          Text(usd(coins),
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: AfriColors.success, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}

// Owns its TextEditingController so it is disposed with the dialog's State (after
// the route is removed), avoiding a use-after-dispose during the exit animation.
class _PromptDialog extends StatefulWidget {
  const _PromptDialog(
      {required this.label, required this.initial, required this.confirmLabel});
  final String label;
  final String initial;
  final String confirmLabel;

  @override
  State<_PromptDialog> createState() => _PromptDialogState();
}

class _PromptDialogState extends State<_PromptDialog> {
  late final TextEditingController _controller =
      TextEditingController(text: widget.initial);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.label),
      content: TextField(controller: _controller, autofocus: true),
      actions: [
        TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel')),
        FilledButton(
            onPressed: () => Navigator.pop(context, _controller.text.trim()),
            child: Text(widget.confirmLabel)),
      ],
    );
  }
}
