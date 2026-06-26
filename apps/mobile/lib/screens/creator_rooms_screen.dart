import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/afri_theme.dart';
import '../core/app_state.dart';
import '../widgets/afri_live.dart';
import '../widgets/afri_ui.dart';

class CreatorRoomsScreen extends StatefulWidget {
  const CreatorRoomsScreen({super.key});

  @override
  State<CreatorRoomsScreen> createState() => _CreatorRoomsScreenState();
}

class _CreatorRoomsScreenState extends State<CreatorRoomsScreen> {
  late Future<List<dynamic>> _rooms;

  @override
  void initState() {
    super.initState();
    _rooms = _load();
  }

  Future<List<dynamic>> _load() =>
      context.read<AppState>().api.getList('/creators/me/rooms');

  Future<void> _refresh() async {
    final f = _load();
    setState(() {
      _rooms = f;
    });
    await f;
  }

  // totalWatchSeconds is a BigInt server-side; parse defensively.
  String _watch(dynamic raw) {
    final secs = num.tryParse('${raw ?? 0}')?.toInt() ?? 0;
    if (secs < 60) return '${secs}s';
    final m = secs ~/ 60;
    if (m < 60) return '${m}m';
    return '${m ~/ 60}h ${m % 60}m';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Show performance')),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<List<dynamic>>(
          future: _rooms,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              return ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  AfriErrorState(
                    title: 'Could not load your shows',
                    body: 'Check your connection and try again.',
                    onRetry: () => setState(() {
                      _rooms = _load();
                    }),
                  ),
                ],
              );
            }
            final rows =
                (snapshot.data ?? const []).cast<Map<String, dynamic>>();
            if (rows.isEmpty) {
              return ListView(
                padding: const EdgeInsets.all(16),
                children: const [
                  AfriEmptyState(
                    icon: Icons.insights,
                    title: 'No shows yet',
                    body: 'Go live, and each room\'s stats will show up here.',
                  ),
                ],
              );
            }
            return ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16),
              itemCount: rows.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (context, i) {
                final r = rows[i];
                return AfriCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text('${r['title'] ?? 'Untitled room'}',
                                style: Theme.of(context).textTheme.titleMedium),
                          ),
                          AfriChip(label: '${r['status'] ?? ''}'),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        shortDateTime(
                            '${r['startedAt'] ?? r['createdAt'] ?? ''}'),
                        style: Theme.of(context)
                            .textTheme
                            .bodySmall
                            ?.copyWith(color: AfriColors.mutedText),
                      ),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          _Metric(
                              icon: Icons.visibility,
                              label: 'Peak',
                              value: '${r['peakViewers'] ?? 0}'),
                          _Metric(
                              icon: Icons.schedule,
                              label: 'Watch',
                              value: _watch(r['totalWatchSeconds'])),
                          _Metric(
                              icon: Icons.card_giftcard,
                              label: 'Gifts',
                              value:
                                  '${r['giftVolumeCoins'] ?? 0} (${r['giftCount'] ?? 0})'),
                        ],
                      ),
                    ],
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({required this.icon, required this.label, required this.value});

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 16, color: AfriColors.teal),
              const SizedBox(width: 4),
              Text(label, style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
          const SizedBox(height: 2),
          Text(value, style: Theme.of(context).textTheme.titleSmall),
        ],
      ),
    );
  }
}
