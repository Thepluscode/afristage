import 'package:afristage_mobile/core/api_client.dart';
import 'package:afristage_mobile/core/app_state.dart';
import 'package:afristage_mobile/models/models.dart';
import 'package:afristage_mobile/screens/room_screen.dart';
import 'package:afristage_mobile/screens/shop_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

/// The seller's side: opening a shop, listing products, and pinning them to a
/// live room from the host controls.

class _FakeSocket implements io.Socket {
  @override
  dynamic noSuchMethod(Invocation i) {
    if (i.memberName == #connect || i.memberName == #open) return this;
    return null;
  }
}

class _SellerApi extends ApiClient {
  _SellerApi({
    this.shop,
    this.products = const [],
    this.failShop = false,
    this.failCreate = false,
    this.failProducts = false,
    this.pins = const [],
  });

  Map<String, dynamic>? shop;
  List<Map<String, dynamic>> products;
  final bool failShop;
  final bool failCreate;
  final bool failProducts;
  final List<Map<String, dynamic>> pins;

  final posts = <String>[];
  final patches = <String>[];
  final deletes = <String>[];
  final postBodies = <String, Map<String, dynamic>?>{};
  final patchBodies = <String, Map<String, dynamic>?>{};

  @override
  Future<Map<String, dynamic>?> getOptionalMap(String path) async {
    if (path == '/shops/me') {
      if (failShop) throw const ApiException(500, 'shop lookup down');
      return shop;
    }
    return null;
  }

  @override
  Future<Map<String, dynamic>> get(String path) async => path == '/wallet/me'
      ? {'coinBalance': 5000, 'earningBalance': 0, 'payoutHoldBalance': 0}
      : const {};

  @override
  Future<List<dynamic>> getList(String path) async {
    if (path == '/shops/me/products') {
      if (failProducts) throw const ApiException(500, 'products down');
      return products;
    }
    if (path.endsWith('/products')) return pins;
    return const [];
  }

  @override
  Future<Map<String, dynamic>> post(String path,
      [Map<String, dynamic>? body]) async {
    if (failCreate && path == '/shops') {
      throw const ApiException(400, 'This account already has a shop');
    }
    posts.add(path);
    postBodies[path] = body;
    if (path.endsWith('/join-token')) {
      return {'livekitUrl': 'ws://x', 'viewerToken': 'tok'};
    }
    if (path == '/shops') {
      shop = {'id': 's1', 'name': body?['name'], 'status': 'PENDING'};
    }
    return const {};
  }

  @override
  Future<Map<String, dynamic>> patch(String path,
      [Map<String, dynamic>? body]) async {
    patches.add(path);
    patchBodies[path] = body;
    return const {};
  }

  @override
  Future<Map<String, dynamic>> delete(String path,
      [Map<String, dynamic>? body]) async {
    deletes.add(path);
    return const {};
  }
}

Map<String, dynamic> _product({
  String id = 'p1',
  String title = 'Ankara Tee',
  int price = 1200,
  int? stock = 4,
  String status = 'DRAFT',
}) =>
    {
      'id': id,
      'title': title,
      'priceCoins': price,
      'stock': stock,
      'status': status,
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

Future<void> _openShopScreen(WidgetTester tester, _SellerApi api) async {
  _tall(tester);
  await tester.pumpWidget(_wrap(AppState(api: api), const ShopScreen()));
  await tester.pumpAndSettle();
}

/// Drives the prompt chain: one AlertDialog per value, in order.
Future<void> _answerPrompts(WidgetTester tester, List<String?> answers) async {
  for (final answer in answers) {
    if (answer == null) {
      await tester.tap(find.text('Cancel'));
    } else {
      await tester.enterText(find.byType(TextField), answer);
      await tester.tap(find.text('Save'));
    }
    await tester.pumpAndSettle();
  }
}

void main() {
  group('ShopScreen — no shop yet', () {
    testWidgets('offers to open one instead of reading as an error',
        (tester) async {
      await _openShopScreen(tester, _SellerApi());
      expect(find.text('Sell to the room you already have'), findsOneWidget);
      expect(find.text('Open my shop'), findsOneWidget);
    });

    testWidgets('creates the shop and says an admin must approve it',
        (tester) async {
      final api = _SellerApi();
      await _openShopScreen(tester, api);
      await tester.tap(find.text('Open my shop'));
      await tester.pumpAndSettle();
      await _answerPrompts(tester, ['Ada Threads']);

      expect(api.postBodies['/shops'], {'name': 'Ada Threads'});
      expect(find.textContaining('admin reviews it'), findsWidgets);
      await tester.pump(const Duration(seconds: 6)); // flush snackbar timer
    });

    testWidgets('a cancelled prompt creates nothing', (tester) async {
      final api = _SellerApi();
      await _openShopScreen(tester, api);
      await tester.tap(find.text('Open my shop'));
      await tester.pumpAndSettle();
      await _answerPrompts(tester, [null]);
      expect(api.posts, isEmpty);
    });

    testWidgets('an empty name creates nothing', (tester) async {
      final api = _SellerApi();
      await _openShopScreen(tester, api);
      await tester.tap(find.text('Open my shop'));
      await tester.pumpAndSettle();
      await _answerPrompts(tester, ['   ']);
      expect(api.posts, isEmpty);
    });

    testWidgets('surfaces a create failure', (tester) async {
      final api = _SellerApi(failCreate: true);
      await _openShopScreen(tester, api);
      await tester.tap(find.text('Open my shop'));
      await tester.pumpAndSettle();
      await _answerPrompts(tester, ['Dupe']);
      expect(find.textContaining('already has a shop'), findsWidgets);
      await tester.pump(const Duration(seconds: 6));
    });
  });

  group('ShopScreen — an existing shop', () {
    testWidgets('says plainly that a pending shop cannot sell yet',
        (tester) async {
      await _openShopScreen(
          tester,
          _SellerApi(
              shop: {'id': 's1', 'name': 'Ada Threads', 'status': 'PENDING'}));
      expect(find.text('Ada Threads'), findsOneWidget);
      expect(find.text('PENDING'), findsOneWidget);
      expect(find.textContaining('Awaiting review'), findsOneWidget);
    });

    testWidgets('an approved shop is told how to start selling', (tester) async {
      await _openShopScreen(
          tester,
          _SellerApi(
              shop: {'id': 's1', 'name': 'Ada', 'status': 'APPROVED'}));
      expect(find.textContaining('Pin a product'), findsOneWidget);
    });

    testWidgets('a suspended shop is told its products are off sale',
        (tester) async {
      await _openShopScreen(
          tester,
          _SellerApi(
              shop: {'id': 's1', 'name': 'Ada', 'status': 'SUSPENDED'}));
      expect(find.textContaining('not on sale'), findsOneWidget);
    });

    testWidgets('an empty catalog explains the next step', (tester) async {
      await _openShopScreen(tester,
          _SellerApi(shop: {'id': 's1', 'name': 'Ada', 'status': 'APPROVED'}));
      expect(find.text('Nothing listed yet'), findsOneWidget);
    });

    testWidgets('renders a product with its price and stock', (tester) async {
      await _openShopScreen(
          tester,
          _SellerApi(
            shop: {'id': 's1', 'name': 'Ada', 'status': 'APPROVED'},
            products: [_product()],
          ));
      expect(find.text('Ankara Tee'), findsOneWidget);
      expect(find.text('1200'), findsOneWidget);
      expect(find.text('4 in stock'), findsOneWidget);
    });

    // null stock is unlimited, not sold out.
    testWidgets('renders unlimited stock as unlimited', (tester) async {
      await _openShopScreen(
          tester,
          _SellerApi(
            shop: {'id': 's1', 'name': 'Ada', 'status': 'APPROVED'},
            products: [_product(stock: null)],
          ));
      expect(find.text('Unlimited'), findsOneWidget);
    });

    testWidgets('surfaces a load failure with a retry', (tester) async {
      await _openShopScreen(tester, _SellerApi(failShop: true));
      expect(find.text('Shop unavailable'), findsOneWidget);
      expect(find.text('shop lookup down'), findsOneWidget);
    });
  });

  group('ShopScreen — product status', () {
    testWidgets('a draft can be set live', (tester) async {
      final api = _SellerApi(
        shop: {'id': 's1', 'name': 'Ada', 'status': 'APPROVED'},
        products: [_product()],
      );
      await _openShopScreen(tester, api);
      await tester.tap(find.text('Set live'));
      await tester.pumpAndSettle();
      expect(api.patchBodies['/shops/me/products/p1'], {'status': 'ACTIVE'});
    });

    testWidgets('a live product can be taken down, not set live again',
        (tester) async {
      final api = _SellerApi(
        shop: {'id': 's1', 'name': 'Ada', 'status': 'APPROVED'},
        products: [_product(status: 'ACTIVE')],
      );
      await _openShopScreen(tester, api);
      expect(find.text('Set live'), findsNothing);
      await tester.tap(find.text('Take down'));
      await tester.pumpAndSettle();
      expect(api.patchBodies['/shops/me/products/p1'], {'status': 'DRAFT'});
    });

    testWidgets('an archived product offers no further archive', (tester) async {
      await _openShopScreen(
          tester,
          _SellerApi(
            shop: {'id': 's1', 'name': 'Ada', 'status': 'APPROVED'},
            products: [_product(status: 'ARCHIVED')],
          ));
      expect(find.text('Archive'), findsNothing);
    });
  });

  group('ShopScreen — adding a product', () {
    testWidgets('collects title, price and stock, then posts them',
        (tester) async {
      final api = _SellerApi(
          shop: {'id': 's1', 'name': 'Ada', 'status': 'APPROVED'});
      await _openShopScreen(tester, api);
      await tester.tap(find.text('Add'));
      await tester.pumpAndSettle();
      await _answerPrompts(tester, ['Ankara Tee', '1200', '5']);

      expect(api.postBodies['/shops/me/products'],
          {'title': 'Ankara Tee', 'priceCoins': 1200, 'stock': 5});
      await tester.pump(const Duration(seconds: 6));
    });

    // Blank stock means unlimited — it must be omitted, not sent as 0.
    testWidgets('a blank stock is sent as unlimited, not zero', (tester) async {
      final api = _SellerApi(
          shop: {'id': 's1', 'name': 'Ada', 'status': 'APPROVED'});
      await _openShopScreen(tester, api);
      await tester.tap(find.text('Add'));
      await tester.pumpAndSettle();
      await _answerPrompts(tester, ['Digital Track', '900', '']);

      expect(api.postBodies['/shops/me/products'],
          {'title': 'Digital Track', 'priceCoins': 900});
      await tester.pump(const Duration(seconds: 6));
    });

    testWidgets('rejects a price below one coin', (tester) async {
      final api = _SellerApi(
          shop: {'id': 's1', 'name': 'Ada', 'status': 'APPROVED'});
      await _openShopScreen(tester, api);
      await tester.tap(find.text('Add'));
      await tester.pumpAndSettle();
      await _answerPrompts(tester, ['Freebie', '0']);

      expect(api.posts, isEmpty);
      expect(find.textContaining('at least 1 coin'), findsWidgets);
      await tester.pump(const Duration(seconds: 6));
    });

    testWidgets('cancelling the title prompt adds nothing', (tester) async {
      final api = _SellerApi(
          shop: {'id': 's1', 'name': 'Ada', 'status': 'APPROVED'});
      await _openShopScreen(tester, api);
      await tester.tap(find.text('Add'));
      await tester.pumpAndSettle();
      await _answerPrompts(tester, [null]);
      expect(api.posts, isEmpty);
    });
  });

  group('the host pin sheet', () {
    Future<_SellerApi> openHostRoom(WidgetTester tester, _SellerApi api) async {
      _tall(tester);
      await tester.pumpWidget(_wrap(
          AppState(api: api)..userId = 'h1',
          RoomScreen(
            room: const LiveRoom(
                id: 'r1',
                title: 'Live',
                category: 'MUSIC',
                country: 'NG',
                language: 'pidgin',
                status: 'LIVE',
                hostId: 'h1'),
            hostToken: 'host-tok',
            livekitUrl: 'ws://x',
            socketFactory: (uri, opts) => _FakeSocket(),
          )));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      return api;
    }

    testWidgets('tells a host with no live products where to add one',
        (tester) async {
      await openHostRoom(tester, _SellerApi(products: [_product()])); // DRAFT only
      await tester.tap(find.text('Shop'));
      await tester.pumpAndSettle();
      expect(find.textContaining('No live products yet'), findsWidgets);
      await tester.pump(const Duration(seconds: 6));
    });

    testWidgets('lists live products and pins one', (tester) async {
      final api = await openHostRoom(
          tester, _SellerApi(products: [_product(status: 'ACTIVE')]));
      await tester.tap(find.text('Shop'));
      await tester.pumpAndSettle();

      expect(find.text('Pin to this room'), findsOneWidget);
      expect(find.text('Ankara Tee'), findsOneWidget);
      await tester.tap(find.text('Pin'));
      await tester.pumpAndSettle();

      expect(api.postBodies['/live-rooms/r1/products'], {'productId': 'p1'});
    });

    testWidgets('offers Unpin for an already-pinned product, and unpins it',
        (tester) async {
      final api = await openHostRoom(
          tester,
          _SellerApi(
            products: [_product(status: 'ACTIVE')],
            pins: [
              {
                'pinId': 'pin1',
                'product': {
                  'id': 'p1',
                  'title': 'Ankara Tee',
                  'priceCoins': 1200,
                  'stock': 4
                },
                'shop': {'id': 's1', 'name': 'Ada'}
              }
            ],
          ));
      await tester.tap(find.text('Shop'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Unpin'));
      await tester.pumpAndSettle();
      expect(api.deletes, contains('/live-rooms/r1/products/p1'));
    });

    testWidgets('surfaces a products-lookup failure', (tester) async {
      await openHostRoom(tester, _SellerApi(failProducts: true));
      await tester.tap(find.text('Shop'));
      await tester.pumpAndSettle();
      expect(find.textContaining('products down'), findsWidgets);
      await tester.pump(const Duration(seconds: 6));
    });
  });
}
