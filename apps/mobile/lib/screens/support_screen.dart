import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/afri_theme.dart';
import '../core/app_state.dart';
import '../widgets/afri_ui.dart';

const _types = <(String, String)>[
  ('PAYMENT', 'Payment issue'),
  ('PAYOUT', 'Payout issue'),
  ('ACCOUNT', 'Account issue'),
  ('CREATOR_APPLICATION', 'Creator application'),
  ('MODERATION', 'Moderation appeal'),
  ('TECHNICAL', 'Technical problem'),
  ('GENERAL', 'General'),
];

class SupportScreen extends StatefulWidget {
  const SupportScreen({super.key});

  @override
  State<SupportScreen> createState() => _SupportScreenState();
}

class _SupportScreenState extends State<SupportScreen> {
  List<dynamic> _tickets = [];
  String _type = 'GENERAL';
  final _subject = TextEditingController();
  final _description = TextEditingController();
  bool _busy = false;
  bool _loadingTickets = true;
  String? _loadError;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _subject.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loadingTickets = true;
      _loadError = null;
    });
    try {
      final list =
          await context.read<AppState>().api.getList('/support/tickets/me');
      if (mounted) setState(() => _tickets = list);
    } on ApiException catch (e) {
      if (mounted) setState(() => _loadError = e.message);
    } finally {
      if (mounted) setState(() => _loadingTickets = false);
    }
  }

  Future<void> _create() async {
    if (_subject.text.trim().isEmpty || _description.text.trim().isEmpty) {
      return;
    }
    setState(() => _busy = true);
    final api = context.read<AppState>().api;
    final messenger = ScaffoldMessenger.of(context);
    try {
      await api.post('/support/tickets', {
        'type': _type,
        'subject': _subject.text.trim(),
        'description': _description.text.trim(),
      });
      _subject.clear();
      _description.clear();
      await _load();
      messenger.showSnackBar(const SnackBar(content: Text('Ticket created')));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AfriScaffold(
      title: 'Support',
      children: [
        AfriGradientPanel(
          colors: const [Color(0xFF092321), Color(0xFF17171F)],
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const AfriIconBadge(
                  icon: Icons.support_agent, accent: AfriColors.teal),
              const SizedBox(height: 16),
              Text('Support hub',
                  style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 8),
              Text(
                'Create payment, payout, moderation, creator, or account tickets and track replies from one place.',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        const Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            AfriChip(label: 'Payment issue'),
            AfriChip(label: 'Payout issue'),
            AfriChip(label: 'Account issue'),
            AfriChip(label: 'Report a bug'),
            AfriChip(label: 'Creator application'),
            AfriChip(label: 'Moderation appeal'),
          ],
        ),
        const SizedBox(height: 20),
        const AfriSectionHeader(
          title: 'New ticket',
          subtitle: 'Give ops enough context to route the issue quickly',
        ),
        const SizedBox(height: 8),
        DropdownButtonFormField<String>(
          initialValue: _type,
          decoration: const InputDecoration(labelText: 'Type'),
          items: _types
              .map((t) => DropdownMenuItem(value: t.$1, child: Text(t.$2)))
              .toList(),
          onChanged: (v) => setState(() => _type = v ?? 'GENERAL'),
        ),
        const SizedBox(height: 12),
        TextField(
            controller: _subject,
            decoration: const InputDecoration(labelText: 'Subject')),
        const SizedBox(height: 12),
        TextField(
            controller: _description,
            maxLines: 3,
            decoration: const InputDecoration(labelText: 'Describe the issue')),
        const SizedBox(height: 12),
        FilledButton(
            onPressed: _busy ? null : _create,
            child: Text(_busy ? 'Submitting…' : 'Create ticket')),
        const Divider(height: 32),
        AfriSectionHeader(
          title: 'My tickets',
          subtitle: _tickets.isEmpty ? 'No active support queue' : null,
          trailing: IconButton(
            tooltip: 'Refresh tickets',
            onPressed: _loadingTickets ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ),
        const SizedBox(height: 8),
        if (_loadingTickets)
          const Center(
            child: Padding(
              padding: EdgeInsets.all(20),
              child: CircularProgressIndicator(),
            ),
          )
        else if (_loadError != null)
          AfriEmptyState(
            icon: Icons.wifi_off,
            title: 'Could not load tickets',
            body: _loadError!,
            action: FilledButton(
              onPressed: _load,
              child: const Text('Retry tickets'),
            ),
          )
        else if (_tickets.isEmpty)
          const AfriEmptyState(
              icon: Icons.support_agent,
              title: 'No tickets yet',
              body:
                  'Create a ticket when you need payment, payout, account, or creator support.'),
        for (final t in _tickets.cast<Map<String, dynamic>>())
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: AfriSupportTicketCard(ticket: t),
          ),
      ],
    );
  }
}
