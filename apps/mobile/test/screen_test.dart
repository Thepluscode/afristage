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
import 'package:afristage_mobile/screens/notifications_screen.dart';
import 'package:afristage_mobile/screens/onboarding_screen.dart';
import 'package:afristage_mobile/screens/payout_history_screen.dart';
import 'package:afristage_mobile/screens/payout_methods_screen.dart';
import 'package:afristage_mobile/screens/register_screen.dart';
import 'package:afristage_mobile/screens/report_screen.dart';
import 'package:afristage_mobile/screens/support_screen.dart';
import 'package:afristage_mobile/screens/support_ticket_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

/// Configurable fake: canned get/getList responses by path; records writes.
/// Paths in [errors] throw, so error-state branches are testable.
class _FakeApi extends ApiClient {
  _FakeApi({this.lists = const {}, this.maps = const {}, this.errors = const {}});
  final Map<String, List<dynamic>> lists;
  final Map<String, Map<String, dynamic>> maps;
  final Set<String> errors;
  final posts = <String>[];
  final deletes = <String>[];

  @override
  Future<List<dynamic>> getList(String path) async {
    if (errors.contains(path)) throw const ApiException(500, 'boom');
    return lists[path] ?? const [];
  }

  @override
  Future<Map<String, dynamic>> get(String path) async {
    if (errors.contains(path)) throw const ApiException(500, 'boom');
    return maps[path] ?? const {};
  }

  @override
  Future<Map<String, dynamic>> post(String path, [Map<String, dynamic>? body]) async {
    posts.add(path);
    return const {};
  }

  @override
  Future<Map<String, dynamic>> delete(String path) async {
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
}
