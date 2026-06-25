import 'dart:convert';

import 'package:flutter/foundation.dart'
    show kIsWeb, defaultTargetPlatform, TargetPlatform, debugPrint;
import 'package:http/http.dart' as http;

/// Resolves the API base URL. An explicit --dart-define=API_BASE always wins
/// (use it for physical devices: http://<your-LAN-IP>:3000/api). Otherwise we
/// pick a host that actually reaches a locally-running API per platform:
///  - Android emulator: 10.0.2.2 is the host loopback alias (localhost = the
///    emulator itself, so localhost would never reach the dev server).
///  - iOS simulator + web + desktop: localhost maps to the host machine.
String _defaultApiBase() {
  const fromEnv = String.fromEnvironment('API_BASE');
  if (fromEnv.isNotEmpty) return fromEnv;
  if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
    return 'http://10.0.2.2:3000/api';
  }
  return 'http://localhost:3000/api';
}

/// Thrown when the API returns a non-2xx response. [message] is safe to surface.
class ApiException implements Exception {
  const ApiException(this.statusCode, this.message);
  final int statusCode;
  final String message;
  @override
  String toString() => 'ApiException($statusCode): $message';
}

/// Thin typed wrapper over the AfriStage REST API. Holds the bearer token and
/// the base URL. Money fields come back as strings (the API serialises BigInt).
///
/// On a 401 it transparently exchanges the refresh token for a new access token
/// once and retries the original request, so normal access-token expiry never
/// bounces the user to login.
class ApiClient {
  ApiClient({String? baseUrl}) : baseUrl = baseUrl ?? _defaultApiBase();

  final String baseUrl;
  String? token;
  String? refreshToken;

  /// Called after a successful silent refresh so the host can persist the new
  /// token pair. Called when refresh fails so the host can clear the session.
  Future<void> Function(String accessToken, String refreshToken)?
      onTokensRefreshed;
  void Function()? onAuthCleared;

  /// The WebSocket origin (base URL without the `/api` suffix).
  String get wsOrigin => baseUrl.replaceFirst(RegExp(r'/api/?$'), '');

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      };

  Future<http.Response> _raw(
      String method, String path, Map<String, dynamic>? body) async {
    final request = http.Request(method, Uri.parse('$baseUrl$path'))
      ..headers.addAll(_headers);
    if (body != null) request.body = jsonEncode(body);
    final streamed = await request.send().timeout(const Duration(seconds: 15));
    return http.Response.fromStream(streamed);
  }

  Future<dynamic> _send(String method, String path,
      {Map<String, dynamic>? body, bool allowRefresh = true}) async {
    var response = await _raw(method, path, body);

    // Access token expired: try one silent refresh, then retry the original call.
    if (response.statusCode == 401 && allowRefresh && refreshToken != null) {
      if (await _refresh()) {
        response = await _raw(method, path, body);
      } else {
        onAuthCleared?.call();
      }
    }

    final decoded = response.body.isEmpty ? null : jsonDecode(response.body);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final message = decoded is Map && decoded['message'] != null
          ? decoded['message'].toString()
          : 'Request failed';
      throw ApiException(response.statusCode, message);
    }
    return decoded;
  }

  Future<bool> _refresh() async {
    try {
      final r =
          await _raw('POST', '/auth/refresh', {'refreshToken': refreshToken});
      if (r.statusCode < 200 || r.statusCode >= 300) return false;
      final d = jsonDecode(r.body) as Map<String, dynamic>;
      final access = d['accessToken'] as String?;
      final refresh = d['refreshToken'] as String?;
      if (access == null || refresh == null) return false;
      token = access;
      refreshToken = refresh;
      await onTokensRefreshed?.call(access, refresh);
      return true;
    } catch (e) {
      // A failed refresh logs the user out, so make transient failures (network
      // blip, token-store write error) distinguishable from a genuinely revoked
      // token instead of vanishing into a silent logout.
      debugPrint('Token refresh failed: $e');
      return false;
    }
  }

  Future<Map<String, dynamic>> get(String path) async =>
      (await _send('GET', path)) as Map<String, dynamic>;

  Future<Map<String, dynamic>?> getOptionalMap(String path) async {
    final decoded = await _send('GET', path);
    if (decoded == null) return null;
    return decoded as Map<String, dynamic>;
  }

  Future<List<dynamic>> getList(String path) async =>
      (await _send('GET', path)) as List<dynamic>;

  Future<Map<String, dynamic>> post(String path,
          [Map<String, dynamic>? body]) async =>
      (await _send('POST', path, body: body)) as Map<String, dynamic>;

  Future<Map<String, dynamic>> patch(String path,
          [Map<String, dynamic>? body]) async =>
      (await _send('PATCH', path, body: body)) as Map<String, dynamic>;

  Future<Map<String, dynamic>> delete(String path) async =>
      (await _send('DELETE', path)) as Map<String, dynamic>;

  /// Raw PUT to an absolute URL (e.g. a presigned upload URL). No base URL, no
  /// bearer token — the presigned URL carries its own signature.
  Future<void> putBytes(String url, List<int> bytes, String contentType) async {
    final res = await http
        .put(Uri.parse(url),
            headers: {'Content-Type': contentType}, body: bytes)
        .timeout(const Duration(seconds: 30));
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw ApiException(res.statusCode, 'Upload failed');
    }
  }
}
