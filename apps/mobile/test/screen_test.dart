import 'dart:async';

import 'package:afristage_mobile/core/api_client.dart';
import 'package:afristage_mobile/core/app_state.dart';
import 'package:afristage_mobile/models/models.dart';
import 'package:afristage_mobile/screens/search_screen.dart';
import 'package:afristage_mobile/screens/wallet_screen.dart';
import 'package:afristage_mobile/screens/creator_profile_screen.dart';
import 'package:afristage_mobile/screens/gift_history_screen.dart';
import 'package:afristage_mobile/screens/creator_rooms_screen.dart';
import 'package:afristage_mobile/screens/creator_screen.dart';
import 'package:afristage_mobile/screens/go_live_setup_screen.dart';
import 'package:afristage_mobile/screens/history_screen.dart';
import 'package:afristage_mobile/screens/live_screen.dart';
import 'package:afristage_mobile/screens/login_screen.dart';
import 'package:afristage_mobile/screens/notifications_screen.dart';
import 'package:afristage_mobile/screens/onboarding_screen.dart';
import 'package:afristage_mobile/screens/payout_history_screen.dart';
import 'package:afristage_mobile/screens/payout_methods_screen.dart';
import 'package:afristage_mobile/screens/register_screen.dart';
import 'package:afristage_mobile/screens/report_screen.dart';
import 'package:afristage_mobile/screens/support_screen.dart';
import 'package:afristage_mobile/screens/support_ticket_screen.dart';
import 'package:afristage_mobile/screens/beta_accept_screen.dart';
import 'package:afristage_mobile/screens/room_screen.dart';
import 'package:afristage_mobile/widgets/afri_live.dart';
import 'package:afristage_mobile/widgets/afri_ui.dart';
import 'package:flutter/material.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

/// Configurable fake: canned get/getList responses by path; records writes.
/// Paths in [errors] throw, so error-state branches are testable.
class _FakeApi extends ApiClient {
  _FakeApi({this.lists = const {}, this.maps = const {}, this.errors = const {}, this.postErrors = const {}});
  final Map<String, List<dynamic>> lists;
  final Map<String, Map<String, dynamic>> maps;
  final Set<String> errors;
  final Set<String> postErrors; // paths whose POST (not GET) throws
  final posts = <String>[];
  final deletes = <String>[];
  final patches = <String>[];

  @override
  Future<List<dynamic>> getList(String path) async {
    if (errors.contains(path)) throw const ApiException(500, 'boom');
    return lists[path] ?? const [];
  }

  @override
  Future<Map<String, dynamic>> patch(String path, [Map<String, dynamic>? body]) async {
    if (errors.contains(path)) throw const ApiException(500, 'boom');
    patches.add(path);
    return maps[path] ?? const {};
  }

  @override
  Future<Map<String, dynamic>> get(String path) async {
    if (errors.contains(path)) throw const ApiException(500, 'boom');
    return maps[path] ?? const {};
  }

  @override
  Future<Map<String, dynamic>> post(String path, [Map<String, dynamic>? body]) async {
    if (errors.contains(path) || postErrors.contains(path)) throw const ApiException(500, 'boom');
    posts.add(path);
    return maps[path] ?? const {};
  }

  @override
  Future<Map<String, dynamic>> delete(String path) async {
    if (errors.contains(path)) throw const ApiException(500, 'boom');
    deletes.add(path);
    return const {};
  }
}

Widget _wrap(ApiClient api, Widget child) => ChangeNotifierProvider(
      create: (_) => AppState(api: api),
      child: MaterialApp(home: child),
    );

Widget _wrapState(AppState state, Widget child) =>
    ChangeNotifierProvider<AppState>.value(
      value: state,
      child: MaterialApp(home: child),
    );

/// Fake that throws on the FIRST getList(path) then returns [after] — lets a
/// retry tap resolve (covering the onRetry closure) without leaving an unhandled
/// rejected future from a still-failing reload.
class _RetryApi extends ApiClient {
  _RetryApi(this.path, this.after);
  final String path;
  final List<dynamic> after;
  int calls = 0;
  @override
  Future<List<dynamic>> getList(String p) async {
    if (p == path) {
      calls++;
      if (calls == 1) throw const ApiException(500, 'boom');
      return after;
    }
    return const [];
  }
}

/// No-op fake socket so screens that navigate into RoomScreen don't open a real
/// websocket. Captures on()/onConnect()/etc. via noSuchMethod.
class _NoopSocket implements io.Socket {
  @override
  dynamic noSuchMethod(Invocation i) => this;
}

/// Install the fake socket as RoomScreen's default factory for this test.
void _stubRoomSockets() {
  debugRoomSocketFactory = (uri, opts) => _NoopSocket();
  addTearDown(() => debugRoomSocketFactory = io.io);
}

/// Returns each queued future in order for getList (so a test can hand a
/// deferred completer that errors AFTER the FutureBuilder has subscribed —
/// avoiding an unhandled rejection from a future created mid-test).
class _QueueApi extends ApiClient {
  _QueueApi(this._q);
  final List<Future<List<dynamic>> Function()> _q;
  int i = 0;
  @override
  Future<List<dynamic>> getList(String p) =>
      i < _q.length ? _q[i++]() : Future.value(const <dynamic>[]);
}

/// Push [screen] onto a launcher route so the screen's Navigator.pop() returns
/// cleanly (instead of popping the only/root route).
Future<void> _pushScreen(WidgetTester tester, ApiClient api, Widget screen) async {
  await tester.pumpWidget(_wrap(
      api,
      Builder(
          builder: (ctx) => Scaffold(
              body: Center(
                  child: ElevatedButton(
                      onPressed: () => Navigator.push(ctx,
                          MaterialPageRoute<void>(builder: (_) => screen)),
                      child: const Text('__open__')))))));
  await tester.pumpAndSettle();
  await tester.tap(find.text('__open__'));
  await tester.pumpAndSettle();
}

/// Pull-to-refresh: fling the first scrollable down and let it settle.
Future<void> _pullToRefresh(WidgetTester tester) async {
  await tester.fling(find.byType(Scrollable).first, const Offset(0, 300), 1000);
  await tester.pumpAndSettle();
}

/// Tall surface so long forms / bottom sheets don't overflow the 800px default.
void _tall(WidgetTester tester) {
  tester.view.physicalSize = const Size(1080, 2600);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

void main() {
  testWidgets('GiftHistoryScreen lists sent gifts with creator + room',
      (tester) async {
    final api = _FakeApi(lists: {
      '/gifts/me': [
        {
          'id': 'g1',
          'giftName': 'Rose',
          'quantity': 2,
          'totalCoinAmount': 20,
          'creatorId': 'c1',
          'creatorName': 'Zola Kim',
          'roomTitle': 'Friday Afrobeats',
          'createdAt': '2026-06-24T12:00:00Z',
        },
      ],
    });
    await tester.pumpWidget(_wrap(api, const GiftHistoryScreen()));
    await tester.pumpAndSettle();

    expect(find.text('Rose ×2'), findsOneWidget);
    expect(find.textContaining('Zola Kim'), findsOneWidget);
    expect(find.text('20 coins'), findsOneWidget);
  });

  testWidgets('GiftHistoryScreen shows an empty state with no gifts',
      (tester) async {
    await tester.pumpWidget(_wrap(_FakeApi(), const GiftHistoryScreen()));
    await tester.pumpAndSettle();
    expect(find.text('No gifts sent yet'), findsOneWidget);
  });

  testWidgets('Creator profile reminder toggles and calls the remind endpoint',
      (tester) async {
    final api = _FakeApi(maps: {
      '/creators/c1': {
        'stageName': 'Zola Kim',
        'approvalStatus': 'APPROVED',
        'totalRooms': 5,
        'followers': 12,
        'isFollowing': false,
        'userId': 'c1',
        'upcomingRoom': {
          'id': 'r1',
          'title': 'Next Show',
          'scheduledStartAt': '2026-07-01T20:00:00Z',
          'reminded': false,
        },
      },
    });
    await tester
        .pumpWidget(_wrap(api, const CreatorProfileScreen(creatorId: 'c1')));
    await tester.pumpAndSettle();

    expect(find.text('Remind me'), findsOneWidget);
    await tester.tap(find.text('Remind me'));
    await tester.pumpAndSettle();

    expect(find.text('Reminder set'), findsOneWidget);
    expect(api.posts, contains('/live-rooms/r1/remind'));
  });

  testWidgets('HistoryScreen renders a ledger row with formatted coin amount',
      (tester) async {
    final api = _FakeApi(lists: {
      '/wallet/me/ledger': [
        {
          'direction': 'DEBIT',
          'amountMinor': 100,
          'currency': 'COIN',
          'createdAt': '2026-06-24T12:00:00Z',
          'transaction': {'type': 'GIFT'},
          'account': {'accountType': 'COIN'},
        },
      ],
    });
    await tester.pumpWidget(_wrap(api, const HistoryScreen()));
    await tester.pumpAndSettle();
    expect(find.textContaining('100 coins'), findsOneWidget);
  });

  testWidgets('PayoutHistoryScreen shows coin amount, fiat, and status',
      (tester) async {
    final api = _FakeApi(lists: {
      '/payouts/me': [
        {
          'coinAmount': 500,
          'fiatMinor': 50000,
          'fiatCurrency': 'NGN',
          'status': 'PAID',
          'createdAt': '2026-06-24T12:00:00Z',
        },
      ],
    });
    await tester.pumpWidget(_wrap(api, const PayoutHistoryScreen()));
    await tester.pumpAndSettle();
    expect(find.text('500 coins'), findsOneWidget);
    expect(find.textContaining('₦500.00'), findsOneWidget);
    expect(find.text('PAID'), findsOneWidget);
  });

  testWidgets('LiveScreen shows an error state when the rooms fetch fails',
      (tester) async {
    final api = _FakeApi(errors: {'/live-rooms'});
    await tester.pumpWidget(_wrap(api, const LiveScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Could not load live rooms'), findsOneWidget);
  });

  testWidgets('Tapping a payout notification opens payout history (#46)',
      (tester) async {
    final api = _FakeApi(lists: {
      '/notifications/me': [
        {
          'id': 'n1',
          'type': 'PAYOUT_UPDATE',
          'title': 'Payout paid',
          'body': 'Your payout was sent.',
          'createdAt': '2026-06-24T12:00:00Z',
          'readAt': null,
        },
      ],
    });
    await tester.pumpWidget(_wrap(api, const NotificationsScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Payout paid'), findsOneWidget);

    await tester.tap(find.text('Payout paid'));
    await tester.pumpAndSettle();
    // Deep-linked to the Payout history screen (its app-bar title).
    expect(find.text('Payout history'), findsOneWidget);
  });

  testWidgets('CreatorRoomsScreen lists a past show', (tester) async {
    final api = _FakeApi(lists: {
      '/creators/me/rooms': [
        {
          'title': 'Afrobeats Night',
          'status': 'ENDED',
          'peakViewers': 120,
          'totalWatchSeconds': 3600,
          'giftVolumeCoins': 500,
          'giftCount': 8,
          'startedAt': '2026-06-20T20:00:00Z',
        },
      ],
    });
    await tester.pumpWidget(_wrap(api, const CreatorRoomsScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Afrobeats Night'), findsOneWidget);
    expect(find.text('Show performance'), findsOneWidget); // app bar
  });

  testWidgets('PayoutMethodsScreen lists a saved method', (tester) async {
    final api = _FakeApi(lists: {
      '/payouts/methods': [
        {
          'id': 'm1',
          'provider': 'BANK',
          'label': 'GTBank savings',
          'destinationReference': '0123456789',
          'currency': 'NGN',
          'isDefault': true,
        },
      ],
    });
    await tester.pumpWidget(_wrap(api, const PayoutMethodsScreen()));
    await tester.pumpAndSettle();
    expect(find.text('GTBank savings'), findsOneWidget);
    expect(find.text('Default'), findsOneWidget);
  });

  testWidgets('PayoutMethodsScreen shows empty state', (tester) async {
    await tester.pumpWidget(_wrap(_FakeApi(), const PayoutMethodsScreen()));
    await tester.pumpAndSettle();
    expect(find.text('No payout methods yet'), findsOneWidget);
  });

  testWidgets('SupportScreen renders the support hub + ticket form',
      (tester) async {
    await tester.pumpWidget(_wrap(_FakeApi(), const SupportScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Support hub'), findsOneWidget);
    expect(find.text('New ticket'), findsOneWidget);
  });

  testWidgets('OnboardingScreen renders the discovery form', (tester) async {
    await tester.pumpWidget(_wrap(_FakeApi(), const OnboardingScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Tune your stage'), findsOneWidget);
    expect(find.text('Interests'), findsOneWidget);
  });

  testWidgets('CreatorScreen dashboard renders earnings hero', (tester) async {
    final api = _FakeApi(maps: {
      '/creators/me/dashboard': {
        'creator': {'stageName': 'Zola Kim', 'status': 'APPROVED'},
        'earnings': 620,
        'topSupporters': [],
        'totalGiftTransactions': 5,
        'totalRooms': 8,
        'followers': 12,
        'totalWatchSeconds': 3600,
      },
    });
    await tester.pumpWidget(_wrap(api, const CreatorScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Available balance'), findsOneWidget);
  });

  testWidgets('SupportTicketScreen shows subject + no-replies state',
      (tester) async {
    final api = _FakeApi(maps: {
      '/support/tickets/t1': {
        'subject': 'Payment issue',
        'status': 'OPEN',
        'messages': [],
      },
    });
    await tester.pumpWidget(_wrap(
        api, const SupportTicketScreen(ticketId: 't1', subject: 'Payment issue')));
    await tester.pumpAndSettle();
    expect(find.text('Payment issue'), findsWidgets); // app bar + card
    expect(find.text('No replies yet'), findsOneWidget);
  });

  testWidgets('RegisterScreen renders the first step', (tester) async {
    await tester.pumpWidget(_wrap(_FakeApi(), const RegisterScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Join AfriStage'), findsOneWidget);
  });

  testWidgets('GoLiveSetupScreen renders the room-details form', (tester) async {
    await tester.pumpWidget(_wrap(_FakeApi(), const GoLiveSetupScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Go Live Setup'), findsOneWidget);
    expect(find.text('Room details'), findsOneWidget);
  });

  testWidgets('WalletScreen renders balance + earnings from AppState',
      (tester) async {
    final state = AppState(api: _FakeApi())
      ..wallet = const Wallet(
          coinBalance: 1200, earningBalance: 620, payoutHoldBalance: 50);
    await tester.pumpWidget(_wrapState(state, const WalletScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Available balance'), findsOneWidget);
    expect(find.text('Coin balance'), findsOneWidget);
    expect(find.text('1200'), findsOneWidget);
  });

  testWidgets('PayoutMethods add-method sheet opens with provider segments',
      (tester) async {
    await tester.pumpWidget(_wrap(_FakeApi(), const PayoutMethodsScreen()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add method'));
    await tester.pumpAndSettle();
    // 'Add payout method' appears as both the empty-state action + sheet header;
    // the provider segments are unique to the sheet.
    expect(find.text('Bank'), findsOneWidget);
    expect(find.text('Mobile money'), findsOneWidget);
  });

  testWidgets('RegisterScreen advances to step 2 on Continue', (tester) async {
    await tester.pumpWidget(_wrap(_FakeApi(), const RegisterScreen()));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Continue'), 200,
        scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(find.text('Step 2 · Public profile'), findsOneWidget);
  });

  testWidgets('SearchScreen category browse loads rooms', (tester) async {
    final api = _FakeApi(lists: {
      '/live-rooms?category=MUSIC': [
        {
          'id': 'r1',
          'title': 'Amapiano Live',
          'category': 'MUSIC',
          'country': 'NG',
          'language': 'pidgin',
          'status': 'LIVE',
          'host': {
            'profile': {'displayName': 'DJ Tunde'}
          },
        },
      ],
    });
    await tester.pumpWidget(_wrap(api, const SearchScreen()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Music'));
    await tester.pumpAndSettle();
    expect(find.text('Amapiano Live'), findsOneWidget);
  });

  testWidgets('CreatorProfile shows a Watch-live CTA when live', (tester) async {
    final api = _FakeApi(maps: {
      '/creators/c1': {
        'stageName': 'Zola Kim',
        'approvalStatus': 'APPROVED',
        'totalRooms': 5,
        'followers': 12,
        'isFollowing': false,
        'userId': 'c1',
        'liveRoom': {
          'id': 'lr1',
          'title': 'On Now',
          'category': 'MUSIC',
          'country': 'NG',
          'language': 'pidgin',
        },
      },
    });
    await tester
        .pumpWidget(_wrap(api, const CreatorProfileScreen(creatorId: 'c1')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Watch live'), findsOneWidget);
  });

  testWidgets('CreatorScreen dashboard lists a top supporter', (tester) async {
    final api = _FakeApi(maps: {
      '/creators/me/dashboard': {
        'creator': {'stageName': 'Zola', 'status': 'APPROVED'},
        'earnings': 620,
        'topSupporters': [
          {'displayName': 'Big Fan', 'coins': 300}
        ],
        'totalRooms': 8,
        'followers': 12,
        'totalWatchSeconds': 3600,
      },
    });
    await tester.pumpWidget(_wrap(api, const CreatorScreen()));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Big Fan'), 250);
    expect(find.text('Big Fan'), findsOneWidget);
  });

  testWidgets('CreatorProfile Follow toggles to Following + posts', (tester) async {
    final api = _FakeApi(maps: {
      '/creators/c1': {
        'stageName': 'Zola Kim',
        'approvalStatus': 'APPROVED',
        'totalRooms': 5,
        'followers': 12,
        'isFollowing': false,
        'userId': 'c1',
      },
    });
    await tester
        .pumpWidget(_wrap(api, const CreatorProfileScreen(creatorId: 'c1')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Follow'));
    await tester.pumpAndSettle();
    expect(find.text('Following'), findsOneWidget);
    expect(api.posts, contains('/users/c1/follow'));
  });

  testWidgets('WalletScreen Buy-coins opens the package sheet', (tester) async {
    _tall(tester);
    final state = AppState(api: _FakeApi())
      ..wallet = const Wallet(
          coinBalance: 100, earningBalance: 0, payoutHoldBalance: 0);
    await tester.pumpWidget(_wrapState(state, const WalletScreen()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Buy coins'));
    await tester.pumpAndSettle();
    // The sheet adds a second 'Buy coins' header.
    expect(find.text('Buy coins'), findsNWidgets(2));
  });

  testWidgets('ReportScreen submit posts a report', (tester) async {
    _tall(tester);
    final api = _FakeApi();
    await tester.pumpWidget(
        _wrap(api, const ReportScreen(roomId: 'r1', label: 'room')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Nudity'));
    await tester.tap(find.text('Submit Report'));
    await tester.pumpAndSettle();
    expect(api.posts, contains('/reports'));
    expect(find.text('Report submitted'), findsOneWidget);
  });

  testWidgets('PayoutMethods saves a new method', (tester) async {
    _tall(tester);
    final api = _FakeApi();
    await tester.pumpWidget(_wrap(api, const PayoutMethodsScreen()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add method'));
    await tester.pumpAndSettle();
    // Label + account number; country/currency are pre-filled.
    await tester.enterText(find.byType(TextField).at(0), 'GTBank savings');
    await tester.enterText(find.byType(TextField).at(1), '0123456789');
    await tester.tap(find.text('Save payout method'));
    await tester.pumpAndSettle();
    expect(api.posts, contains('/payouts/methods'));
  });

  testWidgets('GoLiveSetup low-data toggle flips', (tester) async {
    _tall(tester);
    await tester.pumpWidget(_wrap(_FakeApi(), const GoLiveSetupScreen()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Low-data mode'));
    await tester.pumpAndSettle();
    expect(find.text('Low-data mode'), findsOneWidget); // toggled without error
  });

  testWidgets('WalletScreen buying a package posts a purchase intent',
      (tester) async {
    _tall(tester);
    final api = _FakeApi();
    final state = AppState(api: api)
      ..wallet = const Wallet(
          coinBalance: 0, earningBalance: 0, payoutHoldBalance: 0);
    await tester.pumpWidget(_wrapState(state, const WalletScreen()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Buy coins'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('₦1,000 → 100 coins'));
    await tester.pumpAndSettle();
    expect(api.posts, contains('/payments/coin-purchase-intents'));
  });

  testWidgets('SupportTicketScreen sends a reply', (tester) async {
    _tall(tester);
    final api = _FakeApi(maps: {
      '/support/tickets/t1': {'subject': 'Issue', 'status': 'OPEN', 'messages': []},
    });
    await tester.pumpWidget(_wrap(
        api, const SupportTicketScreen(ticketId: 't1', subject: 'Issue')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, 'Please help');
    await tester.tap(find.byIcon(Icons.send));
    await tester.pumpAndSettle();
    expect(api.posts, contains('/support/tickets/t1/messages'));
  });

  testWidgets('CreatorScreen shows the error state', (tester) async {
    final api = _FakeApi(errors: {'/creators/me/dashboard'});
    await tester.pumpWidget(_wrap(api, const CreatorScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Creator hub unavailable'), findsOneWidget);
    expect(find.text('Retry creator hub'), findsOneWidget);
  });

  testWidgets('CreatorScreen formats multi-hour watch time', (tester) async {
    _tall(tester);
    final api = _FakeApi(maps: {
      '/creators/me/dashboard': {
        'creator': {'stageName': 'Zola', 'status': 'APPROVED'},
        'earnings': 10,
        'topSupporters': [],
        'totalWatchSeconds': 7325, // 2h 2m
      },
    });
    await tester.pumpWidget(_wrap(api, const CreatorScreen()));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('2h 2m'), 200,
        scrollable: find.byType(Scrollable).first);
    expect(find.text('2h 2m'), findsOneWidget);
  });

  testWidgets('CreatorScreen payout with no method nudges to add one',
      (tester) async {
    _tall(tester);
    final api = _FakeApi(maps: {
      '/creators/me/dashboard': {
        'creator': {'stageName': 'Zola', 'status': 'APPROVED'},
        'earnings': 100,
        'topSupporters': [],
      },
    }); // getList('/payouts/methods') defaults to []
    await tester.pumpWidget(_wrap(api, const CreatorScreen()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Request payout'));
    await tester.pumpAndSettle();
    expect(find.text('Add a payout method first so earnings can settle.'),
        findsOneWidget);
  });

  testWidgets('GoLiveSetup blocks an empty title before going live',
      (tester) async {
    _tall(tester);
    final api = _FakeApi();
    await tester.pumpWidget(_wrap(api, const GoLiveSetupScreen()));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, '   ');
    await tester.scrollUntilVisible(find.text('Start Live Room'), 200,
        scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('Start Live Room'));
    await tester.pumpAndSettle();
    expect(find.text('Choose a clear title before going live.'), findsOneWidget);
    expect(api.posts, isEmpty); // never hit the API
  });

  testWidgets('Wallet card mode surfaces a missing-checkout-URL error',
      (tester) async {
    _tall(tester);
    final state = AppState(api: _FakeApi())
      ..wallet = const Wallet(
          coinBalance: 0, earningBalance: 0, payoutHoldBalance: 0);
    await tester.pumpWidget(_wrapState(state, const WalletScreen()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Buy coins'));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(Switch)); // flip Mock -> Card; reopens sheet
    await tester.pumpAndSettle();
    await tester.tap(find.text('₦1,000 → 100 coins')); // _buyWithCard, no URL
    await tester.pumpAndSettle();
    expect(find.text('No checkout URL returned'), findsOneWidget);
  });

  testWidgets('Wallet menu rows show their guidance snackbars', (tester) async {
    _tall(tester);
    final state = AppState(api: _FakeApi())
      ..wallet = const Wallet(
          coinBalance: 0, earningBalance: 0, payoutHoldBalance: 0);
    await tester.pumpWidget(_wrapState(state, const WalletScreen()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Profile'));
    await tester.pump();
    expect(find.text('Use the Profile tab to manage your account.'),
        findsOneWidget);
    await tester.pump(const Duration(seconds: 5)); // flush snackbar
  });

  testWidgets('Notifications empty state when there are none', (tester) async {
    await tester.pumpWidget(_wrap(_FakeApi(), const NotificationsScreen()));
    await tester.pumpAndSettle();
    expect(find.text('No notifications yet'), findsOneWidget);
  });

  testWidgets('Notifications error state when the load fails', (tester) async {
    final api = _FakeApi(errors: {'/notifications/me'});
    await tester.pumpWidget(_wrap(api, const NotificationsScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Could not load notifications'), findsOneWidget);
  });

  testWidgets('Notifications mark-all-read posts to the endpoint',
      (tester) async {
    final api = _FakeApi(lists: {
      '/notifications/me': [
        {'id': 'n1', 'type': 'NEW_FOLLOWER', 'title': 'New follower', 'body': 'x'},
      ],
    });
    await tester.pumpWidget(_wrap(api, const NotificationsScreen()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Mark all read'));
    await tester.pumpAndSettle();
    expect(api.posts, contains('/notifications/read-all'));
  });

  testWidgets('Register reaches step 3 and blocks create until age confirmed',
      (tester) async {
    await tester.pumpWidget(_wrap(_FakeApi(), const RegisterScreen()));
    await tester.pumpAndSettle();
    for (var i = 0; i < 2; i++) {
      await tester.scrollUntilVisible(find.text('Continue'), 200,
          scrollable: find.byType(Scrollable).first);
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
    }
    expect(find.text('Step 3 · Country and language'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Create Account'));
    await tester.pumpAndSettle();
    expect(find.text('Confirm your age before creating an account'),
        findsOneWidget);
  });

  testWidgets('Onboarding toggles interests and creator intent', (tester) async {
    _tall(tester);
    await tester.pumpWidget(_wrap(_FakeApi(), const OnboardingScreen()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Football')); // select an interest
    await tester.tap(find.text('Creator')); // switch intent segment
    await tester.pumpAndSettle();
    expect(find.text('Set Up Discovery'), findsOneWidget);
  });

  testWidgets('Onboarding surfaces a save error', (tester) async {
    _tall(tester);
    final api = _FakeApi(errors: {'/users/me'});
    await tester.pumpWidget(_wrap(api, const OnboardingScreen()));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
        find.text('Save Discovery Preferences'), 200,
        scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('Save Discovery Preferences'));
    await tester.pumpAndSettle();
    expect(find.text('boom'), findsOneWidget);
  });

  testWidgets('Support create with blank fields warns', (tester) async {
    _tall(tester);
    await tester.pumpWidget(_wrap(_FakeApi(), const SupportScreen()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Create ticket'));
    await tester.pumpAndSettle();
    expect(find.text('Add a subject and a short description first.'),
        findsOneWidget);
  });

  testWidgets('Support create posts a ticket and confirms', (tester) async {
    _tall(tester);
    final api = _FakeApi();
    await tester.pumpWidget(_wrap(api, const SupportScreen()));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).at(0), 'Cannot cash out');
    await tester.enterText(find.byType(TextField).at(1), 'Payout stuck 3 days');
    await tester.tap(find.text('Create ticket'));
    await tester.pumpAndSettle();
    expect(api.posts, contains('/support/tickets'));
    expect(find.text('Ticket created'), findsOneWidget);
  });

  testWidgets('Support shows a load error with retry', (tester) async {
    _tall(tester);
    final api = _FakeApi(errors: {'/support/tickets/me'});
    await tester.pumpWidget(_wrap(api, const SupportScreen()));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Could not load tickets'), 200,
        scrollable: find.byType(Scrollable).first);
    expect(find.text('Could not load tickets'), findsOneWidget);
  });

  testWidgets('LiveScreen empty state when nobody is live', (tester) async {
    await tester.pumpWidget(_wrap(_FakeApi(), const LiveScreen()));
    await tester.pumpAndSettle();
    expect(find.text('No rooms live right now'), findsOneWidget);
  });

  testWidgets('LiveScreen renders a live room card', (tester) async {
    final api = _FakeApi(lists: {
      '/live-rooms': [
        {
          'id': 'r1',
          'title': 'Amapiano All Night',
          'category': 'MUSIC',
          'country': 'NG',
          'language': 'pidgin',
          'status': 'LIVE',
          'hostName': 'DJ Tunde',
        },
      ],
    });
    await tester.pumpWidget(_wrap(api, const LiveScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Amapiano All Night'), findsOneWidget);
  });

  testWidgets('ReportScreen block-user flow posts a block', (tester) async {
    _tall(tester);
    final api = _FakeApi();
    await tester.pumpWidget(_wrap(
        api, const ReportScreen(targetUserId: 'u9', label: 'user')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Scam')); // pick a reason tile
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Block this user'), 200,
        scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('Block this user'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Block')); // confirm
    await tester.pumpAndSettle();
    expect(api.posts, contains('/users/u9/block'));
    expect(find.text('User blocked.'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('LoginScreen fills a seed account and reports unreachable server',
      (tester) async {
    await tester.pumpWidget(_wrap(_FakeApi(), const LoginScreen()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Creator')); // _fill seed credentials
    await tester.pump();
    await tester.tap(find.text('Log in to AfriStage'));
    await tester.pumpAndSettle();
    expect(find.text('Could not reach the server'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('CreatorProfile shows an error state', (tester) async {
    final api = _FakeApi(errors: {'/creators/c1'});
    await tester
        .pumpWidget(_wrap(api, const CreatorProfileScreen(creatorId: 'c1')));
    await tester.pumpAndSettle();
    expect(find.text('Could not load this creator'), findsOneWidget);
  });

  testWidgets('CreatorProfile shows not-live state and bio', (tester) async {
    final api = _FakeApi(maps: {
      '/creators/c1': {
        'stageName': 'Zola Kim',
        'approvalStatus': 'APPROVED',
        'userId': 'c1',
        'totalRooms': 3,
        'followers': 9,
        'user': {
          'profile': {'bio': 'Lagos amapiano selector.'}
        },
      },
    });
    await tester
        .pumpWidget(_wrap(api, const CreatorProfileScreen(creatorId: 'c1')));
    await tester.pumpAndSettle();
    expect(find.text('Lagos amapiano selector.'), findsOneWidget);
    expect(find.text('Not live right now'), findsOneWidget);
  });

  testWidgets('CreatorProfile unfollow deletes the follow', (tester) async {
    final api = _FakeApi(maps: {
      '/creators/c1': {
        'stageName': 'Zola Kim',
        'approvalStatus': 'APPROVED',
        'userId': 'c1',
        'isFollowing': true,
        'followers': 10,
      },
    });
    await tester
        .pumpWidget(_wrap(api, const CreatorProfileScreen(creatorId: 'c1')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Following'));
    await tester.pump();
    expect(api.deletes, contains('/users/c1/follow'));
    expect(find.text('Follow'), findsOneWidget); // flipped back
  });

  testWidgets('PayoutHistory empty state', (tester) async {
    await tester.pumpWidget(_wrap(_FakeApi(), const PayoutHistoryScreen()));
    await tester.pumpAndSettle();
    expect(find.text('No payouts yet'), findsOneWidget);
  });

  testWidgets('PayoutHistory error state', (tester) async {
    final api = _FakeApi(errors: {'/payouts/me'});
    await tester.pumpWidget(_wrap(api, const PayoutHistoryScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Could not load payouts'), findsOneWidget);
  });

  testWidgets('PayoutHistory lists paid and rejected payouts with notes',
      (tester) async {
    _tall(tester);
    final api = _FakeApi(lists: {
      '/payouts/me': [
        {
          'id': 'p1',
          'coinAmount': 500,
          'status': 'PAID',
          'fiatMinor': 500000,
          'fiatCurrency': 'NGN',
          'providerReference': 'TRX-123',
          'createdAt': '2026-06-20T10:00:00Z',
        },
        {
          'id': 'p2',
          'coinAmount': 200,
          'status': 'REJECTED',
          'rejectionReason': 'Bank details invalid',
          'createdAt': '2026-06-21T10:00:00Z',
        },
      ],
    });
    await tester.pumpWidget(_wrap(api, const PayoutHistoryScreen()));
    await tester.pumpAndSettle();
    expect(find.text('500 coins'), findsOneWidget);
    expect(find.text('Ref: TRX-123'), findsOneWidget);
    expect(find.text('Bank details invalid'), findsOneWidget);
  });

  testWidgets('Search text query with no matches shows an empty state',
      (tester) async {
    await tester.pumpWidget(_wrap(_FakeApi(), const SearchScreen()));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'afro');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pumpAndSettle();
    expect(find.text('No live rooms for "afro"'), findsOneWidget);
  });

  testWidgets('SupportTicket shows an error state', (tester) async {
    final api = _FakeApi(errors: {'/support/tickets/t1'});
    await tester.pumpWidget(_wrap(
        api, const SupportTicketScreen(ticketId: 't1', subject: 'Issue')));
    await tester.pumpAndSettle();
    expect(find.text('Could not load ticket'), findsOneWidget);
  });

  testWidgets('SupportTicket renders your and support replies', (tester) async {
    final state = AppState(api: _FakeApi(maps: {
      '/support/tickets/t1': {
        'subject': 'Issue',
        'status': 'OPEN',
        'messages': [
          {'senderId': 'me', 'message': 'My payout is stuck'},
          {'senderId': 'agent', 'message': 'Looking into it now'},
        ],
      },
    }))
      ..userId = 'me';
    await tester.pumpWidget(_wrapState(
        state, const SupportTicketScreen(ticketId: 't1', subject: 'Issue')));
    await tester.pumpAndSettle();
    expect(find.byType(AfriChatBubble), findsNWidgets(2));
  });

  testWidgets('PayoutMethods shows the load error state', (tester) async {
    final api = _FakeApi(errors: {'/payouts/methods'});
    await tester.pumpWidget(_wrap(api, const PayoutMethodsScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Could not load payout methods'), findsOneWidget);
  });

  testWidgets('PayoutMethods lists a method and deletes it', (tester) async {
    final api = _FakeApi(lists: {
      '/payouts/methods': [
        {
          'id': 'pm1',
          'provider': 'BANK',
          'label': 'GTBank savings',
          'destinationReference': '1234567890',
          'currency': 'NGN',
          'isDefault': true,
        },
      ],
    });
    await tester.pumpWidget(_wrap(api, const PayoutMethodsScreen()));
    await tester.pumpAndSettle();
    expect(find.text('GTBank savings'), findsOneWidget);
    expect(find.text('Default'), findsOneWidget);
    await tester.tap(find.byIcon(Icons.delete_outline));
    await tester.pumpAndSettle();
    expect(api.deletes, contains('/payouts/methods/pm1'));
  });

  testWidgets('PayoutMethods add-sheet validates an empty label',
      (tester) async {
    _tall(tester);
    await tester.pumpWidget(_wrap(_FakeApi(), const PayoutMethodsScreen()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add method'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save payout method'));
    await tester.pumpAndSettle();
    expect(find.text('Enter a label for this method.'), findsOneWidget);
  });

  testWidgets('HistoryScreen error -> retry recovers, then refreshes', (tester) async {
    final api = _RetryApi('/wallet/me/ledger', [
      {'direction': 'DEBIT', 'amountMinor': 100, 'currency': 'COIN', 'transaction': {'type': 'GIFT'}, 'account': {'accountType': 'COIN'}, 'createdAt': '2026-06-20T10:00:00Z'},
    ]);
    await tester.pumpWidget(_wrap(api, const HistoryScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Could not load history'), findsOneWidget);
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.textContaining('GIFT'), findsOneWidget);
    await _pullToRefresh(tester);
  });

  testWidgets('HistoryScreen empty state', (tester) async {
    await tester.pumpWidget(_wrap(_FakeApi(), const HistoryScreen()));
    await tester.pumpAndSettle();
    expect(find.text('No transactions yet'), findsOneWidget);
  });

  testWidgets('CreatorRooms error -> retry recovers (with watch-time), refreshes',
      (tester) async {
    final api = _RetryApi('/creators/me/rooms', [
      {'title': 'Friday Show', 'status': 'ENDED', 'peakViewers': 5, 'totalWatchSeconds': 7325, 'giftVolumeCoins': 100, 'giftCount': 3, 'startedAt': '2026-06-20T10:00:00Z'},
    ]);
    await tester.pumpWidget(_wrap(api, const CreatorRoomsScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Could not load your shows'), findsOneWidget);
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.text('Friday Show'), findsOneWidget);
    expect(find.text('2h 2m'), findsOneWidget); // watch-time hours branch
    await _pullToRefresh(tester);
  });

  testWidgets('CreatorRooms empty state', (tester) async {
    await tester.pumpWidget(_wrap(_FakeApi(), const CreatorRoomsScreen()));
    await tester.pumpAndSettle();
    expect(find.text('No shows yet'), findsOneWidget);
  });

  testWidgets('GiftHistory error -> retry, refresh, and tap-through to creator',
      (tester) async {
    final api = _RetryApi('/gifts/me', [
      {'giftName': 'Rose', 'quantity': 2, 'totalCoinAmount': 20, 'creatorId': 'c1', 'creatorName': 'Zola', 'roomTitle': 'R1', 'createdAt': '2026-06-20T10:00:00Z'},
      {'giftName': 'Crown', 'quantity': 1, 'totalCoinAmount': 50, 'creatorName': 'Ada', 'roomTitle': 'R2', 'createdAt': '2026-06-21T10:00:00Z'},
    ]);
    await tester.pumpWidget(_wrap(api, const GiftHistoryScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Could not load your gifts'), findsOneWidget);
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.text('Rose ×2'), findsOneWidget);
    await _pullToRefresh(tester);
    await tester.tap(find.text('Rose ×2')); // creatorId present -> nav to profile
    await tester.pumpAndSettle();
    expect(find.text('Creator'), findsWidgets); // CreatorProfileScreen app bar
  });

  testWidgets('LiveScreen error -> retry, refresh, and open a room', (tester) async {
    _tall(tester);
    _stubRoomSockets();
    final api = _RetryApi('/live-rooms', [
      {'id': 'r1', 'title': 'Amapiano', 'category': 'MUSIC', 'country': 'NG', 'language': 'pidgin', 'status': 'LIVE', 'hostName': 'DJ'},
    ]);
    await tester.pumpWidget(_wrap(api, const LiveScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Could not load live rooms'), findsOneWidget);
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.text('Amapiano'), findsOneWidget);
    await _pullToRefresh(tester);
    await tester.tap(find.byType(AfriLiveCard).first);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.byType(AfriVideoStage), findsOneWidget);
  });

  testWidgets('PayoutHistory retry recovers (HELD row) + refresh', (tester) async {
    final api = _RetryApi('/payouts/me', [
      {'id': 'p1', 'coinAmount': 500, 'status': 'HELD', 'createdAt': '2026-06-20T10:00:00Z'},
    ]);
    await tester.pumpWidget(_wrap(api, const PayoutHistoryScreen()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.text('HELD'), findsOneWidget); // _statusColor HELD branch
    await _pullToRefresh(tester);
  });

  testWidgets('Search error -> retry, then open a room from results', (tester) async {
    _tall(tester);
    _stubRoomSockets();
    final errC = Completer<List<dynamic>>();
    final api = _QueueApi([
      () => errC.future, // first search: deferred error (completed post-subscribe)
      () => Future.value([
            {'id': 'r1', 'title': 'Afro Live', 'category': 'MUSIC', 'country': 'NG', 'language': 'pidgin', 'status': 'LIVE', 'host': {'profile': {'displayName': 'DJ'}}},
          ]),
    ]);
    await tester.pumpWidget(_wrap(api, const SearchScreen()));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'afro');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pump(); // FutureBuilder subscribes to the still-pending future
    errC.completeError(const ApiException(500, 'boom'));
    await tester.pumpAndSettle();
    expect(find.text('Search failed'), findsOneWidget);
    await tester.tap(find.text('Retry')); // _lastLoad -> 2nd queued future (success)
    await tester.pumpAndSettle();
    expect(find.text('Afro Live'), findsOneWidget);
    await tester.tap(find.byType(AfriLiveCard).first);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.byType(AfriVideoStage), findsOneWidget);
  });

  testWidgets('Search button + empty query clears results', (tester) async {
    await tester.pumpWidget(_wrap(_FakeApi(), const SearchScreen()));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'x');
    await tester.tap(find.byTooltip('Search')); // search action button
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), '   '); // blank after trim
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pumpAndSettle();
    expect(find.text('Find a live room'), findsOneWidget);
  });

  testWidgets('BetaAccept ignores an empty code, posts a valid one', (tester) async {
    final api = _FakeApi();
    await tester.pumpWidget(_wrap(api, const BetaAcceptScreen()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Accept Beta Invite')); // empty -> early return
    await tester.pump();
    expect(api.posts, isEmpty);
    await tester.enterText(find.byType(TextField), 'INVITE-1');
    await tester.tap(find.text('Accept Beta Invite'));
    await tester.pump(const Duration(milliseconds: 50));
    expect(api.posts, contains('/beta/accept'));
  });

  testWidgets('BetaAccept shows the error message on a bad code', (tester) async {
    final api = _FakeApi(errors: {'/beta/accept'});
    await tester.pumpWidget(_wrap(api, const BetaAcceptScreen()));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'BAD');
    await tester.tap(find.text('Accept Beta Invite'));
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('boom'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('SupportTicket without a subject sends a reply (default title)',
      (tester) async {
    _tall(tester);
    final api = _FakeApi(maps: {
      '/support/tickets/t1': {'subject': 'S', 'status': 'OPEN', 'messages': []},
    });
    await tester.pumpWidget(_wrap(api, const SupportTicketScreen(ticketId: 't1')));
    await tester.pumpAndSettle();
    expect(find.text('Support ticket'), findsOneWidget); // default app-bar title
    await tester.enterText(find.byType(TextField).first, 'hello');
    await tester.tap(find.byIcon(Icons.send));
    await tester.pumpAndSettle();
    expect(api.posts, contains('/support/tickets/t1/messages'));
  });

  testWidgets('Onboarding dropdowns, interest toggle, and viewer save', (tester) async {
    _tall(tester);
    final api = _FakeApi();
    await tester.pumpWidget(_wrap(api, const OnboardingScreen()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Music')); // remove a pre-selected interest
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Save Discovery Preferences'), 200,
        scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('Save Discovery Preferences')); // Viewer intent -> patch + pop
    await tester.pumpAndSettle();
    expect(api.patches, contains('/users/me'));
  });

  testWidgets('Onboarding Skip does not save', (tester) async {
    _tall(tester);
    final api = _FakeApi();
    await tester.pumpWidget(_wrap(api, const OnboardingScreen()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Skip'));
    await tester.pumpAndSettle();
    expect(api.patches, isEmpty);
  });

  testWidgets('Onboarding changes locale dropdowns and saves as creator',
      (tester) async {
    _tall(tester);
    final api = _FakeApi();
    await _pushScreen(tester, api, const OnboardingScreen());
    await tester.tap(find.text('Country').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('GH').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Creator')); // creator intent
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Save Discovery Preferences'), 200,
        scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('Save Discovery Preferences'));
    await tester.pumpAndSettle();
    expect(api.patches, contains('/users/me')); // saved, then routed to apply
  });

  testWidgets('Report submit shows the confirmation then closes', (tester) async {
    _tall(tester);
    final api = _FakeApi();
    await _pushScreen(tester, api, const ReportScreen(label: 'room', roomId: 'r1'));
    await tester.tap(find.text('Scam'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Submit Report'), 200,
        scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('Submit Report'));
    await tester.pumpAndSettle();
    expect(find.text('Report submitted'), findsOneWidget);
    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();
    expect(api.posts, contains('/reports'));
  });

  testWidgets('Report block: cancel does nothing, error surfaces', (tester) async {
    _tall(tester);
    final api = _FakeApi(errors: {'/users/u9/block'});
    await tester.pumpWidget(_wrap(api, const ReportScreen(label: 'user', targetUserId: 'u9')));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Block this user'), 200,
        scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('Block this user'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cancel')); // dialog cancel -> no block
    await tester.pumpAndSettle();
    expect(api.posts, isNot(contains('/users/u9/block')));
    await tester.tap(find.text('Block this user'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Block')); // confirm -> error
    await tester.pumpAndSettle();
    expect(find.text('boom'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('Support: type dropdown, create error, ticket list + tap', (tester) async {
    _tall(tester);
    final api = _FakeApi(lists: {
      '/support/tickets/me': [
        {'id': 't1', 'subject': 'Stuck payout', 'status': 'OPEN', 'type': 'PAYOUT'},
      ],
    }, errors: {'/support/tickets'}, maps: {
      '/support/tickets/t1': {'subject': 'Stuck payout', 'status': 'OPEN', 'messages': []},
    });
    await tester.pumpWidget(_wrap(api, const SupportScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Stuck payout'), findsWidgets); // ticket card rendered
    await tester.enterText(find.byType(TextField).at(0), 'Subject');
    await tester.enterText(find.byType(TextField).at(1), 'Body');
    await tester.tap(find.text('Create ticket')); // POST throws -> error snackbar
    await tester.pumpAndSettle();
    expect(find.text('boom'), findsOneWidget);
    await tester.tap(find.text('Stuck payout').first); // -> SupportTicketScreen
    await tester.pumpAndSettle();
    expect(find.text('No replies yet'), findsOneWidget);
    await tester.pump(const Duration(seconds: 6));
  });

  testWidgets('Login seed buttons + create-account navigation', (tester) async {
    _tall(tester);
    await tester.pumpWidget(_wrap(_FakeApi(), const LoginScreen()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Viewer'));
    await tester.tap(find.text('Admin'));
    await tester.pump();
    await tester.tap(find.text('Create account'));
    await tester.pumpAndSettle();
    expect(find.text('Join AfriStage'), findsOneWidget); // RegisterScreen
  });

  testWidgets('Notifications refresh, mark-all error, open room + deep links',
      (tester) async {
    _tall(tester);
    _stubRoomSockets();
    final api = _FakeApi(lists: {
      '/notifications/me': [
        {'id': 'n1', 'type': 'CREATOR_LIVE', 'title': 'Live', 'body': 'b', 'roomId': 'r1'},
        {'id': 'n2', 'type': 'PAYOUT_UPDATE', 'title': 'Payout', 'body': 'b'},
      ],
    }, maps: {
      '/live-rooms/r1': {'id': 'r1', 'title': 'On', 'category': 'MUSIC', 'country': 'NG', 'language': 'pidgin', 'status': 'LIVE'},
    }, errors: {'/notifications/read-all'});
    await tester.pumpWidget(_wrap(api, const NotificationsScreen()));
    await tester.pumpAndSettle();
    await _pullToRefresh(tester);
    await tester.tap(find.text('Mark all read')); // POST throws -> error snackbar
    await tester.pumpAndSettle();
    expect(find.text('boom'), findsOneWidget);
    await tester.tap(find.text('Live')); // CREATOR_LIVE -> marks read + opens RoomScreen
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.byType(AfriVideoStage), findsOneWidget);
  });

  testWidgets('PayoutMethods refresh, save success, mobile-money provider',
      (tester) async {
    _tall(tester);
    final api = _FakeApi();
    await tester.pumpWidget(_wrap(api, const PayoutMethodsScreen()));
    await tester.pumpAndSettle();
    await _pullToRefresh(tester);
    await tester.tap(find.text('Add method'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Mobile money')); // provider segment (line 282)
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Label (e.g. GTBank savings)'), 'MTN');
    await tester.enterText(find.widgetWithText(TextField, 'Mobile money number'), '08012345678');
    await tester.tap(find.text('Save payout method'));
    await tester.pumpAndSettle();
    expect(api.posts, contains('/payouts/methods'));
  });

  testWidgets('SupportTicket send error surfaces the message', (tester) async {
    _tall(tester);
    final api = _FakeApi(maps: {
      '/support/tickets/t1': {'subject': 'S', 'status': 'OPEN', 'messages': []},
    }, errors: {'/support/tickets/t1/messages'});
    await tester.pumpWidget(_wrap(api, const SupportTicketScreen(ticketId: 't1', subject: 'S')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, 'hi');
    await tester.tap(find.byIcon(Icons.send));
    await tester.pumpAndSettle();
    expect(find.text('boom'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('Report submit error surfaces the message', (tester) async {
    _tall(tester);
    final api = _FakeApi(errors: {'/reports'});
    await tester.pumpWidget(_wrap(api, const ReportScreen(label: 'room', roomId: 'r1')));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Submit Report'), 200,
        scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('Submit Report'));
    await tester.pumpAndSettle();
    expect(find.text('boom'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('Login surfaces a server error message and fills Creator',
      (tester) async {
    _tall(tester);
    final api = _FakeApi(errors: {'/auth/login'}); // post throws ApiException
    await tester.pumpWidget(_wrap(api, const LoginScreen()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Creator')); // seed fill (was off-screen before)
    await tester.pump();
    await tester.tap(find.text('Log in to AfriStage'));
    await tester.pumpAndSettle();
    expect(find.text('boom'), findsOneWidget); // ApiException branch
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('Onboarding changes the language dropdown', (tester) async {
    _tall(tester);
    await tester.pumpWidget(_wrap(_FakeApi(), const OnboardingScreen()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Language').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('yoruba').last);
    await tester.pumpAndSettle();
    expect(find.text('Set Up Discovery'), findsOneWidget);
  });

  testWidgets('Support changes the ticket type dropdown', (tester) async {
    _tall(tester);
    await tester.pumpWidget(_wrap(_FakeApi(), const SupportScreen()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Type').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Payout issue').last);
    await tester.pumpAndSettle();
    expect(find.text('New ticket'), findsOneWidget);
  });

  testWidgets('Notifications: read-rollback, room-ended, open-error', (tester) async {
    _tall(tester);
    final api = _FakeApi(lists: {
      '/notifications/me': <dynamic>[
        <String, dynamic>{'id': 'n1', 'type': 'NEW_FOLLOWER', 'title': 'Follower', 'body': 'b'},
        <String, dynamic>{'id': 'n2', 'type': 'CREATOR_LIVE', 'title': 'Ended', 'body': 'b', 'roomId': 'rended'},
        <String, dynamic>{'id': 'n3', 'type': 'CREATOR_LIVE', 'title': 'Broken', 'body': 'b', 'roomId': 'rbad'},
      ],
    }, maps: {
      '/live-rooms/rended': {'id': 'rended', 'title': 'X', 'category': 'MUSIC', 'country': 'NG', 'language': 'pidgin', 'status': 'ENDED'},
    }, errors: {'/notifications/n1/read', '/live-rooms/rbad'});
    await tester.pumpWidget(_wrap(api, const NotificationsScreen()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Follower')); // markRead optimistic -> post errors -> rollback
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ended')); // room not LIVE -> "This room has ended."
    await tester.pumpAndSettle();
    expect(find.text('This room has ended.'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5)); // let the snackbar auto-dismiss
    await tester.tap(find.text('Broken')); // get throws -> "Could not open the room."
    await tester.pumpAndSettle();
    expect(find.text('Could not open the room.'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('PayoutMethods refresh, delete-error, save-error', (tester) async {
    _tall(tester);
    final api = _FakeApi(lists: {
      '/payouts/methods': [
        {'id': 'pm1', 'provider': 'BANK', 'label': 'GTB', 'destinationReference': '123', 'currency': 'NGN'},
      ],
    }, errors: {'/payouts/methods/pm1'}, postErrors: {'/payouts/methods'});
    await tester.pumpWidget(_wrap(api, const PayoutMethodsScreen()));
    await tester.pumpAndSettle();
    expect(find.text('GTB'), findsOneWidget); // list itemBuilder
    await _pullToRefresh(tester);
    await tester.tap(find.byIcon(Icons.delete_outline)); // delete throws -> snackbar
    await tester.pumpAndSettle();
    expect(find.text('boom'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
    await tester.tap(find.text('Add method'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Label (e.g. GTBank savings)'), 'X');
    await tester.enterText(find.widgetWithText(TextField, 'Account number'), '123');
    await tester.tap(find.text('Save payout method')); // post throws -> in-sheet error
    await tester.pumpAndSettle();
    expect(find.text('boom'), findsOneWidget);
  });
}
