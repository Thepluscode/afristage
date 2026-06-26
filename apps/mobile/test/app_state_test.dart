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
}
