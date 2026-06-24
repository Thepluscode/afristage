import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/afri_theme.dart';
import '../core/api_client.dart';
import '../core/app_state.dart';
import '../models/models.dart';
import '../widgets/afri_live.dart';
import '../widgets/afri_ui.dart';
import 'room_screen.dart';

/// Icon + accent for a notification type (CREATOR_LIVE / NEW_FOLLOWER /
/// PAYOUT_UPDATE today; unknown types fall back to a neutral bell).
({IconData icon, Color color}) notificationStyle(String type) =>
    switch (type) {
      'CREATOR_LIVE' => (icon: Icons.live_tv, color: AfriColors.purple),
      'NEW_FOLLOWER' => (icon: Icons.person_add_alt_1, color: AfriColors.teal),
      'PAYOUT_UPDATE' => (
          icon: Icons.account_balance_wallet,
          color: AfriColors.gold
        ),
      _ => (icon: Icons.notifications, color: AfriColors.mutedText),
    };

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  late Future<List<dynamic>> _items;

  @override
  void initState() {
    super.initState();
    _items = _load();
  }

  Future<List<dynamic>> _load() =>
      context.read<AppState>().api.getList('/notifications/me');

  void _reload() => setState(() => _items = _load());

  Future<void> _markRead(Map<String, dynamic> n) async {
    if (n['readAt'] != null) return;
    setState(() => n['readAt'] = DateTime.now().toIso8601String()); // optimistic
    try {
      await context.read<AppState>().api.post('/notifications/${n['id']}/read');
    } on ApiException {
      if (mounted) setState(() => n['readAt'] = null); // rollback
    }
  }

  // Tapping a notification marks it read and, when it points at a room (e.g. a
  // "creator is live" alert), opens that room if it is still live.
  Future<void> _open(Map<String, dynamic> n) async {
    _markRead(n);
    final roomId = n['roomId'] as String?;
    if (roomId == null) return;
    final api = context.read<AppState>().api;
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    try {
      final data = await api.get('/live-rooms/$roomId');
      if (!mounted) return;
      final room = LiveRoom.fromJson(data);
      if (room.status == 'LIVE') {
        navigator.push(MaterialPageRoute(builder: (_) => RoomScreen(room: room)));
      } else {
        messenger.showSnackBar(
            const SnackBar(content: Text('This room has ended.')));
      }
    } on ApiException {
      if (!mounted) return;
      messenger.showSnackBar(
          const SnackBar(content: Text('Could not open the room.')));
    }
  }

  Future<void> _markAllRead() async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await context.read<AppState>().api.post('/notifications/read-all');
      _reload();
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          TextButton(
            onPressed: _markAllRead,
            child: const Text('Mark all read'),
          ),
        ],
      ),
      body: FutureBuilder<List<dynamic>>(
        future: _items,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Padding(
              padding: const EdgeInsets.all(16),
              child: AfriErrorState(
                title: 'Could not load notifications',
                body: 'Check your connection and try again.',
                onRetry: _reload,
              ),
            );
          }
          final rows = (snapshot.data ?? const []).cast<Map<String, dynamic>>();
          if (rows.isEmpty) {
            return const Padding(
              padding: EdgeInsets.all(16),
              child: AfriEmptyState(
                icon: Icons.notifications_none,
                title: 'No notifications yet',
                body: 'When creators you follow go live, you\'ll hear about it here.',
              ),
            );
          }
          return RefreshIndicator(
            onRefresh: () async => _reload(),
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: rows.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (context, i) {
                final n = rows[i];
                final unread = n['readAt'] == null;
                final style = notificationStyle('${n['type'] ?? ''}');
                return AfriCard(
                  onTap: () => _open(n),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 42,
                        height: 42,
                        decoration: BoxDecoration(
                          color: style.color.withValues(alpha: 0.16),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Icon(style.icon, color: style.color),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('${n['title'] ?? ''}',
                                style: Theme.of(context).textTheme.titleMedium),
                            const SizedBox(height: 3),
                            Text('${n['body'] ?? ''}',
                                style: Theme.of(context).textTheme.bodyMedium),
                            const SizedBox(height: 5),
                            Text(shortDateTime('${n['createdAt'] ?? ''}'),
                                style: Theme.of(context)
                                    .textTheme
                                    .bodySmall
                                    ?.copyWith(color: AfriColors.mutedText)),
                          ],
                        ),
                      ),
                      if (unread)
                        Container(
                          width: 9,
                          height: 9,
                          margin: const EdgeInsets.only(top: 6, left: 6),
                          decoration: const BoxDecoration(
                              color: AfriColors.gold, shape: BoxShape.circle),
                        ),
                    ],
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}
