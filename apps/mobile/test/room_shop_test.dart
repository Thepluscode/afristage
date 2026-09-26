import 'package:afristage_mobile/core/api_client.dart';
import 'package:afristage_mobile/core/app_state.dart';
import 'package:afristage_mobile/models/models.dart';
import 'package:afristage_mobile/screens/room_screen.dart';
import 'package:afristage_mobile/widgets/afri_shop.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import 'net_image_mock.dart';
import 'url_launcher_mock.dart';

/// The in-room shop: the shelf a host pins mid-stream, and the buy that moves
/// coins. Mirrors the gift-drawer harness in room_screen_test.dart.

class _FakeSocket implements io.Socket {
  final handlers = <String, Function>{};

  @override
  dynamic noSuchMethod(Invocation i) {
    if (i.memberName == #on && i.positionalArguments.length >= 2) {
      handlers[i.positionalArguments[0] as String] =
          i.positionalArguments[1] as Function;
    }
    if (i.memberName == #connect || i.memberName == #open) return this;
    return null;
  }
}

class _ShopApi extends ApiClient {
  _ShopApi({
    this.pins = const [],
    this.failPins = false,
    this.failOrder = false,
    this.failClick = false,
    this.clickUrl = 'https://bronzea.example/p1',
    this.coinBalance = 5000,
  });

  final List<Map<String, dynamic>> pins;
  final bool failPins;
  final bool failOrder;
  final bool failClick;
  final String? clickUrl;
  final int coinBalance;

  final posts = <String>[];
  final postBodies = <String, Map<String, dynamic>?>{};
  int pinLoads = 0;

  @override
  Future<Map<String, dynamic>> post(String path,
      [Map<String, dynamic>? body]) async {
    if (failOrder && path == '/orders') {
      throw const ApiException(400, 'Not enough stock');
    }
    if (failClick && path.contains('/click')) {
      throw const ApiException(400, 'This product is bought in-app');
    }
    posts.add(path);
    postBodies[path] = body;
    if (path.endsWith('/join-token')) {
      return {'livekitUrl': 'ws://x', 'viewerToken': 'tok'};
    }
    if (path.contains('/click')) {
      return clickUrl == null ? const {} : {'url': clickUrl};
    }
    return const {};
  }

  @override
  Future<Map<String, dynamic>> get(String path) async => path == '/wallet/me'
      ? {
          'coinBalance': coinBalance,
          'earningBalance': 0,
          'payoutHoldBalance': 0
        }
      : const {};

  @override
  Future<List<dynamic>> getList(String path) async {
    if (path.endsWith('/products')) {
      pinLoads++;
      if (failPins) throw const ApiException(500, 'shelf down');
      return pins;
    }
    return const [];
  }
}

Map<String, dynamic> _pin({
  String id = 'p1',
  String title = 'Ankara Tee',
  int priceCoins = 1200,
  int? stock = 4,
  String? externalUrl,
  String shopName = 'Ada Threads',
  String? imageUrl,
}) =>
    {
      'pinId': 'pin-$id',
      'pinnedAt': DateTime(2026, 8, 1).toIso8601String(),
      'product': {
        'id': id,
        'title': title,
        'imageUrl': imageUrl,
        'priceCoins': priceCoins,
        'stock': stock,
        'externalUrl': externalUrl,
      },
      'shop': {'id': 's1', 'name': shopName, 'slug': 'ada'},
    };

Widget _wrap(AppState state, Widget child) =>
    ChangeNotifierProvider<AppState>.value(
        value: state, child: MaterialApp(home: child));

void _tall(WidgetTester tester) {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

LiveRoom _room() => const LiveRoom(
    id: 'r1',
    title: 'Live Now',
    category: 'MUSIC',
    country: 'NG',
    language: 'pidgin',
    status: 'LIVE',
    hostName: 'Zola',
    hostId: 'h1');

Future<_ShopApi> _openRoom(WidgetTester tester, _ShopApi api,
    {bool asHost = false}) async {
  _tall(tester);
  final socket = _FakeSocket();
  final state = AppState(api: api)..userId = 'v1';
  await state.refreshWallet();
  await tester.pumpWidget(_wrap(
      state,
      RoomScreen(
        room: _room(),
        hostToken: asHost ? 'host-tok' : null,
        livekitUrl: asHost ? 'ws://x' : null,
        socketFactory: (uri, opts) => socket,
      )));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
  return api;
}

void main() {
  group('PinnedProduct parsing', () {
    test('reads the nested product + shop payload', () {
      final p = PinnedProduct.fromJson(_pin());
      expect(p.id, 'p1');
      expect(p.title, 'Ankara Tee');
      expect(p.priceCoins, 1200);
      expect(p.stock, 4);
      expect(p.shopName, 'Ada Threads');
      expect(p.isLinkOut, isFalse);
      expect(p.isSoldOut, isFalse);
    });

    // The regression the models header warns about: a null stock means
    // unlimited, and must not collapse to 0 (which would read as sold out).
    test('null stock is unlimited, not sold out', () {
      final p = PinnedProduct.fromJson(_pin(stock: null));
      expect(p.stock, isNull);
      expect(p.isSoldOut, isFalse);
    });

    test('zero stock is sold out', () {
      expect(PinnedProduct.fromJson(_pin(stock: 0)).isSoldOut, isTrue);
    });

    test('a link-out product is recognised, and an empty URL is not one', () {
      expect(
          PinnedProduct.fromJson(_pin(externalUrl: 'https://b.example'))
              .isLinkOut,
          isTrue);
      expect(PinnedProduct.fromJson(_pin(externalUrl: '')).isLinkOut, isFalse);
    });

    test('survives a payload missing product and shop entirely', () {
      final p = PinnedProduct.fromJson(const {'pinId': 'x'});
      expect(p.title, 'Item');
      expect(p.shopName, 'Shop');
      expect(p.priceCoins, 0);
    });

    // BigInt-serialised numbers arrive as strings from this API.
    test('parses a string price', () {
      final json = _pin();
      (json['product'] as Map<String, dynamic>)['priceCoins'] = '2500';
      expect(PinnedProduct.fromJson(json).priceCoins, 2500);
    });
  });

  group('the shop bag', () {
    testWidgets('is hidden when the host has pinned nothing', (tester) async {
      await _openRoom(tester, _ShopApi());
      expect(find.byType(AfriShopButton), findsNothing);
    });

    testWidgets('is hidden when the shelf fails to load — watching still works',
        (tester) async {
      await _openRoom(tester, _ShopApi(pins: [_pin()], failPins: true));
      expect(find.byType(AfriShopButton), findsNothing);
      expect(find.byType(RoomScreen), findsOneWidget);
    });

    testWidgets('shows a count once products are pinned', (tester) async {
      await _openRoom(tester, _ShopApi(pins: [_pin(), _pin(id: 'p2')]));
      expect(find.byType(AfriShopButton), findsOneWidget);
      expect(find.text('2'), findsOneWidget);
    });

    // A host has no reason to buy from themselves, and the API rejects it.
    testWidgets('never appears for the host', (tester) async {
      await _openRoom(tester, _ShopApi(pins: [_pin()]), asHost: true);
      expect(find.byType(AfriShopButton), findsNothing);
    });
  });

  group('the shop sheet', () {
    testWidgets('opens with the pinned products and re-reads the shelf first',
        (tester) async {
      final api = await _openRoom(tester, _ShopApi(pins: [_pin()]));
      final loadsBefore = api.pinLoads;

      await tester.tap(find.byType(AfriShopButton));
      await tester.pumpAndSettle();

      expect(find.byType(AfriShopDrawer), findsOneWidget);
      expect(find.text('Ankara Tee'), findsOneWidget);
      expect(find.text('Ada Threads'), findsOneWidget);
      expect(find.text('Buy'), findsOneWidget);
      // A host can pull an item mid-stream; the sheet must not be built stale.
      expect(api.pinLoads, greaterThan(loadsBefore));
    });

    testWidgets('warns on scarce stock but stays quiet on healthy stock',
        (tester) async {
      await _openRoom(tester, _ShopApi(pins: [_pin(stock: 3)]));
      await tester.tap(find.byType(AfriShopButton));
      await tester.pumpAndSettle();
      expect(find.text('Only 3 left'), findsOneWidget);

      await tester.tapAt(const Offset(10, 10)); // dismiss
      await tester.pumpAndSettle();
    });

    testWidgets('a healthy stock level shows no scarcity nudge', (tester) async {
      await _openRoom(tester, _ShopApi(pins: [_pin(stock: 40)]));
      await tester.tap(find.byType(AfriShopButton));
      await tester.pumpAndSettle();
      expect(find.textContaining('left'), findsNothing);
    });

    testWidgets('a sold-out product cannot be bought', (tester) async {
      await _openRoom(tester, _ShopApi(pins: [_pin(stock: 0)]));
      await tester.tap(find.byType(AfriShopButton));
      await tester.pumpAndSettle();
      expect(find.text('Sold out'), findsOneWidget);
      final button = tester.widget<FilledButton>(find.byType(FilledButton));
      expect(button.onPressed, isNull);
    });

    testWidgets('a product the viewer cannot afford cannot be bought',
        (tester) async {
      await _openRoom(
          tester, _ShopApi(pins: [_pin(priceCoins: 99999)], coinBalance: 10));
      await tester.tap(find.byType(AfriShopButton));
      await tester.pumpAndSettle();
      expect(find.text('Not enough coins'), findsOneWidget);
      final button = tester.widget<FilledButton>(find.byType(FilledButton));
      expect(button.onPressed, isNull);
    });

    testWidgets('a broken image URL still renders a usable row', (tester) async {
      await provideMockNetworkImages(() async {
        await _openRoom(tester,
            _ShopApi(pins: [_pin(imageUrl: 'https://cdn.example/x.png')]));
        await tester.tap(find.byType(AfriShopButton));
        await tester.pumpAndSettle();
        expect(find.text('Buy'), findsOneWidget);
      });
    });
  });

  group('the shelf composition', () {
    // The most recently pinned product is what the host is holding up now, so
    // it gets the cover treatment; earlier pins sit under "Also pinned".
    testWidgets('features the first pin and demotes the rest', (tester) async {
      await _openRoom(
          tester,
          _ShopApi(pins: [
            _pin(id: 'p1', title: 'Featured Tee'),
            _pin(id: 'p2', title: 'Older Wrap'),
          ]));
      await tester.tap(find.byType(AfriShopButton));
      await tester.pumpAndSettle();

      expect(find.text('Featured Tee'), findsOneWidget);
      expect(find.text('Older Wrap'), findsOneWidget);
      expect(find.text('Also pinned'), findsOneWidget);
      // The feature gets the cover; the demoted row does not.
      expect(find.byType(AspectRatio), findsOneWidget);
    });

    testWidgets('a single pin needs no "Also pinned" section', (tester) async {
      await _openRoom(tester, _ShopApi(pins: [_pin()]));
      await tester.tap(find.byType(AfriShopButton));
      await tester.pumpAndSettle();
      expect(find.text('Also pinned'), findsNothing);
    });

    // Scarcity stated twice on one card reads as a rendering fault.
    testWidgets('never states the same status twice on the feature',
        (tester) async {
      await _openRoom(tester, _ShopApi(pins: [_pin(stock: 2)]));
      await tester.tap(find.byType(AfriShopButton));
      await tester.pumpAndSettle();
      expect(find.text('Only 2 left'), findsOneWidget);
    });
  });

  group('accessibility', () {
    // A sheet of identically-labelled "Buy" buttons is unusable, and these
    // spend money. Each action names its product and its price.
    testWidgets('labels every buy action with its product and price',
        (tester) async {
      await _openRoom(
          tester,
          _ShopApi(pins: [
            _pin(id: 'p1', title: 'Featured Tee', priceCoins: 1200),
            _pin(id: 'p2', title: 'Older Wrap', priceCoins: 800),
          ]));
      await tester.tap(find.byType(AfriShopButton));
      await tester.pumpAndSettle();

      expect(find.bySemanticsLabel('Buy Featured Tee for 1.2K coins'),
          findsOneWidget);
      expect(find.bySemanticsLabel('Buy Older Wrap for 800 coins'),
          findsOneWidget);
    });

    testWidgets('says why an action is unavailable rather than just disabling it',
        (tester) async {
      await _openRoom(tester,
          _ShopApi(pins: [_pin(title: 'Gone', stock: 0)], coinBalance: 5000));
      await tester.tap(find.byType(AfriShopButton));
      await tester.pumpAndSettle();
      expect(find.bySemanticsLabel('Gone, sold out'), findsOneWidget);
    });

    testWidgets('warns that a link-out action leaves the app', (tester) async {
      await _openRoom(
          tester,
          _ShopApi(pins: [
            _pin(title: 'Shea Butter', externalUrl: 'https://b.example/p1', shopName: 'Bronzea')
          ]));
      await tester.tap(find.byType(AfriShopButton));
      await tester.pumpAndSettle();
      expect(
          find.bySemanticsLabel(
              'View Shea Butter on Bronzea, opens outside the app'),
          findsOneWidget);
    });

    testWidgets('announces the coin balance as a balance, not a bare number',
        (tester) async {
      await _openRoom(tester, _ShopApi(pins: [_pin()], coinBalance: 3400));
      await tester.tap(find.byType(AfriShopButton));
      await tester.pumpAndSettle();
      expect(find.bySemanticsLabel('Your balance: 3.4K coins'), findsOneWidget);
    });
  });

  group('image decoding', () {
    // The audience is assumed to be on constrained data; a seller's full-size
    // upload must not be decoded at original resolution.
    testWidgets('bounds decode width for both the feature and the rows',
        (tester) async {
      await provideMockNetworkImages(() async {
        await _openRoom(
            tester,
            _ShopApi(pins: [
              _pin(id: 'p1', imageUrl: 'https://cdn.example/a.png'),
              _pin(id: 'p2', imageUrl: 'https://cdn.example/b.png'),
            ]));
        await tester.tap(find.byType(AfriShopButton));
        await tester.pumpAndSettle();

        final images = tester
            .widgetList<Image>(find.byType(Image))
            .where((i) => i.image is ResizeImage)
            .map((i) => (i.image as ResizeImage).width)
            .toList();
        expect(images, isNotEmpty);
        // Every network image is bounded, and none at the original size.
        expect(images.every((w) => w != null && w <= 720), isTrue);
        expect(images, contains(160)); // the demoted row's thumbnail
      });
    });
  });

  group('buying', () {
    testWidgets('places an order attributed to the room, then reloads the shelf',
        (tester) async {
      final api = await _openRoom(tester, _ShopApi(pins: [_pin()]));
      await tester.tap(find.byType(AfriShopButton));
      await tester.pumpAndSettle();

      final loadsBefore = api.pinLoads;
      await tester.tap(find.text('Buy'));
      await tester.pumpAndSettle();

      final body = api.postBodies['/orders'];
      expect(body?['productId'], 'p1');
      expect(body?['quantity'], 1);
      expect(body?['roomId'], 'r1');
      expect(body?['idempotencyKey'], isNotNull);
      // Stock the next viewer sees must reflect the sale.
      expect(api.pinLoads, greaterThan(loadsBefore));
      await tester.pump(const Duration(seconds: 6)); // flush snackbar timer
    });

    testWidgets('surfaces an order failure instead of claiming success',
        (tester) async {
      final api =
          await _openRoom(tester, _ShopApi(pins: [_pin()], failOrder: true));
      await tester.tap(find.byType(AfriShopButton));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Buy'));
      await tester.pumpAndSettle();

      expect(api.posts.contains('/orders'), isFalse);
      expect(find.textContaining('Not enough stock'), findsWidgets);
      await tester.pump(const Duration(seconds: 6)); // flush snackbar timer
    });
  });

  group('link-out (referral) products', () {
    testWidgets('shows View, names the destination shop, and hides the price',
        (tester) async {
      await _openRoom(
          tester,
          _ShopApi(pins: [
            _pin(externalUrl: 'https://bronzea.example/p1', shopName: 'Bronzea')
          ]));
      await tester.tap(find.byType(AfriShopButton));
      await tester.pumpAndSettle();

      expect(find.text('View'), findsOneWidget);
      expect(find.text('Opens Bronzea'), findsOneWidget);
      expect(find.text('Buy'), findsNothing);
    });

    // The API returns the destination, so the app never trusts a URL it was
    // holding — and the tap is counted for the referral shop.
    testWidgets('records the tap and opens the URL the API returned',
        (tester) async {
      final launcher = installFakeUrlLauncher();
      final api = await _openRoom(
          tester,
          _ShopApi(pins: [_pin(externalUrl: 'https://bronzea.example/stale')]));
      await tester.tap(find.byType(AfriShopButton));
      await tester.pumpAndSettle();
      await tester.tap(find.text('View'));
      await tester.pumpAndSettle();

      expect(api.posts, contains('/products/p1/click'));
      expect(launcher.launched, ['https://bronzea.example/p1']);
    });

    testWidgets('handles a click response with no destination', (tester) async {
      installFakeUrlLauncher();
      await _openRoom(
          tester,
          _ShopApi(
              pins: [_pin(externalUrl: 'https://bronzea.example/p1')],
              clickUrl: null));
      await tester.tap(find.byType(AfriShopButton));
      await tester.pumpAndSettle();
      await tester.tap(find.text('View'));
      await tester.pumpAndSettle();
      expect(find.textContaining('unavailable'), findsWidgets);
      await tester.pump(const Duration(seconds: 6)); // flush snackbar timer
    });

    testWidgets('reports a launcher that refuses to open', (tester) async {
      installFakeUrlLauncher(result: false);
      await _openRoom(
          tester,
          _ShopApi(pins: [
            _pin(externalUrl: 'https://bronzea.example/p1', shopName: 'Bronzea')
          ]));
      await tester.tap(find.byType(AfriShopButton));
      await tester.pumpAndSettle();
      await tester.tap(find.text('View'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Could not open Bronzea'), findsWidgets);
      await tester.pump(const Duration(seconds: 6)); // flush snackbar timer
    });

    testWidgets('surfaces a click-endpoint failure', (tester) async {
      installFakeUrlLauncher();
      await _openRoom(
          tester,
          _ShopApi(
              pins: [_pin(externalUrl: 'https://bronzea.example/p1')],
              failClick: true));
      await tester.tap(find.byType(AfriShopButton));
      await tester.pumpAndSettle();
      await tester.tap(find.text('View'));
      await tester.pumpAndSettle();
      expect(find.textContaining('bought in-app'), findsWidgets);
      await tester.pump(const Duration(seconds: 6)); // flush snackbar timer
    });
  });
}
