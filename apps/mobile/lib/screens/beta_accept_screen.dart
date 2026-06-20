import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/afri_theme.dart';
import '../core/api_client.dart';
import '../core/app_state.dart';
import '../widgets/afri_ui.dart';

class BetaAcceptScreen extends StatefulWidget {
  const BetaAcceptScreen({super.key});

  @override
  State<BetaAcceptScreen> createState() => _BetaAcceptScreenState();
}

class _BetaAcceptScreenState extends State<BetaAcceptScreen> {
  final _code = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _accept() async {
    final code = _code.text.trim();
    if (code.isEmpty) {
      return;
    }
    setState(() => _busy = true);
    final api = context.read<AppState>().api;
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    try {
      final res = await api.post('/beta/accept', {'code': code});
      messenger
          .showSnackBar(SnackBar(content: Text('Invite ${res['status']}')));
      navigator.pop();
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AfriScaffold(
      title: 'Beta Invite',
      children: [
        AfriCard(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  color: AfriColors.gold.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: const Icon(Icons.confirmation_number_outlined,
                    color: AfriColors.gold),
              ),
              const SizedBox(height: 16),
              Text('Join the closed beta',
                  style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 8),
              Text(
                'AfriStage is invite-only while live rooms, wallet flows, and creator approvals are being checked.',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _code,
          decoration: const InputDecoration(
            labelText: 'Invite code',
            prefixIcon: Icon(Icons.vpn_key_outlined),
          ),
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _busy ? null : _accept,
          child: _busy
              ? const SizedBox(
                  height: 18,
                  width: 18,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Accept Beta Invite'),
        ),
      ],
    );
  }
}
