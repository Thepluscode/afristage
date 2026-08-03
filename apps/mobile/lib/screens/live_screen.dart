import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/afri_theme.dart';
import '../core/app_state.dart';
import '../models/models.dart';
import '../widgets/afri_live.dart';
import '../widgets/afri_loader.dart';
import '../widgets/afri_ui.dart';
import 'room_screen.dart';
import 'search_screen.dart';

enum _DiscoveryMode { featured, popular, nearby, explore }

/// Viewer discovery tab: a dense, image-led grid with ranked, popular and
/// country-aware views over the real live-room feed.
class LiveScreen extends StatefulWidget {
  const LiveScreen({super.key});

  @override
  State<LiveScreen> createState() => _LiveScreenState();
}

class _LiveScreenState extends State<LiveScreen> {
  _DiscoveryMode _mode = _DiscoveryMode.featured;
  String _category = 'All';
  String? _myCountry;

  static const _categories = [
    'All',
    'Music',
    'Talk',
    'Comedy',
    'Dance',
    'Gaming',
  ];

  @override
  void initState() {
    super.initState();
    _loadMyCountry();
  }

  Future<void> _loadMyCountry() async {
    try {
      final me = await context.read<AppState>().api.get('/users/me');
      final profile = me['profile'] as Map<String, dynamic>?;
      final country = profile?['country'] as String?;
      if (mounted && country != null && country.isNotEmpty) {
        setState(() => _myCountry = country);
      }
    } catch (error) {
      // Discovery still works globally when profile locality is unavailable.
      debugPrint('Live discovery country failed to load: $error');
    }
  }

  Future<List<LiveRoom>> _load() async {
    final data = await context.read<AppState>().api.getList('/live-rooms');
    return data
        .cast<Map<String, dynamic>>()
        .map(LiveRoom.fromJson)
        .where((room) => room.status == 'LIVE')
        .toList();
  }

  List<LiveRoom> _visible(List<LiveRoom> rooms) {
    var visible = List<LiveRoom>.of(rooms);
    if (_mode == _DiscoveryMode.nearby) {
      visible = _myCountry == null
          ? <LiveRoom>[]
          : visible
              .where((room) =>
                  room.country.toUpperCase() == _myCountry!.toUpperCase())
              .toList();
    }
    if (_category != 'All') {
      visible = visible
          .where(
              (room) => room.category.toLowerCase() == _category.toLowerCase())
          .toList();
    }
    if (_mode == _DiscoveryMode.popular) {
      visible.sort((a, b) {
        final viewers = b.viewerCount.compareTo(a.viewerCount);
        return viewers != 0
            ? viewers
            : b.giftCoinTotal.compareTo(a.giftCoinTotal);
      });
    }
    if (_mode == _DiscoveryMode.explore) {
      visible = _diversifyByCategory(visible);
    }
    return visible;
  }

  List<LiveRoom> _diversifyByCategory(List<LiveRoom> rooms) {
    final queues = <String, List<LiveRoom>>{};
    for (final room in rooms) {
      queues.putIfAbsent(room.category.toUpperCase(), () => []).add(room);
    }
    final diversified = <LiveRoom>[];
    while (diversified.length < rooms.length) {
      for (final queue in queues.values) {
        if (queue.isNotEmpty) diversified.add(queue.removeAt(0));
      }
    }
    return diversified;
  }

  String get _emptyTitle => switch (_mode) {
        _DiscoveryMode.nearby => _myCountry == null
            ? 'Set your country to go local'
            : 'No local stages live',
        _ => 'No rooms live right now',
      };

  String get _emptyBody => switch (_mode) {
        _DiscoveryMode.nearby => _myCountry == null
            ? 'Add a country to your profile to discover nearby creators.'
            : 'Try Featured or check back when creators near you go live.',
        _ => 'Check back soon when creators are on stage.',
      };

  void _open(LiveRoom room) => Navigator.push(
      context, MaterialPageRoute(builder: (_) => RoomScreen(room: room)));

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        title: const Row(
          children: [
            AfriBrandMark(size: 27, flat: true),
            SizedBox(width: 8),
            Text('Discover',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Search live stages',
            onPressed: () => Navigator.push(context,
                MaterialPageRoute(builder: (_) => const SearchScreen())),
            icon: const Icon(CupertinoIcons.search),
          ),
          const SizedBox(width: 6),
        ],
      ),
      body: AfriLoader<List<LiveRoom>>(
        load: _load,
        errorTitle: 'Could not load live rooms',
        isEmpty: (rooms) => rooms.isEmpty,
        emptyBuilder: (_, refresh) => Padding(
          padding: const EdgeInsets.only(top: 80),
          child: AfriEmptyState(
            icon: Icons.live_tv,
            title: 'No rooms live right now',
            body: 'Check back soon when creators are on stage.',
            action:
                FilledButton(onPressed: refresh, child: const Text('Refresh')),
          ),
        ),
        builder: (context, rooms, refresh) {
          final visible = _visible(rooms);
          return CustomScrollView(
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 6, 16, 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(
                        height: 42,
                        child: ListView(
                          scrollDirection: Axis.horizontal,
                          children: [
                            _modeChip(_DiscoveryMode.featured, 'Featured',
                                CupertinoIcons.sparkles),
                            _modeChip(_DiscoveryMode.popular, 'Popular',
                                CupertinoIcons.flame_fill),
                            _modeChip(_DiscoveryMode.nearby, 'Nearby',
                                CupertinoIcons.location_fill),
                            _modeChip(_DiscoveryMode.explore, 'Explore',
                                CupertinoIcons.square_grid_2x2_fill),
                          ],
                        ),
                      ),
                      const SizedBox(height: 8),
                      SizedBox(
                        height: 34,
                        child: ListView.separated(
                          scrollDirection: Axis.horizontal,
                          itemCount: _categories.length,
                          separatorBuilder: (_, __) => const SizedBox(width: 7),
                          itemBuilder: (_, index) {
                            final category = _categories[index];
                            return _DiscoveryChip(
                              label: category,
                              selected: category == _category,
                              onTap: () => setState(() => _category = category),
                            );
                          },
                        ),
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Text(
                            _mode == _DiscoveryMode.nearby
                                ? 'Live near you'
                                : 'Live stages',
                            style: const TextStyle(
                                fontSize: 17, fontWeight: FontWeight.w900),
                          ),
                          const Spacer(),
                          Text('${visible.length} live',
                              style: const TextStyle(
                                  color: AfriColors.secondaryText,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700)),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              if (visible.isEmpty)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: AfriEmptyState(
                    icon: _mode == _DiscoveryMode.nearby
                        ? CupertinoIcons.location_slash
                        : CupertinoIcons.video_camera,
                    title: _emptyTitle,
                    body: _emptyBody,
                    action: _mode == _DiscoveryMode.nearby
                        ? OutlinedButton(
                            onPressed: () =>
                                setState(() => _mode = _DiscoveryMode.featured),
                            child: const Text('Browse all stages'),
                          )
                        : FilledButton(
                            onPressed: refresh,
                            child: const Text('Refresh'),
                          ),
                  ),
                )
              else
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 28),
                  sliver: SliverGrid.builder(
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      mainAxisSpacing: 12,
                      crossAxisSpacing: 12,
                      childAspectRatio: 0.76,
                    ),
                    itemCount: visible.length,
                    itemBuilder: (_, index) {
                      final room = visible[index];
                      return AfriLiveCard(
                        title: room.title,
                        category: room.category,
                        creator: room.hostName,
                        country: room.country,
                        imageUrl: room.coverImageUrl ?? room.hostAvatarUrl,
                        viewerCount: room.viewerCount,
                        giftCoinTotal: room.giftCoinTotal,
                        width: double.infinity,
                        onTap: () => _open(room),
                      );
                    },
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  Widget _modeChip(_DiscoveryMode mode, String label, IconData icon) {
    final selected = _mode == mode;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: _DiscoveryChip(
        icon: icon,
        label: label,
        selected: selected,
        prominent: true,
        onTap: () => setState(() => _mode = mode),
      ),
    );
  }
}

class _DiscoveryChip extends StatelessWidget {
  const _DiscoveryChip({
    required this.label,
    required this.selected,
    required this.onTap,
    this.icon,
    this.prominent = false,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;
  final IconData? icon;
  final bool prominent;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(999),
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        height: prominent ? 40 : 32,
        padding: EdgeInsets.symmetric(horizontal: prominent ? 13 : 12),
        decoration: BoxDecoration(
          color: selected
              ? AfriColors.gold.withValues(alpha: 0.16)
              : AfriColors.elevated,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
              color: selected ? AfriColors.gold : AfriColors.borderStrong),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon,
                  size: 15,
                  color: selected ? AfriColors.gold : AfriColors.mutedText),
              const SizedBox(width: 6),
            ],
            Text(
              label,
              style: TextStyle(
                color: selected ? AfriColors.gold : AfriColors.secondaryText,
                fontSize: prominent ? 12 : 11,
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
