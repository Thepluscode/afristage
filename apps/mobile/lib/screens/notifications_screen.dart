import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/afri_theme.dart';
import '../core/api_client.dart';
import '../core/app_state.dart';
import '../widgets/afri_ui.dart';

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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Notifications')),
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
                return AfriCard(
                  onTap: () => _markRead(n),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 42,
                        height: 42,
                        decoration: BoxDecoration(
                          color: AfriColors.purple.withValues(alpha: 0.16),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: const Icon(Icons.live_tv, color: AfriColors.purple),
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
