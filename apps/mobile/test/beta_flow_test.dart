import 'package:afristage_mobile/core/afri_theme.dart';
import 'package:afristage_mobile/core/app_state.dart';
import 'package:afristage_mobile/core/api_client.dart';
import 'package:afristage_mobile/models/models.dart';
import 'package:afristage_mobile/screens/beta_accept_screen.dart';
import 'package:afristage_mobile/screens/feed_screen.dart';
import 'package:afristage_mobile/screens/report_screen.dart';
import 'package:afristage_mobile/screens/wallet_screen.dart';
import 'package:afristage_mobile/widgets/afri_live.dart';
import 'package:afristage_mobile/widgets/afri_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

Widget wrap(Widget child) => ChangeNotifierProvider(
      create: (_) => AppState(),
      child: MaterialApp(home: child),
    );

Widget wrapWithState(AppState state, Widget child) => ChangeNotifierProvider(
      create: (_) => state,
      child: MaterialApp(home: child),
    );

class _FeedApiClient extends ApiClient {
  @override
  Future<Map<String, dynamic>> get(String path) async {
    if (path == '/notifications/unread-count') {
      return {'count': 3};
    }
    return {};
  }

  @override
  Future<List<dynamic>> getList(String path) async {
    if (path == '/live-rooms') {
      return [
        {
          'id': 'room-1',
          'title': 'Friday Afrobeats Live',
          'category': 'Music',
          'country': 'NG',
          'language': 'English',
          'status': 'LIVE',
          'viewerCount': 1250,
          'host': {
            'id': 'host-1',
            'profile': {'displayName': 'King Bayo'},
            'creatorProfile': {'stageName': 'King Bayo'}
          }
        }
      ];
    }
    if (path == '/live-rooms/upcoming') {
      return [];
    }
    return [];
  }
}

void main() {
  testWidgets('beta accept screen renders code field + accept button',
      (tester) async {
    await tester.pumpWidget(wrap(const BetaAcceptScreen()));
    expect(find.text('Invite code'), findsOneWidget);
    expect(
        find.text('Accept Beta Invite', skipOffstage: false), findsOneWidget);
  });

  testWidgets('report screen renders reason dropdown + submit', (tester) async {
    await tester
        .pumpWidget(wrap(const ReportScreen(roomId: 'r1', label: 'room')));
    expect(find.text('Report room'), findsOneWidget);
    expect(find.text('Select reason'), findsOneWidget);
    await tester.drag(find.byType(ListView), const Offset(0, -900));
    await tester.pump();
    expect(find.text('Submit Report'), findsOneWidget);
  });

  testWidgets('wallet separates coins, earnings, payout hold, and history',
      (tester) async {
    await tester.pumpWidget(wrap(const WalletScreen()));
    expect(find.text('Wallet'), findsOneWidget);
    expect(find.text('Creator earnings'), findsOneWidget);
    expect(find.text('Payout hold'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Buy coins'), 300);
    expect(find.text('Buy coins'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Ledger and history'), 300);
    expect(find.text('Ledger and history'), findsOneWidget);
  });

  testWidgets('feed renders gift wallet quick actions from home mockup',
      (tester) async {
    final state = AppState(api: _FeedApiClient())
      ..wallet = const Wallet(
          coinBalance: 128450, earningBalance: 0, payoutHoldBalance: 0)
      ..role = 'CREATOR';

    await tester.pumpWidget(wrapWithState(state, const FeedScreen()));
    await tester.pump();

    expect(find.text('Go Live'), findsOneWidget);
    expect(find.byIcon(Icons.add), findsOneWidget);
    expect(find.text('Gift Wallet'), findsOneWidget);
    expect(find.text('Gift Balance'), findsOneWidget);
    expect(find.text('128,450'), findsOneWidget);
    expect(find.text('Send Gift'), findsOneWidget);
    expect(find.text('Top Up'), findsOneWidget);
    expect(find.text('History'), findsOneWidget);
    expect(find.text('Friday Afrobeats Live'), findsWidgets);
  });

  testWidgets('gift drawer shows balance, buy coins, prices, and send action',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: AfriGiftDrawer(
            gifts: const [Gift(id: 'g1', name: 'Spotlight', coinPrice: 50)],
            coinBalance: 100,
            onGiftSelected: (_) {},
            onBuyCoins: () {},
          ),
        ),
      ),
    );

    expect(find.text('Send Gift'), findsOneWidget);
    expect(find.text('Balance: 100 coins'), findsOneWidget);
    expect(find.text('Spotlight'), findsWidgets);
    expect(find.text('50 coins'), findsWidgets);
    expect(find.text('Buy coins'), findsOneWidget);
    expect(find.text('Send'), findsOneWidget);
  });

  testWidgets('live card uses full-bleed design overlays', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: Center(
          child: AfriLiveCard(
            title: 'Friday Afrobeats Live',
            category: 'Music',
            creator: 'Zola Kim',
            country: 'NG',
            viewerCount: 3200,
          ),
        ),
      ),
    ));

    expect(find.text('LIVE'), findsOneWidget);
    expect(find.byIcon(Icons.visibility), findsOneWidget);
    expect(find.text('Friday Afrobeats Live'), findsOneWidget);
    expect(find.textContaining('Zola Kim'), findsOneWidget);
  });

  testWidgets('profile header uses circular avatar ring treatment',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: AfriProfileHeader(
          role: 'CREATOR',
          userId: 'user-123456789',
          isCreator: true,
        ),
      ),
    ));

    expect(find.byType(CircleAvatar), findsOneWidget);
    expect(find.text('Creator'), findsOneWidget);
    expect(find.text('Data saver ready'), findsOneWidget);
  });

  testWidgets('profile stat strip shows coins, available USD, and account type',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: Row(children: [
          Expanded(
              child: AfriStatTile(
                  label: 'Coins',
                  value: '150',
                  icon: Icons.monetization_on,
                  accent: AfriColors.teal)),
          Expanded(
              child: AfriStatTile(
                  label: 'Available',
                  value: r'$12.00',
                  icon: Icons.trending_up,
                  accent: AfriColors.success)),
          Expanded(
              child: AfriStatTile(
                  label: 'Account',
                  value: 'Creator',
                  icon: Icons.verified,
                  accent: AfriColors.purple)),
        ]),
      ),
    ));

    expect(find.text('Coins'), findsOneWidget);
    expect(find.text('150'), findsOneWidget);
    expect(find.text(r'$12.00'), findsOneWidget);
    expect(find.text('Account'), findsOneWidget);
  });

  testWidgets('live room state banners describe reconnecting and ended states',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Column(
        children: [
          AfriRoomStateBanner(state: AfriRoomState.reconnectingSocket),
          AfriRoomStateBanner(state: AfriRoomState.ended),
        ],
      ),
    ));

    expect(find.text('Reconnecting chat'), findsOneWidget);
    expect(find.text('Room ended'), findsOneWidget);
  });

  testWidgets(
      'end room confirmation exposes safe cancel and destructive action',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: AfriEndRoomConfirmation(onCancel: () {}, onConfirm: () {}),
      ),
    ));

    expect(find.text('End live room?'), findsOneWidget);
    expect(find.text('Keep Room Live'), findsOneWidget);
    expect(find.text('End Room'), findsOneWidget);
  });
}
