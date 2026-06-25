import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/afri_theme.dart';
import '../core/app_state.dart';
import '../widgets/afri_live.dart';
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
    _entries = _load();
  }

  Future<List<dynamic>> _load() =>
      context.read<AppState>().api.getList('/wallet/me/ledger');

  Future<void> _refresh() async {
    final f = _load();
    setState(() => _entries = f);
    await f;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Transaction History')),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<List<dynamic>>(
          future: _entries,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              return ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  AfriErrorState(
                    title: 'Could not load history',
                    body: 'Check your connection and try again.',
                    onRetry: () => setState(() => _entries = _load()),
                  ),
                ],
              );
            }
            final rows =
                (snapshot.data ?? const []).cast<Map<String, dynamic>>();
            if (rows.isEmpty) {
              return ListView(
                padding: const EdgeInsets.all(16),
                children: const [
                  AfriEmptyState(
                    icon: Icons.receipt_long,
                    title: 'No transactions yet',
                    body:
                        'Coin purchases, gifts, payouts, and wallet movements will appear here.',
                  ),
                ],
              );
            }
            return ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16),
              itemCount: rows.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (context, i) {
                final e = rows[i];
                final tx = e['transaction'] as Map<String, dynamic>?;
                final acct = e['account'] as Map<String, dynamic>?;
                final debit = e['direction'] == 'DEBIT';
                final amountMinor = (e['amountMinor'] as num?)?.toInt() ?? 0;
                final currency = '${e['currency'] ?? 'COIN'}';
                return AfriCard(
                  child: Row(
                    children: [
                      Container(
                        width: 42,
                        height: 42,
                        decoration: BoxDecoration(
                          color:
                              (debit ? AfriColors.danger : AfriColors.success)
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
                            Text(shortDateTime('${e['createdAt'] ?? ''}'),
                                style: Theme.of(context).textTheme.bodyMedium),
                          ],
                        ),
                      ),
                      Text(
                          '${debit ? '-' : '+'}${ledgerMoney(amountMinor, currency)}',
                          style:
                              Theme.of(context).textTheme.titleMedium?.copyWith(
                                    fontWeight: FontWeight.w800,
                                    color: debit
                                        ? AfriColors.danger
                                        : AfriColors.success,
                                  )),
                    ],
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
