import 'package:afristage_mobile/core/api_client.dart';
import 'package:afristage_mobile/core/app_state.dart';
import 'package:afristage_mobile/models/models.dart';
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
  final posts = <String>[];
  @override
  Future<Map<String, dynamic>> post(String path, [Map<String, dynamic>? body]) async {
    posts.add(path);
    return path.endsWith('/join-token')
        ? {'livekitUrl': 'ws://x', 'viewerToken': 'tok'}
        : const {};
  }

  @override
  Future<List<dynamic>> getList(String path) async => const [];
}

Widget _wrap(AppState state, Widget child) =>
    ChangeNotifierProvider<AppState>.value(
        value: state, child: MaterialApp(home: child));

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
    await tester.pumpWidget(_wrap(
        state,
        RoomScreen(
            room: _room(), socketFactory: (uri, opts) => socket)));
    // Let initState's async _connect (join-token + handler registration) settle.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.byType(AfriVideoStage), findsOneWidget);

    // Drive the socket lifecycle + room events through the captured handlers.
    socket.fire('connect', null);
    socket.fire('room.viewer_count_updated', {'count': 99});
    socket.fire('gift.sent', {'giftName': 'Rose', 'quantity': 2});
    socket.fire('chat.message_created',
        {'senderName': 'Zola', 'message': 'hello'});
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

  testWidgets('host room renders host controls', (tester) async {
    // Tall surface: host controls + stage exceed the default 800px height.
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
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
}
