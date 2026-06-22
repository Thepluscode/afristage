import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/afri_theme.dart';
import '../models/models.dart';

class AfriScaffold extends StatelessWidget {
  const AfriScaffold(
      {super.key,
      required this.title,
      required this.children,
      this.actions,
      this.padding = const EdgeInsets.all(16)});

  final String title;
  final List<Widget> children;
  final List<Widget>? actions;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title), actions: actions),
      body: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: RadialGradient(
            center: Alignment.topLeft,
            radius: 0.9,
            colors: [Color(0x1AFFC857), AfriColors.stage],
          ),
        ),
        child: ListView(
          padding: padding,
          children: children,
        ),
      ),
    );
  }
}

class AfriCard extends StatelessWidget {
  const AfriCard(
      {super.key,
      required this.child,
      this.padding = const EdgeInsets.all(16),
      this.onTap});

  final Widget child;
  final EdgeInsets padding;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final card = Card(child: Padding(padding: padding, child: child));
    if (onTap == null) return card;
    return InkWell(
        borderRadius: BorderRadius.circular(16), onTap: onTap, child: card);
  }
}

class AfriGradientPanel extends StatelessWidget {
  const AfriGradientPanel({
    super.key,
    required this.child,
    this.colors = const [Color(0xFF23150C), AfriColors.elevated],
    this.padding = const EdgeInsets.all(20),
  });

  final Widget child;
  final List<Color> colors;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: colors,
        ),
        border: Border.all(color: AfriColors.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.22),
            blurRadius: 24,
            offset: const Offset(0, 14),
          )
        ],
      ),
      child: child,
    );
  }
}

class AfriSectionHeader extends StatelessWidget {
  const AfriSectionHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.trailing,
  });

  final String title;
  final String? subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleLarge),
              if (subtitle != null) ...[
                const SizedBox(height: 3),
                Text(subtitle!, style: Theme.of(context).textTheme.bodyMedium),
              ],
            ],
          ),
        ),
        if (trailing != null) trailing!,
      ],
    );
  }
}

class AfriIconBadge extends StatelessWidget {
  const AfriIconBadge({
    super.key,
    required this.icon,
    this.accent = AfriColors.gold,
    this.size = 44,
  });

  final IconData icon;
  final Color accent;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: accent.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(size * 0.32),
        border: Border.all(color: accent.withValues(alpha: 0.22)),
      ),
      child: Icon(icon, color: accent, size: size * 0.52),
    );
  }
}

class AfriActionRow extends StatelessWidget {
  const AfriActionRow({
    super.key,
    required this.icon,
    required this.title,
    required this.body,
    this.accent = AfriColors.gold,
    this.onTap,
    this.trailing,
  });

  final IconData icon;
  final String title;
  final String body;
  final Color accent;
  final VoidCallback? onTap;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return AfriCard(
      onTap: onTap,
      child: Row(
        children: [
          AfriIconBadge(icon: icon, accent: accent),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 3),
                Text(body, style: Theme.of(context).textTheme.bodyMedium),
              ],
            ),
          ),
          trailing ??
              const Icon(Icons.chevron_right, color: AfriColors.mutedText),
        ],
      ),
    );
  }
}

class AfriStatCard extends StatelessWidget {
  const AfriStatCard(
      {super.key,
      required this.label,
      required this.value,
      this.icon,
      this.accent = AfriColors.gold});

  final String label;
  final String value;
  final IconData? icon;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return AfriCard(
      child: Row(
        children: [
          if (icon != null) ...[
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(14)),
              child: Icon(icon, color: accent),
            ),
            const SizedBox(width: 12),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: Theme.of(context).textTheme.labelMedium),
                const SizedBox(height: 4),
                Text(value, style: Theme.of(context).textTheme.titleLarge),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class AfriLiveBadge extends StatelessWidget {
  const AfriLiveBadge({super.key, this.label = 'LIVE'});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: AfriColors.danger,
        borderRadius: BorderRadius.circular(999),
        boxShadow: [
          BoxShadow(
              color: AfriColors.danger.withValues(alpha: 0.26), blurRadius: 18)
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
              width: 6,
              height: 6,
              decoration: const BoxDecoration(
                  color: Colors.white, shape: BoxShape.circle)),
          const SizedBox(width: 6),
          Text(label,
              style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w900,
                  color: Colors.white)),
        ],
      ),
    );
  }
}

class AfriChip extends StatelessWidget {
  const AfriChip({super.key, required this.label, this.selected = false});

  final String label;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 9),
      decoration: BoxDecoration(
        color: selected
            ? AfriColors.orange.withValues(alpha: 0.18)
            : AfriColors.surface,
        border:
            Border.all(color: selected ? AfriColors.orange : AfriColors.border),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(label,
          style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color: selected ? AfriColors.gold : AfriColors.secondaryText)),
    );
  }
}

class AfriEmptyState extends StatelessWidget {
  const AfriEmptyState(
      {super.key,
      required this.icon,
      required this.title,
      required this.body,
      this.action});

  final IconData icon;
  final String title;
  final String body;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return AfriCard(
      padding: const EdgeInsets.all(22),
      child: Column(
        children: [
          Icon(icon, color: AfriColors.gold, size: 38),
          const SizedBox(height: 12),
          Text(title,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 6),
          Text(body,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium),
          if (action != null) ...[const SizedBox(height: 16), action!],
        ],
      ),
    );
  }
}

/// Branded splash shown during session restore (spec §5.1): dark stage, a gold
/// spotlight glow behind the logo mark, and the "Africa's live stage" tagline.
class AfriSplash extends StatelessWidget {
  const AfriSplash({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AfriColors.stage,
      body: Stack(
        alignment: Alignment.center,
        children: [
          // Gold spotlight glow.
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                radius: 0.9,
                colors: [Color(0x33FFC857), Color(0x00FFC857)],
              ),
            ),
            child: SizedBox.expand(),
          ),
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 84,
                height: 84,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: [AfriColors.orange, AfriColors.gold]),
                  borderRadius: BorderRadius.circular(28),
                  boxShadow: [BoxShadow(color: AfriColors.gold.withValues(alpha: 0.35), blurRadius: 48)],
                ),
                child: const Center(
                  child: Text('A', style: TextStyle(color: Color(0xFF170B02), fontSize: 40, fontWeight: FontWeight.w900)),
                ),
              ),
              const SizedBox(height: 20),
              Text('AfriStage', style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 6),
              Text("Africa's live stage", style: Theme.of(context).textTheme.bodyMedium),
              const SizedBox(height: 26),
              const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2, color: AfriColors.gold)),
            ],
          ),
        ],
      ),
    );
  }
}

class AfriLoadingState extends StatelessWidget {
  const AfriLoadingState({super.key, this.label = 'Restoring session'});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                    colors: [AfriColors.orange, AfriColors.gold]),
                borderRadius: BorderRadius.circular(24),
                boxShadow: [
                  BoxShadow(
                      color: AfriColors.orange.withValues(alpha: 0.26),
                      blurRadius: 34)
                ],
              ),
              child: const Center(
                  child: Text('A',
                      style: TextStyle(
                          color: Color(0xFF170B02),
                          fontSize: 34,
                          fontWeight: FontWeight.w900))),
            ),
            const SizedBox(height: 18),
            Text('AfriStage Live',
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 6),
            Text(label, style: Theme.of(context).textTheme.bodyMedium),
            const SizedBox(height: 20),
            const SizedBox(
                width: 26,
                height: 26,
                child: CircularProgressIndicator(strokeWidth: 2.4)),
          ],
        ),
      ),
    );
  }
}

class AfriErrorState extends StatelessWidget {
  const AfriErrorState({
    super.key,
    required this.title,
    required this.body,
    this.onRetry,
  });

  final String title;
  final String body;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return AfriEmptyState(
      icon: Icons.wifi_off,
      title: title,
      body: body,
      action: onRetry == null
          ? null
          : FilledButton(onPressed: onRetry, child: const Text('Retry')),
    );
  }
}

/// Cinematic hero for the top live room. Full-bleed cover from the host avatar
/// (dark scrim for legibility), falling back to a branded gradient. When [room]
/// is null it shows an inviting "no rooms live" promo that still drives [onJoin]
/// (used as a refresh).
class AfriHeroEventCard extends StatelessWidget {
  const AfriHeroEventCard({super.key, required this.onJoin, this.room});

  final VoidCallback onJoin;
  final LiveRoom? room;

  @override
  Widget build(BuildContext context) {
    final r = room;
    final avatar = r?.hostAvatarUrl;
    final hasCover = avatar != null && avatar.isNotEmpty;
    final title = r?.title ?? 'AfriStage is warming up';
    final subtitle = r != null
        ? 'With ${r.hostName ?? 'a creator'}'
        : 'Be the first on stage — tap to refresh the live feed.';

    return ClipRRect(
      borderRadius: BorderRadius.circular(26),
      child: Stack(
        children: [
          Positioned.fill(
            child: hasCover
                ? Image.network(avatar, fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => const _HeroGradient())
                : const _HeroGradient(),
          ),
          const Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topRight,
                  end: Alignment.bottomLeft,
                  colors: [Color(0x33000000), Color(0xF2000000)],
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    if (r != null) const AfriLiveBadge(),
                    const Spacer(),
                    if (r != null)
                      Row(
                        children: [
                          const Icon(Icons.visibility, color: Colors.white, size: 15),
                          const SizedBox(width: 4),
                          Text('${afriCompactCount(r.viewerCount)} watching',
                              style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600)),
                        ],
                      ),
                  ],
                ),
                const SizedBox(height: 64),
                Text(title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 27,
                        fontWeight: FontWeight.w900,
                        height: 1.1)),
                const SizedBox(height: 6),
                Text(subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: Color(0xFFE4E4E7), fontSize: 13)),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: onJoin,
                        icon: Icon(r != null ? Icons.play_arrow : Icons.refresh),
                        label: Text(r != null ? 'Join now' : 'Refresh'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    const AfriIconBadge(icon: Icons.card_giftcard),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _HeroGradient extends StatelessWidget {
  const _HeroGradient();
  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF2B1606), Color(0xFF171126), Color(0xFF092321)],
        ),
      ),
      child: Center(
        child: Icon(Icons.music_note,
            size: 150, color: AfriColors.gold.withValues(alpha: 0.14)),
      ),
    );
  }
}

class AfriCategoryChips extends StatelessWidget {
  const AfriCategoryChips({
    super.key,
    required this.items,
    required this.selected,
    required this.onSelected,
  });

  final List<String> items;
  final String selected;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final item in items) ...[
            GestureDetector(
              onTap: () => onSelected(item),
              child: AfriChip(label: item, selected: item == selected),
            ),
            const SizedBox(width: 8),
          ],
        ],
      ),
    );
  }
}

class AfriLiveRoomCard extends StatelessWidget {
  const AfriLiveRoomCard({
    super.key,
    required this.room,
    required this.onTap,
    this.viewerCount = 128,
    this.giftActivity = 'Gifts active',
  });

  final LiveRoom room;
  final VoidCallback onTap;
  final int viewerCount;
  final String giftActivity;

  @override
  Widget build(BuildContext context) {
    final category = room.category.isEmpty ? 'Stage' : room.category;
    final country = room.country.isEmpty ? 'Global' : room.country;
    final language = room.language.isEmpty ? 'Live chat' : room.language;
    return AfriCard(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(18),
            child: Container(
              height: 132,
              decoration: const BoxDecoration(
                gradient: RadialGradient(
                  center: Alignment.topLeft,
                  radius: 1.2,
                  colors: [Color(0x507C3AED), Color(0xFF101016)],
                ),
              ),
              child: Stack(
                children: [
                  Positioned(
                    right: -18,
                    bottom: -24,
                    child: Icon(Icons.graphic_eq,
                        size: 142,
                        color: AfriColors.gold.withValues(alpha: 0.16)),
                  ),
                  Positioned(
                    left: 14,
                    top: 14,
                    right: 14,
                    child: Row(
                      children: [
                        const AfriLiveBadge(),
                        const SizedBox(width: 8),
                        AfriChip(label: country),
                        const Spacer(),
                        const Icon(Icons.visibility,
                            color: AfriColors.secondaryText, size: 16),
                        const SizedBox(width: 4),
                        Text('$viewerCount',
                            style: Theme.of(context).textTheme.labelMedium),
                      ],
                    ),
                  ),
                  Positioned(
                    left: 14,
                    right: 14,
                    bottom: 14,
                    child: Row(
                      children: [
                        _AfriAvatar(label: room.hostName ?? 'A'),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(room.hostName ?? 'Creator',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style:
                                      Theme.of(context).textTheme.titleMedium),
                              Text(room.title,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style:
                                      Theme.of(context).textTheme.bodyMedium),
                            ],
                          ),
                        ),
                        const Icon(Icons.chevron_right,
                            color: AfriColors.secondaryText),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    AfriChip(label: category),
                    AfriChip(label: language),
                    AfriChip(label: giftActivity, selected: true),
                  ],
                ),
              ),
              Text('Join',
                  style: Theme.of(context)
                      .textTheme
                      .labelMedium
                      ?.copyWith(color: AfriColors.gold)),
            ],
          ),
        ],
      ),
    );
  }
}

/// Maps a gift's name to a recognisable icon. Keyword-based so new gifts get a
/// sensible glyph without a code change; unknown names fall back to a gift box.
IconData afriGiftIcon(String name) {
  final n = name.toLowerCase();
  if (n.contains('rose') || n.contains('flower')) return Icons.local_florist;
  if (n.contains('fire') || n.contains('flame')) return Icons.local_fire_department;
  if (n.contains('mic')) return Icons.mic;
  if (n.contains('drum') || n.contains('music')) return Icons.music_note;
  if (n.contains('crown') || n.contains('king') || n.contains('royal')) return Icons.workspace_premium;
  if (n.contains('spotlight') || n.contains('light')) return Icons.flashlight_on;
  if (n.contains('star')) return Icons.star;
  if (n.contains('stage') || n.contains('concert')) return Icons.stadium;
  if (n.contains('heart') || n.contains('love')) return Icons.favorite;
  if (n.contains('diamond') || n.contains('gem')) return Icons.diamond;
  if (n.contains('rocket')) return Icons.rocket_launch;
  return Icons.card_giftcard;
}

class AfriGiftTile extends StatelessWidget {
  const AfriGiftTile({super.key, required this.gift, required this.onTap});

  final Gift gift;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AfriCard(
      onTap: onTap,
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AfriIconBadge(
              icon: afriGiftIcon(gift.name), accent: AfriColors.gold, size: 38),
          const Spacer(),
          Text(gift.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 2),
          Text('${gift.coinPrice} coins',
              style: Theme.of(context)
                  .textTheme
                  .labelMedium
                  ?.copyWith(color: AfriColors.gold)),
        ],
      ),
    );
  }
}

class AfriGiftDrawer extends StatefulWidget {
  const AfriGiftDrawer({
    super.key,
    required this.gifts,
    required this.coinBalance,
    required this.onGiftSelected,
    this.onBuyCoins,
  });

  final List<Gift> gifts;
  final int coinBalance;
  final ValueChanged<Gift> onGiftSelected;
  final VoidCallback? onBuyCoins;

  @override
  State<AfriGiftDrawer> createState() => _AfriGiftDrawerState();
}

class _AfriGiftDrawerState extends State<AfriGiftDrawer> {
  Gift? _selected;

  @override
  void initState() {
    super.initState();
    if (widget.gifts.isNotEmpty) {
      _selected = widget.gifts.first;
    }
  }

  @override
  Widget build(BuildContext context) {
    final selected = _selected;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 18),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AfriGradientPanel(
              colors: const [Color(0xFF2A1908), Color(0xFF17171F)],
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  const AfriIconBadge(
                      icon: Icons.card_giftcard, accent: AfriColors.gold),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Send Gift',
                            style: Theme.of(context).textTheme.titleLarge),
                        const SizedBox(height: 3),
                        Text('Balance: ${widget.coinBalance} coins',
                            style: Theme.of(context).textTheme.bodyMedium),
                      ],
                    ),
                  ),
                  if (widget.onBuyCoins != null)
                    TextButton(
                      onPressed: widget.onBuyCoins,
                      child: const Text('Buy coins'),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            if (widget.gifts.isEmpty)
              const AfriEmptyState(
                icon: Icons.card_giftcard,
                title: 'No gifts configured',
                body: 'Ask ops to enable gifts before viewers can send one.',
              )
            else
              GridView.count(
                shrinkWrap: true,
                crossAxisCount: 2,
                childAspectRatio: 1.24,
                mainAxisSpacing: 10,
                crossAxisSpacing: 10,
                children: [
                  for (final gift in widget.gifts)
                    Stack(
                      children: [
                        Positioned.fill(
                          child: AfriGiftTile(
                            gift: gift,
                            onTap: () => setState(() => _selected = gift),
                          ),
                        ),
                        if (selected?.id == gift.id)
                          Positioned(
                            right: 8,
                            top: 8,
                            child: Container(
                              width: 18,
                              height: 18,
                              decoration: const BoxDecoration(
                                color: AfriColors.gold,
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(Icons.check,
                                  color: Color(0xFF170B02), size: 13),
                            ),
                          ),
                      ],
                    ),
                ],
              ),
            if (selected != null) ...[
              const SizedBox(height: 14),
              AfriCard(
                child: Row(
                  children: [
                    const AfriIconBadge(
                        icon: Icons.card_giftcard, accent: AfriColors.gold),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(selected.name,
                              style: Theme.of(context).textTheme.titleMedium),
                          Text('${selected.coinPrice} coins',
                              style: Theme.of(context).textTheme.bodyMedium),
                        ],
                      ),
                    ),
                    FilledButton(
                      onPressed: () => widget.onGiftSelected(selected),
                      child: const Text('Send'),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class AfriChatBubble extends StatelessWidget {
  const AfriChatBubble({super.key, required this.message});

  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    final system = message.sender == '•';
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 3),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: system
            ? AfriColors.gold.withValues(alpha: 0.14)
            : AfriColors.surface.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
            color: system
                ? AfriColors.gold.withValues(alpha: 0.25)
                : AfriColors.border),
      ),
      child: RichText(
        text: TextSpan(
          style: DefaultTextStyle.of(context).style,
          children: [
            TextSpan(
                text: system ? '' : '${message.sender}: ',
                style: const TextStyle(fontWeight: FontWeight.bold)),
            TextSpan(text: message.text),
          ],
        ),
      ),
    );
  }
}

class AfriCreatorStatusBanner extends StatelessWidget {
  const AfriCreatorStatusBanner({
    super.key,
    required this.status,
    this.message,
  });

  final String status;
  final String? message;

  Color get _accent {
    switch (status.toUpperCase()) {
      case 'APPROVED':
        return AfriColors.success;
      case 'REJECTED':
      case 'SUSPENDED':
        return AfriColors.danger;
      case 'PENDING':
      default:
        return AfriColors.warning;
    }
  }

  IconData get _icon {
    switch (status.toUpperCase()) {
      case 'APPROVED':
        return Icons.verified;
      case 'REJECTED':
      case 'SUSPENDED':
        return Icons.block;
      case 'PENDING':
      default:
        return Icons.hourglass_top;
    }
  }

  @override
  Widget build(BuildContext context) {
    return AfriActionRow(
      icon: _icon,
      title: status.toUpperCase(),
      body: message ?? 'Creator access status is being reviewed.',
      accent: _accent,
      trailing: const SizedBox.shrink(),
    );
  }
}

class AfriWalletBalanceCard extends StatelessWidget {
  const AfriWalletBalanceCard({
    super.key,
    required this.coinBalance,
    required this.modeLabel,
  });

  final int coinBalance;
  final String modeLabel;

  @override
  Widget build(BuildContext context) {
    return AfriGradientPanel(
      colors: const [Color(0xFF2A1908), Color(0xFF17171F)],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const AfriIconBadge(
                  icon: Icons.monetization_on_outlined,
                  accent: AfriColors.gold),
              const Spacer(),
              AfriChip(label: modeLabel, selected: true),
            ],
          ),
          const SizedBox(height: 18),
          Text('Coin balance', style: Theme.of(context).textTheme.labelMedium),
          const SizedBox(height: 6),
          Text('$coinBalance',
              style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: 8),
          Text('Available coins for gifts and live room support.',
              style: Theme.of(context).textTheme.bodyMedium),
        ],
      ),
    );
  }
}

class AfriCoinPackageCard extends StatelessWidget {
  const AfriCoinPackageCard({
    super.key,
    required this.label,
    required this.body,
    required this.onTap,
    this.busy = false,
  });

  final String label;
  final String body;
  final VoidCallback? onTap;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    return AfriActionRow(
      icon: Icons.monetization_on_outlined,
      title: label,
      body: body,
      accent: AfriColors.gold,
      onTap: busy ? null : onTap,
      trailing: busy
          ? const SizedBox(
              height: 18,
              width: 18,
              child: CircularProgressIndicator(strokeWidth: 2))
          : const Icon(Icons.add_circle_outline, color: AfriColors.gold),
    );
  }
}

class AfriPayoutStatusCard extends StatelessWidget {
  const AfriPayoutStatusCard({
    super.key,
    required this.available,
    required this.pending,
    required this.hold,
  });

  final int available;
  final int pending;
  final int hold;

  @override
  Widget build(BuildContext context) {
    return AfriCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Creator payouts',
              style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              AfriChip(label: 'Available $available', selected: true),
              AfriChip(label: 'Pending $pending'),
              AfriChip(label: 'Hold $hold'),
            ],
          ),
          const SizedBox(height: 10),
          Text('Coins, earnings, and payout holds are separated for safety.',
              style: Theme.of(context).textTheme.bodyMedium),
        ],
      ),
    );
  }
}

class AfriReportReasonTile extends StatelessWidget {
  const AfriReportReasonTile({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AfriCard(
      onTap: onTap,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          Icon(selected ? Icons.radio_button_checked : Icons.radio_button_off,
              color: selected ? AfriColors.danger : AfriColors.mutedText),
          const SizedBox(width: 10),
          Expanded(
              child: Text(label, style: Theme.of(context).textTheme.bodyLarge)),
        ],
      ),
    );
  }
}

class AfriSupportTicketCard extends StatelessWidget {
  const AfriSupportTicketCard({super.key, required this.ticket});

  final Map<String, dynamic> ticket;

  @override
  Widget build(BuildContext context) {
    return AfriActionRow(
      icon: Icons.confirmation_number_outlined,
      title: ticket['subject'] as String? ?? 'Support ticket',
      body: '${ticket['type'] ?? 'GENERAL'}',
      accent: AfriColors.teal,
      trailing: AfriChip(label: ticket['status'] as String? ?? 'OPEN'),
    );
  }
}

class AfriProfileHeader extends StatelessWidget {
  const AfriProfileHeader({
    super.key,
    required this.role,
    required this.userId,
    required this.isCreator,
    this.avatarUrl,
    this.onEditAvatar,
    this.uploading = false,
  });

  final String? role;
  final String? userId;
  final bool isCreator;
  final String? avatarUrl;
  final VoidCallback? onEditAvatar;
  final bool uploading;

  @override
  Widget build(BuildContext context) {
    final id = userId;
    final shortId =
        id == null ? '—' : (id.length <= 8 ? id : '${id.substring(0, 8)}…');
    return AfriGradientPanel(
      colors: const [Color(0xFF211135), Color(0xFF17171F)],
      child: Row(
        children: [
          _Avatar(
              url: avatarUrl, onEdit: onEditAvatar, uploading: uploading),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Account', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 4),
                Text('Role: ${role ?? '—'}',
                    style: Theme.of(context).textTheme.bodyMedium),
                Text('User ID: $shortId',
                    style: Theme.of(context).textTheme.bodyMedium),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    AfriChip(
                        label: isCreator ? 'Creator' : 'Viewer account',
                        selected: isCreator),
                    const AfriChip(label: 'Data saver ready'),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({this.url, this.onEdit, this.uploading = false});
  final String? url;
  final VoidCallback? onEdit;
  final bool uploading;

  @override
  Widget build(BuildContext context) {
    const size = 58.0;
    Widget face;
    if (uploading) {
      face = const Center(
          child: SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(strokeWidth: 2, color: AfriColors.gold)));
    } else if (url != null && url!.isNotEmpty) {
      face = ClipRRect(
        borderRadius: BorderRadius.circular(18),
        child: Image.network(url!, width: size, height: size, fit: BoxFit.cover,
            errorBuilder: (_, __, ___) =>
                const AfriIconBadge(icon: Icons.person, accent: AfriColors.purple, size: size)),
      );
    } else {
      face = const AfriIconBadge(icon: Icons.person, accent: AfriColors.purple, size: size);
    }

    return GestureDetector(
      onTap: uploading ? null : onEdit,
      child: SizedBox(
        width: size,
        height: size,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            SizedBox(width: size, height: size, child: face),
            if (onEdit != null && !uploading)
              Positioned(
                right: -4,
                bottom: -4,
                child: Container(
                  padding: const EdgeInsets.all(5),
                  decoration: const BoxDecoration(color: AfriColors.gold, shape: BoxShape.circle),
                  child: const Icon(Icons.edit, size: 13, color: Color(0xFF170B02)),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

enum AfriRoomState {
  connecting,
  connected,
  poorNetwork,
  hostReconnecting,
  hostDisconnected,
  ended,
  suspended,
  muted,
  banned,
  reconnectingSocket,
  socketRejoined,
}

class AfriLiveRoomShell extends StatelessWidget {
  const AfriLiveRoomShell({
    super.key,
    required this.stage,
    required this.chat,
    required this.input,
    this.hostControls,
    this.bottomMeta,
  });

  final Widget stage;
  final Widget chat;
  final Widget input;
  final Widget? hostControls;
  final Widget? bottomMeta;

  @override
  Widget build(BuildContext context) {
    // Hosts keep the paneled layout — they need their controls panel visible
    // alongside the stage. Viewers get the immersive mockup layout: full-bleed
    // video with chat + input floating over a bottom scrim.
    if (hostControls != null) {
      return Scaffold(
        backgroundColor: AfriColors.stage,
        body: SafeArea(
          bottom: false,
          child: Column(
            children: [
              Expanded(flex: 6, child: stage),
              if (bottomMeta != null) bottomMeta!,
              hostControls!,
              Expanded(flex: 3, child: chat),
              input,
            ],
          ),
        ),
      );
    }

    final chatMaxHeight = MediaQuery.of(context).size.height * 0.38;
    return Scaffold(
      backgroundColor: AfriColors.stage,
      body: Stack(
        children: [
          Positioned.fill(child: stage),
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: DecoratedBox(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Color(0x00000000), Color(0xB3000000), Color(0xF2000000)],
                ),
              ),
              child: SafeArea(
                top: false,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (bottomMeta != null) bottomMeta!,
                    ConstrainedBox(
                      constraints: BoxConstraints(maxHeight: chatMaxHeight),
                      child: chat,
                    ),
                    input,
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class AfriVideoStage extends StatelessWidget {
  const AfriVideoStage({
    super.key,
    required this.video,
    required this.ready,
    required this.isHost,
    required this.videoOn,
    required this.roomEnded,
    required this.onStartVideo,
    this.overlay,
    this.banner,
    this.reactionLayer,
    this.giftAnimationLayer,
  });

  final Widget video;
  final bool ready;
  final bool isHost;
  final bool videoOn;
  final bool roomEnded;
  final VoidCallback? onStartVideo;
  final Widget? overlay;
  final Widget? banner;
  final Widget? reactionLayer;
  final Widget? giftAnimationLayer;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: const BorderRadius.vertical(bottom: Radius.circular(24)),
      child: Stack(
        children: [
          Positioned.fill(
            child: DecoratedBox(
              decoration: const BoxDecoration(
                gradient: RadialGradient(
                  center: Alignment.topCenter,
                  radius: 0.95,
                  colors: [Color(0x3024B8A6), Colors.black],
                ),
              ),
              child: videoOn
                  ? video
                  : _VideoWaitingState(
                      ready: ready,
                      isHost: isHost,
                      onStartVideo: roomEnded ? null : onStartVideo,
                    ),
            ),
          ),
          if (overlay != null)
            Positioned(left: 14, right: 14, top: 14, child: overlay!),
          if (banner != null)
            Positioned(left: 14, right: 14, top: 74, child: banner!),
          if (reactionLayer != null)
            Positioned.fill(child: IgnorePointer(child: reactionLayer!)),
          if (giftAnimationLayer != null)
            // Centered over the stage so it stays visible above the immersive
            // viewer's bottom chat/input overlay (a bottom-anchored layer is
            // hidden behind it). The layer centers its own content.
            Positioned.fill(child: IgnorePointer(child: giftAnimationLayer!)),
          if (roomEnded)
            Positioned.fill(
              child: Container(
                color: Colors.black.withValues(alpha: 0.74),
                child: Center(
                  child: AfriCard(
                    padding: const EdgeInsets.all(22),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.stop_circle_outlined,
                            color: AfriColors.danger, size: 42),
                        const SizedBox(height: 10),
                        Text('Room ended',
                            style: Theme.of(context).textTheme.titleLarge),
                        const SizedBox(height: 4),
                        Text('This stage is no longer live.',
                            style: Theme.of(context).textTheme.bodyMedium),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _VideoWaitingState extends StatelessWidget {
  const _VideoWaitingState({
    required this.ready,
    required this.isHost,
    required this.onStartVideo,
  });

  final bool ready;
  final bool isHost;
  final VoidCallback? onStartVideo;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const AfriIconBadge(
                icon: Icons.live_tv, accent: AfriColors.teal, size: 60),
            const SizedBox(height: 14),
            Text(
              ready
                  ? (isHost ? 'Ready to publish' : 'Ready to join stream')
                  : 'Connecting to stage…',
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 6),
            Text(
              ready
                  ? 'Video stays paused until you start it.'
                  : 'We are setting up video and chat. You will never see a blank stage.',
              style: Theme.of(context).textTheme.bodyMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            if (ready)
              FilledButton.icon(
                onPressed: onStartVideo,
                icon: Icon(isHost ? Icons.videocam : Icons.play_circle_outline),
                label: Text(
                    isHost ? 'Go Live with Camera + Mic' : 'Connect Video'),
              )
            else
              const SizedBox(
                  width: 26,
                  height: 26,
                  child: CircularProgressIndicator(strokeWidth: 2.4)),
          ],
        ),
      ),
    );
  }
}

class AfriLiveTopBar extends StatelessWidget {
  const AfriLiveTopBar({
    super.key,
    required this.creatorName,
    required this.following,
    required this.onFollow,
    required this.viewerCount,
    required this.onClose,
    this.onReport,
  });

  final String creatorName;
  final bool following;
  final VoidCallback? onFollow;
  final int viewerCount;
  final VoidCallback onClose;
  final VoidCallback? onReport;

  @override
  Widget build(BuildContext context) {
    final initial =
        creatorName.trim().isEmpty ? 'A' : creatorName.trim()[0].toUpperCase();
    return Row(
      children: [
        CircleAvatar(
          backgroundColor: AfriColors.purple,
          child: Text(initial),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(creatorName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium),
              Text('$viewerCount watching',
                  style: Theme.of(context).textTheme.labelMedium),
            ],
          ),
        ),
        TextButton(
            onPressed: onFollow,
            child: Text(following ? 'Following' : 'Follow')),
        if (onReport != null)
          IconButton.filledTonal(
              tooltip: 'Report room',
              onPressed: onReport,
              icon: const Icon(Icons.flag_outlined)),
        IconButton.filledTonal(
            tooltip: 'Close room',
            onPressed: onClose,
            icon: const Icon(Icons.close)),
      ],
    );
  }
}

class AfriRoomStateBanner extends StatelessWidget {
  const AfriRoomStateBanner({
    super.key,
    required this.state,
    this.message,
  });

  final AfriRoomState state;
  final String? message;

  Color get _accent {
    switch (state) {
      case AfriRoomState.connected:
      case AfriRoomState.socketRejoined:
        return AfriColors.success;
      case AfriRoomState.poorNetwork:
      case AfriRoomState.hostReconnecting:
      case AfriRoomState.hostDisconnected:
      case AfriRoomState.reconnectingSocket:
      case AfriRoomState.muted:
        return AfriColors.warning;
      case AfriRoomState.ended:
      case AfriRoomState.suspended:
      case AfriRoomState.banned:
        return AfriColors.danger;
      case AfriRoomState.connecting:
        return AfriColors.teal;
    }
  }

  String get _title {
    switch (state) {
      case AfriRoomState.connecting:
        return 'Connecting';
      case AfriRoomState.connected:
        return 'Live';
      case AfriRoomState.poorNetwork:
        return 'Poor network';
      case AfriRoomState.hostReconnecting:
        return 'Host reconnecting';
      case AfriRoomState.hostDisconnected:
        return 'Host disconnected';
      case AfriRoomState.ended:
        return 'Room ended';
      case AfriRoomState.suspended:
        return 'Room suspended';
      case AfriRoomState.muted:
        return 'Chat muted';
      case AfriRoomState.banned:
        return 'Removed from room';
      case AfriRoomState.reconnectingSocket:
        return 'Reconnecting chat';
      case AfriRoomState.socketRejoined:
        return 'Chat rejoined';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AfriColors.surface.withValues(alpha: 0.86),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _accent.withValues(alpha: 0.38)),
      ),
      child: Row(
        children: [
          Icon(Icons.info_outline, color: _accent, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message ?? _title,
              style: Theme.of(context)
                  .textTheme
                  .bodyMedium
                  ?.copyWith(color: AfriColors.text),
            ),
          ),
        ],
      ),
    );
  }
}

class AfriNetworkStatusPill extends StatelessWidget {
  const AfriNetworkStatusPill({
    super.key,
    required this.connected,
    required this.lowData,
    required this.poorNetwork,
    required this.onToggleLowData,
  });

  final bool connected;
  final bool lowData;
  final bool poorNetwork;
  final ValueChanged<bool> onToggleLowData;

  @override
  Widget build(BuildContext context) {
    final accent = poorNetwork
        ? AfriColors.warning
        : connected
            ? AfriColors.success
            : AfriColors.teal;
    return ActionChip(
      avatar: Icon(lowData ? Icons.speed : Icons.network_check, color: accent),
      label: Text(
          lowData ? 'Low data' : (poorNetwork ? 'Network weak' : 'Network ok')),
      onPressed: () => onToggleLowData(!lowData),
    );
  }
}

class AfriChatOverlay extends StatelessWidget {
  const AfriChatOverlay({
    super.key,
    required this.messages,
    required this.controller,
  });

  final List<ChatMessage> messages;
  final ScrollController controller;

  @override
  Widget build(BuildContext context) {
    if (messages.isEmpty) {
      return Center(
        child: Text('Say hello to the room',
            style: Theme.of(context).textTheme.bodyMedium),
      );
    }
    return ListView.builder(
      controller: controller,
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      itemCount: messages.length,
      itemBuilder: (context, i) => AfriChatBubble(message: messages[i]),
    );
  }
}

class AfriMutedStateNotice extends StatelessWidget {
  const AfriMutedStateNotice(
      {super.key,
      this.label = 'You can watch, but chat is muted in this room.'});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 0, 8, 6),
      child: AfriRoomStateBanner(state: AfriRoomState.muted, message: label),
    );
  }
}

class AfriChatInput extends StatelessWidget {
  const AfriChatInput({
    super.key,
    required this.controller,
    required this.enabled,
    required this.onSend,
    required this.onGift,
    required this.onReaction,
    this.mutedLabel,
  });

  final TextEditingController controller;
  final bool enabled;
  final VoidCallback onSend;
  final VoidCallback onGift;
  final ValueChanged<String> onReaction;
  final String? mutedLabel;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (!enabled)
            AfriMutedStateNotice(
                label: mutedLabel ?? 'Chat is not available right now.'),
          Padding(
            padding: const EdgeInsets.all(8),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: controller,
                    enabled: enabled,
                    decoration: InputDecoration(
                      hintText: enabled ? 'Send a message' : 'Chat unavailable',
                      isDense: true,
                    ),
                    onSubmitted: (_) => onSend(),
                  ),
                ),
                IconButton.filledTonal(
                  tooltip: 'Send message',
                  onPressed: enabled ? onSend : null,
                  icon: const Icon(Icons.send),
                ),
                AfriReactionButton(onReaction: onReaction),
                IconButton.filled(
                  tooltip: 'Send gift',
                  onPressed: onGift,
                  icon: const Icon(Icons.card_giftcard),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class AfriReactionButton extends StatelessWidget {
  const AfriReactionButton({super.key, required this.onReaction});

  final ValueChanged<String> onReaction;

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<String>(
      tooltip: 'Send reaction',
      onSelected: onReaction,
      itemBuilder: (_) => const [
        PopupMenuItem(value: 'heart', child: Text('Heart')),
        PopupMenuItem(value: 'fire', child: Text('Fire')),
        PopupMenuItem(value: 'clap', child: Text('Clap')),
        PopupMenuItem(value: 'laugh', child: Text('Laugh')),
      ],
      child: const Padding(
        padding: EdgeInsets.symmetric(horizontal: 4),
        child: CircleAvatar(
          radius: 20,
          backgroundColor: AfriColors.elevated,
          child: Icon(Icons.favorite, color: AfriColors.gold),
        ),
      ),
    );
  }
}

class AfriReactionLayer extends StatelessWidget {
  const AfriReactionLayer({super.key, required this.reactions});

  final List<String> reactions;

  @override
  Widget build(BuildContext context) {
    final visible = reactions.length > 6
        ? reactions.sublist(reactions.length - 6)
        : reactions;
    return Stack(
      children: [
        for (var i = 0; i < visible.length; i++)
          Positioned(
            right: 24.0 + (i % 2) * 34,
            bottom: 42.0 + i * 34,
            child: AnimatedOpacity(
              duration: const Duration(milliseconds: 220),
              opacity: 1,
              child: Text(
                _reactionGlyph(visible[i]),
                style: const TextStyle(fontSize: 26),
              ),
            ),
          ),
      ],
    );
  }

  static String _reactionGlyph(String value) {
    switch (value) {
      case 'fire':
        return '🔥';
      case 'clap':
        return '👏';
      case 'laugh':
        return '😂';
      case 'heart':
      default:
        return '❤';
    }
  }
}

class AfriGiftAnimationLayer extends StatelessWidget {
  const AfriGiftAnimationLayer({super.key, this.giftLabel, this.imageUrl});

  final String? giftLabel;
  final String? imageUrl; // admin-uploaded gift animation/image, when configured

  @override
  Widget build(BuildContext context) {
    final label = giftLabel;
    if (label == null) return const SizedBox.shrink();
    final pill = Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        color: AfriColors.gold,
        borderRadius: BorderRadius.circular(999),
        boxShadow: [
          BoxShadow(color: AfriColors.gold.withValues(alpha: 0.28), blurRadius: 22)
        ],
      ),
      child: Text(
        'Gift sent · $label',
        style: const TextStyle(
            color: Color(0xFF170B02), fontWeight: FontWeight.w900),
      ),
    );
    final url = imageUrl;
    if (url == null || url.isEmpty) return Center(child: pill);
    // Show the configured gift artwork above the label.
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Image.network(
            url,
            width: 140,
            height: 140,
            fit: BoxFit.contain,
            errorBuilder: (_, __, ___) => const SizedBox.shrink(),
          ),
          const SizedBox(height: 10),
          pill,
        ],
      ),
    );
  }
}

class AfriTopGifterStrip extends StatelessWidget {
  const AfriTopGifterStrip({super.key, required this.gifters});

  final List<(String, String)> gifters;

  @override
  Widget build(BuildContext context) {
    if (gifters.isEmpty) return const SizedBox.shrink();
    return SizedBox(
      height: 44,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        scrollDirection: Axis.horizontal,
        itemCount: gifters.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final gifter = gifters[index];
          final initial = gifter.$1.isEmpty ? 'A' : gifter.$1[0].toUpperCase();
          return Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
            decoration: BoxDecoration(
              color: AfriColors.gold.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(999),
              border:
                  Border.all(color: AfriColors.gold.withValues(alpha: 0.28)),
            ),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 13,
                  backgroundColor: AfriColors.gold,
                  child: Text(initial,
                      style: const TextStyle(
                          color: Color(0xFF170B02),
                          fontSize: 11,
                          fontWeight: FontWeight.w900)),
                ),
                const SizedBox(width: 7),
                Text('${index + 1}. ${gifter.$1}',
                    style: Theme.of(context).textTheme.labelMedium),
                const SizedBox(width: 5),
                Text(gifter.$2,
                    style: Theme.of(context)
                        .textTheme
                        .labelMedium
                        ?.copyWith(color: AfriColors.gold)),
              ],
            ),
          );
        },
      ),
    );
  }
}

class AfriHostControlsPanel extends StatelessWidget {
  const AfriHostControlsPanel({
    super.key,
    required this.viewerCount,
    required this.giftCount,
    required this.earningsEstimate,
    required this.cameraOn,
    required this.micOn,
    required this.chatVisible,
    required this.lowData,
    required this.poorNetwork,
    required this.socketConnected,
    required this.onCameraChanged,
    required this.onMicChanged,
    required this.onChatVisibleChanged,
    required this.onLowDataChanged,
    required this.onMuteUser,
    required this.onSafety,
    required this.onEndRoom,
    this.ending = false,
  });

  final int viewerCount;
  final int giftCount;
  final int earningsEstimate;
  final bool cameraOn;
  final bool micOn;
  final bool chatVisible;
  final bool lowData;
  final bool poorNetwork;
  final bool socketConnected;
  final ValueChanged<bool> onCameraChanged;
  final ValueChanged<bool> onMicChanged;
  final ValueChanged<bool> onChatVisibleChanged;
  final ValueChanged<bool> onLowDataChanged;
  final VoidCallback onMuteUser;
  final VoidCallback onSafety;
  final VoidCallback onEndRoom;
  final bool ending;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 2),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          AfriChip(label: '$viewerCount viewers', selected: true),
          AfriChip(label: '$giftCount gifts'),
          AfriChip(label: '$earningsEstimate coins'),
          FilterChip(
            selected: cameraOn,
            onSelected: onCameraChanged,
            avatar: Icon(cameraOn ? Icons.videocam : Icons.videocam_off),
            label: Text(cameraOn ? 'Camera on' : 'Camera off'),
          ),
          FilterChip(
            selected: micOn,
            onSelected: onMicChanged,
            avatar: Icon(micOn ? Icons.mic : Icons.mic_off),
            label: Text(micOn ? 'Mic on' : 'Mic off'),
          ),
          FilterChip(
            selected: chatVisible,
            onSelected: onChatVisibleChanged,
            avatar: Icon(chatVisible ? Icons.chat : Icons.chat_bubble_outline),
            label: Text(chatVisible ? 'Chat visible' : 'Chat hidden'),
          ),
          AfriNetworkStatusPill(
            connected: socketConnected,
            lowData: lowData,
            poorNetwork: poorNetwork,
            onToggleLowData: onLowDataChanged,
          ),
          ActionChip(
            avatar: const Icon(Icons.volume_off),
            label: const Text('Mute user'),
            onPressed: onMuteUser,
          ),
          ActionChip(
            avatar: const Icon(Icons.health_and_safety_outlined),
            label: const Text('Safety'),
            onPressed: onSafety,
          ),
          ActionChip(
            avatar: const Icon(Icons.stop_circle_outlined,
                color: AfriColors.danger),
            label: Text(ending ? 'Ending…' : 'End Room'),
            onPressed: ending ? null : onEndRoom,
          ),
        ],
      ),
    );
  }
}

Future<bool> showAfriEndRoomConfirmation(BuildContext context) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (ctx) => AfriEndRoomConfirmation(
      onCancel: () => Navigator.pop(ctx, false),
      onConfirm: () => Navigator.pop(ctx, true),
    ),
  );
  return confirmed == true;
}

class AfriEndRoomConfirmation extends StatelessWidget {
  const AfriEndRoomConfirmation({
    super.key,
    required this.onCancel,
    required this.onConfirm,
  });

  final VoidCallback onCancel;
  final VoidCallback onConfirm;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('End live room?'),
      content: const Text(
          'This stops the stream for every viewer. Confirm before ending the stage.'),
      actions: [
        TextButton(onPressed: onCancel, child: const Text('Keep Room Live')),
        FilledButton(
          onPressed: onConfirm,
          style: FilledButton.styleFrom(
              backgroundColor: AfriColors.danger,
              foregroundColor: Colors.white),
          child: const Text('End Room'),
        ),
      ],
    );
  }
}

class AfriLegalLinks extends StatelessWidget {
  const AfriLegalLinks({super.key});

  static const termsUrl = String.fromEnvironment(
    'TERMS_URL',
    defaultValue: 'https://www.afristage.live/terms',
  );
  static const privacyUrl = String.fromEnvironment(
    'PRIVACY_URL',
    defaultValue: 'https://www.afristage.live/privacy',
  );

  Future<void> _open(String url) async {
    await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    return Wrap(
      alignment: WrapAlignment.center,
      spacing: 8,
      runSpacing: 4,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        Text('By continuing you agree to',
            style: Theme.of(context).textTheme.bodySmall),
        TextButton(onPressed: () => _open(termsUrl), child: const Text('Terms')),
        Text('and', style: Theme.of(context).textTheme.bodySmall),
        TextButton(
            onPressed: () => _open(privacyUrl), child: const Text('Privacy')),
      ],
    );
  }
}

class _AfriAvatar extends StatelessWidget {
  const _AfriAvatar({
    required this.label,
    this.avatarUrl,
    this.size = 48,
    this.circle = false,
  });

  final String label;
  final String? avatarUrl;
  final double size;
  final bool circle;

  @override
  Widget build(BuildContext context) {
    final initial = label.trim().isEmpty ? 'A' : label.trim()[0].toUpperCase();
    final radius = BorderRadius.circular(circle ? size : size / 3);
    final fallback = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        gradient: const LinearGradient(
            colors: [AfriColors.purple, AfriColors.orange]),
        borderRadius: radius,
      ),
      child: Center(
        child: Text(initial,
            style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w900,
                fontSize: size * 0.4)),
      ),
    );
    if (avatarUrl == null || avatarUrl!.isEmpty) return fallback;
    return ClipRRect(
      borderRadius: radius,
      child: Image.network(
        avatarUrl!,
        width: size,
        height: size,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => fallback,
      ),
    );
  }
}

/// Compact human-readable count: 1200 -> "1.2K", 2_500_000 -> "2.5M".
String afriCompactCount(int n) {
  if (n < 1000) return '$n';
  if (n < 1000000) {
    final k = n / 1000;
    return '${k.toStringAsFixed(k >= 10 ? 0 : 1)}K';
  }
  final m = n / 1000000;
  return '${m.toStringAsFixed(m >= 10 ? 0 : 1)}M';
}

/// Circular creator avatar + name + live viewer count, for the "Creators to
/// watch" rail. Honest data: these are creators live right now.
class AfriCreatorAvatar extends StatelessWidget {
  const AfriCreatorAvatar({
    super.key,
    required this.name,
    required this.viewerCount,
    this.avatarUrl,
    this.onTap,
  });

  final String name;
  final int viewerCount;
  final String? avatarUrl;
  final VoidCallback? onTap;

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
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(colors: [AfriColors.gold, AfriColors.purple]),
              ),
              child: _AfriAvatar(label: name, avatarUrl: avatarUrl, size: 62, circle: true),
            ),
            const SizedBox(height: 6),
            Text(name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.labelMedium),
            Text('${afriCompactCount(viewerCount)} live',
                style: Theme.of(context)
                    .textTheme
                    .labelSmall
                    ?.copyWith(color: AfriColors.mutedText)),
          ],
        ),
      ),
    );
  }
}

/// Compact live-room tile for the horizontal "Live now" rail. Cinematic cover
/// from the host avatar with a dark scrim, falling back to a branded gradient.
class AfriLiveTile extends StatelessWidget {
  const AfriLiveTile({super.key, required this.room, required this.onTap});

  final LiveRoom room;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final avatar = room.hostAvatarUrl;
    final hasCover = avatar != null && avatar.isNotEmpty;
    return GestureDetector(
      onTap: onTap,
      child: SizedBox(
        width: 188,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(20),
          child: Stack(
            children: [
              Positioned.fill(
                child: hasCover
                    ? Image.network(avatar, fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => const _TileGradient())
                    : const _TileGradient(),
              ),
              const Positioned.fill(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [Color(0x11000000), Color(0xE6000000)],
                    ),
                  ),
                ),
              ),
              Positioned(
                left: 10,
                top: 10,
                right: 10,
                child: Row(
                  children: [
                    const AfriLiveBadge(),
                    const Spacer(),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.45),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.visibility, color: Colors.white, size: 13),
                          const SizedBox(width: 3),
                          Text(afriCompactCount(room.viewerCount),
                              style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700)),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              Positioned(
                left: 12,
                right: 12,
                bottom: 12,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(room.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w800,
                            fontSize: 15)),
                    const SizedBox(height: 2),
                    Text(
                      '${room.hostName ?? 'Creator'}'
                      '${room.country.isNotEmpty ? '  ·  ${room.country}' : ''}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: Color(0xFFD4D4D8), fontSize: 12),
                    ),
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

class _TileGradient extends StatelessWidget {
  const _TileGradient();
  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF3A1D6E), Color(0xFF1A1030), Color(0xFF2B1606)],
        ),
      ),
      child: Center(
        child: Icon(Icons.graphic_eq,
            size: 96, color: AfriColors.gold.withValues(alpha: 0.18)),
      ),
    );
  }
}
