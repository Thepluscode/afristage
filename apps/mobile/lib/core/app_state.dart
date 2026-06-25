import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'api_client.dart';
import '../models/models.dart';

/// App-wide auth + wallet state. Small enough for one ChangeNotifier.
class AppState extends ChangeNotifier {
  AppState({ApiClient? api, FlutterSecureStorage? storage})
      : api = api ?? ApiClient(),
        _storage = storage ?? const FlutterSecureStorage() {
    // Persist tokens after a silent refresh; clear the session if refresh fails.
    this.api.onTokensRefreshed = (access, refresh) async {
      await _storage.write(key: _tokenKey, value: access);
      await _storage.write(key: _refreshKey, value: refresh);
    };
    this.api.onAuthCleared = () {
      logout();
    };
  }

  final ApiClient api;
  final FlutterSecureStorage _storage;

  String? userId;
  String? role;
  Wallet wallet = Wallet.empty;
  bool _restoring = true;

  bool get isAuthenticated => api.token != null;
  bool get isRestoring => _restoring;
  bool get isCreator =>
      role == 'CREATOR' || role == 'ADMIN' || role == 'SUPER_ADMIN';

  static const _tokenKey = 'afristage_token';
  static const _refreshKey = 'afristage_refresh';
  static const _roleKey = 'afristage_role';
  static const _userKey = 'afristage_user';

  /// Load a previously saved session, if any. A stale access token is recovered
  /// silently by the client's 401→refresh path, so we only log out if that fails.
  Future<void> restore() async {
    try {
      final token = await _storage.read(key: _tokenKey);
      if (token != null) {
        api.token = token;
        api.refreshToken = await _storage.read(key: _refreshKey);
        role = await _storage.read(key: _roleKey);
        userId = await _storage.read(key: _userKey);
        try {
          await refreshWallet();
        } on ApiException {
          await logout(); // auth refresh also failed -> truly expired
        } catch (e) {
          // Network/other error at startup: keep the session and continue into
          // the app. The wallet refetches on the wallet screen / pull-to-refresh.
          // Never hang the splash on a transient blip — but log so a schema /
          // parse bug doesn't hide behind the network case.
          debugPrint('Wallet load during restore failed: $e');
        }
      }
    } catch (e) {
      // Storage or any unexpected failure must not trap the user on the splash.
      debugPrint('Session restore failed: $e');
    } finally {
      _restoring = false;
      notifyListeners();
    }
  }

  Future<void> login(String identifier, String password) async {
    final res = await api.post('/auth/login', {
      'identifier': identifier,
      'password': password,
    });
    await _applyAuth(res);
  }

  Future<void> register({
    required String email,
    required String password,
    required String username,
    required String displayName,
    required String country,
    required String language,
  }) async {
    final res = await api.post('/auth/register', {
      'email': email,
      'password': password,
      'username': username,
      'displayName': displayName,
      'country': country,
      'language': language,
      'ageConfirmed': true,
    });
    await _applyAuth(res);
  }

  Future<void> _applyAuth(Map<String, dynamic> res) async {
    api.token = res['accessToken'] as String;
    api.refreshToken = res['refreshToken'] as String?;
    userId = res['userId'] as String?;
    role = res['role'] as String?;
    await _storage.write(key: _tokenKey, value: api.token);
    await _storage.write(key: _refreshKey, value: api.refreshToken);
    await _storage.write(key: _roleKey, value: role);
    await _storage.write(key: _userKey, value: userId);
    // Wallet is non-critical to completing login — don't fail auth if it errors,
    // but log so a load failure isn't invisible (login would otherwise show a
    // zero/stale balance with no trace).
    try {
      await refreshWallet();
    } catch (e) {
      debugPrint('Wallet load after auth failed: $e');
    }
    notifyListeners();
  }

  Future<void> logout() async {
    api.token = null;
    api.refreshToken = null;
    userId = null;
    role = null;
    wallet = Wallet.empty;
    await _storage.deleteAll();
    notifyListeners();
  }

  Future<void> refreshWallet() async {
    wallet = Wallet.fromJson(await api.get('/wallet/me'));
    notifyListeners();
  }
}
