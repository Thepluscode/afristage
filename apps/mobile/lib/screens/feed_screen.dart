import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/app_state.dart';
import '../models/models.dart';
import '../widgets/afri_ui.dart';
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
              onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                      builder: (_) => const NotificationsScreen())),
              icon: const Icon(Icons.notifications_none)),
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
                          onTap: () => _openRoom(r),
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
