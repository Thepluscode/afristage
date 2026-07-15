import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/afri_theme.dart';
import '../core/app_state.dart';
import '../widgets/afri_loader.dart';
import '../widgets/afri_ui.dart';
import '../models/models.dart';

/// Creator Circles (R4 §7): my circle (members + pooled points), the weekly
/// circle leaderboard, and browse/join/create. Surfaces /circles endpoints.
class CirclesScreen extends StatefulWidget {
  const CirclesScreen({super.key});

  @override
  State<CirclesScreen> createState() => _CirclesScreenState();
}

class _CirclesScreenState extends State<CirclesScreen> {
  // Actions (create/join/leave) are State methods; they reach the loader's
  // reload through its public state.
  final _loader = GlobalKey<AfriLoaderState<_CirclesData>>();
  bool _busy = false;
  final _nameCtrl = TextEditingController();

  @override
  void dispose() {
    _nameCtrl.dispose();
    super.dispose();
  }

  Future<_CirclesData> _load() async {
    final api = context.read<AppState>().api;
    final mine = await api.get('/circles/me');
    final circle = mine['circle'] as Map<String, dynamic>?;
    Map<String, dynamic>? detail;
    if (circle != null) {
      detail = await api.get('/circles/${circle['id']}');
    }
    final leaderboard = await api.getList('/circles/leaderboard?window=week');
    final browse = detail == null ? await api.getList('/circles') : const [];
    return _CirclesData(
      role: mine['role'] as String?,
      detail: detail,
      leaderboard: leaderboard.cast<Map<String, dynamic>>(),
      browse: browse.cast<Map<String, dynamic>>(),
    );
  }

  Future<void> _act(Future<void> Function() action, String failure) async {
    setState(() => _busy = true);
    try {
      await action();
      if (!mounted) return;
      await _loader.currentState?.refresh();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(failure)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _create() => _act(() async {
        final name = _nameCtrl.text.trim();
        await context.read<AppState>().api.post('/circles', {'name': name});
        _nameCtrl.clear();
      }, 'Could not create the circle (name may be taken).');

  Future<void> _join(String id) => _act(
      () => context.read<AppState>().api.post('/circles/$id/join'),
      'Could not join this circle.');

  Future<void> _leave() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Leave circle?'),
        content: const Text(
            'Your gift and mission points will stop counting for this circle.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Leave')),
        ],
      ),
    );
    if (confirmed != true) return;
    await _act(() => context.read<AppState>().api.post('/circles/leave'),
        'Could not leave (owners must be the last member).');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Circles')),
      body: AfriLoader<_CirclesData>(
        key: _loader,
        load: _load,
        errorTitle: 'Could not load circles',
        builder: (context, data, refresh) {
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
            children: [
              if (data.detail != null)
                ..._myCircle(data)
              else
                ..._joinOrCreate(data),
              const SizedBox(height: 18),
              const AfriSectionHeader(title: 'This week\'s top circles'),
              const SizedBox(height: 8),
              if (data.leaderboard.isEmpty)
                const Text('No circle activity yet this week.',
                    style: TextStyle(
                        color: AfriColors.secondaryText, fontSize: 13))
              else
                ...data.leaderboard.map(_rankTile),
            ],
          );
        },
      ),
    );
  }

  List<Widget> _myCircle(_CirclesData data) {
    final d = data.detail!;
    final points = d['points'] as Map<String, dynamic>? ?? const {};
    final week = points['week'] as Map<String, dynamic>? ?? const {};
    final allTime = points['allTime'] as Map<String, dynamic>? ?? const {};
    final members = (d['members'] as List<dynamic>? ?? const [])
        .cast<Map<String, dynamic>>();
    return [
      AfriCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(d['name'] as String? ?? 'My circle',
                      style: const TextStyle(
                          fontWeight: FontWeight.w900, fontSize: 17)),
                ),
                AfriChip(
                    label: data.role == 'OWNER' ? 'Owner' : 'Member',
                    selected: data.role == 'OWNER'),
              ],
            ),
            if (d['city'] != null) ...[
              const SizedBox(height: 4),
              Text(d['city'] as String,
                  style: const TextStyle(
                      color: AfriColors.secondaryText, fontSize: 13)),
            ],
            const SizedBox(height: 12),
            Row(
              children: [
                _pointsBox('This week', asInt(week['total'])),
                const SizedBox(width: 10),
                _pointsBox(
                    'All time', asInt(allTime['total'])),
              ],
            ),
            const SizedBox(height: 12),
            Text('${members.length} member${members.length == 1 ? '' : 's'}',
                style: const TextStyle(
                    color: AfriColors.secondaryText,
                    fontSize: 13,
                    fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            ...members.map((m) => Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Row(
                    children: [
                      const Icon(Icons.person,
                          size: 15, color: AfriColors.secondaryText),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(m['displayName'] as String? ?? 'Anonymous',
                            style: const TextStyle(fontSize: 14)),
                      ),
                      if (m['role'] == 'OWNER')
                        const Text('owner',
                            style: TextStyle(
                                color: AfriColors.gold,
                                fontSize: 12,
                                fontWeight: FontWeight.w800)),
                    ],
                  ),
                )),
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: _busy ? null : _leave,
                child: const Text('Leave circle'),
              ),
            ),
          ],
        ),
      ),
    ];
  }

  Widget _pointsBox(String label, int value) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AfriColors.surface,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('$value',
                style: const TextStyle(
                    fontWeight: FontWeight.w900,
                    fontSize: 18,
                    color: AfriColors.gold)),
            Text(label,
                style: const TextStyle(
                    color: AfriColors.secondaryText, fontSize: 12)),
          ],
        ),
      ),
    );
  }

  List<Widget> _joinOrCreate(_CirclesData data) {
    return [
      const Text(
          'Join a circle to pool your gift and mission points with friends '
          'and climb the weekly board together.',
          style: TextStyle(color: AfriColors.secondaryText, fontSize: 13)),
      const SizedBox(height: 12),
      AfriCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Start your own circle',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
            const SizedBox(height: 10),
            TextField(
              controller: _nameCtrl,
              decoration: const InputDecoration(hintText: 'Circle name'),
            ),
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton(
                onPressed: _busy ? null : _create,
                child: const Text('Create circle'),
              ),
            ),
          ],
        ),
      ),
      if (data.browse.isNotEmpty) ...[
        const SizedBox(height: 18),
        const AfriSectionHeader(title: 'Circles to join'),
        const SizedBox(height: 8),
        ...data.browse.map((c) => Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: AfriCard(
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(c['name'] as String? ?? 'Circle',
                              style: const TextStyle(
                                  fontWeight: FontWeight.w800, fontSize: 14)),
                          Text(
                              '${asInt((c['_count'] as Map<String, dynamic>?)?['members'])} members'
                              '${c['city'] != null ? ' · ${c['city']}' : ''}',
                              style: const TextStyle(
                                  color: AfriColors.secondaryText,
                                  fontSize: 12)),
                        ],
                      ),
                    ),
                    FilledButton.tonal(
                      onPressed: _busy ? null : () => _join(c['id'] as String),
                      child: const Text('Join'),
                    ),
                  ],
                ),
              ),
            )),
      ],
    ];
  }

  Widget _rankTile(Map<String, dynamic> row) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: AfriCard(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Text('#${row['rank']}',
                style: const TextStyle(
                    color: AfriColors.gold,
                    fontWeight: FontWeight.w900,
                    fontSize: 14)),
            const SizedBox(width: 12),
            Expanded(
              child: Text(row['name'] as String? ?? 'Circle',
                  style: const TextStyle(
                      fontWeight: FontWeight.w700, fontSize: 14)),
            ),
            Text('${asInt(row['points'])} pts',
                style: const TextStyle(
                    color: AfriColors.secondaryText,
                    fontSize: 13,
                    fontWeight: FontWeight.w700)),
          ],
        ),
      ),
    );
  }
}

class _CirclesData {
  const _CirclesData(
      {required this.role,
      required this.detail,
      required this.leaderboard,
      required this.browse});
  final String? role;
  final Map<String, dynamic>? detail;
  final List<Map<String, dynamic>> leaderboard;
  final List<Map<String, dynamic>> browse;
}
