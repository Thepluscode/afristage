import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/afri_theme.dart';
import '../core/api_client.dart';
import '../core/app_state.dart';
import '../models/models.dart';
import '../widgets/afri_ui.dart';
import 'room_screen.dart';

/// Public profile for a creator. [creatorId] may be their userId or
/// creatorProfile id (the backend accepts either).
class CreatorProfileScreen extends StatefulWidget {
  const CreatorProfileScreen({super.key, required this.creatorId});

  final String creatorId;

  @override
  State<CreatorProfileScreen> createState() => _CreatorProfileScreenState();
}

class _CreatorProfileScreenState extends State<CreatorProfileScreen> {
  Map<String, dynamic>? _data;
  String? _error;
  bool _loading = true;
  bool _following = false;
  int _followers = 0;
  bool _followBusy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final d = await context
          .read<AppState>()
          .api
          .get('/creators/${widget.creatorId}');
      if (!mounted) return;
      setState(() {
        _data = d as Map<String, dynamic>?;
        _following = _data?['isFollowing'] == true;
        _followers = (_data?['followers'] as num?)?.toInt() ?? 0;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    }
  }

  Future<void> _toggleFollow(String creatorUserId) async {
    final api = context.read<AppState>().api;
    final wasFollowing = _following;
    setState(() {
      _followBusy = true;
      _following = !wasFollowing;
      _followers += wasFollowing ? -1 : 1;
    });
    try {
      if (wasFollowing) {
        await api.delete('/users/$creatorUserId/follow');
      } else {
        await api.post('/users/$creatorUserId/follow');
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _following = wasFollowing; // rollback
        _followers += wasFollowing ? 1 : -1;
      });
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _followBusy = false);
    }
  }

  void _watchLive(Map<String, dynamic> live, Map<String, dynamic> d) {
    final room = LiveRoom(
      id: live['id'] as String,
      title: live['title'] as String? ?? 'Live now',
      category: live['category'] as String? ?? '',
      country: live['country'] as String? ?? '',
      language: live['language'] as String? ?? '',
      status: 'LIVE',
      hostName: d['stageName'] as String?,
      hostId: d['userId'] as String?,
      hostAvatarUrl:
          (d['user'] as Map?)?['profile']?['avatarUrl'] as String?,
    );
    Navigator.push(
        context, MaterialPageRoute(builder: (_) => RoomScreen(room: room)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Creator')),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null || _data == null) {
      return Padding(
        padding: const EdgeInsets.all(16),
        child: AfriErrorState(
          title: 'Could not load this creator',
          body: 'Check your connection and try again.',
          onRetry: _load,
        ),
      );
    }
    final d = _data!;
    final user = d['user'] as Map<String, dynamic>?;
    final profile = user?['profile'] as Map<String, dynamic>?;
    final stageName = d['stageName'] as String? ??
        profile?['displayName'] as String? ??
        'Creator';
    final avatarUrl = profile?['avatarUrl'] as String?;
    final bio = profile?['bio'] as String?;
    final category = d['category'] as String? ?? '';
    final country = d['country'] as String? ?? '';
    final approved = d['approvalStatus'] == 'APPROVED';
    final sessions = (d['totalRooms'] as num?)?.toInt() ?? 0;
    final live = d['liveRoom'] as Map<String, dynamic>?;
    final creatorUserId = d['userId'] as String?;
    final hasAvatar = avatarUrl != null && avatarUrl.isNotEmpty;
    final initial =
        stageName.trim().isEmpty ? 'C' : stageName.trim()[0].toUpperCase();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            Container(
              padding: const EdgeInsets.all(2.5),
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                gradient:
                    LinearGradient(colors: [AfriColors.gold, AfriColors.purple]),
              ),
              child: CircleAvatar(
                radius: 36,
                backgroundColor: AfriColors.elevated,
                backgroundImage: hasAvatar ? NetworkImage(avatarUrl) : null,
                child: hasAvatar
                    ? null
                    : Text(initial,
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 28,
                            fontWeight: FontWeight.w900)),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(stageName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.headlineSmall),
                      ),
                      if (approved) ...[
                        const SizedBox(width: 6),
                        const Icon(Icons.verified,
                            color: AfriColors.teal, size: 20),
                      ],
                    ],
                  ),
                  const SizedBox(height: 6),
                  Wrap(spacing: 8, runSpacing: 8, children: [
                    if (category.isNotEmpty) AfriChip(label: category),
                    if (country.isNotEmpty) AfriChip(label: country),
                    if (live != null) const AfriLiveBadge(),
                  ]),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 18),
        Row(
          children: [
            Expanded(
              child: AfriStatCard(
                  label: 'Followers',
                  value: '$_followers',
                  icon: Icons.group_outlined,
                  accent: AfriColors.teal),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: AfriStatCard(
                  label: 'Live sessions',
                  value: '$sessions',
                  icon: Icons.mic,
                  accent: AfriColors.purple),
            ),
          ],
        ),
        if (bio != null && bio.isNotEmpty) ...[
          const SizedBox(height: 16),
          Text('About', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 6),
          Text(bio, style: Theme.of(context).textTheme.bodyMedium),
        ],
        const SizedBox(height: 20),
        if (creatorUserId != null)
          _following
              ? OutlinedButton.icon(
                  onPressed: _followBusy
                      ? null
                      : () => _toggleFollow(creatorUserId),
                  icon: const Icon(Icons.check),
                  label: const Text('Following'),
                )
              : FilledButton.icon(
                  onPressed: _followBusy
                      ? null
                      : () => _toggleFollow(creatorUserId),
                  icon: const Icon(Icons.person_add_alt),
                  label: const Text('Follow'),
                ),
        const SizedBox(height: 12),
        if (live != null)
          FilledButton.icon(
            style: FilledButton.styleFrom(backgroundColor: AfriColors.purple),
            onPressed: () => _watchLive(live, d),
            icon: const Icon(Icons.live_tv),
            label: Text('Watch live · ${live['title'] ?? 'On stage now'}'),
          )
        else
          const AfriEmptyState(
            icon: Icons.live_tv_outlined,
            title: 'Not live right now',
            body:
                'Follow to get notified when this creator starts their next live room.',
          ),
      ],
    );
  }
}
