import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/app_state.dart';
import '../widgets/afri_ui.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  static const _countries = ['NG', 'GH', 'KE', 'ZA', 'UK', 'US'];
  static const _languages = [
    'pidgin',
    'english',
    'yoruba',
    'twi',
    'swahili',
    'zulu'
  ];
  static const _interests = [
    'Music',
    'Comedy',
    'Dance',
    'Football',
    'Faith',
    'Talk',
    'Education',
    'Gaming',
    'Diaspora',
    'Relationships'
  ];

  String _country = 'NG';
  String _language = 'pidgin';
  String _intent = 'Viewer';
  final Set<String> _selected = {'Music', 'Comedy', 'Diaspora'};
  bool _busy = false;

  Future<void> _save() async {
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    try {
      await context.read<AppState>().api.patch('/users/me', {
        'country': _country,
        'language': _language,
        'bio': 'Intent: $_intent · Interests: ${_selected.join(', ')}',
      });
      if (!mounted) {
        return;
      }
      navigator.pop();
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
      title: 'Set Up Discovery',
      actions: [
        TextButton(
            onPressed: () => Navigator.pop(context), child: const Text('Skip')),
      ],
      children: [
        AfriCard(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Tune your stage',
                  style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 8),
              Text(
                  'Choose only what improves discovery. You can skip this and update it later.',
                  style: Theme.of(context).textTheme.bodyMedium),
            ],
          ),
        ),
        const SizedBox(height: 16),
        DropdownButtonFormField<String>(
          initialValue: _country,
          decoration: const InputDecoration(labelText: 'Country'),
          items: _countries
              .map((c) => DropdownMenuItem(value: c, child: Text(c)))
              .toList(),
          onChanged: (v) => setState(() => _country = v ?? 'NG'),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          initialValue: _language,
          decoration: const InputDecoration(labelText: 'Language'),
          items: _languages
              .map((l) => DropdownMenuItem(value: l, child: Text(l)))
              .toList(),
          onChanged: (v) => setState(() => _language = v ?? 'pidgin'),
        ),
        const SizedBox(height: 18),
        Text('Interests', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final interest in _interests)
              GestureDetector(
                onTap: () => setState(() {
                  _selected.contains(interest)
                      ? _selected.remove(interest)
                      : _selected.add(interest);
                }),
                child: AfriChip(
                    label: interest, selected: _selected.contains(interest)),
              ),
          ],
        ),
        const SizedBox(height: 18),
        SegmentedButton<String>(
          segments: const [
            ButtonSegment(
                value: 'Viewer',
                label: Text('Viewer'),
                icon: Icon(Icons.visibility_outlined)),
            ButtonSegment(
                value: 'Creator',
                label: Text('Creator'),
                icon: Icon(Icons.mic_outlined)),
          ],
          selected: {_intent},
          onSelectionChanged: (value) => setState(() => _intent = value.first),
        ),
        const SizedBox(height: 18),
        FilledButton(
          onPressed: _busy ? null : _save,
          child: _busy
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Save Discovery Preferences'),
        ),
        const SizedBox(height: 12),
        const AfriLegalLinks(),
      ],
    );
  }
}
