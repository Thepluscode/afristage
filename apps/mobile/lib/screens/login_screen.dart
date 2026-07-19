import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/afri_theme.dart';
import '../core/app_state.dart';
import '../widgets/afri_ui.dart';
import 'register_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  // Prefill the seeded viewer only in debug builds; a shipped build starts empty.
  final _identifier =
      TextEditingController(text: kDebugMode ? 'viewer@afristage.local' : '');
  final _password = TextEditingController(text: kDebugMode ? 'Viewer123!' : '');
  bool _busy = false;

  @override
  void dispose() {
    _identifier.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    setState(() => _busy = true);
    final state = context.read<AppState>();
    final messenger = ScaffoldMessenger.of(context);
    try {
      await state.login(_identifier.text.trim(), _password.text);
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } on Object {
      messenger.showSnackBar(
          const SnackBar(content: Text('Could not reach the server')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _fill(String email, String password) {
    _identifier.text = email;
    _password.text = password;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: DecoratedBox(
          decoration: const BoxDecoration(
            gradient: RadialGradient(
              center: Alignment.topCenter,
              radius: 0.85,
              colors: [Color(0x22FFC857), AfriColors.stage],
            ),
          ),
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 380),
                child: AfriCard(
                  padding: const EdgeInsets.all(22),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Align(
                        alignment: Alignment.centerLeft,
                        child: Padding(
                          padding: EdgeInsets.only(bottom: 18),
                          child: AfriBrandMark(size: 74),
                        ),
                      ),
                      Text('Welcome back to AfriStage',
                          style: Theme.of(context).textTheme.headlineMedium),
                      const SizedBox(height: 8),
                      Text('Go live, discover creators, and support talent.',
                          style: Theme.of(context).textTheme.bodyLarge),
                      const SizedBox(height: 32),
                      TextField(
                        controller: _identifier,
                        decoration: const InputDecoration(
                          labelText: 'Email or phone',
                          prefixIcon: Icon(Icons.alternate_email),
                        ),
                        keyboardType: TextInputType.emailAddress,
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _password,
                        obscureText: true,
                        decoration: const InputDecoration(
                          labelText: 'Password',
                          prefixIcon: Icon(Icons.lock_outline),
                        ),
                      ),
                      const SizedBox(height: 20),
                      FilledButton(
                        onPressed: _busy ? null : _login,
                        child: _busy
                            ? const SizedBox(
                                height: 18,
                                width: 18,
                                child:
                                    CircularProgressIndicator(strokeWidth: 2))
                            : const Text('Log in to AfriStage'),
                      ),
                      // Dev-only quick-fill; never shown in a shipped build.
                      if (kDebugMode) ...[
                        const SizedBox(height: 24),
                        Text('Seeded test accounts',
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.labelMedium),
                        const SizedBox(height: 8),
                        Wrap(
                          alignment: WrapAlignment.center,
                          spacing: 8,
                          children: [
                            OutlinedButton(
                                onPressed: () => _fill(
                                    'viewer@afristage.local', 'Viewer123!'),
                                child: const Text('Viewer')),
                            OutlinedButton(
                                onPressed: () => _fill(
                                    'creator@afristage.local', 'Creator123!'),
                                child: const Text('Creator')),
                            OutlinedButton(
                                onPressed: () =>
                                    _fill('admin@afristage.local', 'Admin123!'),
                                child: const Text('Admin')),
                          ],
                        ),
                      ],
                      const SizedBox(height: 14),
                      TextButton(
                        onPressed: () => Navigator.push(
                          context,
                          MaterialPageRoute(
                              builder: (_) => const RegisterScreen()),
                        ),
                        child: const Text('Create account'),
                      ),
                      const SizedBox(height: 4),
                      const AfriLegalLinks(),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
