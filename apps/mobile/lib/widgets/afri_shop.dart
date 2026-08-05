import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import '../core/afri_theme.dart';
import '../models/models.dart';
import 'afri_live.dart';

/// The in-room shelf. Lives in its own file rather than afri_ui.dart, which is
/// already past 3.5k lines.

/// The floating bag that sits beside the gift button. The caller decides
/// whether to render it at all — an empty shop button invites a tap that leads
/// to a blank sheet, so AfriChatInput omits it when nothing is pinned.
class AfriShopButton extends StatelessWidget {
  const AfriShopButton({super.key, required this.count, required this.onTap});

  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Shop $count ${count == 1 ? 'item' : 'items'}',
      child: GestureDetector(
        onTap: onTap,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: AfriColors.elevated.withValues(alpha: 0.92),
                border:
                    Border.all(color: AfriColors.purple.withValues(alpha: 0.55)),
                boxShadow: const [
                  BoxShadow(color: Color(0x66000000), blurRadius: 14),
                ],
              ),
              child: const Icon(CupertinoIcons.bag_fill,
                  color: Colors.white, size: 21),
            ),
            Positioned(
              right: -2,
              top: -2,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: AfriColors.purple,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  '$count',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The bottom sheet the bag opens: what the host is selling, right now.
class AfriShopDrawer extends StatelessWidget {
  const AfriShopDrawer({
    super.key,
    required this.products,
    required this.coinBalance,
    required this.onBuy,
    required this.onOpenLink,
    this.onBuyCoins,
    this.busyProductId,
  });

  final List<PinnedProduct> products;
  final int coinBalance;
  final void Function(PinnedProduct product) onBuy;
  final void Function(PinnedProduct product) onOpenLink;
  final VoidCallback? onBuyCoins;

  /// The product whose purchase is in flight. Its button shows a spinner and
  /// every other buy button is disabled — a viewer cannot fire two orders by
  /// double-tapping while the first is still going.
  final String? busyProductId;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 18),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Text('Shop',
                  style: Theme.of(context)
                      .textTheme
                      .titleLarge
                      ?.copyWith(fontWeight: FontWeight.w900)),
              const SizedBox(width: 8),
              Text('Live picks',
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                      color: Colors.white.withValues(alpha: 0.55))),
              const Spacer(),
              _CoinPill(coins: coinBalance),
            ]),
            const SizedBox(height: 14),
            if (products.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 28),
                child: Center(
                  child: Text(
                    'Nothing on sale in this room yet.',
                    style: TextStyle(color: Colors.white.withValues(alpha: 0.6)),
                  ),
                ),
              ),
            for (final product in products) ...[
              _ProductRow(
                product: product,
                coinBalance: coinBalance,
                busy: busyProductId == product.id,
                // Any purchase in flight locks the whole sheet, not just its row.
                locked: busyProductId != null && busyProductId != product.id,
                onBuy: () => onBuy(product),
                onOpenLink: () => onOpenLink(product),
              ),
              const SizedBox(height: 10),
            ],
            if (onBuyCoins != null && products.any((p) => !p.isLinkOut)) ...[
              const SizedBox(height: 4),
              Center(
                child: TextButton.icon(
                  onPressed: onBuyCoins,
                  icon: const Icon(CupertinoIcons.money_dollar_circle_fill,
                      size: 16),
                  label: const Text('Top up coins'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _CoinPill extends StatelessWidget {
  const _CoinPill({required this.coins});

  final int coins;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: AfriColors.gold.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AfriColors.gold.withValues(alpha: 0.24)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        const Icon(CupertinoIcons.money_dollar_circle_fill,
            color: AfriColors.gold, size: 15),
        const SizedBox(width: 5),
        Text(formatCount(coins),
            style: const TextStyle(
                color: AfriColors.gold, fontWeight: FontWeight.w800)),
      ]),
    );
  }
}

class _ProductRow extends StatelessWidget {
  const _ProductRow({
    required this.product,
    required this.coinBalance,
    required this.busy,
    required this.locked,
    required this.onBuy,
    required this.onOpenLink,
  });

  final PinnedProduct product;
  final int coinBalance;
  final bool busy;
  final bool locked;
  final VoidCallback onBuy;
  final VoidCallback onOpenLink;

  @override
  Widget build(BuildContext context) {
    final affordable = coinBalance >= product.priceCoins;
    // A link-out product costs the viewer nothing here, so affordability and
    // stock are irrelevant to it — only in-app items can be sold out or unaffordable.
    final blocked =
        !product.isLinkOut && (product.isSoldOut || !affordable) || locked;

    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AfriColors.elevated.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _Thumb(url: product.imageUrl),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  product.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      fontWeight: FontWeight.w800, fontSize: 14),
                ),
                const SizedBox(height: 2),
                Text(
                  product.shopName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      fontSize: 12, color: Colors.white.withValues(alpha: 0.55)),
                ),
                const SizedBox(height: 6),
                Row(children: [
                  if (!product.isLinkOut) ...[
                    const Icon(CupertinoIcons.money_dollar_circle_fill,
                        color: AfriColors.gold, size: 14),
                    const SizedBox(width: 4),
                    Text(
                      formatCount(product.priceCoins),
                      style: const TextStyle(
                          color: AfriColors.gold, fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(width: 10),
                  ],
                  _StockLabel(product: product, affordable: affordable),
                ]),
              ],
            ),
          ),
          const SizedBox(width: 8),
          SizedBox(
            width: 96,
            child: FilledButton(
              onPressed: blocked || busy
                  ? null
                  : (product.isLinkOut ? onOpenLink : onBuy),
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 12),
                backgroundColor:
                    product.isLinkOut ? AfriColors.elevated : AfriColors.purple,
                side: product.isLinkOut
                    ? BorderSide(color: Colors.white.withValues(alpha: 0.18))
                    : null,
              ),
              child: busy
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : Text(
                      product.isLinkOut ? 'View' : 'Buy',
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StockLabel extends StatelessWidget {
  const _StockLabel({required this.product, required this.affordable});

  final PinnedProduct product;
  final bool affordable;

  @override
  Widget build(BuildContext context) {
    final (text, color) = _label();
    if (text == null) return const SizedBox.shrink();
    return Text(text, style: TextStyle(fontSize: 11, color: color));
  }

  (String?, Color) _label() {
    if (product.isLinkOut) {
      return ('Opens ${product.shopName}', Colors.white.withValues(alpha: 0.5));
    }
    if (product.isSoldOut) return ('Sold out', AfriColors.gold);
    if (!affordable) return ('Not enough coins', AfriColors.gold);
    // Only nudge on genuinely scarce stock; "12 left" is noise.
    final stock = product.stock;
    if (stock != null && stock <= 5) {
      return ('Only $stock left', AfriColors.gold);
    }
    return (null, Colors.white);
  }
}

class _Thumb extends StatelessWidget {
  const _Thumb({required this.url});

  final String? url;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: Container(
        width: 64,
        height: 64,
        color: AfriColors.surface,
        child: url == null || url!.isEmpty
            ? Icon(CupertinoIcons.bag,
                color: Colors.white.withValues(alpha: 0.35), size: 24)
            : Image.network(
                url!,
                fit: BoxFit.cover,
                // A broken image URL must not blank the row the buy button is in.
                errorBuilder: (_, __, ___) => Icon(CupertinoIcons.bag,
                    color: Colors.white.withValues(alpha: 0.35), size: 24),
              ),
      ),
    );
  }
}
