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
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(color: AfriColors.danger, borderRadius: BorderRadius.circular(6)),
      child: const Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.circle, size: 7, color: Colors.white),
        SizedBox(width: 4),
        Text('LIVE', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Colors.white, letterSpacing: 0.5)),
      ]),
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
        const Icon(Icons.visibility, size: 13, color: Colors.white),
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
