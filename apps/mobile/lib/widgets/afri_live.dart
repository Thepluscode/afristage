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
  const AfriCover(
      {super.key, this.imageUrl, required this.category, this.initial});

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
          Image.network(imageUrl!,
              fit: BoxFit.cover, errorBuilder: (_, __, ___) => _gradient(grad))
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
          gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: grad),
        ),
        child: Center(
          child: Text(
            (initial ?? category.characters.firstOrNull ?? 'A').toUpperCase(),
            style: const TextStyle(
                fontSize: 56,
                fontWeight: FontWeight.w900,
                color: Color(0x33FFFFFF)),
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
      // Teal LIVE pill per the mockups (cards/room). Red is the hero-only AfriLiveNowPill.
      decoration: BoxDecoration(
          color: AfriColors.teal, borderRadius: BorderRadius.circular(8)),
      child: const Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.circle, size: 7, color: Colors.white),
        SizedBox(width: 5),
        Text('LIVE',
            style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w900,
                color: Colors.white)),
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
      decoration: BoxDecoration(
          color: const Color(0x66000000),
          borderRadius: BorderRadius.circular(20)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.person, size: 13, color: Colors.white),
        const SizedBox(width: 4),
        Text(formatCount(count),
            style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: Colors.white)),
      ]),
    );
  }
}

/// Red "Live now" pill for the hero.
class AfriLiveNowPill extends StatelessWidget {
  const AfriLiveNowPill({super.key});
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
          color: AfriColors.danger, borderRadius: BorderRadius.circular(8)),
      child: const Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.circle, size: 7, color: Colors.white),
        SizedBox(width: 5),
        Text('Live now',
            style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w800,
                color: Colors.white)),
      ]),
    );
  }
}

/// Full-width featured live card with a Join CTA + carousel dots.
class AfriHeroLive extends StatelessWidget {
  const AfriHeroLive(
      {super.key,
      required this.title,
      required this.category,
      this.creator,
      this.imageUrl,
      this.viewerCount = 0,
      this.onTap,
      this.onJoin,
      this.dotCount = 4,
      this.dotIndex = 0});

  final String title;
  final String category;
  final String? creator;
  final String? imageUrl;
  final int viewerCount;
  final VoidCallback? onTap;
  final VoidCallback? onJoin;
  final int dotCount;
  final int dotIndex;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(22),
        child: SizedBox(
          height: 248,
          child: Stack(
            fit: StackFit.expand,
            children: [
              AfriCover(
                  imageUrl: imageUrl, category: category, initial: creator),
              const Positioned(top: 14, left: 14, child: AfriLiveNowPill()),
              Positioned(
                  top: 14,
                  right: 14,
                  child: AfriViewerPill(count: viewerCount)),
              Positioned(
                left: 16,
                right: 16,
                bottom: 16,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.w900,
                            color: Colors.white)),
                    if (creator != null) ...[
                      const SizedBox(height: 4),
                      Text('With $creator',
                          style: const TextStyle(
                              fontSize: 13,
                              color: Color(0xFFE5E5E5),
                              fontWeight: FontWeight.w600)),
                    ],
                    const SizedBox(height: 12),
                    Row(children: [
                      FilledButton(
                        onPressed: onJoin ?? onTap,
                        style: FilledButton.styleFrom(
                          backgroundColor: AfriColors.gold,
                          foregroundColor: const Color(0xFF170B02),
                          minimumSize: const Size(0, 42),
                          padding: const EdgeInsets.symmetric(horizontal: 22),
                        ),
                        child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text('Join now',
                                  style:
                                      TextStyle(fontWeight: FontWeight.w800)),
                              SizedBox(width: 6),
                              Icon(Icons.arrow_forward, size: 16),
                            ]),
                      ),
                      const Spacer(),
                      // Carousel dots.
                      for (int i = 0; i < dotCount; i++)
                        Container(
                          width: i == dotIndex ? 18 : 6,
                          height: 6,
                          margin: const EdgeInsets.only(left: 4),
                          decoration: BoxDecoration(
                            color:
                                i == dotIndex ? Colors.white : Colors.white38,
                            borderRadius: BorderRadius.circular(3),
                          ),
                        ),
                    ]),
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

/// Emoji flag from an ISO country code (e.g. "NG" -> 🇳🇬).
String countryFlag(String? code) {
  if (code == null || code.length != 2) return '';
  final cc = code.toUpperCase();
  final a = cc.codeUnitAt(0), b = cc.codeUnitAt(1);
  if (a < 65 || a > 90 || b < 65 || b > 90) return '';
  return String.fromCharCode(0x1F1E6 + (a - 65)) +
      String.fromCharCode(0x1F1E6 + (b - 65));
}

/// Compact live card: full-bleed cover with LIVE/viewer pills and bottom scrim.
class AfriLiveCard extends StatelessWidget {
  const AfriLiveCard(
      {super.key,
      required this.title,
      required this.category,
      this.creator,
      this.country,
      this.imageUrl,
      this.viewerCount = 0,
      this.onTap,
      this.width = 168});

  final String title;
  final String category;
  final String? creator;
  final String? country;
  final String? imageUrl;
  final int viewerCount;
  final VoidCallback? onTap;
  final double width;

  @override
  Widget build(BuildContext context) {
    final flag = countryFlag(country);
    return Semantics(
      // Only a button when it actually navigates — a non-interactive preview
      // (e.g. the go-live feed preview) is described but not announced tappable.
      button: onTap != null,
      // Replace the decorative cover + overlay pills with one spoken label.
      excludeSemantics: true,
      label: creator == null
          ? 'Live room: $title'
          : 'Live room: $title by $creator',
      child: GestureDetector(
        onTap: onTap,
        child: SizedBox(
          width: width,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(18),
            child: AspectRatio(
              aspectRatio: 0.78,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  AfriCover(
                      imageUrl: imageUrl, category: category, initial: creator),
                  const Positioned(top: 10, left: 10, child: AfriLivePill()),
                  Positioned(
                      top: 10,
                      right: 10,
                      child: AfriViewerPill(count: viewerCount)),
                  Positioned(
                    left: 0,
                    right: 0,
                    bottom: 0,
                    child: Container(
                      padding: const EdgeInsets.fromLTRB(12, 34, 12, 12),
                      decoration: const BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [Colors.transparent, Color(0xE607070A)],
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(title,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                  fontSize: 15,
                                  height: 1.12,
                                  fontWeight: FontWeight.w900,
                                  color: Colors.white)),
                          const SizedBox(height: 5),
                          Text(
                              '${creator ?? 'Creator'}${flag.isNotEmpty ? '  $flag ${country!.toUpperCase()}' : ''}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  color: Color(0xFFD4D4D8))),
                        ],
                      ),
                    ),
                  ),
                  Positioned(
                    left: 10,
                    bottom: 74,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: AfriColors.purple.withValues(alpha: 0.72),
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(
                            color: AfriColors.purple.withValues(alpha: 0.42)),
                      ),
                      child: Text(category,
                          maxLines: 1,
                          style: const TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                              color: Color(0xFFEDE9FE))),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Circular creator avatar with a gradient ring.
class AfriCreatorRing extends StatelessWidget {
  const AfriCreatorRing(
      {super.key,
      required this.name,
      this.imageUrl,
      this.viewerCount,
      this.onTap,
      this.live = true});

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
                  colors: live
                      ? const [AfriColors.orange, AfriColors.gold]
                      : const [AfriColors.border, AfriColors.border],
                ),
              ),
              child: CircleAvatar(
                radius: 30,
                backgroundColor: AfriColors.elevated,
                backgroundImage: (imageUrl != null && imageUrl!.isNotEmpty)
                    ? NetworkImage(imageUrl!)
                    : null,
                child: (imageUrl == null || imageUrl!.isEmpty)
                    ? Text(name.characters.firstOrNull?.toUpperCase() ?? 'A',
                        style: const TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w800,
                            color: AfriColors.text))
                    : null,
              ),
            ),
            const SizedBox(height: 6),
            Text(name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: AfriColors.secondaryText)),
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
          Text(formatCount(coins),
              style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  color: AfriColors.gold)),
        ]),
      ),
    );
  }
}

/// Dark-gold gradient balance card (mockup #4): label, big value, two actions.
class AfriBalanceCard extends StatelessWidget {
  const AfriBalanceCard({
    super.key,
    required this.label,
    required this.value,
    required this.primaryLabel,
    required this.secondaryLabel,
    this.primaryIcon = Icons.north_east,
    this.onPrimary,
    this.onSecondary,
    this.currencyLabel,
  });
  final String label;
  final String value;
  final String primaryLabel;
  final String secondaryLabel;
  final IconData primaryIcon;
  final VoidCallback? onPrimary;
  final VoidCallback? onSecondary;
  final String? currencyLabel; // e.g. "USD" shown as a chip top-right

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF3A2A0A), Color(0xFF17120A)]),
        border: Border.all(color: const Color(0x33FFC857)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Text(label,
              style: const TextStyle(
                  color: AfriColors.mutedText, fontWeight: FontWeight.w600)),
          const Spacer(),
          if (currencyLabel != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                  color: const Color(0x22FFC857),
                  borderRadius: BorderRadius.circular(20)),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Text(currencyLabel!,
                    style: const TextStyle(
                        color: AfriColors.gold,
                        fontWeight: FontWeight.w700,
                        fontSize: 12)),
                const Icon(Icons.keyboard_arrow_down,
                    size: 16, color: AfriColors.gold),
              ]),
            ),
        ]),
        const SizedBox(height: 6),
        Text(value,
            style: const TextStyle(
                fontSize: 40,
                fontWeight: FontWeight.w900,
                color: AfriColors.gold)),
        const SizedBox(height: 18),
        Row(children: [
          Expanded(
              child: FilledButton.icon(
                  onPressed: onPrimary,
                  style: FilledButton.styleFrom(
                      backgroundColor: AfriColors.gold,
                      foregroundColor: const Color(0xFF170B02),
                      minimumSize: const Size.fromHeight(46),
                      padding: const EdgeInsets.symmetric(horizontal: 12)),
                  icon: Icon(primaryIcon, size: 18),
                  label: Text(primaryLabel,
                      maxLines: 1, overflow: TextOverflow.ellipsis))),
          const SizedBox(width: 10),
          Expanded(
              child: OutlinedButton(
                  onPressed: onSecondary,
                  style: OutlinedButton.styleFrom(
                      foregroundColor: AfriColors.gold,
                      side: const BorderSide(color: Color(0x55FFC857)),
                      minimumSize: const Size.fromHeight(46),
                      padding: const EdgeInsets.symmetric(horizontal: 10)),
                  child: Text(secondaryLabel,
                      maxLines: 1, overflow: TextOverflow.ellipsis))),
        ]),
      ]),
    );
  }
}

/// USD display from coins (1 coin ≈ \$1 at the platform payout rate).
String usd(num coins) => '\$${coins.toStringAsFixed(2)}';

/// Ledger amount display. COIN has no minor subdivision (whole coins); fiat
/// `amountMinor` is in minor units (kobo/cents) and divides by 100.
String ledgerMoney(int amountMinor, String currency) {
  if (currency == 'COIN') return '$amountMinor coins';
  const symbol = {'NGN': '₦', 'USD': '\$', 'GHS': '₵'};
  final major = amountMinor / 100;
  return '${symbol[currency] ?? '$currency '}${major.toStringAsFixed(2)}';
}

const _monthAbbr = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
];

/// Human-readable "Jun 24, 2026 · 9:05 PM" from an ISO timestamp.
/// Returns the raw string unchanged if it cannot be parsed.
String shortDateTime(String? iso) {
  final dt = DateTime.tryParse(iso ?? '')?.toLocal();
  if (dt == null) return iso ?? '';
  final hour12 = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
  final minute = dt.minute.toString().padLeft(2, '0');
  final meridiem = dt.hour < 12 ? 'AM' : 'PM';
  return '${_monthAbbr[dt.month - 1]} ${dt.day}, ${dt.year} · '
      '$hour12:$minute $meridiem';
}

/// Stat tile with a colored icon chip (dashboard / profile / wallet overview).
class AfriStatTile extends StatelessWidget {
  const AfriStatTile(
      {super.key,
      required this.label,
      required this.value,
      required this.icon,
      required this.accent});
  final String label;
  final String value;
  final IconData icon;
  final Color accent;
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
          color: AfriColors.elevated,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AfriColors.border)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
              color: accent.withValues(alpha: 0.16),
              borderRadius: BorderRadius.circular(10)),
          child: Icon(icon, size: 19, color: accent),
        ),
        const SizedBox(height: 10),
        SizedBox(
          width: double.infinity,
          child: FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(value,
                maxLines: 1,
                style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                    color: AfriColors.text)),
          ),
        ),
        Text(label,
            style: const TextStyle(fontSize: 12, color: AfriColors.mutedText)),
      ]),
    );
  }
}

/// Tappable settings/menu row (mockup #4 list).
class AfriMenuRow extends StatelessWidget {
  const AfriMenuRow(
      {super.key,
      required this.icon,
      required this.title,
      this.subtitle,
      this.accent = AfriColors.teal,
      this.onTap});
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
            width: 38,
            height: 38,
            decoration: BoxDecoration(
                color: accent.withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(11)),
            child: Icon(icon, size: 19, color: accent),
          ),
          const SizedBox(width: 12),
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text(title,
                    style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: AfriColors.text)),
                if (subtitle != null)
                  Text(subtitle!,
                      style: const TextStyle(
                          fontSize: 12, color: AfriColors.mutedText)),
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
    const icons = [
      Icons.local_florist,
      Icons.favorite,
      Icons.mic,
      Icons.emoji_events,
      Icons.diamond,
      Icons.celebration
    ];
    const tints = [
      Color(0xFFEC4899),
      Color(0xFFEF4444),
      Color(0xFFFFC857),
      Color(0xFFF59E0B),
      Color(0xFF22D3EE),
      Color(0xFF7C3AED)
    ];
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
              decoration: BoxDecoration(
                  color: AfriColors.elevated,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AfriColors.border)),
              child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(icons[i % icons.length], color: tint, size: 26),
                    const SizedBox(height: 6),
                    Text('${g['name'] ?? 'Gift'}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            color: AfriColors.text)),
                    const SizedBox(height: 3),
                    Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                      const Icon(Icons.monetization_on,
                          size: 12, color: AfriColors.gold),
                      const SizedBox(width: 3),
                      Text('${g['coinPrice'] ?? 0}',
                          style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: AfriColors.gold)),
                    ]),
                  ]),
            ),
          );
        },
      ),
    );
  }
}
