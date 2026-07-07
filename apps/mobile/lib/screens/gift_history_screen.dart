import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/afri_theme.dart';
import '../core/app_state.dart';
import '../widgets/afri_live.dart';
import '../widgets/afri_loader.dart';
import '../widgets/afri_ui.dart';
import 'creator_profile_screen.dart';

/// Emoji for the seeded gift set; falls back to a generic gift.
const _giftEmoji = {
  'Rose': '🌹',
  'Fire': '🔥',
  'Golden Mic': '🎤',
  'Drum': '🥁',
  'Crown': '👑',
  'Spotlight': '💡',
  'Star': '⭐',
  'Stage': '🎭',
};

/// A viewer's gift history — what they've sent, to which creator/room.
/// Surfaces GET /gifts/me, which had no UI before.
class GiftHistoryScreen extends StatefulWidget {
  const GiftHistoryScreen({super.key});

  @override
  State<GiftHistoryScreen> createState() => _GiftHistoryScreenState();
}

class _GiftHistoryScreenState extends State<GiftHistoryScreen> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Gifts sent')),
      body: AfriLoader<List<dynamic>>(
        load: () => context.read<AppState>().api.getList('/gifts/me'),
        errorTitle: 'Could not load your gifts',
        isEmpty: (items) => items.isEmpty,
        emptyBuilder: (_, __) => const AfriEmptyState(
          icon: Icons.card_giftcard,
          title: 'No gifts sent yet',
          body:
              'Gifts you send in live rooms will show up here, with the creator and room.',
        ),
        builder: (context, items, refresh) {
          final rows = items.cast<Map<String, dynamic>>();
          return ListView.separated(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            itemCount: rows.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (context, i) {
              final g = rows[i];
              final name = '${g['giftName'] ?? 'Gift'}';
              final qty = (g['quantity'] as num?)?.toInt() ?? 1;
              final coins = (g['totalCoinAmount'] as num?)?.toInt() ?? 0;
              final creatorId = g['creatorId'] as String?;
              return AfriCard(
                // Tap through to the creator you supported.
                onTap: creatorId == null
                    ? null
                    : () => Navigator.push(
                        context,
                        MaterialPageRoute(
                            builder: (_) =>
                                CreatorProfileScreen(creatorId: creatorId))),
                child: Row(
                  children: [
                    Container(
                      width: 42,
                      height: 42,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: AfriColors.gold.withValues(alpha: 0.16),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Text(_giftEmoji[name] ?? '🎁',
                          style: const TextStyle(fontSize: 20)),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(qty > 1 ? '$name ×$qty' : name,
                              style: Theme.of(context).textTheme.titleMedium),
                          const SizedBox(height: 2),
                          Text(
                            'to ${g['creatorName'] ?? 'Creator'} · ${g['roomTitle'] ?? 'a room'}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.bodyMedium,
                          ),
                          const SizedBox(height: 2),
                          Text(shortDateTime('${g['createdAt'] ?? ''}'),
                              style: Theme.of(context)
                                  .textTheme
                                  .bodySmall
                                  ?.copyWith(color: AfriColors.mutedText)),
                        ],
                      ),
                    ),
                    Text('$coins coins',
                        style:
                            Theme.of(context).textTheme.titleMedium?.copyWith(
                                  fontWeight: FontWeight.w800,
                                  color: AfriColors.gold,
                                )),
                  ],
                ),
              );
            },
          );
        },
      ),
    );
  }
}
