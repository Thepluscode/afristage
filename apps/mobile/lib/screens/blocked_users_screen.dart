import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/afri_theme.dart';
import '../core/api_client.dart';
import '../core/app_state.dart';
import '../widgets/afri_ui.dart';

class BlockedUsersScreen extends StatefulWidget {
  const BlockedUsersScreen({super.key});

  @override
  State<BlockedUsersScreen> createState() => _BlockedUsersScreenState();
}

class _BlockedUsersScreenState extends State<BlockedUsersScreen> {
  late Future<List<dynamic>> _items;
  final _unblocking = <String>{};

  @override
  void initState() {
    super.initState();
    _items = _load();
  }

  Future<List<dynamic>> _load() =>
      context.read<AppState>().api.getList('/users/me/blocks');

  void _reload() => setState(() => _items = _load());

  Future<void> _unblock(Map<String, dynamic> u) async {
    final id = u['id'] as String;
    setState(() => _unblocking.add(id));
    try {
      await context.read<AppState>().api.delete('/users/$id/block');
      _reload();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _unblocking.remove(id));
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Could not unblock: ${e.message}')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Blocked users')),
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
                title: 'Could not load blocked users',
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
                icon: Icons.block,
                title: 'No blocked users',
                body: 'Accounts you block won\'t be able to interact with you. '
                    'You can unblock them here anytime.',
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
                final u = rows[i];
                final id = u['id'] as String;
                final avatar = u['avatarUrl'] as String?;
                final busy = _unblocking.contains(id);
                return AfriCard(
                  child: Row(
                    children: [
                      CircleAvatar(
                        radius: 21,
                        backgroundColor: AfriColors.warning.withValues(alpha: 0.16),
                        backgroundImage:
                            (avatar != null && avatar.isNotEmpty) ? NetworkImage(avatar) : null,
                        child: (avatar == null || avatar.isEmpty)
                            ? const Icon(Icons.person, color: AfriColors.warning)
                            : null,
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text('${u['displayName'] ?? 'Unknown user'}',
                            style: Theme.of(context).textTheme.titleMedium),
                      ),
                      busy
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2))
                          : OutlinedButton(
                              onPressed: () => _unblock(u),
                              child: const Text('Unblock'),
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
