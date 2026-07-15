import 'package:afristage_mobile/core/api_client.dart';
import 'package:afristage_mobile/core/app_state.dart';
import 'package:afristage_mobile/models/models.dart';
import 'package:afristage_mobile/screens/report_screen.dart';
import 'package:afristage_mobile/screens/room_screen.dart';
import 'package:afristage_mobile/widgets/afri_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

/// Fake socket: captures every `on(event, handler)` (including the connect/
/// disconnect extension methods, which delegate to `on`) so a test can fire
/// server events. connect/emit/dispose are no-ops.
class _FakeSocket implements io.Socket {
  final handlers = <String, Function>{};
  void fire(String event, [dynamic data]) => handlers[event]?.call(data);

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

class _RoomApi extends ApiClient {
  _RoomApi({
    this.failJoin = false,
    this.gifts = const [],
    this.topGifters = const [],
    this.failGifts = false,
    this.failGiftPost = false,
    this.failFollow = false,
    this.failEnd = false,
    this.failMute = false,
    this.giftResult = const {},
  });
  final bool failJoin;
  final List<Map<String, dynamic>> gifts;
  final List<Map<String, dynamic>> topGifters;
  final bool failGifts;
  final bool failGiftPost;
  final bool failFollow;
  final bool failEnd;
  final bool failMute;
  final Map<String, dynamic> giftResult;
  final posts = <String>[];
  final deletes = <String>[];

  @override
  Future<Map<String, dynamic>> post(String path,
      [Map<String, dynamic>? body]) async {
    if (failJoin && path.endsWith('/join-token')) {
      throw const ApiException(503, 'room offline');
    }
    if (failGiftPost && path.endsWith('/gifts')) {
      throw const ApiException(402, 'gift declined');
    }
    if (failEnd && path.endsWith('/end')) {
      throw const ApiException(500, 'end failed');
    }
    if (failMute && path.contains('/mute/')) {
      throw const ApiException(500, 'mute failed');
    }
    if (failFollow && path.endsWith('/follow')) {
      throw const ApiException(500, 'follow failed');
    }
    posts.add(path);
    if (path.endsWith('/join-token')) {
      return {'livekitUrl': 'ws://x', 'viewerToken': 'tok'};
    }
    if (path.endsWith('/gifts')) return giftResult;
    return const {};
  }

  @override
  Future<Map<String, dynamic>> delete(String path) async {
    if (failFollow && path.endsWith('/follow')) {
      throw const ApiException(500, 'unfollow failed');
    }
    deletes.add(path);
    return const {};
  }

  @override
  Future<Map<String, dynamic>> get(String path) async => path == '/wallet/me'
      ? {'coinBalance': 1000, 'earningBalance': 0, 'payoutHoldBalance': 0}
      : const {};

  @override
  Future<List<dynamic>> getList(String path) async {
    if (path == '/gifts') {
      if (failGifts) throw const ApiException(500, 'gift list down');
      return gifts;
    }
    if (path.endsWith('/top-gifters')) return topGifters;
    return const [];
  }
}

class _TopGiftersDownApi extends _RoomApi {
  @override
  Future<List<dynamic>> getList(String path) async {
    if (path.endsWith('/top-gifters')) {
      throw const ApiException(500, 'leaderboard down');
    }
    return super.getList(path);
  }
}

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

void main() {
  testWidgets('viewer room renders the stage and reacts to server events',
      (tester) async {
    final socket = _FakeSocket();
    final state = AppState(api: _RoomApi())..userId = 'v1';
    await tester.pumpWidget(_wrap(state,
        RoomScreen(room: _room(), socketFactory: (uri, opts) => socket)));
    // Let initState's async _connect (join-token + handler registration) settle.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.byType(AfriVideoStage), findsOneWidget);

    // Drive the socket lifecycle + room events through the captured handlers.
    socket.fire('connect', null);
    socket.fire('room.viewer_count_updated', {'count': 99});
    socket.fire('gift.sent', {'giftName': 'Rose', 'quantity': 2});
    socket.fire(
        'chat.message_created', {'senderName': 'Zola', 'message': 'hello'});
    socket.fire('reaction.sent', {'reactionType': 'heart'});
    socket.fire('connect_error', null);
    socket.fire('disconnect', null);
    socket.fire('connect', null); // reconnect -> "rejoined" banner branch
    socket.fire('user.muted', {'userId': 'v1'});
    socket.fire('room.suspended', null);
    await tester.pump();

    // Ending the room shows a snackbar.
    socket.fire('room.ended', null);
    await tester.pump();
    expect(find.text('This room has ended.'), findsOneWidget);

    // Flush pending banner/snackbar auto-dismiss timers before teardown.
    await tester.pump(const Duration(seconds: 6));
  });

  testWidgets('viewer can type chat and open the gift sheet', (tester) async {
    _tall(tester);
    final socket = _FakeSocket();
    final state = AppState(api: _RoomApi())..userId = 'v1';
    await tester.pumpWidget(_wrap(state,
        RoomScreen(room: _room(), socketFactory: (uri, opts) => socket)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    await tester.enterText(find.byType(TextField).first, 'hello room');
    await tester.testTextInput.receiveAction(TextInputAction.done); // onSend
    await tester.pump();

    await tester.tap(find.byIcon(Icons.card_giftcard)); // onGift -> sheet
    await tester.pumpAndSettle();
    expect(find.byType(AfriGiftDrawer), findsOneWidget);
  });

  // Regression (staging, 2026-07-14): the only publish affordance lived inside
  // the stage, where the host layout scales it to nothing on short screens —
  // the host could not go live. The controls panel now carries the button.
  testWidgets('host panel Go Live button starts publishing (video builder invoked)',
      (tester) async {
    _tall(tester);
    final original = debugRoomVideoBuilder;
    String? builtUrl;
    bool? builtPublish;
    debugRoomVideoBuilder = (u, t, p) {
      builtUrl = u;
      builtPublish = p;
      return const Text('VIDEO-LIVE');
    };
    addTearDown(() => debugRoomVideoBuilder = original);
    final socket = _FakeSocket();
    final api = _RoomApi();
    final state = AppState(api: api)..userId = 'h1';
    await tester.pumpWidget(_wrap(
        state,
        RoomScreen(
            room: _room(),
            hostToken: 'htok',
            livekitUrl: 'ws://x',
            socketFactory: (uri, opts) => socket)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    await tester.tap(find.text('Go Live with Camera + Mic').last);
    await tester.pumpAndSettle();
    expect(find.text('VIDEO-LIVE'), findsOneWidget);
    expect(builtUrl, 'ws://x');
    expect(builtPublish, isTrue); // host publishes, not subscribes
    // once live, the panel's publish button is gone
    expect(find.text('Go Live with Camera + Mic'), findsNothing);
  });

  testWidgets('host room renders host controls', (tester) async {
    // Tall surface: host controls + stage exceed the default 800px height.
    _tall(tester);
    final socket = _FakeSocket();
    final api = _RoomApi();
    final state = AppState(api: api)..userId = 'h1';
    await tester.pumpWidget(_wrap(
        state,
        RoomScreen(
            room: _room(),
            hostToken: 'htok',
            livekitUrl: 'ws://x',
            socketFactory: (uri, opts) => socket)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.byType(AfriVideoStage), findsOneWidget);
    expect(find.byType(AfriHostControlsPanel), findsOneWidget);

    // End the room: panel button -> confirmation dialog -> confirm -> POST /end.
    await tester.tap(find.text('End Room'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('End Room').last); // dialog confirm
    await tester.pumpAndSettle();
    expect(api.posts, contains('/live-rooms/r1/end'));
  });

  testWidgets('host can toggle camera, mic, chat, and mute with no viewer',
      (tester) async {
    _tall(tester);
    final socket = _FakeSocket();
    final state = AppState(api: _RoomApi())..userId = 'h1';
    await tester.pumpWidget(_wrap(
        state,
        RoomScreen(
            room: _room(),
            hostToken: 'htok',
            livekitUrl: 'ws://x',
            socketFactory: (uri, opts) => socket)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    await tester.tap(find.text('Camera on'));
    await tester.pump();
    expect(find.text('Camera off'), findsOneWidget);

    await tester.tap(find.text('Mic on'));
    await tester.pump();
    expect(find.text('Mic off'), findsOneWidget);

    await tester.tap(find.text('Mute user')); // no chat messages yet
    await tester.pump();
    expect(find.text('No recent viewer to mute yet.'), findsOneWidget);

    await tester.tap(find.text('Chat visible'));
    await tester.pump();
    expect(find.text('Chat hidden by host controls'), findsOneWidget);

    await tester.pump(const Duration(seconds: 6)); // flush snackbar timer
  });

  testWidgets('viewer follow posts to the creator follow endpoint',
      (tester) async {
    _tall(tester);
    final socket = _FakeSocket();
    final api = _RoomApi();
    final state = AppState(api: api)..userId = 'v1';
    await tester.pumpWidget(_wrap(state,
        RoomScreen(room: _room(), socketFactory: (uri, opts) => socket)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    await tester.tap(find.text('Follow'));
    await tester.pump();
    expect(api.posts, contains('/users/h1/follow'));
    expect(find.text('Following'), findsOneWidget);
  });

  testWidgets('viewer with no coins gets an insufficient-coins toast',
      (tester) async {
    _tall(tester);
    final socket = _FakeSocket();
    final api = _RoomApi(gifts: [
      {'id': 'g1', 'name': 'Rose', 'coinPrice': 50},
    ]);
    final state = AppState(api: api)
      ..userId = 'v1'; // wallet defaults to 0 coins
    await tester.pumpWidget(_wrap(state,
        RoomScreen(room: _room(), socketFactory: (uri, opts) => socket)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    await tester.tap(find.byIcon(Icons.card_giftcard)); // open gift sheet
    await tester.pumpAndSettle();
    await tester.tap(find.text('Rose').first); // ensure the gift is selected
    await tester.pumpAndSettle();
    await tester.tap(find.text('Send')); // confirm -> _sendGift
    await tester.pumpAndSettle();

    expect(api.posts, isNot(contains('/live-rooms/r1/gifts'))); // never charged
    await tester.pump(const Duration(seconds: 6));
  });

  testWidgets('viewer join-token failure is handled without crashing',
      (tester) async {
    _tall(tester);
    final api = _RoomApi(failJoin: true);
    final socket = _FakeSocket();
    final state = AppState(api: api)..userId = 'v1';
    await tester.pumpWidget(_wrap(state,
        RoomScreen(room: _room(), socketFactory: (uri, opts) => socket)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    // The join-token POST threw, so it was never recorded and the screen still
    // renders the stage (the _connect catch-block set _error and bailed out).
    expect(api.posts, isEmpty);
    expect(find.byType(AfriVideoStage), findsOneWidget);
  });

  testWidgets('viewer sends a gift (funded wallet)', (tester) async {
    _tall(tester);
    final socket = _FakeSocket();
    final api = _RoomApi(gifts: [
      {'id': 'g1', 'name': 'Rose', 'coinPrice': 50}
    ]);
    final state = AppState(api: api)
      ..userId = 'v1'
      ..wallet = const Wallet(
          coinBalance: 1000, earningBalance: 0, payoutHoldBalance: 0);
    await tester.pumpWidget(_wrap(
        state, RoomScreen(room: _room(), socketFactory: (u, o) => socket)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await tester.tap(find.byIcon(Icons.card_giftcard));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Rose').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Send'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(api.posts, contains('/live-rooms/r1/gifts'));
    await tester.pump(const Duration(seconds: 4));
  });

  testWidgets('viewer sends a reaction from the picker', (tester) async {
    _tall(tester);
    final socket = _FakeSocket();
    final state = AppState(api: _RoomApi())..userId = 'v1';
    await tester.pumpWidget(_wrap(
        state, RoomScreen(room: _room(), socketFactory: (u, o) => socket)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    socket.fire('connect', null); // so _connected -> reaction emits
    await tester.pump();
    await tester.tap(find.byType(AfriReactionButton));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Fire').last);
    await tester.pumpAndSettle();
    expect(find.byType(AfriReactionLayer), findsOneWidget);
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('viewer opens the creator profile and report', (tester) async {
    _tall(tester);
    final socket = _FakeSocket();
    final state = AppState(api: _RoomApi())..userId = 'v1';
    await tester.pumpWidget(_wrap(
        state, RoomScreen(room: _room(), socketFactory: (u, o) => socket)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await tester.tap(find.text('Zola')); // creator tap -> profile
    await tester.pumpAndSettle();
    expect(find.text('Creator'), findsWidgets);
  });

  testWidgets('viewer connects video (stubbed)', (tester) async {
    _tall(tester);
    final original = debugRoomVideoBuilder;
    debugRoomVideoBuilder = (u, t, p) => const Text('VIDEO-STUB');
    addTearDown(() => debugRoomVideoBuilder = original);
    final socket = _FakeSocket();
    final state = AppState(api: _RoomApi())..userId = 'v1';
    await tester.pumpWidget(_wrap(
        state, RoomScreen(room: _room(), socketFactory: (u, o) => socket)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await tester.tap(find.byIcon(Icons.play_arrow_rounded)); // viewer start
    await tester.pumpAndSettle();
    expect(find.text('VIDEO-STUB'), findsOneWidget);
  });

  testWidgets('host mutes the latest viewer after a chat message',
      (tester) async {
    _tall(tester);
    final socket = _FakeSocket();
    final api = _RoomApi();
    final state = AppState(api: api)..userId = 'h1';
    await tester.pumpWidget(_wrap(
        state,
        RoomScreen(
            room: _room(),
            hostToken: 'h',
            livekitUrl: 'ws://x',
            socketFactory: (u, o) => socket)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    socket.fire('chat.message_created', {
      'senderId': 'v2',
      'message': 'hey',
      'sender': {
        'profile': {'displayName': 'Vee'}
      }
    });
    await tester.pump();
    await tester.tap(find.text('Mute user'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(api.posts.any((p) => p.contains('/mute/')), isTrue);
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('top-gifter leaderboard renders from the backend',
      (tester) async {
    _tall(tester);
    final socket = _FakeSocket();
    final api = _RoomApi(topGifters: [
      {'displayName': 'Ada', 'totalCoins': 900},
      {'totalCoins': 100}, // missing name -> 'Supporter' fallback
    ]);
    final state = AppState(api: api)..userId = 'v1';
    await tester.pumpWidget(_wrap(
        state, RoomScreen(room: _room(), socketFactory: (u, o) => socket)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.textContaining('Ada'), findsWidgets);
  });

  testWidgets('leaderboard failure is non-fatal', (tester) async {
    _tall(tester);
    final socket = _FakeSocket();
    // getList('/top-gifters') is stubbed to throw via a subclass.
    final state = AppState(api: _TopGiftersDownApi())..userId = 'v1';
    await tester.pumpWidget(_wrap(
        state, RoomScreen(room: _room(), socketFactory: (u, o) => socket)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.byType(AfriVideoStage), findsOneWidget); // still renders
  });

  testWidgets('viewer can send a chat message once connected', (tester) async {
    _tall(tester);
    final socket = _FakeSocket();
    final state = AppState(api: _RoomApi())..userId = 'v1';
    await tester.pumpWidget(_wrap(
        state, RoomScreen(room: _room(), socketFactory: (u, o) => socket)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    socket.fire('connect', null); // enables the chat input
    await tester.pump();
    await tester.enterText(find.byType(TextField).first, '');
    await tester.testTextInput
        .receiveAction(TextInputAction.done); // empty -> no-op
    await tester.pump();
    await tester.enterText(find.byType(TextField).first, 'hi all');
    await tester.testTextInput.receiveAction(TextInputAction.done); // emits
    await tester.pump();
    expect(find.text('hi all'), findsNothing); // cleared after emit
  });

  testWidgets('other viewer muted + self banned events', (tester) async {
    final socket = _FakeSocket();
    final state = AppState(api: _RoomApi())..userId = 'v1';
    await tester.pumpWidget(_wrap(
        state, RoomScreen(room: _room(), socketFactory: (u, o) => socket)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    socket.fire('user.muted', {'userId': 'someone-else'}); // else branch
    await tester.pump();
    socket.fire('user.banned', {'userId': 'v1'}); // self banned
    await tester.pump();
    expect(find.byType(AfriRoomStateBanner), findsWidgets);
    await tester.pump(const Duration(seconds: 6));
  });

  testWidgets('viewer follow toggles on then off, with rollback on failure',
      (tester) async {
    _tall(tester);
    final socket = _FakeSocket();
    final api = _RoomApi();
    final state = AppState(api: api)..userId = 'v1';
    await tester.pumpWidget(_wrap(
        state, RoomScreen(room: _room(), socketFactory: (u, o) => socket)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await tester.tap(find.text('Follow'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(api.posts, contains('/users/h1/follow')); // followed
    await tester.tap(find.text('Following'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(api.deletes, contains('/users/h1/follow')); // unfollowed
  });

  testWidgets('follow failure rolls the button back', (tester) async {
    _tall(tester);
    final socket = _FakeSocket();
    final state = AppState(api: _RoomApi(failFollow: true))..userId = 'v1';
    await tester.pumpWidget(_wrap(
        state, RoomScreen(room: _room(), socketFactory: (u, o) => socket)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await tester.tap(find.text('Follow'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('Follow'), findsOneWidget); // rolled back
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('gift sheet surfaces a load failure', (tester) async {
    _tall(tester);
    final socket = _FakeSocket();
    final state = AppState(api: _RoomApi(failGifts: true))..userId = 'v1';
    await tester.pumpWidget(_wrap(
        state, RoomScreen(room: _room(), socketFactory: (u, o) => socket)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await tester.tap(find.byIcon(Icons.card_giftcard));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('gift list down'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('gift sheet buy-coins shortcut toasts', (tester) async {
    _tall(tester);
    final socket = _FakeSocket();
    final api = _RoomApi(gifts: [
      {'id': 'g1', 'name': 'Rose', 'coinPrice': 50}
    ]);
    final state = AppState(api: api)
      ..userId = 'v1'
      ..wallet =
          const Wallet(coinBalance: 0, earningBalance: 0, payoutHoldBalance: 0);
    await tester.pumpWidget(_wrap(
        state, RoomScreen(room: _room(), socketFactory: (u, o) => socket)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await tester.tap(find.byIcon(Icons.card_giftcard));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Buy coins'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('Open Wallet to buy coins.'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('gift with non-numeric earning falls back to coin price',
      (tester) async {
    _tall(tester);
    final socket = _FakeSocket();
    final api = _RoomApi(gifts: [
      {'id': 'g1', 'name': 'Rose', 'coinPrice': 50}
    ], giftResult: const {
      'creatorEarningMinor': 'oops'
    });
    final state = AppState(api: api)
      ..userId = 'v1'
      ..wallet = const Wallet(
          coinBalance: 1000, earningBalance: 0, payoutHoldBalance: 0);
    await tester.pumpWidget(_wrap(
        state, RoomScreen(room: _room(), socketFactory: (u, o) => socket)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await tester.tap(find.byIcon(Icons.card_giftcard));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Rose').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Send'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(api.posts, contains('/live-rooms/r1/gifts'));
    await tester.pump(const Duration(seconds: 4));
  });

  testWidgets('insufficient coins blocks the gift', (tester) async {
    _tall(tester);
    final socket = _FakeSocket();
    final api = _RoomApi(gifts: [
      {'id': 'g1', 'name': 'Rose', 'coinPrice': 50}
    ]);
    final state = AppState(api: api)
      ..userId = 'v1'
      ..wallet =
          const Wallet(coinBalance: 5, earningBalance: 0, payoutHoldBalance: 0);
    await tester.pumpWidget(_wrap(
        state, RoomScreen(room: _room(), socketFactory: (u, o) => socket)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await tester.tap(find.byIcon(Icons.card_giftcard));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Rose').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Send'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.textContaining('Not enough coins'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('gift post failure shows an error', (tester) async {
    _tall(tester);
    final socket = _FakeSocket();
    final api = _RoomApi(gifts: [
      {'id': 'g1', 'name': 'Rose', 'coinPrice': 50}
    ], failGiftPost: true);
    final state = AppState(api: api)
      ..userId = 'v1'
      ..wallet = const Wallet(
          coinBalance: 1000, earningBalance: 0, payoutHoldBalance: 0);
    await tester.pumpWidget(_wrap(
        state, RoomScreen(room: _room(), socketFactory: (u, o) => socket)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await tester.tap(find.byIcon(Icons.card_giftcard));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Rose').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Send'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.textContaining('Gift failed'), findsWidgets);
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('viewer can close the room and open report', (tester) async {
    _tall(tester);
    final socket = _FakeSocket();
    final state = AppState(api: _RoomApi())..userId = 'v1';
    await tester.pumpWidget(_wrap(
        state,
        Navigator(
            onGenerateRoute: (_) => MaterialPageRoute(
                builder: (_) => RoomScreen(
                    room: _room(), socketFactory: (u, o) => socket)))));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await tester.tap(find.byTooltip('Close room'));
    await tester.pump();
  });

  testWidgets('viewer opens report from the top bar', (tester) async {
    _tall(tester);
    final socket = _FakeSocket();
    final state = AppState(api: _RoomApi())..userId = 'v1';
    await tester.pumpWidget(_wrap(
        state, RoomScreen(room: _room(), socketFactory: (u, o) => socket)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await tester.tap(find.byTooltip('Room options'));
    await tester.pumpAndSettle();
    expect(find.byType(ReportScreen), findsOneWidget);
  });

  testWidgets('host toggles low-data and opens safety + end failure',
      (tester) async {
    _tall(tester);
    final socket = _FakeSocket();
    final api = _RoomApi(failEnd: true);
    final state = AppState(api: api)..userId = 'h1';
    await tester.pumpWidget(_wrap(
        state,
        RoomScreen(
            room: _room(),
            hostToken: 'h',
            livekitUrl: 'ws://x',
            socketFactory: (u, o) => socket)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await tester.tap(find.text('Network ok')); // low-data toggle
    await tester.pump();
    await tester.tap(find.text('Safety'));
    await tester.pumpAndSettle();
    expect(find.byType(ReportScreen), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.tap(find.text('End Room'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('End Room').last); // confirm -> fails
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('end failed'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('host mute failure surfaces an error', (tester) async {
    _tall(tester);
    final socket = _FakeSocket();
    final api = _RoomApi(failMute: true);
    final state = AppState(api: api)..userId = 'h1';
    await tester.pumpWidget(_wrap(
        state,
        RoomScreen(
            room: _room(),
            hostToken: 'h',
            livekitUrl: 'ws://x',
            socketFactory: (u, o) => socket)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    socket.fire('chat.message_created', {
      'senderId': 'v2',
      'message': 'hey',
      'sender': {
        'profile': {'displayName': 'Vee'}
      }
    });
    await tester.pump();
    await tester.tap(find.text('Mute user'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('mute failed'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('blocked room toasts when gifting', (tester) async {
    _tall(tester);
    final socket = _FakeSocket();
    final state = AppState(api: _RoomApi())..userId = 'v1';
    await tester.pumpWidget(_wrap(
        state, RoomScreen(room: _room(), socketFactory: (u, o) => socket)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    socket.fire('room.suspended', null); // blocked
    await tester.pump();
    await tester.tap(find.byIcon(Icons.card_giftcard));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('Gifts are closed for this room.'), findsOneWidget);
    await tester.pump(const Duration(seconds: 6));
  });
}
