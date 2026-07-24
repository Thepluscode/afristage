import 'dart:io';
import 'dart:ui' as ui;

import 'package:afristage_mobile/core/afri_theme.dart';
import 'package:afristage_mobile/core/api_client.dart';
import 'package:afristage_mobile/core/app_state.dart';
import 'package:afristage_mobile/main.dart';
import 'package:afristage_mobile/models/models.dart';
import 'package:afristage_mobile/widgets/afri_ui.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

const _captureDesign = bool.fromEnvironment('CAPTURE_DESIGN');
const _captureDir = String.fromEnvironment(
  'CAPTURE_DIR',
  defaultValue: '/Users/theophilusogieva/projects/ai/afristage/mobile-captures',
);

class _CaptureApi extends ApiClient {
  static const rooms = <Map<String, dynamic>>[
    {
      'id': 'zola-live',
      'title': 'Friday Afrobeats Live',
      'category': 'MUSIC',
      'country': 'NG',
      'language': 'English',
      'status': 'LIVE',
      'viewerCount': 3200,
      'host': {
        'id': 'zola',
        'profile': {'displayName': 'Zola Kim'},
        'creatorProfile': {'stageName': 'Zola Kim'},
      },
    },
    {
      'id': 'kofi-live',
      'title': 'Good Vibes Only',
      'category': 'MUSIC',
      'country': 'GH',
      'language': 'English',
      'status': 'LIVE',
      'viewerCount': 2100,
      'host': {
        'id': 'kofi',
        'profile': {'displayName': 'Kofi Blaze'},
        'creatorProfile': {'stageName': 'Kofi Blaze'},
      },
    },
    {
      'id': 'nandi-live',
      'title': 'Acoustic Soul',
      'category': 'TALK',
      'country': 'ZA',
      'language': 'Zulu',
      'status': 'LIVE',
      'viewerCount': 1400,
      'host': {
        'id': 'nandi',
        'profile': {'displayName': 'Nandi'},
        'creatorProfile': {'stageName': 'Nandi'},
      },
    },
    {
      'id': 'tflow-live',
      'title': 'Street Freestyle',
      'category': 'COMEDY',
      'country': 'KE',
      'language': 'Swahili',
      'status': 'LIVE',
      'viewerCount': 980,
      'host': {
        'id': 'tflow',
        'profile': {'displayName': 'T-Flow'},
        'creatorProfile': {'stageName': 'T-Flow'},
      },
    },
  ];

  @override
  Future<List<dynamic>> getList(String path) async {
    if (path == '/live-rooms') return rooms;
    if (path == '/live-rooms/upcoming') return const [];
    if (path == '/payments/coin-packages') return const [];
    return const [];
  }

  @override
  Future<Map<String, dynamic>> get(String path) async {
    if (path == '/notifications/unread-count') return {'count': 2};
    if (path == '/users/me') {
      return {
        'profile': {'displayName': 'Zola Kim', 'country': 'NG'},
      };
    }
    if (path == '/creators/me/dashboard') {
      return {
        'creator': {
          'stageName': 'Zola Kim',
          'status': 'APPROVED',
        },
        'earnings': 1245.60,
        'views': 24600,
        'followers': 1200,
        'totalRooms': 8,
        'topSupporters': [
          {'displayName': 'KingSteve', 'coins': 245},
          {'displayName': 'Ama_Gh', 'coins': 128},
          {'displayName': 'TosinB', 'coins': 87},
        ],
      };
    }
    return const {};
  }
}

Widget _app(AppState state, Key boundaryKey, Widget child) {
  final baseTheme = AfriTheme.dark();
  return ChangeNotifierProvider<AppState>.value(
    value: state,
    child: MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: baseTheme.copyWith(
        textTheme: baseTheme.textTheme.apply(fontFamily: 'AfriCapture'),
        primaryTextTheme:
            baseTheme.primaryTextTheme.apply(fontFamily: 'AfriCapture'),
        filledButtonTheme: FilledButtonThemeData(
          style: baseTheme.filledButtonTheme.style?.copyWith(
            textStyle: const WidgetStatePropertyAll(
              TextStyle(
                fontFamily: 'AfriCapture',
                fontSize: 14,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: baseTheme.outlinedButtonTheme.style?.copyWith(
            textStyle: const WidgetStatePropertyAll(
              TextStyle(
                fontFamily: 'AfriCapture',
                fontSize: 14,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ),
        appBarTheme: baseTheme.appBarTheme.copyWith(
          titleTextStyle: baseTheme.appBarTheme.titleTextStyle?.copyWith(
            fontFamily: 'AfriCapture',
          ),
        ),
      ),
      home: RepaintBoundary(key: boundaryKey, child: child),
    ),
  );
}

Future<void> _capture(WidgetTester tester, Key key, String name) async {
  await tester.pumpAndSettle(const Duration(milliseconds: 100));
  await tester.runAsync(
    () => Future<void>.delayed(const Duration(milliseconds: 250)),
  );
  await tester.pump();
  final boundary = tester.renderObject<RenderRepaintBoundary>(find.byKey(key));
  await tester.runAsync(() async {
    final image = await boundary.toImage(pixelRatio: 1);
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    final file = File('$_captureDir/$name.png');
    await file.parent.create(recursive: true);
    await file.writeAsBytes(data!.buffer.asUint8List());
  });
}

Future<void> _loadCaptureFonts() async {
  final bodyLoader = FontLoader('AfriCapture')
    ..addFont(
      File('/System/Library/Fonts/SFNS.ttf')
          .readAsBytes()
          .then((bytes) => bytes.buffer.asByteData()),
    );
  final effectiveIconFamily = const TextStyle(
    fontFamily: CupertinoIcons.iconFont,
    package: CupertinoIcons.iconFontPackage,
  ).fontFamily!;
  final iconLoader = FontLoader(effectiveIconFamily)
    ..addFont(
      File(
        '/Users/theophilusogieva/.pub-cache/hosted/pub.dev/'
        'cupertino_icons-1.0.9/assets/CupertinoIcons.ttf',
      ).readAsBytes().then((bytes) => bytes.buffer.asByteData()),
    );
  await Future.wait([bodyLoader.load(), iconLoader.load()]);
}

void main() async {
  if (_captureDesign) await _loadCaptureFonts();
  testWidgets(
    'capture polished mobile reference states',
    (tester) async {
      tester.view
        ..physicalSize = const Size(390, 844)
        ..devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final api = _CaptureApi()..token = 'capture-token';
      final state = AppState(api: api)
        ..role = 'CREATOR'
        ..userId = 'zola'
        ..wallet = const Wallet(
          coinBalance: 12450,
          earningBalance: 620,
          payoutHoldBalance: 0,
        );
      const boundaryKey = ValueKey('capture-boundary');

      await tester.pumpWidget(_app(state, boundaryKey, const HomeShell()));
      await _capture(tester, boundaryKey, 'home');

      await tester.tap(find.text('Analytics'));
      await _capture(tester, boundaryKey, 'creator-dashboard');

      await tester.tap(find.text('Earn'));
      await _capture(tester, boundaryKey, 'wallet');

      await tester.tap(find.text('Go Live'));
      await _capture(tester, boundaryKey, 'go-live-setup');

      final chatController = TextEditingController();
      final chatScrollController = ScrollController();
      addTearDown(chatController.dispose);
      addTearDown(chatScrollController.dispose);
      await tester.pumpWidget(_app(
        state,
        boundaryKey,
        Stack(
          children: [
            Positioned.fill(
              child: AfriLiveRoomShell(
                stage: AfriVideoStage(
                  video: const SizedBox.shrink(),
                  ready: true,
                  isHost: false,
                  videoOn: false,
                  roomEnded: false,
                  coverCategory: 'MUSIC',
                  coverInitial: 'Zola Kim',
                  onStartVideo: () {},
                  overlay: AfriLiveTopBar(
                    creatorName: 'Zola Kim',
                    category: 'Music',
                    language: 'EN',
                    following: false,
                    viewerCount: 3200,
                    onClose: () {},
                    onFollow: () {},
                  ),
                  reactionLayer: const AfriReactionLayer(
                    reactions: ['heart', 'fire', 'heart'],
                  ),
                ),
                bottomMeta: const Padding(
                  padding: EdgeInsets.fromLTRB(16, 10, 16, 2),
                  child: Row(
                    children: [
                      AfriLiveBadge(),
                      SizedBox(width: 8),
                      Expanded(child: Text('Music · NG · English')),
                      Text('12,450 coins'),
                    ],
                  ),
                ),
                chat: AfriChatOverlay(
                  controller: chatScrollController,
                  messages: const [
                    ChatMessage(sender: 'Ama_Gh', text: 'Great energy!'),
                    ChatMessage(sender: 'TosinB', text: 'This is fire!'),
                    ChatMessage(sender: 'Nandi_Love', text: 'Voice on point!'),
                  ],
                ),
                input: AfriChatInput(
                  controller: chatController,
                  enabled: true,
                  onSend: () {},
                  onGift: () {},
                  onReaction: (_) {},
                ),
              ),
            ),
            Align(
              alignment: Alignment.bottomCenter,
              child: Material(
                color: AfriColors.surface,
                borderRadius:
                    const BorderRadius.vertical(top: Radius.circular(24)),
                clipBehavior: Clip.antiAlias,
                child: SizedBox(
                  height: 382,
                  child: AfriGiftDrawer(
                    gifts: const [
                      Gift(id: 'rose', name: 'Rose', coinPrice: 10),
                      Gift(id: 'fire', name: 'Fire', coinPrice: 50),
                      Gift(id: 'mic', name: 'Golden Mic', coinPrice: 100),
                      Gift(id: 'drum', name: 'Drum', coinPrice: 200),
                      Gift(id: 'crown', name: 'Crown', coinPrice: 500),
                      Gift(id: 'spot', name: 'Spotlight', coinPrice: 1000),
                      Gift(id: 'star', name: 'Star', coinPrice: 2000),
                      Gift(id: 'stage', name: 'Stage', coinPrice: 5000),
                    ],
                    coinBalance: 12450,
                    onGiftSelected: (_) {},
                  ),
                ),
              ),
            ),
          ],
        ),
      ));
      await _capture(tester, boundaryKey, 'live-room');
    },
    skip: !_captureDesign,
  );
}
