import 'package:afristage_mobile/core/app_state.dart';
import 'package:afristage_mobile/models/models.dart';
import 'package:afristage_mobile/screens/beta_accept_screen.dart';
import 'package:afristage_mobile/screens/report_screen.dart';
import 'package:afristage_mobile/screens/wallet_screen.dart';
import 'package:afristage_mobile/widgets/afri_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

Widget wrap(Widget child) => ChangeNotifierProvider(
      create: (_) => AppState(),
      child: MaterialApp(home: child),
    );

void main() {
  testWidgets('beta accept screen renders code field + accept button', (tester) async {
    await tester.pumpWidget(wrap(const BetaAcceptScreen()));
    expect(find.text('Invite code'), findsOneWidget);
    expect(find.text('Accept Beta Invite', skipOffstage: false), findsOneWidget);
  });

  testWidgets('report screen renders reason dropdown + submit', (tester) async {
    await tester.pumpWidget(wrap(const ReportScreen(roomId: 'r1', label: 'room')));
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

  testWidgets('end room confirmation exposes safe cancel and destructive action',
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
