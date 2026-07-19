import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../core/afri_theme.dart';
import '../core/api_client.dart';
import '../core/app_state.dart';
import '../widgets/afri_ui.dart';

/// Self-service account deletion (soft delete + 30-day retention; see
/// docs/account-deletion.md). Re-authenticates the password, explains exactly
/// what happens, and offers a GDPR data copy before the irreversible step.
class DeleteAccountScreen extends StatefulWidget {
  const DeleteAccountScreen({super.key});

  @override
  State<DeleteAccountScreen> createState() => _DeleteAccountScreenState();
}

class _DeleteAccountScreenState extends State<DeleteAccountScreen> {
  final _password = TextEditingController();
  bool _busy = false;
  bool _exporting = false;

  @override
  void dispose() {
    _password.dispose();
    super.dispose();
  }

  // GDPR Art. 15 self-service: fetch everything we hold and hand it to the user.
  // No file/share plugin in the app, so copy to clipboard — still a real export.
  Future<void> _downloadData() async {
    final api = context.read<AppState>().api;
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _exporting = true);
    try {
      final data = await api.get('/account/export');
      await Clipboard.setData(
          ClipboardData(text: const JsonEncoder.withIndent('  ').convert(data)));
      messenger.showSnackBar(const SnackBar(
          content: Text('Your data was copied to the clipboard.')));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  Future<void> _delete() async {
    if (_password.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Enter your password to confirm deletion.')));
      return;
    }
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete your account?'),
        content: const Text(
            'Your account will be deactivated immediately and permanently '
            'deleted after 30 days. This cannot be undone once the 30 days pass.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AfriColors.danger),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete account'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    final state = context.read<AppState>();
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _busy = true);
    try {
      await state.api.delete('/account', {'password': _password.text});
      messenger.showSnackBar(const SnackBar(
          content: Text('Your account has been deleted. Signing out…')));
      await state.logout(); // sessions are already revoked server-side
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AfriScaffold(
      title: 'Delete account',
      children: [
        const AfriEmptyState(
          icon: Icons.gpp_maybe,
          title: 'Before you delete',
          body:
              'Your account is deactivated right away. We keep your data for 30 '
              'days in case you change your mind, then delete it permanently. '
              'Financial records we are legally required to keep are anonymised.',
        ),
        const SizedBox(height: 16),
        AfriActionRow(
          icon: Icons.download,
          title: 'Download a copy of your data',
          body: _exporting
              ? 'Preparing your data…'
              : 'Get everything we hold on you (copied to your clipboard).',
          accent: AfriColors.teal,
          onTap: _exporting ? () {} : _downloadData,
        ),
        const SizedBox(height: 24),
        Text('Confirm your password to continue',
            style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 12),
        TextField(
          controller: _password,
          obscureText: true,
          decoration: const InputDecoration(
            labelText: 'Password',
            prefixIcon: Icon(Icons.lock_outline),
          ),
        ),
        const SizedBox(height: 20),
        FilledButton.icon(
          style: FilledButton.styleFrom(backgroundColor: AfriColors.danger),
          onPressed: _busy ? null : _delete,
          icon: _busy
              ? const SizedBox(
                  height: 18,
                  width: 18,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: Colors.white))
              : const Icon(Icons.delete_forever),
          label: const Text('Delete my account'),
        ),
      ],
    );
  }
}
