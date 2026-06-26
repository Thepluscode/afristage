import 'package:afristage_mobile/core/api_client.dart';
import 'package:afristage_mobile/core/app_state.dart';
import 'package:afristage_mobile/screens/creator_profile_screen.dart';
import 'package:afristage_mobile/screens/gift_history_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

/// Configurable fake: canned get/getList responses by path; records writes.
class _FakeApi extends ApiClient {
  _FakeApi({this.lists = const {}, this.maps = const {}});
  final Map<String, List<dynamic>> lists;
  final Map<String, Map<String, dynamic>> maps;
  final posts = <String>[];
  final deletes = <String>[];

  @override
  Future<List<dynamic>> getList(String path) async => lists[path] ?? const [];

  @override
  Future<Map<String, dynamic>> get(String path) async => maps[path] ?? const {};

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
}
