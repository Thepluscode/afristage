import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/afri_theme.dart';
import '../core/api_client.dart';
import '../core/app_state.dart';
import '../widgets/afri_ui.dart';

const _reasons = <(String, String)>[
  ('NUDITY', 'Nudity'),
  ('HARASSMENT', 'Harassment'),
  ('HATE', 'Hate'),
  ('SCAM', 'Scam'),
  ('UNDERAGE_RISK', 'Underage risk'),
  ('SELF_HARM', 'Self-harm'),
  ('VIOLENCE', 'Violence'),
  ('SPAM', 'Spam'),
  ('COPYRIGHT', 'Copyright'),
  ('IMPERSONATION', 'Impersonation'),
  ('PAYMENT_FRAUD', 'Payment fraud'),
  ('OTHER', 'Other'),
];

class ReportScreen extends StatefulWidget {
  const ReportScreen({super.key, this.roomId, this.targetUserId, this.label});
  final String? roomId;
  final String? targetUserId;
  final String? label;

  @override
  State<ReportScreen> createState() => _ReportScreenState();
}

class _ReportScreenState extends State<ReportScreen> {
  String _reason = 'HARASSMENT';
  final _details = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _details.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _busy = true);
    final api = context.read<AppState>().api;
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    try {
      await api.post('/reports', {
        if (widget.roomId != null) 'roomId': widget.roomId,
        if (widget.targetUserId != null) 'targetUserId': widget.targetUserId,
        'reason': _reason,
        'details': _details.text.trim(),
      });
      if (!mounted) {
        return;
      }
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Report submitted'),
          content: const Text(
              'Thanks. Our moderation team will prioritise this report.'),
          actions: [
            FilledButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Done'),
            )
          ],
        ),
      );
      navigator.pop();
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  Future<void> _block() async {
    final target = widget.targetUserId;
    if (target == null) return;
    final api = context.read<AppState>().api;
    final messenger = ScaffoldMessenger.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Block this user?'),
        content: const Text(
            "You won't see their rooms and they can't interact with you. You can unblock later."),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Block')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await api.post('/users/$target/block');
      messenger.showSnackBar(const SnackBar(content: Text('User blocked.')));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return AfriScaffold(
      title: 'Report ${widget.label ?? 'content'}',
      children: [
        AfriCard(
          child: Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  color: AfriColors.danger.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Icon(Icons.health_and_safety_outlined,
                    color: AfriColors.danger),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Reporting is private. Choose the closest reason and add details only if helpful.',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        const AfriSectionHeader(
          title: 'Select reason',
          subtitle: 'Choose the closest match. You can add details below.',
        ),
        const SizedBox(height: 10),
        for (final reason in _reasons)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: AfriReportReasonTile(
              label: reason.$2,
              selected: _reason == reason.$1,
              onTap: () => setState(() => _reason = reason.$1),
            ),
          ),
        const SizedBox(height: 12),
        TextField(
          controller: _details,
          maxLines: 4,
          decoration: const InputDecoration(labelText: 'Details (optional)'),
        ),
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: _busy ? null : _submit,
          icon: const Icon(Icons.flag),
          label: Text(_busy ? 'Submitting…' : 'Submit Report'),
        ),
        if (widget.targetUserId != null) ...[
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: _busy ? null : _block,
            icon: const Icon(Icons.block),
            label: const Text('Block this user'),
          ),
        ],
      ],
    );
  }
}
