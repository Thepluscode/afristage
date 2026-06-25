import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/afri_theme.dart';
import '../core/app_state.dart';
import '../widgets/afri_live.dart';
import '../widgets/afri_ui.dart';

class PayoutHistoryScreen extends StatefulWidget {
  const PayoutHistoryScreen({super.key});

  @override
  State<PayoutHistoryScreen> createState() => _PayoutHistoryScreenState();
}

class _PayoutHistoryScreenState extends State<PayoutHistoryScreen> {
  late Future<List<dynamic>> _payouts;

  @override
  void initState() {
    super.initState();
    _payouts = _load();
  }

  Future<List<dynamic>> _load() =>
      context.read<AppState>().api.getList('/payouts/me');

  Future<void> _refresh() async {
    final f = _load();
    setState(() => _payouts = f);
    await f;
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'PAID':
        return AfriColors.success;
      case 'REJECTED':
      case 'FAILED':
        return AfriColors.danger;
      case 'HELD':
        return AfriColors.warning;
      default:
        return AfriColors
            .teal; // REQUESTED / UNDER_REVIEW / APPROVED / PROCESSING
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Payout history')),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<List<dynamic>>(
          future: _payouts,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              return ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  AfriErrorState(
                    title: 'Could not load payouts',
                    body: 'Check your connection and try again.',
                    onRetry: () => setState(() => _payouts = _load()),
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
                    icon: Icons.payments_outlined,
                    title: 'No payouts yet',
                    body:
                        'Request a payout from your creator studio once you have earnings.',
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
                final p = rows[i];
                final status = p['status'] as String? ?? 'REQUESTED';
                final color = _statusColor(status);
                final fiatMinor = (p['fiatMinor'] as num?)?.toInt();
                final when = shortDateTime('${p['createdAt'] ?? ''}');
                final subtitle = fiatMinor != null
                    ? '${ledgerMoney(fiatMinor, '${p['fiatCurrency'] ?? 'NGN'}')} · $when'
                    : when;
                // Tell the creator what happened: why a payout was rejected/failed,
                // and the transfer reference once it's paid. Both already come from
                // /payouts/me — they just weren't shown.
                final reason = (p['rejectionReason'] as String?)?.trim();
                final reference = (p['providerReference'] as String?)?.trim();
                final note = (status == 'REJECTED' || status == 'FAILED')
                    ? (reason?.isNotEmpty == true ? reason : null)
                    : status == 'PAID'
                        ? (reference?.isNotEmpty == true
                            ? 'Ref: $reference'
                            : null)
                        : null;
                return AfriCard(
                  child: Row(
                    children: [
                      Container(
                        width: 42,
                        height: 42,
                        decoration: BoxDecoration(
                          color: color.withValues(alpha: 0.14),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child:
                            Icon(Icons.account_balance_outlined, color: color),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('${p['coinAmount']} coins',
                                style: Theme.of(context).textTheme.titleMedium),
                            const SizedBox(height: 3),
                            Text(subtitle,
                                style: Theme.of(context).textTheme.bodyMedium),
                            if (note != null) ...[
                              const SizedBox(height: 3),
                              Text(note,
                                  style: Theme.of(context)
                                      .textTheme
                                      .bodySmall
                                      ?.copyWith(color: color)),
                            ],
                          ],
                        ),
                      ),
                      AfriChip(label: status),
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
