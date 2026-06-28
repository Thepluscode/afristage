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
}
