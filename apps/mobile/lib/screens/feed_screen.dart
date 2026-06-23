import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/afri_theme.dart';
import '../core/api_client.dart';
import '../core/app_state.dart';
import '../models/models.dart';
import '../widgets/afri_ui.dart';
import 'creator_profile_screen.dart';
import 'notifications_screen.dart';
import 'room_screen.dart';
import 'search_screen.dart';

class FeedScreen extends StatefulWidget {
  const FeedScreen({super.key});

  @override
  State<FeedScreen> createState() => _FeedScreenState();
}

class _FeedScreenState extends State<FeedScreen> {
  late Future<List<LiveRoom>> _rooms;
  String _category = 'For You';
  int _unread = 0;
  List<Map<String, dynamic>> _upcoming = const [];
  final Set<String> _reminded = {};

  static const _categories = [
    'For You',
    'Music',
    'Comedy',
    'Talk',
    'Football',
    'Faith',
    'New Creators'
  ];

  @override
  void initState() {
    super.initState();
    _rooms = _load();
    _loadUnread();
    _loadUpcoming();
  }

  // Upcoming scheduled rooms. Best-effort: a failure just hides the section.
  Future<void> _loadUpcoming() async {
    try {
      final data = await context.read<AppState>().api.getList('/live-rooms/upcoming');
      if (mounted) setState(() => _upcoming = data.cast<Map<String, dynamic>>());
    } catch (_) {
      // non-critical: the live feed still renders
    }
  }

  Future<void> _remind(String roomId) async {
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _reminded.add(roomId)); // optimistic
    try {
      await context.read<AppState>().api.post('/live-rooms/$roomId/remind');
      messenger.showSnackBar(const SnackBar(
          content: Text("Reminder set — we'll notify you when it starts.")));
    } on ApiException catch (e) {
      if (mounted) setState(() => _reminded.remove(roomId)); // rollback
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  // Compact local time for a scheduled start, e.g. "23/06 19:30".
  String _formatStart(String? iso) {
    final d = DateTime.tryParse(iso ?? '')?.toLocal();
    if (d == null) return 'Soon';
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(d.day)}/${two(d.month)} ${two(d.hour)}:${two(d.minute)}';
  }

  // Bell badge. Best-effort: a failed count must never blank the feed, so swallow.
  Future<void> _loadUnread() async {
    try {
      final data = await context.read<AppState>().api.get('/notifications/unread-count');
      if (mounted) setState(() => _unread = (data['count'] as num?)?.toInt() ?? 0);
    } catch (_) {
      // leave the previous count; the badge is non-critical
    }
  }

  Future<List<LiveRoom>> _load() async {
    final api = context.read<AppState>().api;
    final data = await api.getList('/live-rooms');
    return data
        .cast<Map<String, dynamic>>()
        .map(LiveRoom.fromJson)
        .where((r) => r.status == 'LIVE')
        .toList();
  }

  Future<void> _refresh() async {
    final rooms = _load();
    setState(() => _rooms = rooms);
    _loadUpcoming();
    await rooms;
  }

  void _openRoom(LiveRoom room) => Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => RoomScreen(room: room)),
      );

  List<LiveRoom> _filter(List<LiveRoom> rooms) => _category == 'For You'
      ? rooms
      : rooms
          .where((r) => r.category.toLowerCase() == _category.toLowerCase())
          .toList();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('AfriStage Live'),
        actions: [
          IconButton(
              tooltip: 'Search creators',
              onPressed: () => Navigator.push(context,
                  MaterialPageRoute(builder: (_) => const SearchScreen())),
              icon: const Icon(Icons.search)),
          IconButton(
              tooltip: 'Notifications',
              onPressed: () async {
                await Navigator.push(
                    context,
                    MaterialPageRoute(
                        builder: (_) => const NotificationsScreen()));
                // Refresh the badge after the user has seen/read notifications.
                _loadUnread();
              },
              icon: Badge.count(
                count: _unread,
                isLabelVisible: _unread > 0,
                child: const Icon(Icons.notifications_none),
              )),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<List<LiveRoom>>(
          future: _rooms,
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
                    title: 'Could not load live rooms',
                    body:
                        'Check your connection and retry. If the problem continues, contact support.',
                    action: FilledButton(
                        onPressed: _refresh,
                        child: const Text('Retry live feed')),
                  ),
                ],
              );
            }
            final rooms = snapshot.data ?? const <LiveRoom>[];
            final hero = rooms.isEmpty ? null : rooms.first;
            final live = _filter(rooms);
            // "Creators to watch": creators live right now (deduped by host).
            final creators = <String, LiveRoom>{};
            for (final r in rooms) {
              if (r.hostId != null) creators.putIfAbsent(r.hostId!, () => r);
            }

            return ListView(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
              children: [
                AfriHeroEventCard(
                  room: hero,
                  onJoin: hero == null ? _refresh : () => _openRoom(hero),
                ),
                const SizedBox(height: 22),
                AfriSectionHeader(
                  title: 'Live now',
                  subtitle: live.isEmpty
                      ? 'No rooms broadcasting yet'
                      : '${live.length} ${live.length == 1 ? 'stage' : 'stages'} broadcasting',
                  trailing: IconButton(
                    tooltip: 'Refresh live rooms',
                    onPressed: _refresh,
                    icon: const Icon(Icons.refresh),
                  ),
                ),
                const SizedBox(height: 12),
                if (live.isEmpty)
                  AfriEmptyState(
                    icon: Icons.live_tv,
                    title: _category == 'For You'
                        ? 'No live rooms yet'
                        : 'No $_category rooms yet',
                    body:
                        'Follow creators or check back soon when creators are on stage.',
                    action: OutlinedButton(
                        onPressed: _refresh,
                        child: const Text('Refresh live rooms')),
                  )
                else
                  SizedBox(
                    height: 250,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: live.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 12),
                      itemBuilder: (_, i) =>
                          AfriLiveTile(room: live[i], onTap: () => _openRoom(live[i])),
                    ),
                  ),
                if (_upcoming.isNotEmpty) ...[
                  const SizedBox(height: 22),
                  const AfriSectionHeader(
                    title: 'Upcoming',
                    subtitle: 'Scheduled stages — set a reminder',
                  ),
                  const SizedBox(height: 12),
                  ..._upcoming.map((u) {
                    final host = u['host'] as Map<String, dynamic>?;
                    final hostName = (host?['creatorProfile']
                            as Map<String, dynamic>?)?['stageName'] as String? ??
                        (host?['profile'] as Map<String, dynamic>?)?['displayName']
                            as String? ??
                        'Creator';
                    return AfriCard(
                      child: Row(
                        children: [
                          const Icon(Icons.event_outlined, color: AfriColors.gold),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('${u['title'] ?? 'Untitled room'}',
                                    style:
                                        Theme.of(context).textTheme.titleMedium),
                                const SizedBox(height: 2),
                                Text(hostName,
                                    style:
                                        Theme.of(context).textTheme.bodyMedium),
                              ],
                            ),
                          ),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              AfriChip(
                                  label: _formatStart(
                                      u['scheduledStartAt'] as String?)),
                              const SizedBox(height: 4),
                              _reminded.contains(u['id'])
                                  ? const Text('Reminder set',
                                      style: TextStyle(
                                          color: AfriColors.gold, fontSize: 12))
                                  : TextButton(
                                      onPressed: () =>
                                          _remind(u['id'] as String),
                                      style: TextButton.styleFrom(
                                          padding: EdgeInsets.zero,
                                          minimumSize: const Size(0, 0),
                                          tapTargetSize:
                                              MaterialTapTargetSize.shrinkWrap),
                                      child: const Text('Remind me'),
                                    ),
                            ],
                          ),
                        ],
                      ),
                    );
                  }),
                ],
                const SizedBox(height: 22),
                Text('Browse by category',
                    style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 12),
                AfriCategoryChips(
                  items: _categories,
                  selected: _category,
                  onSelected: (value) => setState(() => _category = value),
                ),
                if (creators.isNotEmpty) ...[
                  const SizedBox(height: 22),
                  const AfriSectionHeader(
                    title: 'Creators to watch',
                    subtitle: 'On stage right now',
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    height: 116,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: creators.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 14),
                      itemBuilder: (_, i) {
                        final r = creators.values.elementAt(i);
                        return AfriCreatorAvatar(
                          name: r.hostName ?? 'Creator',
                          viewerCount: r.viewerCount,
                          avatarUrl: r.hostAvatarUrl,
                          onTap: r.hostId == null
                              ? () => _openRoom(r)
                              : () => Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                      builder: (_) => CreatorProfileScreen(
                                          creatorId: r.hostId!),
                                    ),
                                  ),
                        );
                      },
                    ),
                  ),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}
