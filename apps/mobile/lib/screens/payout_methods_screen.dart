import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/afri_theme.dart';
import '../core/api_client.dart';
import '../core/app_state.dart';
import '../widgets/afri_ui.dart';

class PayoutMethodsScreen extends StatefulWidget {
  const PayoutMethodsScreen({super.key});

  @override
  State<PayoutMethodsScreen> createState() => _PayoutMethodsScreenState();
}

class _PayoutMethodsScreenState extends State<PayoutMethodsScreen> {
  late Future<List<dynamic>> _items;

  @override
  void initState() {
    super.initState();
    _items = _load();
  }

  Future<List<dynamic>> _load() =>
      context.read<AppState>().api.getList('/payouts/methods');

  void _reload() => setState(() => _items = _load());

  Future<void> _delete(Map<String, dynamic> m) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await context.read<AppState>().api.delete('/payouts/methods/${m['id']}');
      _reload();
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _add() async {
    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AfriColors.surface,
      builder: (_) => const _AddPayoutMethodSheet(),
    );
    if (created == true) _reload();
  }

  String _mask(String ref) =>
      ref.length <= 4 ? ref : '•••• ${ref.substring(ref.length - 4)}';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Payout methods')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _add,
        icon: const Icon(Icons.add),
        label: const Text('Add method'),
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
                title: 'Could not load payout methods',
                body: 'Check your connection and try again.',
                onRetry: _reload,
              ),
            );
          }
          final rows = (snapshot.data ?? const []).cast<Map<String, dynamic>>();
          if (rows.isEmpty) {
            return Padding(
              padding: const EdgeInsets.all(16),
              child: AfriEmptyState(
                icon: Icons.account_balance_outlined,
                title: 'No payout methods yet',
                body:
                    'Add a bank account or mobile-money number so approved earnings have somewhere to settle.',
                action: FilledButton(
                    onPressed: _add, child: const Text('Add payout method')),
              ),
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: rows.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (context, i) {
              final m = rows[i];
              final isBank = m['provider'] == 'BANK';
              return AfriCard(
                child: Row(
                  children: [
                    AfriIconBadge(
                        icon: isBank
                            ? Icons.account_balance
                            : Icons.smartphone,
                        accent: AfriColors.teal),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Flexible(
                                child: Text('${m['label'] ?? 'Method'}',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: Theme.of(context)
                                        .textTheme
                                        .titleMedium),
                              ),
                              if (m['isDefault'] == true) ...[
                                const SizedBox(width: 8),
                                const AfriChip(label: 'Default', selected: true),
                              ],
                            ],
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '${isBank ? 'Bank' : 'Mobile money'} · ${_mask('${m['destinationReference'] ?? ''}')} · ${m['currency'] ?? ''}',
                            style: Theme.of(context).textTheme.bodyMedium,
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      tooltip: 'Remove',
                      icon: const Icon(Icons.delete_outline,
                          color: AfriColors.danger),
                      onPressed: () => _delete(m),
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

class _AddPayoutMethodSheet extends StatefulWidget {
  const _AddPayoutMethodSheet();

  @override
  State<_AddPayoutMethodSheet> createState() => _AddPayoutMethodSheetState();
}

class _AddPayoutMethodSheetState extends State<_AddPayoutMethodSheet> {
  String _provider = 'BANK';
  final _label = TextEditingController();
  final _country = TextEditingController(text: 'NG');
  final _currency = TextEditingController(text: 'NGN');
  final _reference = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _label.dispose();
    _country.dispose();
    _currency.dispose();
    _reference.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await context.read<AppState>().api.post('/payouts/methods', {
        'provider': _provider,
        'label': _label.text.trim(),
        'country': _country.text.trim().toUpperCase(),
        'currency': _currency.text.trim().toUpperCase(),
        'destinationReference': _reference.text.trim(),
      });
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _error = e.message;
          _busy = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isBank = _provider == 'BANK';
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 18,
        bottom: MediaQuery.of(context).viewInsets.bottom + 18,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Add payout method',
              style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 14),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'BANK', label: Text('Bank'), icon: Icon(Icons.account_balance)),
              ButtonSegment(value: 'MOBILE_MONEY', label: Text('Mobile money'), icon: Icon(Icons.smartphone)),
            ],
            selected: {_provider},
            onSelectionChanged: (s) => setState(() => _provider = s.first),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _label,
            decoration: const InputDecoration(labelText: 'Label (e.g. GTBank savings)'),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _reference,
            keyboardType: isBank ? TextInputType.number : TextInputType.phone,
            decoration: InputDecoration(
                labelText: isBank ? 'Account number' : 'Mobile money number'),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _country,
                  textCapitalization: TextCapitalization.characters,
                  decoration: const InputDecoration(labelText: 'Country (ISO)'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: TextField(
                  controller: _currency,
                  textCapitalization: TextCapitalization.characters,
                  decoration: const InputDecoration(labelText: 'Currency'),
                ),
              ),
            ],
          ),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, style: const TextStyle(color: AfriColors.danger)),
          ],
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _busy ? null : _submit,
            child: _busy
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('Save payout method'),
          ),
        ],
      ),
    );
  }
}
