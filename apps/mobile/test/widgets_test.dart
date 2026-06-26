import 'package:afristage_mobile/widgets/afri_live.dart';
import 'package:afristage_mobile/widgets/afri_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _host(Widget child) => MaterialApp(home: Scaffold(body: Center(child: child)));

void main() {
  testWidgets('AfriBalanceCard renders fields and fires button callbacks',
      (tester) async {
    var paid = false, txns = false;
    await tester.pumpWidget(_host(AfriBalanceCard(
      label: 'Available balance',
      value: r'$620.40',
      currencyLabel: 'USD',
      primaryLabel: 'Payout',
      secondaryLabel: 'Transactions',
      onPrimary: () => paid = true,
      onSecondary: () => txns = true,
    )));

    expect(find.text('Available balance'), findsOneWidget);
    expect(find.text(r'$620.40'), findsOneWidget);
    expect(find.text('USD'), findsOneWidget);

    await tester.tap(find.text('Payout'));
    await tester.tap(find.text('Transactions'));
    expect(paid, isTrue);
    expect(txns, isTrue);
  });

  testWidgets('AfriMenuRow renders title + subtitle and is tappable',
      (tester) async {
    var tapped = false;
    await tester.pumpWidget(_host(AfriMenuRow(
      icon: Icons.card_giftcard,
      title: 'Gifts sent',
      subtitle: 'Every gift you have sent',
      onTap: () => tapped = true,
    )));

    expect(find.text('Gifts sent'), findsOneWidget);
    expect(find.text('Every gift you have sent'), findsOneWidget);
    await tester.tap(find.text('Gifts sent'));
    expect(tapped, isTrue);
  });

  testWidgets('AfriCreatorAvatar shows name and compact live count',
      (tester) async {
    await tester.pumpWidget(_host(
        const AfriCreatorAvatar(name: 'Zola', viewerCount: 3200)));
    expect(find.text('Zola'), findsOneWidget);
    expect(find.text('3.2K live'), findsOneWidget);
  });

  testWidgets('AfriHeroLive shows title, creator, Join CTA + red Live now pill',
      (tester) async {
    var joined = false;
    await tester.pumpWidget(_host(SizedBox(
      width: 360,
      child: AfriHeroLive(
        title: 'Friday Afrobeats',
        category: 'Music',
        creator: 'Kofi',
        onJoin: () => joined = true,
      ),
    )));
    expect(find.text('Friday Afrobeats'), findsOneWidget);
    expect(find.textContaining('Kofi'), findsOneWidget);
    expect(find.text('Live now'), findsOneWidget);
    await tester.tap(find.text('Join now'));
    expect(joined, isTrue);
  });

  testWidgets('AfriViewerPill formats the count', (tester) async {
    await tester.pumpWidget(_host(const AfriViewerPill(count: 1500)));
    expect(find.text('1.5K'), findsOneWidget);
  });

  testWidgets('AfriCoinPill shows the coin balance', (tester) async {
    await tester.pumpWidget(_host(const AfriCoinPill(coins: 250)));
    expect(find.textContaining('250'), findsOneWidget);
  });
}
