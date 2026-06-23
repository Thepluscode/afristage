import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/afri_theme.dart';
import '../core/api_client.dart';
import '../core/app_state.dart';
import '../models/models.dart';
import '../widgets/afri_live.dart';
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
    'Talk',
    'Comedy',
    'Dance',
    'Art',
    'Lifestyle'
  ];

  @override
  void initState() {
    super.initState();
    _rooms = _load();
    _loadUnread();
    _loadUpcoming();
  }

  Future<void> _loadUnread() async {
    try {
      final data = await context.read<AppState>().api.get('/notifications/unread-count');
      if (mounted) setState(() => _unread = (data['count'] as num?)?.toInt() ?? 0);
    } catch (_) {}
  }

  Future<void> _loadUpcoming() async {
    try {
      final data = await context.read<AppState>().api.getList('/live-rooms/upcoming');
      if (mounted) setState(() => _upcoming = data.cast<Map<String, dynamic>>());
    } catch (_) {}
  }

  Future<void> _remind(String roomId) async {
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _reminded.add(roomId));
    try {
      await context.read<AppState>().api.post('/live-rooms/$roomId/remind');
      messenger.showSnackBar(const SnackBar(content: Text("Reminder set — we'll notify you when it starts.")));
    } on ApiException catch (e) {
      if (mounted) setState(() => _reminded.remove(roomId));
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  String _formatStart(String? iso) {
    final d = DateTime.tryParse(iso ?? '')?.toLocal();
    if (d == null) return 'Soon';
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(d.day)}/${two(d.month)} ${two(d.hour)}:${two(d.minute)}';
  }

  Future<List<LiveRoom>> _load() async {
    final api = context.read<AppState>().api;
    final data = await api.getList('/live-rooms');
    return data.cast<Map<String, dynamic>>().map(LiveRoom.fromJson).where((r) => r.status == 'LIVE').toList();
  }

  Future<void> _refresh() async {
    final rooms = _load();
    setState(() => _rooms = rooms);
    _loadUnread();
    _loadUpcoming();
    await rooms;
  }

  void _openRoom(LiveRoom room) => Navigator.push(context, MaterialPageRoute(builder: (_) => RoomScreen(room: room)));

  void _openCreator(LiveRoom room) {
    if (room.hostId == null) {
      _openRoom(room);
      return;
    }
    Navigator.push(context, MaterialPageRoute(builder: (_) => CreatorProfileScreen(creatorId: room.hostId!)));
  }

  List<LiveRoom> _filter(List<LiveRoom> rooms) => _category == 'For You'
      ? rooms
      : rooms.where((r) => r.category.toLowerCase() == _category.toLowerCase()).toList();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        // Logomark + wordmark per the mockup (no coin pill on the feed).
        title: Row(children: [
          Container(
            width: 26,
            height: 26,
            margin: const EdgeInsets.only(right: 8),
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: [AfriColors.orange, AfriColors.gold]),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(Icons.graphic_eq, size: 16, color: Color(0xFF170B02)),
          ),
          const Text('AfriStage', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: AfriColors.text)),
        ]),
        actions: [
          // Notification bell with unread badge, then search (mockup order).
          IconButton(
            tooltip: 'Notifications',
            onPressed: () async {
              await Navigator.push(context, MaterialPageRoute(builder: (_) => const NotificationsScreen()));
              _loadUnread();
            },
            icon: Badge.count(count: _unread, isLabelVisible: _unread > 0, child: const Icon(Icons.notifications_none)),
          ),
          Padding(
            padding: const EdgeInsets.only(right: 6),
            child: IconButton(
              tooltip: 'Search',
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SearchScreen())),
              icon: const Icon(Icons.search),
            ),
          ),
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
              return ListView(padding: const EdgeInsets.all(16), children: [
                const SizedBox(height: 80),
                AfriEmptyState(
                  icon: Icons.wifi_off,
                  title: 'Could not load live rooms',
                  body: 'Check your connection and retry.',
                  action: FilledButton(onPressed: _refresh, child: const Text('Retry live feed')),
                ),
              ]);
            }
            final rooms = snapshot.data ?? const <LiveRoom>[];
            final live = _filter(rooms);
            final hero = live.isNotEmpty ? live.first : (rooms.isNotEmpty ? rooms.first : null);
            final rail = live.where((r) => r.id != hero?.id).toList();
            final creators = <String, LiveRoom>{};
            for (final r in rooms) {
              if (r.hostId != null) creators.putIfAbsent(r.hostId!, () => r);
            }

            return ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
              children: [
                // Hero featured live card.
                if (hero != null)
                  AfriHeroLive(
                    title: hero.title,
                    category: hero.category,
                    creator: hero.hostName,
                    imageUrl: hero.hostAvatarUrl,
                    viewerCount: hero.viewerCount,
                    onTap: () => _openRoom(hero),
                  )
                else
                  _WarmingUp(onRefresh: _refresh),
                const SizedBox(height: 22),

                // Live now rail.
                _SectionHeader(title: 'Live now', trailing: '${live.length} live'),
                const SizedBox(height: 12),
                if (rail.isEmpty)
                  AfriEmptyState(
                    icon: Icons.live_tv,
                    title: _category == 'For You' ? 'No other rooms live' : 'No $_category rooms live',
                    body: 'Follow creators or check back soon.',
                  )
                else
                  SizedBox(
                    height: 232,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: rail.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 12),
                      itemBuilder: (_, i) => AfriLiveCard(
                        title: rail[i].title,
                        category: rail[i].category,
                        creator: rail[i].hostName,
                        country: rail[i].country,
                        imageUrl: rail[i].hostAvatarUrl,
                        viewerCount: rail[i].viewerCount,
                        onTap: () => _openRoom(rail[i]),
                      ),
                    ),
                  ),

                // Upcoming.
                if (_upcoming.isNotEmpty) ...[
                  const SizedBox(height: 22),
                  const _SectionHeader(title: 'Upcoming'),
                  const SizedBox(height: 12),
                  ..._upcoming.map(_upcomingTile),
                ],

                const SizedBox(height: 22),
                const _SectionHeader(title: 'Browse by category'),
                const SizedBox(height: 12),
                AfriCategoryChips(items: _categories, selected: _category, onSelected: (v) => setState(() => _category = v)),

                if (creators.isNotEmpty) ...[
                  const SizedBox(height: 24),
                  const _SectionHeader(title: 'Creators to watch'),
                  const SizedBox(height: 12),
                  SizedBox(
                    height: 116,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: creators.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 12),
                      itemBuilder: (_, i) {
                        final r = creators.values.elementAt(i);
                        return AfriCreatorRing(
                          name: r.hostName ?? 'Creator',
                          imageUrl: r.hostAvatarUrl,
                          viewerCount: r.viewerCount,
                          onTap: () => _openCreator(r),
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

  Widget _upcomingTile(Map<String, dynamic> u) {
    final host = u['host'] as Map<String, dynamic>?;
    final hostName = (host?['creatorProfile'] as Map<String, dynamic>?)?['stageName'] as String? ??
        (host?['profile'] as Map<String, dynamic>?)?['displayName'] as String? ??
        'Creator';
    final reminded = _reminded.contains(u['id']);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AfriCard(
        child: Row(children: [
          const Icon(Icons.event_outlined, color: AfriColors.gold),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${u['title'] ?? 'Untitled room'}', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 2),
              Text(hostName, style: Theme.of(context).textTheme.bodyMedium),
            ]),
          ),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            AfriChip(label: _formatStart(u['scheduledStartAt'] as String?)),
            const SizedBox(height: 4),
            reminded
                ? const Text('Reminder set', style: TextStyle(color: AfriColors.gold, fontSize: 12))
                : TextButton(
                    onPressed: () => _remind(u['id'] as String),
                    style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 0), tapTargetSize: MaterialTapTargetSize.shrinkWrap),
                    child: const Text('Remind me'),
                  ),
          ]),
        ]),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, this.trailing});
  final String title;
  final String? trailing;
  @override
  Widget build(BuildContext context) {
    return Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
      Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AfriColors.text)),
      if (trailing != null) Text(trailing!, style: const TextStyle(fontSize: 13, color: AfriColors.mutedText)),
    ]);
  }
}

class _WarmingUp extends StatelessWidget {
  const _WarmingUp({required this.onRefresh});
  final VoidCallback onRefresh;
  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(22),
      child: Container(
        height: 200,
        decoration: const BoxDecoration(
          gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF2B1606), Color(0xFF111827)]),
        ),
        padding: const EdgeInsets.all(20),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
          const Text('AfriStage is warming up', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: Colors.white)),
          const SizedBox(height: 6),
          const Text('Be the first on stage — refresh the live feed.', style: TextStyle(color: Color(0xFFD4D4D8))),
          const SizedBox(height: 16),
          FilledButton.icon(onPressed: onRefresh, icon: const Icon(Icons.refresh), label: const Text('Refresh')),
        ]),
      ),
    );
  }
}
