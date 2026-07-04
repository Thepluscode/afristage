import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/afri_theme.dart';
import '../core/api_client.dart';
import '../core/app_state.dart';
import '../models/models.dart';
import '../widgets/afri_live.dart';
import '../widgets/afri_ui.dart';
import 'creator_apply_screen.dart';
import 'creator_profile_screen.dart';
import 'creator_screen.dart';
import 'circles_screen.dart';
import 'events_screen.dart';
import 'missions_screen.dart';
import 'notifications_screen.dart';
import 'room_screen.dart';
import 'search_screen.dart';
import 'wallet_screen.dart';

class FeedScreen extends StatefulWidget {
  const FeedScreen({super.key});

  @override
  State<FeedScreen> createState() => _FeedScreenState();
}

class _FeedScreenState extends State<FeedScreen> {
  late Future<List<LiveRoom>> _rooms;
  String _category = 'For You';
  // Local Stage: filter the feed to the viewer's profile country (privacy-safe
  // coarse region — no GPS, no permission; see docs/reverse-engineering/R4 §2).
  String _scope = 'All Stages';
  String? _myCountry;
  int _unread = 0;

  static const _scopes = ['All Stages', 'Local'];
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
    _loadMyCountry();
  }

  // Best-effort: the Local chip needs the viewer's profile country. A failure
  // just leaves Local showing the "set your country" hint.
  Future<void> _loadMyCountry() async {
    try {
      final me = await context.read<AppState>().api.get('/users/me');
      final profile = me['profile'] as Map<String, dynamic>?;
      final country = profile?['country'] as String?;
      if (mounted && country != null && country.isNotEmpty) {
        setState(() => _myCountry = country);
      }
    } catch (e) {
      debugPrint('Viewer country failed to load: $e');
    }
  }

  Future<void> _loadUnread() async {
    try {
      final data =
          await context.read<AppState>().api.get('/notifications/unread-count');
      if (mounted) {
        setState(() => _unread = (data['count'] as num?)?.toInt() ?? 0);
      }
    } catch (e) {
      debugPrint('Unread notification count failed to load: $e');
    }
  }

  Future<void> _loadUpcoming() async {
    try {
      final data =
          await context.read<AppState>().api.getList('/live-rooms/upcoming');
      if (mounted) {
        setState(() => _upcoming = data.cast<Map<String, dynamic>>());
      }
    } catch (e) {
      debugPrint('Upcoming rooms failed to load: $e');
    }
  }

  Future<void> _remind(String roomId) async {
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _reminded.add(roomId));
    try {
      await context.read<AppState>().api.post('/live-rooms/$roomId/remind');
      messenger.showSnackBar(const SnackBar(
          content: Text("Reminder set — we'll notify you when it starts.")));
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
    return data
        .cast<Map<String, dynamic>>()
        .map(LiveRoom.fromJson)
        .where((r) => r.status == 'LIVE')
        .toList();
  }

  Future<void> _refresh() async {
    final rooms = _load();
    setState(() {
      _rooms = rooms;
    });
    _loadUnread();
    _loadUpcoming();
    await rooms;
  }

  void _openRoom(LiveRoom room) => Navigator.push(
      context, MaterialPageRoute(builder: (_) => RoomScreen(room: room)));

  // Only ever called from the "Creators to watch" ring, which is built from
  // rooms with a non-null hostId, so the id is always present here.
  void _openCreator(LiveRoom room) {
    Navigator.push(
        context,
        MaterialPageRoute(
            builder: (_) => CreatorProfileScreen(creatorId: room.hostId!)));
  }

  List<LiveRoom> _filter(List<LiveRoom> rooms) {
    var result = _category == 'For You'
        ? rooms
        : rooms
            .where((r) => r.category.toLowerCase() == _category.toLowerCase())
            .toList();
    if (_scope == 'Local') {
      // Unknown viewer country matches nothing — the empty state explains why.
      result = result
          .where((r) =>
              _myCountry != null &&
              r.country.toUpperCase() == _myCountry!.toUpperCase())
          .toList();
    }
    return result;
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final coins = state.wallet.coinBalance;
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        title: const Row(children: [
          Padding(
            padding: EdgeInsets.only(right: 8),
            child: AfriBrandMark(size: 28, flat: true),
          ),
          Text('AfriStage',
              style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w900,
                  color: AfriColors.text)),
          SizedBox(width: 3),
          Text('Live',
              style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w900,
                  color: AfriColors.orange)),
        ]),
        actions: [
          IconButton(
            tooltip: 'Events',
            onPressed: () => Navigator.push(context,
                MaterialPageRoute(builder: (_) => const EventsScreen())),
            icon: const Icon(Icons.emoji_events_outlined),
          ),
          IconButton(
            tooltip: 'Circles',
            onPressed: () => Navigator.push(context,
                MaterialPageRoute(builder: (_) => const CirclesScreen())),
            icon: const Icon(Icons.groups_outlined),
          ),
          IconButton(
            tooltip: 'Daily missions',
            onPressed: () => Navigator.push(context,
                MaterialPageRoute(builder: (_) => const MissionsScreen())),
            icon: const Icon(Icons.task_alt),
          ),
          IconButton(
            tooltip: 'Notifications',
            onPressed: () async {
              await Navigator.push(
                  context,
                  MaterialPageRoute(
                      builder: (_) => const NotificationsScreen()));
              _loadUnread();
            },
            icon: Badge.count(
                count: _unread,
                isLabelVisible: _unread > 0,
                child: const Icon(Icons.notifications_none)),
          ),
          IconButton(
            tooltip: 'Search',
            onPressed: () => Navigator.push(context,
                MaterialPageRoute(builder: (_) => const SearchScreen())),
            icon: const Icon(Icons.search),
          ),
          const SizedBox(width: 6),
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
                  action: FilledButton(
                      onPressed: _refresh,
                      child: const Text('Retry live feed')),
                ),
              ]);
            }
            final rooms = snapshot.data ?? const <LiveRoom>[];
            final live = _filter(rooms);
            final hero = live.isNotEmpty
                ? live.first
                : (rooms.isNotEmpty ? rooms.first : null);
            final rail = live.length > 1
                ? live.where((r) => r.id != hero?.id).toList()
                : live;
            final creators = <String, LiveRoom>{};
            for (final r in rooms) {
              if (r.hostId != null) creators.putIfAbsent(r.hostId!, () => r);
            }

            return ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
              children: [
                _HomeStageActions(
                  isCreator: state.isCreator,
                  onCreate: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                        builder: (_) => state.isCreator
                            ? const CreatorScreen()
                            : const CreatorApplyScreen()),
                  ),
                ),
                const SizedBox(height: 18),

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

                _HomeWalletPanel(
                  coins: coins,
                  onWallet: () => Navigator.push(context,
                      MaterialPageRoute(builder: (_) => const WalletScreen())),
                  onSendGift: hero == null ? null : () => _openRoom(hero),
                ),
                const SizedBox(height: 22),

                // Live now rail, scoped All Stages / Local (viewer's region).
                _SectionHeader(
                    title: _scope == 'Local' ? 'Live near you' : 'Live now',
                    trailing: '${live.length} live'),
                const SizedBox(height: 12),
                AfriCategoryChips(
                    items: _scopes,
                    selected: _scope,
                    onSelected: (v) => setState(() => _scope = v)),
                const SizedBox(height: 12),
                if (rail.isEmpty)
                  AfriEmptyState(
                    icon: _scope == 'Local' ? Icons.place : Icons.live_tv,
                    title: _scope == 'Local'
                        ? 'No local rooms live'
                        : _category == 'For You'
                            ? 'No other rooms live'
                            : 'No $_category rooms live',
                    body: _scope == 'Local'
                        ? (_myCountry == null
                            ? 'Set your country in your profile to see local rooms.'
                            : 'No live rooms in $_myCountry right now.')
                        : 'Follow creators or check back soon.',
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
                AfriCategoryChips(
                    items: _categories,
                    selected: _category,
                    onSelected: (v) => setState(() => _category = v)),

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
    final hostName = (host?['creatorProfile']
            as Map<String, dynamic>?)?['stageName'] as String? ??
        (host?['profile'] as Map<String, dynamic>?)?['displayName']
            as String? ??
        'Creator';
    final reminded = _reminded.contains(u['id']);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AfriCard(
        child: Row(children: [
          const Icon(Icons.event_outlined, color: AfriColors.gold),
          const SizedBox(width: 12),
          Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${u['title'] ?? 'Untitled room'}',
                  style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 2),
              Text(hostName, style: Theme.of(context).textTheme.bodyMedium),
            ]),
          ),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            AfriChip(label: _formatStart(u['scheduledStartAt'] as String?)),
            const SizedBox(height: 4),
            reminded
                ? const Text('Reminder set',
                    style: TextStyle(color: AfriColors.gold, fontSize: 12))
                : TextButton(
                    onPressed: () => _remind(u['id'] as String),
                    style: TextButton.styleFrom(
                        padding: EdgeInsets.zero,
                        minimumSize: const Size(0, 0),
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap),
                    child: const Text('Remind me'),
                  ),
          ]),
        ]),
      ),
    );
  }
}

class _HomeStageActions extends StatelessWidget {
  const _HomeStageActions({required this.isCreator, required this.onCreate});

  final bool isCreator;
  final VoidCallback onCreate;

  @override
  Widget build(BuildContext context) {
    return Row(children: [
      Expanded(
        child: FilledButton.icon(
          onPressed: onCreate,
          style: FilledButton.styleFrom(
            backgroundColor: AfriColors.teal,
            foregroundColor: Colors.white,
            minimumSize: const Size.fromHeight(58),
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          ),
          icon: const Icon(Icons.sensors),
          label: Text(isCreator ? 'Go Live' : 'Apply to Go Live',
              style: const TextStyle(fontWeight: FontWeight.w900)),
        ),
      ),
      const SizedBox(width: 10),
      InkWell(
        onTap: onCreate,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          width: 58,
          height: 58,
          decoration: BoxDecoration(
            gradient: const LinearGradient(
                colors: [AfriColors.purple, AfriColors.orange]),
            borderRadius: BorderRadius.circular(14),
            boxShadow: [
              BoxShadow(
                  color: AfriColors.purple.withValues(alpha: 0.24),
                  blurRadius: 18,
                  offset: const Offset(0, 10)),
            ],
          ),
          child: const Icon(Icons.add, color: Colors.white, size: 30),
        ),
      ),
    ]);
  }
}

class _HomeWalletPanel extends StatelessWidget {
  const _HomeWalletPanel({
    required this.coins,
    required this.onWallet,
    required this.onSendGift,
  });

  final int coins;
  final VoidCallback onWallet;
  final VoidCallback? onSendGift;

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const _SectionHeader(title: 'Gift Wallet', trailing: 'View wallet'),
      const SizedBox(height: 12),
      GestureDetector(
        onTap: onWallet,
        child: Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFFB87905), Color(0xFF4D3004)],
            ),
            border: Border.all(color: const Color(0x66FFC857)),
          ),
          child: Row(children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: const Color(0x22FFFFFF),
                borderRadius: BorderRadius.circular(16),
              ),
              child: const Icon(Icons.card_giftcard,
                  color: AfriColors.gold, size: 30),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Gift Balance',
                        style: TextStyle(
                            color: Color(0xFFEFE3BC),
                            fontWeight: FontWeight.w700)),
                    const SizedBox(height: 2),
                    Text(_formatCoins(coins),
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 28,
                            fontWeight: FontWeight.w900)),
                  ]),
            ),
            const Icon(Icons.chevron_right, color: AfriColors.gold),
          ]),
        ),
      ),
      const SizedBox(height: 10),
      Row(children: [
        Expanded(
            child: _WalletActionTile(
                icon: Icons.card_giftcard,
                label: 'Send Gift',
                onTap: onSendGift)),
        const SizedBox(width: 10),
        Expanded(
            child: _WalletActionTile(
                icon: Icons.account_balance_wallet_outlined,
                label: 'Top Up',
                onTap: onWallet)),
        const SizedBox(width: 10),
        Expanded(
            child: _WalletActionTile(
                icon: Icons.history, label: 'History', onTap: onWallet)),
      ]),
    ]);
  }
}

String _formatCoins(int coins) {
  final raw = coins.toString();
  final buffer = StringBuffer();
  for (var i = 0; i < raw.length; i++) {
    final fromRight = raw.length - i;
    buffer.write(raw[i]);
    if (fromRight > 1 && fromRight % 3 == 1) {
      buffer.write(',');
    }
  }
  return buffer.toString();
}

class _WalletActionTile extends StatelessWidget {
  const _WalletActionTile({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        height: 76,
        decoration: BoxDecoration(
          color: AfriColors.elevated,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AfriColors.border),
        ),
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(icon, color: AfriColors.gold, size: 24),
          const SizedBox(height: 7),
          Text(label,
              textAlign: TextAlign.center,
              style: const TextStyle(
                  color: AfriColors.text,
                  fontSize: 12,
                  fontWeight: FontWeight.w800)),
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
      Text(title,
          style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: AfriColors.text)),
      if (trailing != null)
        Text(trailing!,
            style: const TextStyle(fontSize: 13, color: AfriColors.mutedText)),
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
          gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF2B1606), Color(0xFF111827)]),
        ),
        padding: const EdgeInsets.all(20),
        child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Text('AfriStage is warming up',
                  style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w900,
                      color: Colors.white)),
              const SizedBox(height: 6),
              const Text('Be the first on stage — refresh the live feed.',
                  style: TextStyle(color: Color(0xFFD4D4D8))),
              const SizedBox(height: 16),
              FilledButton.icon(
                  onPressed: onRefresh,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Refresh')),
            ]),
      ),
    );
  }
}
