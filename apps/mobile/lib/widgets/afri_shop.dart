import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import '../core/afri_theme.dart';
import '../models/models.dart';
import 'afri_live.dart';

/// The in-room shelf. Lives in its own file rather than afri_ui.dart, which is
/// already past 3.5k lines.
///
/// Composition: the most recently pinned product is the FEATURE — the thing the
/// host is holding up right now — and gets the cover-and-scrim treatment the
/// system already uses for a featured live room (see AfriCover). Everything
/// pinned earlier is a quiet row beneath it. Uniform rows would say every item
/// matters equally, which is never true mid-stream.

/// Decode bounds for network images. Product photos arrive at whatever size the
/// seller uploaded; decoding a 2000px original into a 64dp box costs memory and
/// bandwidth on an audience the product assumes is data-constrained.
const _heroDecodeWidth = 720;
const _thumbDecodeWidth = 160;

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
    final feature = products.isEmpty ? null : products.first;
    final rest = products.length > 1 ? products.sublist(1) : const <PinnedProduct>[];

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
                  style: Theme.of(context)
                      .textTheme
                      .labelMedium
                      ?.copyWith(color: AfriColors.mutedText)),
              const Spacer(),
              _CoinPill(coins: coinBalance),
            ]),
            const SizedBox(height: 14),
            if (feature == null)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 28),
                child: Center(
                  child: Text(
                    'Nothing on sale in this room yet.',
                    style: TextStyle(color: AfriColors.secondaryText),
                  ),
                ),
              )
            else
              _FeatureProduct(
                product: feature,
                coinBalance: coinBalance,
                busy: busyProductId == feature.id,
                locked: busyProductId != null && busyProductId != feature.id,
                onBuy: () => onBuy(feature),
                onOpenLink: () => onOpenLink(feature),
              ),
            if (rest.isNotEmpty) ...[
              const SizedBox(height: 18),
              Text('Also pinned',
                  style: Theme.of(context)
                      .textTheme
                      .labelMedium
                      ?.copyWith(color: AfriColors.mutedText)),
              const SizedBox(height: 8),
            ],
            for (final product in rest) ...[
              _ProductRow(
                product: product,
                coinBalance: coinBalance,
                busy: busyProductId == product.id,
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
    return Semantics(
      label: 'Your balance: ${formatCount(coins)} coins',
      excludeSemantics: true,
      child: Container(
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
      ),
    );
  }
}

/// The thing the host is holding up. Cover, scrim, title over the image, the
/// price at display weight, and one full-width action — the system's featured
/// live-room treatment, applied to a product.
class _FeatureProduct extends StatelessWidget {
  const _FeatureProduct({
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
    final blocked = _isBlocked(product, affordable, locked);

    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: AfriColors.elevated,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AfriColors.borderStrong),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AspectRatio(
            aspectRatio: 16 / 10,
            child: Stack(
              fit: StackFit.expand,
              children: [
                _Cover(url: product.imageUrl),
                // Bottom scrim, same value the live-room cover uses, so text
                // stays legible over an unpredictable photo.
                const DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.center,
                      end: Alignment.bottomCenter,
                      colors: [Colors.transparent, Color(0xCC07070A)],
                    ),
                  ),
                ),
                Positioned(
                  left: 12,
                  right: 12,
                  bottom: 10,
                  child: Text(
                    product.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w800),
                  ),
                ),
                if (_urgency(product) case final label?)
                  Positioned(
                    left: 12,
                    top: 12,
                    child: _UrgencyPill(label: label),
                  ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    if (!product.isLinkOut) ...[
                      // Money at display weight: the one number a viewer is
                      // scanning for should not be body copy.
                      Text(
                        formatCount(product.priceCoins),
                        style: const TextStyle(
                          color: AfriColors.gold,
                          fontSize: 26,
                          height: 1.12,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.5,
                        ),
                      ),
                      const SizedBox(width: 6),
                      const Padding(
                        padding: EdgeInsets.only(bottom: 4),
                        child: Text('coins',
                            style: TextStyle(
                                color: AfriColors.gold,
                                fontSize: 12,
                                fontWeight: FontWeight.w800)),
                      ),
                    ],
                    const Spacer(),
                    Flexible(
                      child: Text(
                        product.shopName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.end,
                        style: const TextStyle(
                            fontSize: 12, color: AfriColors.mutedText),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                _ActionButton(
                  product: product,
                  affordable: affordable,
                  blocked: blocked,
                  busy: busy,
                  fullWidth: true,
                  onBuy: onBuy,
                  onOpenLink: onOpenLink,
                ),
                _StatusLine(product: product, affordable: affordable),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Everything pinned before the feature. Deliberately quieter: a smaller
/// thumbnail, the price inline, the action compact.
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
    final blocked = _isBlocked(product, affordable, locked);

    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AfriColors.elevated.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AfriColors.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: SizedBox(
              width: 56,
              height: 56,
              child: _Cover(url: product.imageUrl, decodeWidth: _thumbDecodeWidth),
            ),
          ),
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
                  style: const TextStyle(
                      fontSize: 12, color: AfriColors.mutedText),
                ),
                const SizedBox(height: 6),
                // Wrap, not Row: at large text scale a price plus a status
                // label overflows a fixed row.
                Wrap(
                  spacing: 10,
                  runSpacing: 2,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    if (!product.isLinkOut)
                      Row(mainAxisSize: MainAxisSize.min, children: [
                        const Icon(CupertinoIcons.money_dollar_circle_fill,
                            color: AfriColors.gold, size: 14),
                        const SizedBox(width: 4),
                        Text(
                          formatCount(product.priceCoins),
                          style: const TextStyle(
                              color: AfriColors.gold,
                              fontWeight: FontWeight.w800),
                        ),
                      ]),
                    _StatusText(product: product, affordable: affordable),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          _ActionButton(
            product: product,
            affordable: affordable,
            blocked: blocked,
            busy: busy,
            fullWidth: false,
            onBuy: onBuy,
            onOpenLink: onOpenLink,
          ),
        ],
      ),
    );
  }
}

/// A link-out product costs the viewer nothing here, so affordability and stock
/// are irrelevant to it; only in-app items can be sold out or unaffordable.
bool _isBlocked(PinnedProduct product, bool affordable, bool locked) =>
    (!product.isLinkOut && (product.isSoldOut || !affordable)) || locked;

/// Scarcity worth interrupting for. Silent on healthy stock — "12 left" is noise.
String? _urgency(PinnedProduct product) {
  if (product.isLinkOut) return null;
  if (product.isSoldOut) return 'Sold out';
  final stock = product.stock;
  if (stock != null && stock <= 5) return 'Only $stock left';
  return null;
}

class _UrgencyPill extends StatelessWidget {
  const _UrgencyPill({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: AfriColors.stage.withValues(alpha: 0.82),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AfriColors.gold.withValues(alpha: 0.5)),
      ),
      child: Text(
        label,
        style: const TextStyle(
            color: AfriColors.gold, fontSize: 11, fontWeight: FontWeight.w800),
      ),
    );
  }
}

/// The buy/view action. Labelled for a screen reader with the product it acts
/// on: a sheet of identically-labelled "Buy" buttons is unusable, and this one
/// spends money.
class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.product,
    required this.affordable,
    required this.blocked,
    required this.busy,
    required this.fullWidth,
    required this.onBuy,
    required this.onOpenLink,
  });

  final PinnedProduct product;
  final bool affordable;
  final bool blocked;
  final bool busy;
  final bool fullWidth;
  final VoidCallback onBuy;
  final VoidCallback onOpenLink;

  String get _semanticLabel {
    if (product.isLinkOut) {
      return 'View ${product.title} on ${product.shopName}, opens outside the app';
    }
    if (product.isSoldOut) return '${product.title}, sold out';
    if (!affordable) {
      return '${product.title}, ${formatCount(product.priceCoins)} coins, not enough coins';
    }
    return 'Buy ${product.title} for ${formatCount(product.priceCoins)} coins';
  }

  @override
  Widget build(BuildContext context) {
    final button = FilledButton(
      onPressed:
          blocked || busy ? null : (product.isLinkOut ? onOpenLink : onBuy),
      style: FilledButton.styleFrom(
        padding: EdgeInsets.symmetric(vertical: fullWidth ? 14 : 12),
        backgroundColor:
            product.isLinkOut ? AfriColors.soft : AfriColors.purple,
        foregroundColor: Colors.white,
        side: product.isLinkOut
            ? const BorderSide(color: AfriColors.borderStrong)
            : null,
      ),
      child: busy
          ? const SizedBox(
              width: 16,
              height: 16,
              child:
                  CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
            )
          : Text(
              product.isLinkOut ? 'View' : 'Buy',
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
    );

    return Semantics(
      button: true,
      enabled: !blocked && !busy,
      label: _semanticLabel,
      excludeSemantics: true,
      child: fullWidth
          ? SizedBox(width: double.infinity, child: button)
          // Constrained rather than fixed: "View" at a large text scale needs
          // more than a hard 96dp, and clipping the only action is fatal.
          : ConstrainedBox(
              constraints: const BoxConstraints(minWidth: 88, maxWidth: 132),
              child: button,
            ),
    );
  }
}

/// The feature's status, on its own line so it never competes with the price.
/// Suppressed when the urgency pill over the cover already says the same thing:
/// stating "Sold out" twice on one card reads as a rendering fault, not emphasis.
class _StatusLine extends StatelessWidget {
  const _StatusLine({required this.product, required this.affordable});

  final PinnedProduct product;
  final bool affordable;

  @override
  Widget build(BuildContext context) {
    final text = _statusText(product, affordable);
    if (text == null || text == _urgency(product)) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Center(child: _StatusText(product: product, affordable: affordable)),
    );
  }
}

class _StatusText extends StatelessWidget {
  const _StatusText({required this.product, required this.affordable});

  final PinnedProduct product;
  final bool affordable;

  @override
  Widget build(BuildContext context) {
    final text = _statusText(product, affordable);
    if (text == null) return const SizedBox.shrink();
    final muted = product.isLinkOut;
    return Text(
      text,
      style: TextStyle(
        fontSize: 11,
        fontWeight: muted ? FontWeight.w400 : FontWeight.w700,
        color: muted ? AfriColors.mutedText : AfriColors.gold,
      ),
    );
  }
}

String? _statusText(PinnedProduct product, bool affordable) {
  if (product.isLinkOut) return 'Opens ${product.shopName}';
  if (product.isSoldOut) return 'Sold out';
  if (!affordable) return 'Not enough coins';
  final stock = product.stock;
  if (stock != null && stock <= 5) return 'Only $stock left';
  return null;
}

/// Product imagery. Decode bounds are explicit: a seller's full-size upload
/// must not be decoded at original resolution to fill a thumbnail, and this
/// audience is assumed to be on constrained data.
class _Cover extends StatelessWidget {
  const _Cover({required this.url, this.decodeWidth = _heroDecodeWidth});

  final String? url;
  final int decodeWidth;

  @override
  Widget build(BuildContext context) {
    if (url == null || url!.isEmpty) return const _CoverFallback();
    return Image.network(
      url!,
      fit: BoxFit.cover,
      cacheWidth: decodeWidth,
      // Hold the space rather than popping in; a jumping layout under a live
      // stream reads as breakage.
      loadingBuilder: (context, child, progress) =>
          progress == null ? child : const _CoverFallback(),
      // A broken image URL must not blank the row the buy button is in.
      errorBuilder: (_, __, ___) => const _CoverFallback(),
    );
  }
}

class _CoverFallback extends StatelessWidget {
  const _CoverFallback();

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: AfriColors.surface,
      child: Center(
        child: Icon(CupertinoIcons.bag,
            color: AfriColors.mutedText.withValues(alpha: 0.6), size: 24),
      ),
    );
  }
}
