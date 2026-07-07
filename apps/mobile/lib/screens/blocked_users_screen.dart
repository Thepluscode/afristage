import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/afri_theme.dart';
import '../core/api_client.dart';
import '../core/app_state.dart';
import '../widgets/afri_loader.dart';
import '../widgets/afri_ui.dart';

class BlockedUsersScreen extends StatefulWidget {
  const BlockedUsersScreen({super.key});

  @override
  State<BlockedUsersScreen> createState() => _BlockedUsersScreenState();
}

class _BlockedUsersScreenState extends State<BlockedUsersScreen> {
  final _unblocking = <String>{};

  Future<void> _unblock(
      Map<String, dynamic> u, Future<void> Function() refresh) async {
    final id = u['id'] as String;
    setState(() => _unblocking.add(id));
    try {
      await context.read<AppState>().api.delete('/users/$id/block');
      await refresh();
      if (mounted) setState(() => _unblocking.remove(id));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _unblocking.remove(id));
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not unblock: ${e.message}')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Blocked users')),
      body: AfriLoader<List<dynamic>>(
        load: () => context.read<AppState>().api.getList('/users/me/blocks'),
        errorTitle: 'Could not load blocked users',
        isEmpty: (items) => items.isEmpty,
        emptyBuilder: (_, __) => const AfriEmptyState(
          icon: Icons.block,
          title: 'No blocked users',
          body: 'Accounts you block won\'t be able to interact with you. '
              'You can unblock them here anytime.',
        ),
        builder: (context, items, refresh) {
          final rows = items.cast<Map<String, dynamic>>();
          return ListView.separated(
            physics: const AlwaysScrollableScrollPhysics(),
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
                      backgroundColor:
                          AfriColors.warning.withValues(alpha: 0.16),
                      backgroundImage: (avatar != null && avatar.isNotEmpty)
                          ? NetworkImage(avatar)
                          : null,
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
                            onPressed: () => _unblock(u, refresh),
                            child: const Text('Unblock'),
                          ),
                  ],
                ),
              );
            },
          );
        },
      ),
    );
  }
}
