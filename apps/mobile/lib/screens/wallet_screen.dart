import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api_client.dart';
import '../core/afri_theme.dart';
import '../core/app_state.dart';
import '../widgets/afri_live.dart';
import '../widgets/afri_ui.dart';
import 'gift_history_screen.dart';
import 'history_screen.dart';
import 'payout_history_screen.dart';
import 'payout_methods_screen.dart';
import 'support_screen.dart';

class WalletScreen extends StatefulWidget {
  const WalletScreen({super.key});

  @override
  State<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends State<WalletScreen> {
  bool _busy = false;
  bool _useCard = false;
  String? _pendingIntentId; // last card checkout awaiting confirmation

  /// Server-authoritative coin catalog (`/payments/coin-packages`). Holds every
  /// market's tiers — NGN (routed to Paystack) and USD (routed to Stripe) — the
  /// client only sends the package id; the server owns amount + coins + routing.
  List<({String id, String label})> _catalog = const [];

  @override
  void initState() {
    super.initState();
    _loadCatalog();
  }

  Future<void> _loadCatalog() async {
    try {
      final rows = await context.read<AppState>().api.getList('/payments/coin-packages');
      if (!mounted) return;
      setState(() => _catalog = [
            for (final p in rows.cast<Map<String, dynamic>>())
              (id: p['id'] as String, label: p['label'] as String)
          ]);
    } on Exception {
      // Non-fatal (network blip, no server in a widget test): the buy sheet
      // shows a "loading" state; reopening it retries the fetch.
    }
  }

  Future<void> _buy(String packageId) async {
    if (_useCard) {
      return _buyWithCard(packageId);
    }
    setState(() => _busy = true);
    final state = context.read<AppState>();
    final messenger = ScaffoldMessenger.of(context);
    try {
      final intent = await state.api.post('/payments/coin-purchase-intents', {
        'packageId': packageId,
      });
      await state.api.post('/payments/mock/${intent['id']}/complete');
      await state.refreshWallet();
      messenger.showSnackBar(
          SnackBar(content: Text('Added ${intent['coinAmount']} coins')));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  // Real card checkout: open the hosted checkout (Paystack for NGN, Stripe for
  // USD — the server routes by the package's currency). Coins are credited by
  // the verified webhook after payment, so we prompt the user to confirm.
  Future<void> _buyWithCard(String packageId) async {
    setState(() => _busy = true);
    final state = context.read<AppState>();
    final messenger = ScaffoldMessenger.of(context);
    try {
      final intent = await state.api.post('/payments/coin-purchase-intents', {
        'packageId': packageId,
        'provider': 'card',
      });
      final url = intent['checkoutUrl'] as String?;
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
  // reach localhost. The intent knows its processor; the backend re-verifies with
  // Paystack or Stripe before crediting.
  Future<void> _confirmCard() async {
    final intentId = _pendingIntentId;
    if (intentId == null) {
      return;
    }
    setState(() => _busy = true);
    final state = context.read<AppState>();
    final messenger = ScaffoldMessenger.of(context);
    try {
      final res = await state.api
          .post('/payments/coin-purchase-intents/$intentId/verify');
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
        TextButton(
          onPressed: () => Navigator.push(context,
              MaterialPageRoute(builder: (_) => const SupportScreen())),
          child: const Text('Support'),
        ),
        IconButton(
          tooltip: 'Refresh wallet',
          onPressed: () => context.read<AppState>().refreshWallet(),
          icon: const Icon(Icons.refresh),
        ),
      ],
      children: [
        // Available (withdrawable) earnings shown in USD, per the mockup.
        AfriBalanceCard(
          label: 'Available balance',
          value: usd(wallet.earningBalance),
          currencyLabel: 'USD',
          primaryLabel: 'Payout',
          primaryIcon: Icons.north_east,
          secondaryLabel: 'Transactions',
          onPrimary: () => Navigator.push(context,
              MaterialPageRoute(builder: (_) => const PayoutMethodsScreen())),
          onSecondary: () => Navigator.push(context,
              MaterialPageRoute(builder: (_) => const HistoryScreen())),
        ),
        const SizedBox(height: 22),
        const Text('Earnings summary',
            style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: AfriColors.text)),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(
              child: AfriStatTile(
                  label: 'Total earnings',
                  value: usd(wallet.earningBalance),
                  icon: Icons.trending_up,
                  accent: AfriColors.success)),
          const SizedBox(width: 12),
          Expanded(
              child: AfriStatTile(
                  label: 'Creator earnings',
                  value: usd(wallet.earningBalance),
                  icon: Icons.card_giftcard,
                  accent: AfriColors.gold)),
        ]),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(
              child: AfriStatTile(
                  label: 'Payout hold',
                  value: usd(wallet.payoutHoldBalance),
                  icon: Icons.lock_clock_outlined,
                  accent: AfriColors.warning)),
          const SizedBox(width: 12),
          Expanded(
              child: AfriStatTile(
                  label: 'Coin balance',
                  value: '${wallet.coinBalance}',
                  icon: Icons.monetization_on,
                  accent: AfriColors.teal)),
        ]),
        const SizedBox(height: 22),
        // Settings/menu list (mockup #4).
        AfriCard(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          child: Column(children: [
            AfriMenuRow(
                icon: Icons.person,
                title: 'Profile',
                subtitle: 'Manage your account',
                accent: AfriColors.purple,
                onTap: () => ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                        content: Text(
                            'Use the Profile tab to manage your account.')))),
            AfriMenuRow(
                icon: Icons.add_circle_outline,
                title: 'Buy coins',
                subtitle: 'Top up to send gifts',
                accent: AfriColors.gold,
                onTap: _busy ? null : _openBuyCoins),
            AfriMenuRow(
                icon: Icons.account_balance,
                title: 'Payout methods',
                subtitle: 'Bank or mobile money',
                accent: AfriColors.teal,
                onTap: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                        builder: (_) => const PayoutMethodsScreen()))),
            AfriMenuRow(
                icon: Icons.history,
                title: 'Ledger and history',
                subtitle: 'View past sessions, gifts, and wallet movement',
                accent: AfriColors.purple,
                onTap: () => Navigator.push(context,
                    MaterialPageRoute(builder: (_) => const HistoryScreen()))),
            AfriMenuRow(
                icon: Icons.card_giftcard,
                title: 'Gifts sent',
                subtitle: 'Every gift you have sent, by creator and room',
                accent: AfriColors.gold,
                onTap: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                        builder: (_) => const GiftHistoryScreen()))),
            AfriMenuRow(
                icon: Icons.receipt_long,
                title: 'Payout history',
                subtitle: 'Track every payout request',
                accent: AfriColors.gold,
                onTap: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                        builder: (_) => const PayoutHistoryScreen()))),
            AfriMenuRow(
                icon: Icons.support_agent,
                title: 'Support',
                subtitle: 'Help center & contact us',
                accent: AfriColors.teal,
                onTap: () => Navigator.push(context,
                    MaterialPageRoute(builder: (_) => const SupportScreen()))),
            AfriMenuRow(
                icon: Icons.report_outlined,
                title: 'Report',
                subtitle: 'Report a user or content',
                accent: AfriColors.warning,
                onTap: () => ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                        content: Text(
                            'Open a live room or profile to report specific content.')))),
            AfriMenuRow(
                icon: Icons.settings,
                title: 'Settings',
                subtitle: 'Notifications, privacy, and more',
                accent: AfriColors.purple,
                onTap: () => ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                        content:
                            Text('Settings are available from Profile.')))),
          ]),
        ),
        if (_pendingIntentId != null) ...[
          const SizedBox(height: 12),
          FilledButton.tonalIcon(
            onPressed: _busy ? null : _confirmCard,
            icon: const Icon(Icons.check_circle_outline),
            label: const Text("I've paid — confirm"),
          ),
        ],
      ],
    );
  }

  // Buy-coins moved into a bottom sheet (the mockup wallet leads with earnings).
  void _openBuyCoins() {
    if (_catalog.isEmpty) _loadCatalog(); // recover if the initial fetch failed
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AfriColors.surface,
      showDragHandle: true,
      builder: (sheetCtx) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Row(children: [
            const Text('Buy coins',
                style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: AfriColors.text)),
            const Spacer(),
            Switch(
                value: _useCard,
                onChanged: (v) {
                  setState(() => _useCard = v);
                  Navigator.pop(sheetCtx);
                  _openBuyCoins();
                }),
            Text(_useCard ? 'Card' : 'Mock',
                style:
                    const TextStyle(color: AfriColors.mutedText, fontSize: 12)),
          ]),
          const SizedBox(height: 8),
          if (_catalog.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Text('Loading coin packages…',
                  style: TextStyle(color: AfriColors.mutedText)),
            ),
          for (final p in _catalog)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: AfriCoinPackageCard(
                label: p.label,
                body: _useCard
                    ? 'Open secure checkout'
                    : 'Credit instantly in dev mode',
                onTap: _busy
                    ? null
                    : () {
                        Navigator.pop(sheetCtx);
                        _buy(p.id);
                      },
                busy: _busy,
              ),
            ),
        ]),
      ),
    );
  }
}
