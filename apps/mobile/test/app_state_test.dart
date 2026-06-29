import 'package:afristage_mobile/core/api_client.dart';
import 'package:afristage_mobile/core/app_state.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeStorage implements FlutterSecureStorage {
  final store = <String, String?>{};
  @override
  dynamic noSuchMethod(Invocation i) {
    final named = i.namedArguments;
    final key = named[#key] as String?;
    switch (i.memberName) {
      case #write:
        store[key!] = named[#value] as String?;
        return Future<void>.value();
      case #read:
        return Future<String?>.value(store[key]);
      case #delete:
        store.remove(key);
        return Future<void>.value();
      case #deleteAll:
        store.clear();
        return Future<void>.value();
      default:
        return Future<void>.value();
    }
  }
}

class _AuthApi extends ApiClient {
  @override
  Future<Map<String, dynamic>> post(String path, [Map<String, dynamic>? body]) async {
    if (path.contains('/auth/')) {
      return {
        'accessToken': 'at',
        'refreshToken': 'rt',
        'userId': 'u1',
        'role': 'CREATOR',
      };
    }
    return const {};
  }

  @override
  Future<Map<String, dynamic>> get(String path) async => path == '/wallet/me'
      ? {'coinBalance': 100, 'earningBalance': 50, 'payoutHoldBalance': 10}
      : const {};
}

void main() {
  test('login applies auth, loads wallet, and persists tokens', () async {
    final storage = _FakeStorage();
    final s = AppState(api: _AuthApi(), storage: storage);
    await s.login('e@x.com', 'pw');
    expect(s.isAuthenticated, isTrue);
    expect(s.userId, 'u1');
    expect(s.role, 'CREATOR');
    expect(s.isCreator, isTrue);
    expect(s.wallet.coinBalance, 100);
    expect(storage.store.values, contains('at')); // token persisted
  });

  test('register applies auth the same way', () async {
    final s = AppState(api: _AuthApi(), storage: _FakeStorage());
    await s.register(
        email: 'e@x.com',
        password: 'pw',
        username: 'u',
        displayName: 'U',
        country: 'NG',
        language: 'pidgin');
    expect(s.isAuthenticated, isTrue);
    expect(s.userId, 'u1');
  });

  test('logout clears session, wallet, and storage', () async {
    final storage = _FakeStorage();
    final s = AppState(api: _AuthApi(), storage: storage);
    await s.login('e@x.com', 'pw');
    await s.logout();
    expect(s.isAuthenticated, isFalse);
    expect(s.userId, isNull);
    expect(s.wallet.coinBalance, 0);
    expect(storage.store, isEmpty);
  });

  test('restore rehydrates a session from persisted tokens', () async {
    final storage = _FakeStorage();
    // Seed storage by logging in on one instance...
    await AppState(api: _AuthApi(), storage: storage).login('e@x.com', 'pw');
    // ...then a fresh instance restores from the same storage.
    final restored = AppState(api: _AuthApi(), storage: storage);
    await restored.restore();
    expect(restored.isAuthenticated, isTrue);
    expect(restored.userId, 'u1');
    expect(restored.wallet.coinBalance, 100);
  });

  test('refreshWallet pulls the latest balance', () async {
    final s = AppState(api: _AuthApi(), storage: _FakeStorage());
    await s.refreshWallet();
    expect(s.wallet.coinBalance, 100);
    expect(s.wallet.earningBalance, 50);
  });

  _extra();
}

class _CfgApi extends ApiClient {
  Object? walletError;
  @override
  Future<Map<String, dynamic>> post(String path, [Map<String, dynamic>? body]) async => {
        'accessToken': 'at', 'refreshToken': 'rt', 'userId': 'u1', 'role': 'VIEWER'
      };
  @override
  Future<Map<String, dynamic>> get(String path) async {
    if (walletError != null) throw walletError!;
    return path == '/wallet/me'
        ? {'coinBalance': 100, 'earningBalance': 50, 'payoutHoldBalance': 10}
        : const {};
  }
}

void _extra() {
  test('restore with a truly-expired token logs out (wallet ApiException)', () async {
    final storage = _FakeStorage();
    await AppState(api: _AuthApi(), storage: storage).login('e@x.com', 'pw');
    final api = _CfgApi()..walletError = const ApiException(401, 'expired');
    final s = AppState(api: api, storage: storage);
    await s.restore();
    expect(s.isAuthenticated, isFalse); // refresh also failed -> logged out
  });

  test('restore keeps the session on a transient wallet error', () async {
    final storage = _FakeStorage();
    await AppState(api: _AuthApi(), storage: storage).login('e@x.com', 'pw');
    final api = _CfgApi()..walletError = Exception('network blip');
    final s = AppState(api: api, storage: storage);
    await s.restore();
    expect(s.isAuthenticated, isTrue); // kept; wallet refetches later
  });

  test('restore with no stored token finishes restoring unauthenticated', () async {
    final s = AppState(api: _CfgApi(), storage: _FakeStorage());
    await s.restore();
    expect(s.isRestoring, isFalse);
    expect(s.isAuthenticated, isFalse);
  });

  test('onTokensRefreshed persists the new pair; onAuthCleared logs out', () async {
    final storage = _FakeStorage();
    final s = AppState(api: _CfgApi(), storage: storage);
    await s.api.onTokensRefreshed!('new-at', 'new-rt');
    expect(storage.store.values, contains('new-at'));
    await s.login('e@x.com', 'pw');
    s.api.onAuthCleared!();
    await Future<void>.delayed(Duration.zero);
    expect(s.isAuthenticated, isFalse);
  });

  test('restore survives a storage read failure', () async {
    final s = AppState(api: _CfgApi(), storage: _ThrowStorage());
    await s.restore(); // storage.read throws -> caught, splash not trapped
    expect(s.isRestoring, isFalse);
  });

  test('login keeps the session when the wallet load fails', () async {
    final api = _CfgApi()..walletError = Exception('wallet down');
    final s = AppState(api: api, storage: _FakeStorage());
    await s.login('e@x.com', 'pw');
    expect(s.isAuthenticated, isTrue); // wallet error swallowed, auth intact
  });
}

class _ThrowStorage extends _FakeStorage {
  @override
  dynamic noSuchMethod(Invocation i) {
    if (i.memberName == #read) throw Exception('keychain locked');
    return super.noSuchMethod(i);
  }
}
