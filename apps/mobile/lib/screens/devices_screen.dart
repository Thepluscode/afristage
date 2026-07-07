import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/afri_theme.dart';
import '../core/app_state.dart';
import '../widgets/afri_loader.dart';
import '../widgets/afri_ui.dart';

/// Signed-in devices (device sessions, R5 §9 #6): every login is listed with
/// its label and last activity; any other device can be signed out on its own
/// — the "lost phone" flow. Surfaces GET /auth/sessions +
/// POST /auth/sessions/:id/revoke.
class DevicesScreen extends StatefulWidget {
  const DevicesScreen({super.key});

  @override
  State<DevicesScreen> createState() => _DevicesScreenState();
}

class _DevicesScreenState extends State<DevicesScreen> {
  String? _revoking; // session id mid-revoke, to disable its button

  Future<void> _revoke(
      Map<String, dynamic> s, Future<void> Function() refresh) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sign out device?'),
        content: Text(
            '${s['device'] ?? 'This device'} will be signed out and will need '
            'to log in again.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Sign out')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    final id = s['id'] as String;
    setState(() => _revoking = id);
    try {
      await context.read<AppState>().api.post('/auth/sessions/$id/revoke');
      await refresh();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not sign out that device.')));
    } finally {
      if (mounted) setState(() => _revoking = null);
    }
  }

  String _when(dynamic iso) {
    final d = DateTime.tryParse('${iso ?? ''}');
    if (d == null) return '';
    final diff = DateTime.now().difference(d);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    return '${diff.inDays}d ago';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Signed-in devices')),
      body: AfriLoader<List<dynamic>>(
        load: () => context.read<AppState>().api.getList('/auth/sessions'),
        errorTitle: 'Could not load your devices',
        isEmpty: (items) => items.isEmpty,
        emptyBuilder: (_, __) => const AfriEmptyState(
          icon: Icons.devices_outlined,
          title: 'No active devices',
          body: 'Devices you log in from will appear here.',
        ),
        builder: (context, items, refresh) {
          final rows = items.cast<Map<String, dynamic>>();
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
            children: [
              const Text(
                  'Every device signed in to your account. Sign out any you '
                  'don\'t recognise — it takes effect the moment that device '
                  'next talks to AfriStage.',
                  style:
                      TextStyle(color: AfriColors.secondaryText, fontSize: 13)),
              const SizedBox(height: 14),
              ...rows.map((s) => _tile(s, refresh)),
            ],
          );
        },
      ),
    );
  }

  Widget _tile(Map<String, dynamic> s, Future<void> Function() refresh) {
    final current = s['current'] == true;
    final label = (s['device'] as String?)?.trim();
    final ua = (s['userAgent'] as String?)?.trim();
    final name = (label != null && label.isNotEmpty)
        ? label
        : (ua != null && ua.isNotEmpty ? ua : 'Unknown device');
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: AfriCard(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(current ? Icons.smartphone : Icons.devices_other,
                color: current ? AfriColors.teal : AfriColors.secondaryText),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    Flexible(
                      child: Text(name,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontWeight: FontWeight.w800, fontSize: 14)),
                    ),
                    if (current) ...[
                      const SizedBox(width: 8),
                      const AfriChip(label: 'This device', selected: true),
                    ],
                  ]),
                  const SizedBox(height: 4),
                  Text(
                    'Active ${_when(s['lastSeenAt'])}'
                    '${s['ip'] != null ? ' · ${s['ip']}' : ''}',
                    style: const TextStyle(
                        color: AfriColors.secondaryText, fontSize: 12),
                  ),
                ],
              ),
            ),
            if (!current)
              TextButton(
                onPressed:
                    _revoking == s['id'] ? null : () => _revoke(s, refresh),
                child: Text(_revoking == s['id'] ? 'Signing out…' : 'Sign out'),
              ),
          ],
        ),
      ),
    );
  }
}
