import 'package:flutter/material.dart';

import '../core/afri_theme.dart';

/// Visual language for live content, matching design/ mockups: full-bleed cover
/// imagery with a gradient scrim, a red LIVE pill, and a viewer pill.

String formatCount(int n) {
  if (n >= 1000000) return '${(n / 1000000).toStringAsFixed(1)}M';
  if (n >= 1000) return '${(n / 1000).toStringAsFixed(1)}K';
  return '$n';
}

/// Deterministic, vibrant gradient per category — the cover fallback when a room
/// has no photo, so cards read as intentional rather than empty.
List<Color> categoryGradient(String category) {
  switch (category.toUpperCase()) {
    case 'MUSIC':
      return const [Color(0xFF7C3AED), Color(0xFFEC4899)];
    case 'COMEDY':
      return const [Color(0xFFF97316), Color(0xFFFBBF24)];
    case 'DANCE':
      return const [Color(0xFFEC4899), Color(0xFFF97316)];
    case 'FOOTBALL':
      return const [Color(0xFF059669), Color(0xFF14B8A6)];
    case 'FAITH':
      return const [Color(0xFF2563EB), Color(0xFF7C3AED)];
    case 'GAMING':
      return const [Color(0xFF6366F1), Color(0xFF22D3EE)];
    case 'TALK':
      return const [Color(0xFF0EA5E9), Color(0xFF6366F1)];
    default:
      return const [Color(0xFF7C3AED), Color(0xFFFF8A1F)];
  }
}

/// Cover layer: network image if available, else a category gradient with the
/// creator's initial. Always topped with a bottom scrim for legible overlays.
class AfriCover extends StatelessWidget {
  const AfriCover({super.key, this.imageUrl, required this.category, this.initial});

  final String? imageUrl;
  final String category;
  final String? initial;

  @override
  Widget build(BuildContext context) {
    final grad = categoryGradient(category);
    return Stack(
      fit: StackFit.expand,
      children: [
        if (imageUrl != null && imageUrl!.isNotEmpty)
          Image.network(imageUrl!, fit: BoxFit.cover, errorBuilder: (_, __, ___) => _gradient(grad))
        else
          _gradient(grad),
        // bottom scrim for text legibility
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.center,
              end: Alignment.bottomCenter,
              colors: [Colors.transparent, Color(0xCC07070A)],
            ),
          ),
        ),
      ],
    );
  }

  Widget _gradient(List<Color> grad) => DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: grad),
        ),
        child: Center(
          child: Text(
            (initial ?? category.characters.firstOrNull ?? 'A').toUpperCase(),
            style: const TextStyle(fontSize: 56, fontWeight: FontWeight.w900, color: Color(0x33FFFFFF)),
          ),
        ),
      );
}

class AfriLivePill extends StatelessWidget {
  const AfriLivePill({super.key});
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      // Teal LIVE pill per the design mockups (not red).
      decoration: BoxDecoration(color: AfriColors.teal, borderRadius: BorderRadius.circular(8)),
      child: const Text('LIVE',
          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: Colors.white, letterSpacing: 0.6)),
    );
  }
}

class AfriViewerPill extends StatelessWidget {
  const AfriViewerPill({super.key, required this.count});
  final int count;
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(color: const Color(0x66000000), borderRadius: BorderRadius.circular(20)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        // People icon per the mockups (not an eye).
        const Icon(Icons.people, size: 13, color: Colors.white),
        const SizedBox(width: 4),
        Text(formatCount(count), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white)),
      ]),
    );
  }
}

/// Full-width featured live card.
class AfriHeroLive extends StatelessWidget {
  const AfriHeroLive({super.key, required this.title, required this.category, this.creator, this.imageUrl, this.viewerCount = 0, this.onTap});

  final String title;
  final String category;
  final String? creator;
  final String? imageUrl;
  final int viewerCount;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(22),
        child: SizedBox(
          height: 220,
          child: Stack(
            fit: StackFit.expand,
            children: [
              AfriCover(imageUrl: imageUrl, category: category, initial: creator),
              Positioned(
                top: 14,
                left: 14,
                child: Row(children: [
                  const AfriLivePill(),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(color: const Color(0x66000000), borderRadius: BorderRadius.circular(6)),
                    child: Text(category, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white)),
                  ),
                ]),
              ),
              Positioned(top: 14, right: 14, child: AfriViewerPill(count: viewerCount)),
              Positioned(
                left: 16,
                right: 16,
                bottom: 16,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, maxLines: 2, overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: Colors.white)),
                    if (creator != null) ...[
                      const SizedBox(height: 4),
                      Text('With $creator', style: const TextStyle(fontSize: 13, color: Color(0xFFE5E5E5), fontWeight: FontWeight.w600)),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Compact live card for horizontal rails.
class AfriLiveCard extends StatelessWidget {
  const AfriLiveCard({super.key, required this.title, required this.category, this.creator, this.imageUrl, this.viewerCount = 0, this.onTap, this.width = 168});

  final String title;
  final String category;
  final String? creator;
  final String? imageUrl;
  final int viewerCount;
  final VoidCallback? onTap;
  final double width;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: SizedBox(
        width: width,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: SizedBox(
                height: 190,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    AfriCover(imageUrl: imageUrl, category: category, initial: creator),
                    const Positioned(top: 10, left: 10, child: AfriLivePill()),
                    Positioned(top: 10, right: 10, child: AfriViewerPill(count: viewerCount)),
                    Positioned(
                      left: 10,
                      right: 10,
                      bottom: 10,
                      child: Text(creator ?? title,
                          maxLines: 1, overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: Colors.white)),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            Text(title, maxLines: 1, overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AfriColors.text)),
            Text(category, style: const TextStyle(fontSize: 11, color: AfriColors.mutedText)),
          ],
        ),
      ),
    );
  }
}

/// Circular creator avatar with a gradient ring.
class AfriCreatorRing extends StatelessWidget {
  const AfriCreatorRing({super.key, required this.name, this.imageUrl, this.viewerCount, this.onTap, this.live = true});

  final String name;
  final String? imageUrl;
  final int? viewerCount;
  final VoidCallback? onTap;
  final bool live;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: SizedBox(
        width: 76,
        child: Column(
          children: [
            Container(
              padding: const EdgeInsets.all(2.5),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(
                  colors: live ? const [AfriColors.orange, AfriColors.gold] : const [AfriColors.border, AfriColors.border],
                ),
              ),
              child: CircleAvatar(
                radius: 30,
                backgroundColor: AfriColors.elevated,
                backgroundImage: (imageUrl != null && imageUrl!.isNotEmpty) ? NetworkImage(imageUrl!) : null,
                child: (imageUrl == null || imageUrl!.isEmpty)
                    ? Text(name.characters.firstOrNull?.toUpperCase() ?? 'A',
                        style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AfriColors.text))
                    : null,
              ),
            ),
            const SizedBox(height: 6),
            Text(name, maxLines: 1, overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AfriColors.secondaryText)),
          ],
        ),
      ),
    );
  }
}

/// Gold coin-balance pill for the app bar.
class AfriCoinPill extends StatelessWidget {
  const AfriCoinPill({super.key, required this.coins, this.onTap});
  final int coins;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: const Color(0x33FFC857),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: const Color(0x55FFC857)),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.monetization_on, size: 16, color: AfriColors.gold),
          const SizedBox(width: 5),
          Text(formatCount(coins), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AfriColors.gold)),
        ]),
      ),
    );
  }
}

/// Gold-gradient wallet balance card (mockup #4).
class AfriBalanceCard extends StatelessWidget {
  const AfriBalanceCard({super.key, required this.coins, this.onBuy, this.onHistory});
  final int coins;
  final VoidCallback? onBuy;
  final VoidCallback? onHistory;
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFFFFC857), Color(0xFFF59E0B)]),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Coin balance', style: TextStyle(color: Color(0xCC1A1205), fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
          Text(formatCount(coins), style: const TextStyle(fontSize: 38, fontWeight: FontWeight.w900, color: Color(0xFF170B02))),
          const SizedBox(width: 6),
          const Text('coins', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Color(0xAA170B02))),
        ]),
        const SizedBox(height: 16),
        Row(children: [
          Expanded(child: FilledButton.icon(
            onPressed: onBuy,
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFF170B02), foregroundColor: AfriColors.gold, minimumSize: const Size.fromHeight(46)),
            icon: const Icon(Icons.add, size: 18), label: const Text('Buy coins'))),
          const SizedBox(width: 10),
          Expanded(child: OutlinedButton.icon(
            onPressed: onHistory,
            style: OutlinedButton.styleFrom(foregroundColor: const Color(0xFF170B02), side: const BorderSide(color: Color(0x55170B02)), minimumSize: const Size.fromHeight(46)),
            icon: const Icon(Icons.receipt_long, size: 18), label: const Text('Transactions'))),
        ]),
      ]),
    );
  }
}

/// Stat tile with a colored icon chip (dashboard / profile / wallet overview).
class AfriStatTile extends StatelessWidget {
  const AfriStatTile({super.key, required this.label, required this.value, required this.icon, required this.accent});
  final String label;
  final String value;
  final IconData icon;
  final Color accent;
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: AfriColors.elevated, borderRadius: BorderRadius.circular(16), border: Border.all(color: AfriColors.border)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: 36, height: 36,
          decoration: BoxDecoration(color: accent.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(10)),
          child: Icon(icon, size: 19, color: accent),
        ),
        const SizedBox(height: 10),
        Text(value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: AfriColors.text)),
        Text(label, style: const TextStyle(fontSize: 12, color: AfriColors.mutedText)),
      ]),
    );
  }
}

/// Tappable settings/menu row (mockup #4 list).
class AfriMenuRow extends StatelessWidget {
  const AfriMenuRow({super.key, required this.icon, required this.title, this.subtitle, this.accent = AfriColors.teal, this.onTap});
  final IconData icon;
  final String title;
  final String? subtitle;
  final Color accent;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
        child: Row(children: [
          Container(
            width: 38, height: 38,
            decoration: BoxDecoration(color: accent.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(11)),
            child: Icon(icon, size: 19, color: accent),
          ),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AfriColors.text)),
            if (subtitle != null) Text(subtitle!, style: const TextStyle(fontSize: 12, color: AfriColors.mutedText)),
          ])),
          const Icon(Icons.chevron_right, color: AfriColors.mutedText),
        ]),
      ),
    );
  }
}

/// Horizontal gift bar for the live room (mockup #2).
class AfriGiftBar extends StatelessWidget {
  const AfriGiftBar({super.key, required this.gifts, this.onSend});
  final List<Map<String, dynamic>> gifts; // {name, coinPrice}
  final void Function(Map<String, dynamic>)? onSend;
  @override
  Widget build(BuildContext context) {
    const icons = [Icons.local_florist, Icons.favorite, Icons.mic, Icons.emoji_events, Icons.diamond, Icons.celebration];
    const tints = [Color(0xFFEC4899), Color(0xFFEF4444), Color(0xFFFFC857), Color(0xFFF59E0B), Color(0xFF22D3EE), Color(0xFF7C3AED)];
    return SizedBox(
      height: 92,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: gifts.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (_, i) {
          final g = gifts[i];
          final tint = tints[i % tints.length];
          return GestureDetector(
            onTap: () => onSend?.call(g),
            child: Container(
              width: 72,
              decoration: BoxDecoration(color: AfriColors.elevated, borderRadius: BorderRadius.circular(14), border: Border.all(color: AfriColors.border)),
              child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                Icon(icons[i % icons.length], color: tint, size: 26),
                const SizedBox(height: 6),
                Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  const Icon(Icons.monetization_on, size: 12, color: AfriColors.gold),
                  const SizedBox(width: 3),
                  Text('${g['coinPrice'] ?? 0}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AfriColors.gold)),
                ]),
              ]),
            ),
          );
        },
      ),
    );
  }
}
