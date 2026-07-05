import 'dart:convert';

import 'package:afristage_mobile/core/api_client.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// Builds an ApiClient whose transport is a MockClient driven by [handler].
ApiClient _client(Future<http.Response> Function(http.Request) handler) =>
    ApiClient(baseUrl: 'https://api.test/api', client: MockClient(handler));

http.Response _json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status,
        headers: {'content-type': 'application/json'});

void main() {
  test('get decodes a 2xx JSON object', () async {
    final api = _client((req) async {
      expect(req.url.toString(), 'https://api.test/api/users/me');
      expect(req.method, 'GET');
      return _json({'id': 'u1'});
    });
    expect(await api.get('/users/me'), {'id': 'u1'});
  });

  test('getList decodes a 2xx JSON array', () async {
    final api = _client((_) async => _json([1, 2, 3]));
    expect(await api.getList('/rooms'), [1, 2, 3]);
  });

  test('attaches the bearer token when set', () async {
    final api = _client((req) async {
      expect(req.headers['Authorization'], 'Bearer abc');
      return _json({});
    })
      ..token = 'abc';
    await api.get('/x');
  });

  test('maps a non-2xx body message to ApiException', () async {
    final api = _client((_) async => _json({'message': 'Nope'}, 422));
    expect(
        () => api.post('/x'),
        throwsA(isA<ApiException>()
            .having((e) => e.statusCode, 'status', 422)
            .having((e) => e.message, 'message', 'Nope')));
  });

  test('falls back to a generic message when the error body has none',
      () async {
    final api = _client((_) async => http.Response('', 500));
    expect(
        () => api.get('/x'),
        throwsA(isA<ApiException>()
            .having((e) => e.message, 'message', 'Request failed')));
  });

  test('getOptionalMap returns null on an empty 2xx body', () async {
    final api = _client((_) async => http.Response('', 200));
    expect(await api.getOptionalMap('/maybe'), isNull);
  });

  test('401 silently refreshes once, retries, and persists the new tokens',
      () async {
    var calls = 0;
    String? savedAccess;
    final api = _client((req) async {
      if (req.url.path.endsWith('/auth/refresh')) {
        return _json({'accessToken': 'new-at', 'refreshToken': 'new-rt'});
      }
      calls++;
      return calls == 1
          ? _json({'message': 'expired'}, 401)
          : _json({'ok': true});
    })
      ..refreshToken = 'old-rt'
      ..onTokensRefreshed = (a, r) async => savedAccess = a;

    expect(await api.get('/protected'), {'ok': true});
    expect(api.token, 'new-at');
    expect(savedAccess, 'new-at');
  });

  test('concurrent 401s share ONE refresh call (rotation-safe)', () async {
    var refreshCalls = 0;
    var dataCalls = 0;
    final api = _client((req) async {
      if (req.url.path.endsWith('/auth/refresh')) {
        refreshCalls++;
        await Future<void>.delayed(const Duration(milliseconds: 20));
        return _json({'accessToken': 'new-at', 'refreshToken': 'new-rt'});
      }
      dataCalls++;
      // first hit of each endpoint is a 401; the post-refresh retry succeeds
      return dataCalls <= 2
          ? _json({'message': 'expired'}, 401)
          : _json({'ok': true});
    })..refreshToken = 'old-rt';

    final results =
        await Future.wait([api.get('/one'), api.get('/two')]);
    expect(results, everyElement({'ok': true}));
    // rotation makes a second refresh with the same token fatal — there
    // must have been exactly one
    expect(refreshCalls, 1);
  });

  test('401 with a failing refresh clears auth and rethrows', () async {
    var cleared = false;
    final api = _client((req) async {
      if (req.url.path.endsWith('/auth/refresh')) {
        return http.Response('', 401); // refresh rejected
      }
      return _json({'message': 'expired'}, 401);
    })
      ..refreshToken = 'old-rt'
      ..onAuthCleared = () => cleared = true;

    await expectLater(
        () => api.get('/protected'), throwsA(isA<ApiException>()));
    expect(cleared, isTrue);
  });

  test('putBytes succeeds on 2xx and throws on non-2xx', () async {
    final ok = _client((req) async {
      expect(req.method, 'PUT');
      return http.Response('', 200);
    });
    await ok.putBytes('https://cdn.test/up', [1, 2, 3], 'image/png');

    final bad = _client((_) async => http.Response('', 403));
    expect(() => bad.putBytes('https://cdn.test/up', [1], 'image/png'),
        throwsA(isA<ApiException>()));
  });

  test('wsOrigin strips the trailing /api', () {
    expect(ApiClient(baseUrl: 'https://api.test/api').wsOrigin,
        'https://api.test');
  });

  test('patch and delete decode a 2xx map', () async {
    final api = _client((req) async {
      expect(['PATCH', 'DELETE'], contains(req.method));
      return _json({'ok': true});
    });
    expect(await api.patch('/x', {'a': 1}), {'ok': true});
    expect(await api.delete('/x'), {'ok': true});
  });

  test('getOptionalMap returns the map for a non-empty body', () async {
    final api = _client((_) async => _json({'id': '1'}));
    expect(await api.getOptionalMap('/maybe'), {'id': '1'});
  });

  test('ApiException.toString includes the status and message', () {
    expect(const ApiException(404, 'nope').toString(), contains('404'));
    expect(const ApiException(404, 'nope').toString(), contains('nope'));
  });

  test('a refresh whose call throws is treated as failed (logs, clears auth)',
      () async {
    var cleared = false;
    final api = _client((req) async {
      if (req.url.path.endsWith('/auth/refresh')) {
        throw Exception('network down');
      }
      return _json({'message': 'expired'}, 401);
    })
      ..refreshToken = 'rt'
      ..onAuthCleared = () => cleared = true;
    await expectLater(
        () => api.get('/protected'), throwsA(isA<ApiException>()));
    expect(cleared, isTrue);
  });
}
