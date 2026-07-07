import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/afri_theme.dart';
import '../core/app_state.dart';
import '../widgets/afri_loader.dart';
import '../widgets/afri_ui.dart';

/// Daily missions board (R4 §4): progress toward each mission and a Claim
/// button once complete. Surfaces GET /missions/me + POST /missions/:key/claim.
class MissionsScreen extends StatefulWidget {
  const MissionsScreen({super.key});

  @override
  State<MissionsScreen> createState() => _MissionsScreenState();
}

class _MissionsScreenState extends State<MissionsScreen> {
  String? _claiming; // mission key mid-claim, to disable its button

  Future<void> _claim(
      String key, int rewardCoins, Future<void> Function() refresh) async {
    final state = context.read<AppState>();
    setState(() => _claiming = key);
    try {
      await state.api.post('/missions/$key/claim');
      // Wallet refresh is best-effort; the board refresh below shows the claim.
      try {
        await state.refreshWallet();
      } catch (_) {}
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('+$rewardCoins coins earned!')));
      await refresh();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not claim this mission yet.')));
    } finally {
      if (mounted) setState(() => _claiming = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Daily missions')),
      body: AfriLoader<Map<String, dynamic>>(
        load: () => context.read<AppState>().api.get('/missions/me'),
        errorTitle: 'Could not load missions',
        isEmpty: (data) =>
            (data['missions'] as List<dynamic>? ?? const []).isEmpty,
        emptyBuilder: (_, __) => const Padding(
          padding: EdgeInsets.only(top: 60),
          child: AfriEmptyState(
            icon: Icons.task_alt,
            title: 'No missions today',
            body: 'Check back tomorrow for new missions.',
          ),
        ),
        builder: (context, data, refresh) {
          final missions = (data['missions'] as List<dynamic>? ?? const [])
              .cast<Map<String, dynamic>>();
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
            children: [
              const Text('Complete missions to earn free coins. Resets daily.',
                  style:
                      TextStyle(color: AfriColors.secondaryText, fontSize: 13)),
              const SizedBox(height: 14),
              ...missions.map((m) => _tile(m, refresh)),
            ],
          );
        },
      ),
    );
  }

  Widget _tile(Map<String, dynamic> m, Future<void> Function() refresh) {
    final key = m['key'] as String;
    final target = (m['target'] as num?)?.toInt() ?? 1;
    final progress = (m['progress'] as num?)?.toInt() ?? 0;
    final reward = (m['rewardCoins'] as num?)?.toInt() ?? 0;
    final claimed = m['claimed'] == true;
    final claimable = m['claimable'] == true;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: AfriCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(m['label'] as String? ?? key,
                      style: const TextStyle(
                          fontWeight: FontWeight.w800, fontSize: 15)),
                ),
                AfriChip(label: '+$reward coins', selected: claimable),
              ],
            ),
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(
                value: target > 0 ? progress / target : 0,
                minHeight: 7,
                backgroundColor: AfriColors.surface,
                color: claimed ? AfriColors.teal : AfriColors.orange,
              ),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Text('$progress / $target',
                    style: const TextStyle(
                        color: AfriColors.secondaryText,
                        fontSize: 13,
                        fontWeight: FontWeight.w700)),
                const Spacer(),
                if (claimed)
                  const Row(children: [
                    Icon(Icons.check_circle, size: 18, color: AfriColors.teal),
                    SizedBox(width: 5),
                    Text('Claimed',
                        style: TextStyle(
                            color: AfriColors.teal,
                            fontWeight: FontWeight.w800,
                            fontSize: 13)),
                  ])
                else
                  FilledButton(
                    onPressed: claimable && _claiming != key
                        ? () => _claim(key, reward, refresh)
                        : null,
                    child: Text(_claiming == key ? 'Claiming…' : 'Claim'),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
