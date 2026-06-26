import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/afri_theme.dart';
import '../core/api_client.dart';
import '../core/app_state.dart';
import '../widgets/afri_ui.dart';

const _categories = [
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
];

class CreatorApplyScreen extends StatefulWidget {
  const CreatorApplyScreen({super.key});

  @override
  State<CreatorApplyScreen> createState() => _CreatorApplyScreenState();
}

class _CreatorApplyScreenState extends State<CreatorApplyScreen> {
  final _stageName = TextEditingController();
  String _category = 'MUSIC';
  String? _approvalStatus;
  bool _busy = false;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadStatus();
  }

  @override
  void dispose() {
    _stageName.dispose();
    super.dispose();
  }

  Future<void> _loadStatus() async {
    try {
      final me =
          await context.read<AppState>().api.getOptionalMap('/creators/me');
      if (!mounted) {
        return;
      }
      if (me == null) {
        return;
      }
      setState(() {
        _approvalStatus = me['approvalStatus'] as String?;
        if (me['stageName'] != null) {
          _stageName.text = me['stageName'] as String;
        }
      });
    } on ApiException {
      // No creator profile yet.
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _apply() async {
    if (_stageName.text.trim().isEmpty) {
      return;
    }
    setState(() => _busy = true);
    final api = context.read<AppState>().api;
    final messenger = ScaffoldMessenger.of(context);
    try {
      final res = await api.post('/creators/apply', {
        'stageName': _stageName.text.trim(),
        'category': _category,
        'country': 'NG',
        'language': 'pidgin',
      });
      if (!mounted) {
        return;
      }
      setState(() => _approvalStatus = res['approvalStatus'] as String?);
      messenger.showSnackBar(const SnackBar(
          content: Text('Application submitted for creator review')));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  Color _statusColor(String s) => switch (s) {
        'APPROVED' => AfriColors.success,
        'REJECTED' || 'SUSPENDED' => AfriColors.danger,
        _ => AfriColors.warning,
      };

  String _statusMessage(String? status) => switch (status) {
        'APPROVED' => 'You are approved. You can go live from Create.',
        'REJECTED' => 'Application rejected. Update your profile and re-apply.',
        'SUSPENDED' =>
          'Creator access is suspended. Contact support for an appeal.',
        'PENDING' =>
          'Creator approval pending. Your profile is being reviewed before you can go live.',
        _ => 'Apply once. We review creators before live access is enabled.',
      };

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const AfriLoadingState(label: 'Checking creator status');
    }

    return AfriScaffold(
      title: 'Creator Application',
      children: [
        AfriCard(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 54,
                    height: 54,
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                          colors: [AfriColors.purple, AfriColors.orange]),
                      shape: BoxShape.circle,
                    ),
                    child:
                        const Icon(Icons.mic_external_on, color: Colors.white),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                      child: Text('Build your stage',
                          style: Theme.of(context).textTheme.headlineSmall)),
                ],
              ),
              const SizedBox(height: 14),
              Text(_statusMessage(_approvalStatus),
                  style: Theme.of(context).textTheme.bodyMedium),
              if (_approvalStatus != null) ...[
                const SizedBox(height: 14),
                Chip(
                  label: Text(_approvalStatus!),
                  backgroundColor:
                      _statusColor(_approvalStatus!).withValues(alpha: 0.16),
                  side: BorderSide(
                      color: _statusColor(_approvalStatus!)
                          .withValues(alpha: 0.45)),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _stageName,
          decoration: const InputDecoration(
              labelText: 'Stage name', prefixIcon: Icon(Icons.badge_outlined)),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          initialValue: _category,
          decoration: const InputDecoration(labelText: 'Primary category'),
          items: _categories
              .map((c) => DropdownMenuItem(value: c, child: Text(c)))
              .toList(),
          onChanged: (v) => setState(() => _category = v ?? 'MUSIC'),
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _busy ? null : _apply,
          child: _busy
              ? const SizedBox(
                  height: 18,
                  width: 18,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : Text(_approvalStatus == null
                  ? 'Apply as Creator'
                  : 'Update Application'),
        ),
      ],
    );
  }
}
