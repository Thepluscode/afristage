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
            final visibleRooms = _category == 'For You'
                ? rooms
                : rooms
                    .where((room) =>
                        room.category.toLowerCase() == _category.toLowerCase())
                    .toList();
            return ListView(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
              children: [
                AfriHeroEventCard(
                  onJoin: rooms.isEmpty
                      ? _refresh
                      : () => Navigator.push(
                            context,
                            MaterialPageRoute(
                                builder: (_) => RoomScreen(room: rooms.first)),
                          ),
                ),
                const SizedBox(height: 16),
                AfriCategoryChips(
                  items: _categories,
                  selected: _category,
                  onSelected: (value) => setState(() => _category = value),
                ),
                const SizedBox(height: 16),
                AfriSectionHeader(
                  title: 'Live now',
                  subtitle: visibleRooms.isEmpty
                      ? 'No rooms broadcasting yet'
                      : '${visibleRooms.length} stages broadcasting',
                  trailing: IconButton(
                    tooltip: 'Refresh live rooms',
                    onPressed: _refresh,
                    icon: const Icon(Icons.refresh),
                  ),
                ),
                const SizedBox(height: 12),
                if (visibleRooms.isEmpty)
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
                  for (final room in visibleRooms) ...[
                    AfriLiveRoomCard(
                      room: room,
                      viewerCount: room.viewerCount,
                      onTap: () => Navigator.push(
                        context,
                        MaterialPageRoute(
                            builder: (_) => RoomScreen(room: room)),
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
              ],
            );
          },
        ),
      ),
    );
  }
}
