import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/afri_theme.dart';
import '../core/app_state.dart';
import '../widgets/afri_ui.dart';

/// Live + upcoming events (R4 §6): limited-time gifts, prize pools and the
/// per-event supporter leaderboard. Surfaces GET /events and
/// GET /events/:id/leaderboard.
class EventsScreen extends StatefulWidget {
  const EventsScreen({super.key});

  @override
  State<EventsScreen> createState() => _EventsScreenState();
}

class _EventsScreenState extends State<EventsScreen> {
  late Future<List<dynamic>> _events;
  String? _expandedId;
  Future<Map<String, dynamic>>? _leaderboard;

  @override
  void initState() {
    super.initState();
    _events = _load();
  }

  Future<List<dynamic>> _load() => context.read<AppState>().api.getList('/events');

  Future<void> _refresh() async {
    final f = _load();
    setState(() {
      _events = f;
      _expandedId = null;
      _leaderboard = null;
    });
    await f;
  }

  void _toggle(String id) {
    setState(() {
      if (_expandedId == id) {
        _expandedId = null;
        _leaderboard = null;
      } else {
        _expandedId = id;
        final f = context.read<AppState>().api.get('/events/$id/leaderboard');
        // FutureBuilder only subscribes on the next frame; without this an
        // immediate rejection escapes as an unhandled error.
        f.ignore();
        _leaderboard = f;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Events')),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<List<dynamic>>(
          future: _events,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              return ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  AfriErrorState(
                    title: 'Could not load events',
                    body: 'Check your connection and try again.',
                    onRetry: () => setState(() {
                      _events = _load();
                    }),
                  ),
                ],
              );
            }
            final events = (snapshot.data ?? const [])
                .cast<Map<String, dynamic>>();
            if (events.isEmpty) {
              return ListView(
                padding: const EdgeInsets.all(16),
                children: const [
                  SizedBox(height: 60),
                  AfriEmptyState(
                    icon: Icons.emoji_events,
                    title: 'No events right now',
                    body: 'Limited-time events with special gifts and prize '
                        'pools will appear here.',
                  ),
                ],
              );
            }
            return ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
              children: events.map(_tile).toList(),
            );
          },
        ),
      ),
    );
  }

  Widget _tile(Map<String, dynamic> e) {
    final id = e['id'] as String;
    final pool = (e['prizePoolCoins'] as num?)?.toInt() ?? 0;
    final gifts =
        (e['gifts'] as List<dynamic>? ?? const []).cast<Map<String, dynamic>>();
    final expanded = _expandedId == id;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: AfriCard(
        onTap: () => _toggle(id),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(e['name'] as String? ?? 'Event',
                      style: const TextStyle(
                          fontWeight: FontWeight.w800, fontSize: 15)),
                ),
                if (pool > 0) AfriChip(label: '$pool coin pool', selected: true),
              ],
            ),
            if (e['description'] != null) ...[
              const SizedBox(height: 6),
              Text(e['description'] as String,
                  style: const TextStyle(
                      color: AfriColors.secondaryText, fontSize: 13)),
            ],
            if (gifts.isNotEmpty) ...[
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: gifts
                    .map((g) => AfriChip(
                        label:
                            '${g['name']} · ${(g['coinPrice'] as num?)?.toInt() ?? 0}c'))
                    .toList(),
              ),
            ],
            const SizedBox(height: 8),
            Row(
              children: [
                Icon(expanded ? Icons.expand_less : Icons.leaderboard,
                    size: 16, color: AfriColors.secondaryText),
                const SizedBox(width: 5),
                Text(expanded ? 'Hide leaderboard' : 'Supporter leaderboard',
                    style: const TextStyle(
                        color: AfriColors.secondaryText,
                        fontSize: 13,
                        fontWeight: FontWeight.w700)),
              ],
            ),
            if (expanded) _leaderboardView(),
          ],
        ),
      ),
    );
  }

  Widget _leaderboardView() {
    return FutureBuilder<Map<String, dynamic>>(
      future: _leaderboard,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Padding(
            padding: EdgeInsets.all(12),
            child: Center(child: CircularProgressIndicator()),
          );
        }
        if (snapshot.hasError) {
          return const Padding(
            padding: EdgeInsets.only(top: 10),
            child: Text('Could not load the leaderboard.',
                style:
                    TextStyle(color: AfriColors.secondaryText, fontSize: 13)),
          );
        }
        final supporters = (snapshot.data?['supporters'] as List<dynamic>? ??
                const [])
            .cast<Map<String, dynamic>>();
        if (supporters.isEmpty) {
          return const Padding(
            padding: EdgeInsets.only(top: 10),
            child: Text('No supporters yet — send an event gift to lead!',
                style:
                    TextStyle(color: AfriColors.secondaryText, fontSize: 13)),
          );
        }
        return Padding(
          padding: const EdgeInsets.only(top: 10),
          child: Column(
            children: supporters
                .map((s) => Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Row(
                        children: [
                          Text('#${s['rank']}',
                              style: const TextStyle(
                                  color: AfriColors.gold,
                                  fontWeight: FontWeight.w900,
                                  fontSize: 13)),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                                s['displayName'] as String? ?? 'Anonymous',
                                style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 14)),
                          ),
                          Text('${(s['totalCoins'] as num?)?.toInt() ?? 0} coins',
                              style: const TextStyle(
                                  color: AfriColors.secondaryText,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700)),
                        ],
                      ),
                    ))
                .toList(),
          ),
        );
      },
    );
  }
}
