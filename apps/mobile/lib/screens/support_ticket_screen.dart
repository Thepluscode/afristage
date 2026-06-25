import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/afri_theme.dart';
import '../core/api_client.dart';
import '../core/app_state.dart';
import '../models/models.dart';
import '../widgets/afri_live.dart';
import '../widgets/afri_ui.dart';

class SupportTicketScreen extends StatefulWidget {
  const SupportTicketScreen({super.key, required this.ticketId, this.subject});
  final String ticketId;
  final String? subject;

  @override
  State<SupportTicketScreen> createState() => _SupportTicketScreenState();
}

class _SupportTicketScreenState extends State<SupportTicketScreen> {
  late Future<Map<String, dynamic>> _ticket;
  final _reply = TextEditingController();
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _ticket = _load();
  }

  Future<Map<String, dynamic>> _load() =>
      context.read<AppState>().api.get('/support/tickets/${widget.ticketId}');

  void _reload() => setState(() => _ticket = _load());

  @override
  void dispose() {
    _reply.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _reply.text.trim();
    if (text.isEmpty) return;
    setState(() => _sending = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await context
          .read<AppState>()
          .api
          .post('/support/tickets/${widget.ticketId}/messages', {'message': text});
      _reply.clear();
      _reload();
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.subject ?? 'Support ticket')),
      body: Column(
        children: [
          Expanded(
            child: FutureBuilder<Map<String, dynamic>>(
              future: _ticket,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snapshot.hasError) {
                  return Padding(
                    padding: const EdgeInsets.all(16),
                    child: AfriErrorState(
                      title: 'Could not load ticket',
                      body: 'Check your connection and try again.',
                      onRetry: _reload,
                    ),
                  );
                }
                final ticket = snapshot.data ?? const {};
                final messages =
                    (ticket['messages'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
                return ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    AfriCard(
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(ticket['subject'] as String? ?? 'Ticket',
                                style: Theme.of(context).textTheme.titleMedium),
                          ),
                          AfriChip(label: ticket['status'] as String? ?? 'OPEN'),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),
                    if (messages.isEmpty)
                      const AfriEmptyState(
                        icon: Icons.forum_outlined,
                        title: 'No replies yet',
                        body: 'Add a message below and our team will respond here.',
                      ),
                    for (final m in messages)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            AfriChatBubble(
                              message: ChatMessage(
                                sender: m['senderId'] ==
                                        context.read<AppState>().userId
                                    ? 'You'
                                    : 'Support',
                                text: m['message'] as String? ?? '',
                              ),
                            ),
                            Padding(
                              padding: const EdgeInsets.only(left: 8, top: 2),
                              child: Text(
                                shortDateTime('${m['createdAt'] ?? ''}'),
                                style: Theme.of(context)
                                    .textTheme
                                    .bodySmall
                                    ?.copyWith(color: AfriColors.mutedText),
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                );
              },
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _reply,
                      minLines: 1,
                      maxLines: 4,
                      decoration: const InputDecoration(
                        hintText: 'Write a reply',
                        border: OutlineInputBorder(),
                        isDense: true,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    onPressed: _sending ? null : _send,
                    icon: const Icon(Icons.send),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
