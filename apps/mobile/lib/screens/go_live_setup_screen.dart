import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/app_state.dart';
import '../models/models.dart';
import '../widgets/afri_live.dart';
import '../widgets/afri_ui.dart';
import 'room_screen.dart';

class GoLiveSetupScreen extends StatefulWidget {
  const GoLiveSetupScreen({super.key});

  @override
  State<GoLiveSetupScreen> createState() => _GoLiveSetupScreenState();
}

class _GoLiveSetupScreenState extends State<GoLiveSetupScreen> {
  final _title = TextEditingController(text: 'Friday Night Afrobeats');
  String _category = 'MUSIC';
  String _country = 'NG';
  String _language = 'pidgin';
  bool _lowData = false;
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

  // Compact local time, e.g. "23/06 19:30" — avoids pulling in intl for one label.
  String _formatSchedule(DateTime d) {
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(d.day)}/${two(d.month)} ${two(d.hour)}:${two(d.minute)}';
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
      title: 'Go Live Setup',
      children: [
        AfriGradientPanel(
          colors: const [Color(0xFF2B1606), Color(0xFF111827)],
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const AfriLiveBadge(label: 'HOST MODE'),
              const SizedBox(height: 16),
              Text('Prepare the stage',
                  style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 8),
              Text(
                'Set the room context before viewers enter. Gifts, chat, and LiveKit publishing start after confirmation.',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        const AfriSectionHeader(
          title: 'Room details',
          subtitle: 'These labels appear in discovery and moderation queues',
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _title,
          onChanged: (_) {
            if (_titleError != null) {
              setState(() => _titleError = null);
            }
          },
          decoration: const InputDecoration(
                  labelText: 'Room title', prefixIcon: Icon(Icons.title))
              .copyWith(errorText: _titleError),
        ),
        const SizedBox(height: 6),
        Text('Choose a clear title so viewers know what to expect.',
            style: Theme.of(context).textTheme.bodyMedium),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          initialValue: _category,
          decoration: const InputDecoration(labelText: 'Category'),
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
          ].map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
          onChanged: (v) => setState(() => _category = v ?? 'MUSIC'),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: DropdownButtonFormField<String>(
                initialValue: _country,
                decoration: const InputDecoration(labelText: 'Country'),
                items: const ['NG', 'GH', 'KE', 'ZA', 'UK', 'US']
                    .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                    .toList(),
                onChanged: (v) => setState(() => _country = v ?? 'NG'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: DropdownButtonFormField<String>(
                initialValue: _language,
                decoration: const InputDecoration(labelText: 'Language'),
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
        const SizedBox(height: 12),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          value: _lowData,
          onChanged: (v) => setState(() => _lowData = v),
          title: const Text('Low-data mode'),
          subtitle:
              const Text('Optimise the room for lower bandwidth viewers.'),
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          value: _chatRules,
          onChanged: (v) => setState(() => _chatRules = v),
          title: const Text('Show chat rules'),
          subtitle: const Text('Remind viewers to keep the room respectful.'),
        ),
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Icons.event_outlined),
          title: Text(_scheduledAt == null
              ? 'Schedule for later'
              : 'Scheduled: ${_formatSchedule(_scheduledAt!)}'),
          subtitle: const Text('Announce a start time in the Upcoming feed.'),
          trailing: _scheduledAt == null
              ? TextButton(
                  onPressed: _pickSchedule, child: const Text('Set time'))
              : IconButton(
                  icon: const Icon(Icons.clear),
                  tooltip: 'Clear schedule',
                  onPressed: () => setState(() => _scheduledAt = null),
                ),
          onTap: _pickSchedule,
        ),
        const SizedBox(height: 12),
        const AfriSectionHeader(
          title: 'Feed preview',
          subtitle: 'How this stage will read in the home feed',
        ),
        const SizedBox(height: 10),
        SizedBox(
          width: 188,
          child: AfriLiveCard(
            title: _title.text.trim().isEmpty
                ? 'Your room title'
                : _title.text.trim(),
            category: _category,
            country: _country,
            creator: 'Your stage',
            viewerCount: 0,
            // Preview only — non-interactive (no dead tap, not a11y "button").
          ),
        ),
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: _busy ? null : _start,
          icon: Icon(
              _scheduledAt == null ? Icons.live_tv : Icons.event_available),
          label: Text(_busy
              ? 'Working…'
              : _scheduledAt == null
                  ? 'Start Live Room'
                  : 'Schedule Room'),
        ),
      ],
    );
  }
}
