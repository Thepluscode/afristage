import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api_client.dart';
import '../core/afri_theme.dart';
import '../core/app_state.dart';
import '../widgets/afri_ui.dart';
import 'history_screen.dart';

class WalletScreen extends StatefulWidget {
  const WalletScreen({super.key});

  @override
  State<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends State<WalletScreen> {
  bool _busy = false;
  bool _useCard = false;
  String? _pendingIntentId; // last Paystack checkout awaiting confirmation

  /// Coin packages: (label, fiat minor, coins).
  static const _packages = <(String, int, int)>[
    ('₦1,000 → 100 coins', 100000, 100),
    ('₦5,000 → 550 coins', 500000, 550),
    ('₦10,000 → 1,200 coins', 1000000, 1200),
  ];

  Future<void> _buy(int amountMinor, int coinAmount) async {
    if (_useCard) {
      return _buyWithCard(amountMinor, coinAmount);
    }
    setState(() => _busy = true);
    final state = context.read<AppState>();
    final messenger = ScaffoldMessenger.of(context);
    try {
      final intent = await state.api.post('/payments/coin-purchase-intents', {
        'amountMinor': amountMinor,
        'currency': 'NGN',
        'coinAmount': coinAmount,
      });
      await state.api.post('/payments/mock/${intent['id']}/complete');
      await state.refreshWallet();
      messenger
          .showSnackBar(SnackBar(content: Text('Added $coinAmount coins')));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  // Real Paystack: open the hosted checkout. Coins are credited by the verified
  // webhook after payment, so we tell the user to refresh once it completes.
  Future<void> _buyWithCard(int amountMinor, int coinAmount) async {
    setState(() => _busy = true);
    final state = context.read<AppState>();
    final messenger = ScaffoldMessenger.of(context);
    try {
      final intent = await state.api.post('/payments/coin-purchase-intents', {
        'amountMinor': amountMinor,
        'currency': 'NGN',
        'coinAmount': coinAmount,
        'provider': 'paystack',
      });
      final url = intent['authorizationUrl'] as String?;
      if (url == null) {
        throw const ApiException(502, 'No checkout URL returned');
      }
      final launched =
          await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
      if (!launched) throw const ApiException(0, 'Could not open checkout');
      if (mounted) {
        setState(() => _pendingIntentId = intent['id'] as String?);
      }
      messenger.showSnackBar(const SnackBar(
          content:
              Text('Complete payment, then tap "I\'ve paid" to confirm.')));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  // Pull-based confirm for the last checkout — works in dev where webhooks can't
  // reach localhost. The backend re-verifies with Paystack before crediting.
  Future<void> _confirmCard() async {
    final intentId = _pendingIntentId;
    if (intentId == null) {
      return;
    }
    setState(() => _busy = true);
    final state = context.read<AppState>();
    final messenger = ScaffoldMessenger.of(context);
    try {
      final res = await state.api.post('/payments/paystack/$intentId/verify');
      await state.refreshWallet();
      final credited =
          res['credited'] == true || res['status'] == 'already_credited';
      messenger.showSnackBar(SnackBar(
          content: Text(credited
              ? 'Payment confirmed — coins added.'
              : 'Payment not completed yet. Try again shortly.')));
      if (mounted && credited) setState(() => _pendingIntentId = null);
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final wallet = context.watch<AppState>().wallet;
    return AfriScaffold(
      title: 'Wallet',
      actions: [
        IconButton(
          tooltip: 'Refresh wallet',
          onPressed: () => context.read<AppState>().refreshWallet(),
          icon: const Icon(Icons.refresh),
        ),
      ],
      children: [
        AfriWalletBalanceCard(
          coinBalance: wallet.coinBalance,
          modeLabel: _useCard ? 'Paystack ready' : 'Dev wallet',
        ),
        const SizedBox(height: 20),
        const AfriSectionHeader(
          title: 'Earnings summary',
          subtitle: 'Coins earned from gifts, and what is held for checks',
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: AfriStatCard(
                  label: 'Creator earnings',
                  value: '${wallet.earningBalance}',
                  icon: Icons.payments_outlined,
                  accent: AfriColors.success),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: AfriStatCard(
                  label: 'Payout hold',
                  value: '${wallet.payoutHoldBalance}',
                  icon: Icons.lock_clock_outlined,
                  accent: AfriColors.warning),
            ),
          ],
        ),
        const SizedBox(height: 12),
        AfriPayoutStatusCard(
          available: wallet.earningBalance,
          pending: 0,
          hold: wallet.payoutHoldBalance,
        ),
        const SizedBox(height: 24),
        AfriSectionHeader(
          title: 'Buy coins',
          subtitle:
              'Provider: ${_useCard ? 'Paystack card checkout' : 'Mock instant dev flow'}',
        ),
        const SizedBox(height: 8),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(
              _useCard ? 'Pay with card (Paystack)' : 'Mock (instant, dev)'),
          value: _useCard,
          onChanged: _busy ? null : (v) => setState(() => _useCard = v),
        ),
        if (_pendingIntentId != null)
          FilledButton.tonalIcon(
            onPressed: _busy ? null : _confirmCard,
            icon: const Icon(Icons.check_circle_outline),
            label: const Text("I've paid — confirm"),
          ),
        const SizedBox(height: 8),
        for (final p in _packages)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: AfriCoinPackageCard(
              label: p.$1,
              body: _useCard
                  ? 'Open secure checkout'
                  : 'Credit instantly in dev mode',
              onTap: _busy ? null : () => _buy(p.$2, p.$3),
              busy: _busy,
            ),
          ),
        const SizedBox(height: 8),
        AfriActionRow(
          icon: Icons.receipt_long,
          title: 'Ledger and history',
          body: 'Review coin purchases, gifts, payouts, and wallet movement.',
          accent: AfriColors.teal,
          onTap: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const HistoryScreen()),
          ),
        ),
        const SizedBox(height: 10),
        Text(
          'Available earnings can be requested for payout. Some earnings may be held for fraud and payment checks.',
          style: Theme.of(context).textTheme.bodyMedium,
        ),
      ],
    );
  }
}
