import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/afri_theme.dart';
import '../core/app_state.dart';
import '../widgets/afri_ui.dart';

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  late Future<List<dynamic>> _entries;

  @override
  void initState() {
    super.initState();
    _entries = context.read<AppState>().api.getList('/wallet/me/ledger');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Transaction History')),
      body: FutureBuilder<List<dynamic>>(
        future: _entries,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Padding(
              padding: const EdgeInsets.all(16),
              child: AfriErrorState(
                title: 'Could not load history',
                body: 'Check your connection and try again.',
                onRetry: () => setState(() {
                  _entries =
                      context.read<AppState>().api.getList('/wallet/me/ledger');
                }),
              ),
            );
          }
          final rows = (snapshot.data ?? const []).cast<Map<String, dynamic>>();
          if (rows.isEmpty) {
            return const Padding(
              padding: EdgeInsets.all(16),
              child: AfriEmptyState(
                icon: Icons.receipt_long,
                title: 'No transactions yet',
                body:
                    'Coin purchases, gifts, payouts, and wallet movements will appear here.',
              ),
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: rows.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (context, i) {
              final e = rows[i];
              final tx = e['transaction'] as Map<String, dynamic>?;
              final acct = e['account'] as Map<String, dynamic>?;
              final debit = e['direction'] == 'DEBIT';
              return AfriCard(
                child: Row(
                  children: [
                    Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(
                        color: (debit ? AfriColors.danger : AfriColors.success)
                            .withValues(alpha: 0.14),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Icon(
                        debit ? Icons.arrow_upward : Icons.arrow_downward,
                        color: debit ? AfriColors.danger : AfriColors.success,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                              '${tx?['type'] ?? 'TXN'} · ${acct?['accountType'] ?? 'Wallet'}',
                              style: Theme.of(context).textTheme.titleMedium),
                          const SizedBox(height: 3),
                          Text('${e['createdAt'] ?? ''}',
                              style: Theme.of(context).textTheme.bodyMedium),
                        ],
                      ),
                    ),
                    Text(
                        '${debit ? '-' : '+'}${e['amountMinor']} ${e['currency']}',
                        style: Theme.of(context).textTheme.titleMedium),
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
