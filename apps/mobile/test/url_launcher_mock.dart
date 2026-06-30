// ignore_for_file: depend_on_referenced_packages
import 'package:plugin_platform_interface/plugin_platform_interface.dart';
import 'package:url_launcher_platform_interface/link.dart';
import 'package:url_launcher_platform_interface/url_launcher_platform_interface.dart';

/// Fake url_launcher platform so launchUrl() succeeds (or fails) in tests without
/// a real platform channel. Install with [installFakeUrlLauncher].
class FakeUrlLauncher extends UrlLauncherPlatform
    with MockPlatformInterfaceMixin {
  final launched = <String>[];
  bool result = true;

  @override
  final LinkDelegate? linkDelegate = null;

  @override
  Future<bool> canLaunch(String url) async => true;

  @override
  Future<bool> launchUrl(String url, LaunchOptions options) async {
    launched.add(url);
    return result;
  }

  @override
  Future<bool> launch(
    String url, {
    required bool useSafariVC,
    required bool useWebView,
    required bool enableJavaScript,
    required bool enableDomStorage,
    required bool universalLinksOnly,
    required Map<String, String> headers,
    String? webOnlyWindowName,
  }) async {
    launched.add(url);
    return result;
  }
}

FakeUrlLauncher installFakeUrlLauncher({bool result = true}) {
  final fake = FakeUrlLauncher()..result = result;
  UrlLauncherPlatform.instance = fake;
  return fake;
}
