import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/afri_theme.dart';
import '../core/app_state.dart';
import '../widgets/afri_ui.dart';
import 'onboarding_screen.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _page = PageController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _username = TextEditingController();
  final _displayName = TextEditingController();
  String _country = 'NG';
  String _language = 'pidgin';
  int _step = 0;
  bool _ageConfirmed = false;
  bool _busy = false;

  @override
  void dispose() {
    _page.dispose();
    _email.dispose();
    _password.dispose();
    _username.dispose();
    _displayName.dispose();
    super.dispose();
  }

  Future<void> _next() async {
    if (_step < 2) {
      setState(() => _step += 1);
      await _page.animateToPage(_step,
          duration: const Duration(milliseconds: 220), curve: Curves.easeOut);
      return;
    }
    await _createAccount();
  }

  Future<void> _createAccount() async {
    if (!_ageConfirmed) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Confirm your age before creating an account')));
      return;
    }
    setState(() => _busy = true);
    final state = context.read<AppState>();
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    try {
      await state.register(
        email: _email.text.trim(),
        password: _password.text,
        username: _username.text.trim(),
        displayName: _displayName.text.trim(),
        country: _country,
        language: _language,
      );
      if (!mounted) {
        return;
      }
      await navigator.pushReplacement(
          MaterialPageRoute(builder: (_) => const OnboardingScreen()));
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
    return Scaffold(
      appBar: AppBar(title: const Text('Create Account')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            AfriCard(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Join AfriStage',
                      style: Theme.of(context).textTheme.headlineSmall),
                  const SizedBox(height: 8),
                  Text(
                      'Create an account in three short steps. Beta invites can be added later from Profile.',
                      style: Theme.of(context).textTheme.bodyMedium),
                  const SizedBox(height: 14),
                  LinearProgressIndicator(
                      value: (_step + 1) / 3, color: AfriColors.gold),
                ],
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              height: 360,
              child: PageView(
                controller: _page,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  _AccountStep(email: _email, password: _password),
                  _IdentityStep(username: _username, displayName: _displayName),
                  _LocaleStep(
                    country: _country,
                    language: _language,
                    ageConfirmed: _ageConfirmed,
                    onCountry: (v) => setState(() => _country = v),
                    onLanguage: (v) => setState(() => _language = v),
                    onAge: (v) => setState(() => _ageConfirmed = v),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _busy ? null : _next,
              child: _busy
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : Text(_step == 2 ? 'Create Account' : 'Continue'),
            ),
            TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('I already have an account')),
            const SizedBox(height: 8),
            const AfriLegalLinks(),
          ],
        ),
      ),
    );
  }
}

class _AccountStep extends StatelessWidget {
  const _AccountStep({required this.email, required this.password});

  final TextEditingController email;
  final TextEditingController password;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Step 1 · Account', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 14),
        TextField(
          controller: email,
          keyboardType: TextInputType.emailAddress,
          decoration: const InputDecoration(
              labelText: 'Email', prefixIcon: Icon(Icons.alternate_email)),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: password,
          obscureText: true,
          decoration: const InputDecoration(
              labelText: 'Password', prefixIcon: Icon(Icons.lock_outline)),
        ),
      ],
    );
  }
}

class _IdentityStep extends StatelessWidget {
  const _IdentityStep({required this.username, required this.displayName});

  final TextEditingController username;
  final TextEditingController displayName;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Step 2 · Public profile',
            style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 14),
        TextField(
          controller: displayName,
          decoration: const InputDecoration(
              labelText: 'Display name',
              prefixIcon: Icon(Icons.badge_outlined)),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: username,
          decoration: const InputDecoration(
              labelText: 'Username', prefixIcon: Icon(Icons.person_outline)),
        ),
      ],
    );
  }
}

class _LocaleStep extends StatelessWidget {
  const _LocaleStep({
    required this.country,
    required this.language,
    required this.ageConfirmed,
    required this.onCountry,
    required this.onLanguage,
    required this.onAge,
  });

  final String country;
  final String language;
  final bool ageConfirmed;
  final ValueChanged<String> onCountry;
  final ValueChanged<String> onLanguage;
  final ValueChanged<bool> onAge;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Step 3 · Country and language',
            style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 14),
        DropdownButtonFormField<String>(
          initialValue: country,
          decoration: const InputDecoration(labelText: 'Country'),
          items: const ['NG', 'GH', 'KE', 'ZA', 'UK', 'US']
              .map((c) => DropdownMenuItem(value: c, child: Text(c)))
              .toList(),
          onChanged: (v) => onCountry(v ?? 'NG'),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          initialValue: language,
          decoration: const InputDecoration(labelText: 'Language'),
          items: const ['pidgin', 'english', 'yoruba', 'twi', 'swahili', 'zulu']
              .map((l) => DropdownMenuItem(value: l, child: Text(l)))
              .toList(),
          onChanged: (v) => onLanguage(v ?? 'pidgin'),
        ),
        const SizedBox(height: 12),
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          value: ageConfirmed,
          onChanged: (v) => onAge(v ?? false),
          title: const Text(
              'I confirm I am old enough to use AfriStage and accept the Terms and Privacy policy'),
        ),
      ],
    );
  }
}
