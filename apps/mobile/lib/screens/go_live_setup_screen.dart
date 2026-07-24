import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/afri_theme.dart';
import '../core/app_state.dart';
import '../models/models.dart';
import '../widgets/afri_live.dart';
import '../widgets/afri_ui.dart';
import 'room_screen.dart';

class GoLiveSetupScreen extends StatefulWidget {
  const GoLiveSetupScreen({super.key, this.avatarUrl, this.stageName});

  final String? avatarUrl;
  final String? stageName;

  @override
  State<GoLiveSetupScreen> createState() => _GoLiveSetupScreenState();
}

class _GoLiveSetupScreenState extends State<GoLiveSetupScreen> {
  final _title = TextEditingController(text: 'Friday Night Afrobeats');
  String _category = 'MUSIC';
  String _country = 'NG';
  String _language = 'pidgin';
  bool _chatRules = true;
  bool _busy = false;
  String? _titleError;
  DateTime? _scheduledAt; // null = go live now

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  // Native date + time pickers (no dependency). Must be in the future.
  Future<void> _pickSchedule() async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: _scheduledAt ?? now.add(const Duration(hours: 1)),
      firstDate: now,
      lastDate: now.add(const Duration(days: 90)),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(
          _scheduledAt ?? now.add(const Duration(hours: 1))),
    );
    if (time == null || !mounted) return;
    final chosen =
        DateTime(date.year, date.month, date.day, time.hour, time.minute);
    if (chosen.isBefore(DateTime.now())) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Pick a time in the future.')));
      return;
    }
    setState(() => _scheduledAt = chosen);
  }

  Future<void> _scheduleRoom() async {
    setState(() => _busy = true);
    final state = context.read<AppState>();
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    try {
      await state.api.post('/live-rooms', {
        'title': _title.text.trim(),
        'category': _category,
        'country': _country,
        'language': _language,
        'scheduledStartAt': _scheduledAt!.toUtc().toIso8601String(),
      });
      if (!mounted) return;
      messenger.showSnackBar(const SnackBar(
          content: Text('Room scheduled. Followers can find it in Upcoming.')));
      navigator.pop();
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _start() async {
    if (_title.text.trim().isEmpty) {
      setState(() => _titleError = 'Choose a clear title before going live.');
      return;
    }
    setState(() => _titleError = null);
    // Scheduling for later creates the room without starting the LiveKit session.
    if (_scheduledAt != null) {
      await _scheduleRoom();
      return;
    }
    setState(() => _busy = true);
    final state = context.read<AppState>();
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    try {
      final created = await state.api.post('/live-rooms', {
        'title': _title.text.trim(),
        'category': _category,
        'country': _country,
        'language': _language,
      });
      final started =
          await state.api.post('/live-rooms/${created['id']}/start');
      if (!mounted) {
        return;
      }
      final room = LiveRoom.fromJson({...created, 'status': 'LIVE'});
      await navigator.pushReplacement(
        MaterialPageRoute(
          builder: (_) => RoomScreen(
            room: room,
            hostToken: started['hostToken'] as String?,
            livekitUrl: started['livekitUrl'] as String?,
          ),
        ),
      );
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AfriScaffold(
      title: 'Go Live',
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
      actions: [
        IconButton(
          onPressed: _pickSchedule,
          tooltip: 'Schedule room',
          icon: Icon(_scheduledAt == null
              ? CupertinoIcons.calendar_badge_plus
              : CupertinoIcons.calendar),
        ),
      ],
      children: [
        _StagePreview(
          title: _title.text.trim().isEmpty
              ? 'Your live session'
              : _title.text.trim(),
          category: _category,
          language: _language,
          avatarUrl: widget.avatarUrl,
          stageName: widget.stageName,
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _title,
          maxLength: 80,
          onChanged: (_) => setState(() => _titleError = null),
          decoration: const InputDecoration(
            labelText: 'Title',
            hintText: 'What are you performing?',
            prefixIcon: Icon(CupertinoIcons.pencil),
          ).copyWith(errorText: _titleError),
        ),
        const SizedBox(height: 4),
        Row(
          children: [
            Expanded(
              child: DropdownButtonFormField<String>(
                isExpanded: true,
                icon: const Icon(CupertinoIcons.chevron_down, size: 16),
                initialValue: _category,
                decoration: const InputDecoration(
                    labelText: 'Category',
                    prefixIcon: Icon(CupertinoIcons.music_note)),
                items: const [
                  'MUSIC',
                  'COMEDY',
                  'DANCE',
                  'TALK',
                  'FAITH',
                  'EDUCATION',
                  'FOOTBALL',
                  'GAMING',
                  'DIASPORA',
                  'RELATIONSHIPS'
                ]
                    .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                    .toList(),
                onChanged: (v) => setState(() => _category = v ?? 'MUSIC'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: DropdownButtonFormField<String>(
                isExpanded: true,
                icon: const Icon(CupertinoIcons.chevron_down, size: 16),
                initialValue: _language,
                decoration: const InputDecoration(
                    labelText: 'Language',
                    prefixIcon: Icon(CupertinoIcons.globe)),
                items: const [
                  'pidgin',
                  'english',
                  'yoruba',
                  'twi',
                  'swahili',
                  'zulu'
                ]
                    .map((l) => DropdownMenuItem(value: l, child: Text(l)))
                    .toList(),
                onChanged: (v) => setState(() => _language = v ?? 'pidgin'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        DropdownButtonFormField<String>(
          initialValue: _country,
          icon: const Icon(CupertinoIcons.chevron_down, size: 16),
          decoration: const InputDecoration(
              labelText: 'Stage location',
              prefixIcon: Icon(CupertinoIcons.location)),
          items: const ['NG', 'GH', 'KE', 'ZA', 'UK', 'US']
              .map((c) => DropdownMenuItem(value: c, child: Text(c)))
              .toList(),
          onChanged: (v) => setState(() => _country = v ?? 'NG'),
        ),
        const SizedBox(height: 12),
        const AfriSectionHeader(
          title: 'Audience & settings',
        ),
        const SizedBox(height: 8),
        Row(children: [
          const Expanded(
            child: _SetupTile(
              icon: CupertinoIcons.person_2,
              title: 'Audience',
              value: 'Public',
              accent: AfriColors.teal,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _SetupTile(
              icon: CupertinoIcons.chat_bubble,
              title: 'Chat',
              value: _chatRules ? 'Rules on' : 'Open chat',
              accent: AfriColors.purple,
              onTap: () => setState(() => _chatRules = !_chatRules),
            ),
          ),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          const Expanded(
            child: _SetupTile(
              icon: CupertinoIcons.gift,
              title: 'Gifts',
              value: 'Enabled',
              accent: AfriColors.gold,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _SetupTile(
              icon: CupertinoIcons.shield,
              title: 'Moderation',
              value: _chatRules ? 'Standard' : 'Basic',
              accent: AfriColors.success,
            ),
          ),
        ]),
        const SizedBox(height: 10),
        FilledButton.icon(
          onPressed: _busy ? null : _start,
          style: FilledButton.styleFrom(
            backgroundColor: AfriColors.purple,
            foregroundColor: Colors.white,
            minimumSize: const Size.fromHeight(48),
          ),
          icon: Icon(_scheduledAt == null
              ? CupertinoIcons.video_camera_solid
              : CupertinoIcons.calendar_badge_plus),
          label: Text(_busy
              ? 'Working…'
              : _scheduledAt == null
                  ? 'GO LIVE'
                  : 'Schedule Room'),
        ),
      ],
    );
  }
}

class _StagePreview extends StatelessWidget {
  const _StagePreview({
    required this.title,
    required this.category,
    required this.language,
    this.avatarUrl,
    this.stageName,
  });

  final String title;
  final String category;
  final String language;
  final String? avatarUrl;
  final String? stageName;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(18),
      child: SizedBox(
        height: 248,
        child: Stack(fit: StackFit.expand, children: [
          AfriCover(
            imageUrl: avatarUrl,
            category: category,
            initial: avatarUrl == null || avatarUrl!.isEmpty
                ? 'studio creator'
                : stageName,
          ),
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Color(0x22000000), Color(0xDD07070A)],
              ),
            ),
          ),
          const Positioned(
            top: 14,
            left: 14,
            child: AfriLiveBadge(label: 'CAMERA PREVIEW'),
          ),
          Positioned(
            top: 14,
            right: 14,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
              decoration: BoxDecoration(
                color: const Color(0x8807070A),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: const Color(0x33FFFFFF)),
              ),
              child: const Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(CupertinoIcons.camera_rotate,
                    color: Colors.white, size: 16),
                SizedBox(width: 6),
                Text('Front camera',
                    style: TextStyle(
                        color: Colors.white,
                        fontSize: 11,
                        fontWeight: FontWeight.w700)),
              ]),
            ),
          ),
          Positioned(
            left: 16,
            right: 16,
            bottom: 16,
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 24,
                      height: 1.08,
                      fontWeight: FontWeight.w900)),
              const SizedBox(height: 7),
              Row(children: [
                Text(stageName ?? 'Your stage',
                    style: const TextStyle(
                        color: Color(0xFFE4E4E7),
                        fontSize: 13,
                        fontWeight: FontWeight.w700)),
                const SizedBox(width: 8),
                const AfriLiveBadge(label: 'READY'),
                const SizedBox(width: 8),
                Flexible(
                  child: Text('$category · ${language.toUpperCase()}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          color: AfriColors.secondaryText, fontSize: 11)),
                ),
              ]),
            ]),
          ),
        ]),
      ),
    );
  }
}

class _SetupTile extends StatelessWidget {
  const _SetupTile({
    required this.icon,
    required this.title,
    required this.value,
    required this.accent,
    this.onTap,
  });

  final IconData icon;
  final String title;
  final String value;
  final Color accent;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final tile = Container(
      constraints: const BoxConstraints(minHeight: 56),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AfriColors.elevated,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AfriColors.border),
      ),
      child: Row(children: [
        Icon(icon, color: accent, size: 20),
        const SizedBox(width: 8),
        Expanded(
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title,
                style: const TextStyle(
                    color: AfriColors.mutedText,
                    fontSize: 11,
                    fontWeight: FontWeight.w700)),
            const SizedBox(height: 3),
            Text(value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    color: AfriColors.text,
                    fontSize: 13,
                    fontWeight: FontWeight.w800)),
          ]),
        ),
      ]),
    );
    if (onTap == null) return tile;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: tile,
    );
  }
}
