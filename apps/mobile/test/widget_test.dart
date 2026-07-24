import 'package:afristage_mobile/core/app_state.dart';
import 'package:afristage_mobile/screens/login_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

void main() {
  testWidgets('login screen renders title, button, and seeded accounts',
      (tester) async {
    await tester.pumpWidget(
      ChangeNotifierProvider(
        create: (_) => AppState(),
        child: const MaterialApp(home: LoginScreen()),
      ),
    );

    expect(find.byIcon(CupertinoIcons.antenna_radiowaves_left_right),
        findsOneWidget);
    expect(find.text('Welcome back to AfriStage'), findsOneWidget);
    expect(find.text('Log in to AfriStage'), findsOneWidget);
    expect(find.text('Seeded test accounts'), findsOneWidget);
    expect(find.text('Viewer'), findsOneWidget);
    expect(find.text('Creator'), findsOneWidget);
    expect(find.text('Admin'), findsOneWidget);
  });
}
