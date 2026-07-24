import 'package:afristage_mobile/core/afri_theme.dart';
import 'package:afristage_mobile/models/models.dart';
import 'package:afristage_mobile/widgets/afri_live.dart';
import 'package:afristage_mobile/widgets/afri_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'net_image_mock.dart';
import 'url_launcher_mock.dart';

void _noop() {}
Widget _host(Widget child) =>
    MaterialApp(home: Scaffold(body: Center(child: child)));

void main() {
  installMockNetworkImages();
  tearDown(() => PaintingBinding.instance.imageCache.clear());

  testWidgets('AfriCover error-builder falls back to a gradient',
      (tester) async {
    await tester.pumpWidget(_host(const SizedBox(
      width: 200,
      height: 200,
      child: AfriCover(
          imageUrl: 'https://fail/broken.png', category: 'MUSIC', initial: 'Z'),
    )));
    await tester.pumpAndSettle(); // 404 -> errorBuilder runs
    expect(find.byType(AfriCover), findsOneWidget);
  });

  testWidgets('AfriCoinPill is tappable', (tester) async {
    var tapped = false;
    await tester
        .pumpWidget(_host(AfriCoinPill(coins: 42, onTap: () => tapped = true)));
    await tester.tap(find.byType(AfriCoinPill));
    expect(tapped, isTrue);
  });

  testWidgets('AfriCover uses the gradient when no image is supplied',
      (tester) async {
    await tester.pumpWidget(_host(const SizedBox(
      width: 200,
      height: 200,
      child: AfriCover(category: 'MUSIC', initial: 'Z'),
    )));
    expect(find.byType(AfriCover), findsOneWidget);
  });

  testWidgets('AfriCreatorRing renders a network avatar', (tester) async {
    await tester.pumpWidget(
        _host(const AfriCreatorRing(name: 'Ada', imageUrl: 'https://x/a.png')));
    await tester.pumpAndSettle();
    expect(find.byType(AfriCreatorRing), findsOneWidget);
  });

  testWidgets('AfriCreatorRing renders live, offline, and with a photo',
      (tester) async {
    var tapped = false;
    await tester
        .pumpWidget(_host(Column(mainAxisSize: MainAxisSize.min, children: [
      AfriCreatorRing(
          name: 'Zola', viewerCount: 99, onTap: () => tapped = true),
      const AfriCreatorRing(
          name: '', live: false), // offline + empty-name fallback
    ])));
    await tester.tap(find.text('Zola'));
    expect(tapped, isTrue);
    final avatars = tester.widgetList<CircleAvatar>(find.byType(CircleAvatar));
    expect(avatars.where((avatar) => avatar.backgroundImage is AssetImage),
        hasLength(2));
  });

  testWidgets('AfriGiftBar lists gifts and reports taps', (tester) async {
    Map<String, dynamic>? sent;
    await tester.pumpWidget(_host(SizedBox(
      width: 320,
      child: AfriGiftBar(
        gifts: const [
          {'name': 'Rose', 'coinPrice': 10},
          {'name': 'Crown', 'coinPrice': 50},
        ],
        onSend: (g) => sent = g,
      ),
    )));
    expect(find.text('Rose'), findsOneWidget);
    await tester.tap(find.text('Rose'));
    expect(sent?['name'], 'Rose');
  });

  testWidgets('AfriCover falls back to a gradient on a broken image',
      (tester) async {
    await tester.pumpWidget(_host(const SizedBox(
      width: 200,
      height: 200,
      child: AfriCover(
          imageUrl: 'https://x/broken.png', category: 'MUSIC', initial: 'Z'),
    )));
    expect(find.byType(AfriCover), findsOneWidget);
  });

  testWidgets('AfriTheme.dark builds the full dark ThemeData', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: AfriTheme.dark(),
      home: Scaffold(
        body: const Center(child: Text('themed')),
        bottomNavigationBar: NavigationBar(destinations: const [
          NavigationDestination(icon: Icon(Icons.home), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.person), label: 'Me'),
        ]),
      ),
    ));
    final theme = Theme.of(tester.element(find.text('themed')));
    expect(theme.brightness, Brightness.dark);
    expect(theme.scaffoldBackgroundColor, AfriColors.stage);
  });

  group('afri_ui widget smoke + render', () {
    testWidgets('AfriSectionHeader shows title + subtitle', (t) async {
      await t.pumpWidget(_host(
          const AfriSectionHeader(title: 'Earnings', subtitle: 'This week')));
      expect(find.text('Earnings'), findsOneWidget);
      expect(find.text('This week'), findsOneWidget);
    });

    testWidgets('AfriActionRow shows title/body and is tappable', (t) async {
      var tapped = false;
      await t.pumpWidget(_host(AfriActionRow(
          icon: Icons.mic,
          title: 'Become a creator',
          body: 'Apply to host rooms',
          onTap: () => tapped = true)));
      expect(find.text('Become a creator'), findsOneWidget);
      expect(find.text('Apply to host rooms'), findsOneWidget);
      await t.tap(find.text('Become a creator'));
      expect(tapped, isTrue);
    });

    testWidgets('AfriStatCard shows label + value', (t) async {
      await t.pumpWidget(_host(const AfriStatCard(
          label: 'Followers', value: '1.2K', icon: Icons.group)));
      expect(find.text('Followers'), findsOneWidget);
      expect(find.text('1.2K'), findsOneWidget);
    });

    testWidgets('AfriLiveBadge shows LIVE', (t) async {
      await t.pumpWidget(_host(const AfriLiveBadge()));
      expect(find.text('LIVE'), findsOneWidget);
    });

    testWidgets('AfriChip shows its label', (t) async {
      await t.pumpWidget(_host(const AfriChip(label: 'Music')));
      expect(find.text('Music'), findsOneWidget);
    });

    testWidgets('AfriEmptyState shows title + body', (t) async {
      await t.pumpWidget(_host(const AfriEmptyState(
          icon: Icons.inbox, title: 'Nothing here', body: 'Come back later')));
      expect(find.text('Nothing here'), findsOneWidget);
      expect(find.text('Come back later'), findsOneWidget);
    });

    testWidgets('AfriErrorState shows title and retries', (t) async {
      var retried = false;
      await t.pumpWidget(_host(AfriErrorState(
          title: 'Oops', body: 'Try again', onRetry: () => retried = true)));
      expect(find.text('Oops'), findsOneWidget);
      await t.tap(find.byType(FilledButton));
      expect(retried, isTrue);
    });

    testWidgets('AfriLoadingState renders a label', (t) async {
      await t.pumpWidget(_host(const AfriLoadingState()));
      expect(find.text('Restoring session'), findsOneWidget);
    });

    testWidgets('AfriCard renders child and fires onTap', (t) async {
      var tapped = false;
      await t.pumpWidget(_host(
          AfriCard(onTap: () => tapped = true, child: const Text('inside'))));
      expect(find.text('inside'), findsOneWidget);
      await t.tap(find.text('inside'));
      expect(tapped, isTrue);
    });

    testWidgets('AfriGradientPanel renders its child', (t) async {
      await t.pumpWidget(_host(const AfriGradientPanel(child: Text('panel'))));
      expect(find.text('panel'), findsOneWidget);
    });

    testWidgets('AfriIconBadge / AfriBrandMark / AfriLegalLinks build',
        (t) async {
      await t.pumpWidget(
          _host(const Column(mainAxisSize: MainAxisSize.min, children: [
        AfriIconBadge(icon: Icons.star),
        AfriBrandMark(),
        AfriLegalLinks(),
      ])));
      expect(find.byType(AfriIconBadge), findsOneWidget);
      expect(find.byType(AfriBrandMark), findsOneWidget);
    });

    testWidgets('AfriCreatorStatusBanner shows its message', (t) async {
      await t.pumpWidget(_host(const AfriCreatorStatusBanner(
          status: 'APPROVED', message: 'You can go live')));
      expect(find.text('You can go live'), findsOneWidget);
    });

    testWidgets('AfriMutedStateNotice shows the default label', (t) async {
      await t.pumpWidget(_host(const AfriMutedStateNotice()));
      expect(find.textContaining('muted'), findsOneWidget);
    });

    testWidgets('AfriChatBubble builds a message (RichText spans)', (t) async {
      await t.pumpWidget(_host(const AfriChatBubble(
          message: ChatMessage(sender: 'Zola', text: 'hello room'))));
      expect(find.byType(AfriChatBubble), findsOneWidget);
    });

    testWidgets('AfriGiftTile shows the gift name + price', (t) async {
      await t.pumpWidget(_host(AfriGiftTile(
          gift: const Gift(id: 'g', name: 'Rose', coinPrice: 10),
          onTap: () {})));
      expect(find.text('Rose'), findsOneWidget);
    });

    testWidgets('AfriCategoryChips renders + selects', (t) async {
      String? picked;
      await t.pumpWidget(_host(AfriCategoryChips(
          items: const ['Music', 'Comedy'],
          selected: 'Music',
          onSelected: (v) => picked = v)));
      expect(find.text('Comedy'), findsOneWidget);
      await t.tap(find.text('Comedy'));
      expect(picked, 'Comedy');
    });

    testWidgets('AfriCoinPackageCard shows label/body and taps', (t) async {
      var tapped = false;
      await t.pumpWidget(_host(AfriCoinPackageCard(
          label: '100 coins', body: '₦1,000', onTap: () => tapped = true)));
      expect(find.text('100 coins'), findsOneWidget);
      expect(find.text('₦1,000'), findsOneWidget);
      await t.tap(find.text('100 coins'));
      expect(tapped, isTrue);
    });

    testWidgets('AfriPayoutStatusCard / AfriWalletBalanceCard build',
        (t) async {
      await t.pumpWidget(
          _host(const Column(mainAxisSize: MainAxisSize.min, children: [
        AfriPayoutStatusCard(available: 500, pending: 100, hold: 50),
        AfriWalletBalanceCard(coinBalance: 1200, modeLabel: 'USD'),
      ])));
      expect(find.byType(AfriPayoutStatusCard), findsOneWidget);
      expect(find.byType(AfriWalletBalanceCard), findsOneWidget);
    });

    testWidgets('AfriReportReasonTile shows label and selects', (t) async {
      var tapped = false;
      await t.pumpWidget(_host(AfriReportReasonTile(
          label: 'Spam', selected: false, onTap: () => tapped = true)));
      expect(find.text('Spam'), findsOneWidget);
      await t.tap(find.text('Spam'));
      expect(tapped, isTrue);
    });

    testWidgets('AfriTopGifterStrip shows a gifter', (t) async {
      await t.pumpWidget(_host(const SizedBox(
          width: 360, child: AfriTopGifterStrip(gifters: [('Zola', '500')]))));
      expect(find.textContaining('Zola'), findsOneWidget);
    });

    testWidgets('AfriSupportTicketCard builds from a ticket map', (t) async {
      await t.pumpWidget(_host(const AfriSupportTicketCard(
          ticket: {'subject': 'Help me', 'status': 'OPEN'})));
      expect(find.byType(AfriSupportTicketCard), findsOneWidget);
    });

    testWidgets('AfriHeroEventCard builds + fires onJoin', (t) async {
      var joined = false;
      await t.pumpWidget(_host(SizedBox(
          width: 360, child: AfriHeroEventCard(onJoin: () => joined = true))));
      expect(find.byType(AfriHeroEventCard), findsOneWidget);
      await t
          .tap(find.text('Refresh')); // no room -> "Refresh" CTA fires onJoin
      expect(joined, isTrue);
    });

    testWidgets('AfriScaffold renders title + children', (t) async {
      await t.pumpWidget(const MaterialApp(
          home: AfriScaffold(title: 'Wallet', children: [Text('body')])));
      expect(find.text('Wallet'), findsOneWidget);
      expect(find.text('body'), findsOneWidget);
    });
  });

  group('afri_ui live-room widgets', () {
    LiveRoom room() => const LiveRoom(
        id: 'r1',
        title: 'Afro Night',
        category: 'MUSIC',
        country: 'NG',
        language: 'pidgin',
        status: 'LIVE',
        hostName: 'Zola',
        hostId: 'h1');

    testWidgets('AfriSplash builds', (t) async {
      await t.pumpWidget(_host(const AfriSplash()));
      expect(find.byType(AfriSplash), findsOneWidget);
    });

    testWidgets('AfriLiveRoomCard shows the room title', (t) async {
      await t.pumpWidget(_host(SizedBox(
          width: 360, child: AfriLiveRoomCard(room: room(), onTap: () {}))));
      expect(find.text('Afro Night'), findsOneWidget);
    });

    testWidgets('AfriLiveTile builds', (t) async {
      await t.pumpWidget(_host(AfriLiveTile(room: room(), onTap: () {})));
      expect(find.byType(AfriLiveTile), findsOneWidget);
    });

    testWidgets('AfriNetworkStatusPill builds', (t) async {
      await t.pumpWidget(_host(AfriNetworkStatusPill(
          connected: true,
          lowData: false,
          poorNetwork: false,
          onToggleLowData: (_) {})));
      expect(find.byType(AfriNetworkStatusPill), findsOneWidget);
    });

    testWidgets('AfriChatInput builds', (t) async {
      final c = TextEditingController();
      addTearDown(c.dispose);
      await t.pumpWidget(_host(AfriChatInput(
          controller: c,
          enabled: true,
          onSend: () {},
          onGift: () {},
          onReaction: (_) {})));
      expect(find.byType(AfriChatInput), findsOneWidget);
    });

    testWidgets('AfriReactionButton builds', (t) async {
      await t.pumpWidget(_host(AfriReactionButton(onReaction: (_) {})));
      expect(find.byType(AfriReactionButton), findsOneWidget);
    });

    testWidgets('AfriChatOverlay builds', (t) async {
      final s = ScrollController();
      addTearDown(s.dispose);
      await t.pumpWidget(_host(SizedBox(
          height: 200,
          child: AfriChatOverlay(
              messages: const [ChatMessage(sender: 'A', text: 'hi')],
              controller: s))));
      expect(find.byType(AfriChatOverlay), findsOneWidget);
    });

    testWidgets('AfriReactionLayer + AfriGiftAnimationLayer build', (t) async {
      await t.pumpWidget(_host(const SizedBox(
          height: 200,
          width: 200,
          child: Stack(children: [
            AfriReactionLayer(reactions: ['heart']),
            AfriGiftAnimationLayer(giftLabel: 'Rose x1'),
          ]))));
      expect(find.byType(AfriReactionLayer), findsOneWidget);
      expect(find.byType(AfriGiftAnimationLayer), findsOneWidget);
    });

    testWidgets('AfriVideoStage builds (viewer, waiting)', (t) async {
      await t.pumpWidget(_host(SizedBox(
          height: 300,
          width: 300,
          child: AfriVideoStage(
              video: const SizedBox(),
              ready: false,
              isHost: false,
              videoOn: false,
              roomEnded: false,
              onStartVideo: () {}))));
      expect(find.byType(AfriVideoStage), findsOneWidget);
    });

    testWidgets('AfriHostControlsPanel builds', (t) async {
      await t.pumpWidget(_host(AfriHostControlsPanel(
          viewerCount: 10,
          giftCount: 5,
          earningsEstimate: 100,
          cameraOn: true,
          micOn: true,
          chatVisible: true,
          lowData: false,
          poorNetwork: false,
          socketConnected: true,
          onCameraChanged: (_) {},
          onMicChanged: (_) {},
          onChatVisibleChanged: (_) {},
          onLowDataChanged: (_) {},
          onMuteUser: () {},
          onSafety: () {},
          onEndRoom: () {})));
      expect(find.byType(AfriHostControlsPanel), findsOneWidget);
    });

    testWidgets('AfriLiveRoomShell builds', (t) async {
      await t.pumpWidget(_host(const SizedBox(
          height: 600,
          width: 360,
          child: AfriLiveRoomShell(
              stage: SizedBox(), chat: SizedBox(), input: SizedBox()))));
      expect(find.byType(AfriLiveRoomShell), findsOneWidget);
    });
  });
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
    await tester.pumpWidget(
        _host(const AfriCreatorAvatar(name: 'Zola', viewerCount: 3200)));
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

  testWidgets('AfriHeroEventCard with room (cover) and without room',
      (tester) async {
    const room = LiveRoom(
        id: 'r1',
        title: 'On Now',
        category: 'MUSIC',
        country: 'NG',
        language: 'pidgin',
        status: 'LIVE',
        hostName: 'Z',
        hostAvatarUrl: 'https://x/a.png',
        viewerCount: 1500);
    await tester
        .pumpWidget(_host(const AfriHeroEventCard(onJoin: _noop, room: room)));
    await tester.pumpAndSettle();
    expect(find.byType(AfriHeroEventCard), findsOneWidget);
    await tester
        .pumpWidget(_host(const AfriHeroEventCard(onJoin: _noop))); // no room
    await tester.pumpAndSettle();
    expect(find.textContaining('warming up'), findsOneWidget);
  });

  testWidgets('AfriChatBubble renders a gift message', (tester) async {
    await tester.pumpWidget(_host(const AfriChatBubble(
        message: ChatMessage(sender: 'Z', text: 'sent a Rose gift'))));
    expect(find.byType(AfriChatBubble), findsOneWidget);
  });

  testWidgets('AfriCreatorStatusBanner renders each status', (tester) async {
    for (final s in ['APPROVED', 'REJECTED', 'SUSPENDED', 'PENDING']) {
      await tester
          .pumpWidget(_host(AfriCreatorStatusBanner(status: s, message: 'm')));
      expect(find.byType(AfriCreatorStatusBanner), findsOneWidget);
    }
  });

  testWidgets('AfriProfileHeader with an avatar', (tester) async {
    await tester.pumpWidget(_host(const AfriProfileHeader(
        role: 'CREATOR',
        userId: 'u1',
        isCreator: true,
        avatarUrl: 'https://x/a.png')));
    await tester.pumpAndSettle();
    expect(find.byType(AfriProfileHeader), findsOneWidget);
  });

  testWidgets('AfriVideoStage cover (off) and video (on)', (tester) async {
    await tester.pumpWidget(_host(AfriVideoStage(
        video: const SizedBox(),
        ready: false,
        isHost: false,
        videoOn: false,
        roomEnded: false,
        onStartVideo: () {},
        coverCategory: 'MUSIC',
        coverInitial: 'Z')));
    expect(find.byType(AfriVideoStage), findsOneWidget);
    await tester.pumpWidget(_host(AfriVideoStage(
        video: const Text('VID'),
        ready: true,
        isHost: true,
        videoOn: true,
        roomEnded: false,
        onStartVideo: () {})));
    expect(find.text('VID'), findsOneWidget);
  });

  testWidgets('AfriLiveTopBar with a creator avatar', (tester) async {
    await tester.pumpWidget(_host(AfriLiveTopBar(
        creatorName: 'Z',
        avatarUrl: 'https://x/a.png',
        following: false,
        onFollow: () {},
        viewerCount: 5,
        onClose: () {})));
    await tester.pumpAndSettle();
    expect(find.byType(AfriLiveTopBar), findsOneWidget);
  });

  testWidgets('AfriRoomStateBanner renders several states', (tester) async {
    for (final s in AfriRoomState.values) {
      await tester
          .pumpWidget(_host(AfriRoomStateBanner(state: s, message: 'm')));
      expect(find.byType(AfriRoomStateBanner), findsOneWidget);
    }
  });

  testWidgets('AfriNetworkStatusPill toggles low-data', (tester) async {
    var v = false;
    await tester.pumpWidget(_host(AfriNetworkStatusPill(
        connected: true,
        lowData: false,
        poorNetwork: true,
        onToggleLowData: (x) => v = x)));
    await tester.tap(find.byType(AfriNetworkStatusPill));
    expect(v, isTrue);
    await tester.pumpWidget(_host(AfriNetworkStatusPill(
        connected: false,
        lowData: true,
        poorNetwork: false,
        onToggleLowData: (_) {})));
    expect(find.text('Low data'), findsOneWidget);
  });

  testWidgets('AfriChatInput sends on submit', (tester) async {
    var sent = false;
    final c = TextEditingController();
    await tester.pumpWidget(_host(AfriChatInput(
        controller: c,
        enabled: true,
        onSend: () => sent = true,
        onGift: () {},
        onReaction: (_) {})));
    await tester.enterText(find.byType(TextField), 'hi');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    expect(sent, isTrue);
  });

  testWidgets('AfriReactionButton picks a reaction', (tester) async {
    String? picked;
    await tester
        .pumpWidget(_host(AfriReactionButton(onReaction: (r) => picked = r)));
    await tester.tap(find.byType(AfriReactionButton));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Fire').last);
    await tester.pumpAndSettle();
    expect(picked, 'fire');
  });

  testWidgets('AfriReactionLayer caps at the last six', (tester) async {
    await tester.pumpWidget(_host(const SizedBox(
        width: 300,
        height: 400,
        child: AfriReactionLayer(reactions: [
          'heart',
          'fire',
          'clap',
          'laugh',
          'heart',
          'fire',
          'clap'
        ]))));
    expect(find.byType(AfriReactionLayer), findsOneWidget);
  });

  testWidgets('AfriGiftAnimationLayer with artwork + label', (tester) async {
    await tester.pumpWidget(_host(const AfriGiftAnimationLayer(
        giftLabel: 'Rose x2', imageUrl: 'https://x/g.png')));
    await tester.pumpAndSettle();
    expect(find.byType(AfriGiftAnimationLayer), findsOneWidget);
  });

  testWidgets('AfriTopGifterStrip lists gifters', (tester) async {
    await tester.pumpWidget(_host(const SizedBox(
        width: 360,
        child: AfriTopGifterStrip(gifters: [('Ada', '120'), ('Bo', '90')]))));
    await tester.pumpAndSettle();
    expect(find.byType(AfriTopGifterStrip), findsOneWidget);
  });

  testWidgets('AfriHostControlsPanel low-data + poor-network', (tester) async {
    await tester.pumpWidget(_host(AfriHostControlsPanel(
        viewerCount: 5,
        giftCount: 2,
        earningsEstimate: 10,
        cameraOn: true,
        micOn: true,
        chatVisible: true,
        lowData: true,
        poorNetwork: true,
        socketConnected: false,
        ending: false,
        onCameraChanged: (_) {},
        onMicChanged: (_) {},
        onChatVisibleChanged: (_) {},
        onLowDataChanged: (_) {},
        onMuteUser: () {},
        onSafety: () {},
        onEndRoom: () {})));
    expect(find.byType(AfriHostControlsPanel), findsOneWidget);
  });

  testWidgets('AfriLiveRoomCard + AfriLiveTile with host avatars',
      (tester) async {
    const room = LiveRoom(
        id: 'r1',
        title: 'T',
        category: 'MUSIC',
        country: 'NG',
        language: 'pidgin',
        status: 'LIVE',
        hostName: 'Z',
        hostAvatarUrl: 'https://x/a.png',
        viewerCount: 12);
    await tester.pumpWidget(_host(SizedBox(
        width: 360, child: AfriLiveRoomCard(room: room, onTap: () {}))));
    await tester.pumpAndSettle();
    expect(find.byType(AfriLiveRoomCard), findsOneWidget);
    await tester.pumpWidget(_host(AfriLiveTile(room: room, onTap: () {})));
    await tester.pumpAndSettle();
    expect(find.byType(AfriLiveTile), findsOneWidget);
  });

  // Non-const instantiation (UniqueKey) so the constructor line registers a
  // runtime hit — const constructors are evaluated at compile time.
  testWidgets('AfriSplash + AfriLoadingState render', (tester) async {
    await tester.pumpWidget(MaterialApp(home: AfriSplash(key: UniqueKey())));
    expect(find.byType(AfriSplash), findsOneWidget);
    await tester.pumpWidget(
        _host(AfriLoadingState(key: UniqueKey(), label: 'Loading')));
    expect(find.byType(AfriLoadingState), findsOneWidget);
  });

  testWidgets('AfriWalletBalanceCard + AfriPayoutStatusCard render',
      (tester) async {
    await tester.pumpWidget(_host(AfriWalletBalanceCard(
        key: UniqueKey(), coinBalance: 120, modeLabel: 'Mock')));
    expect(find.byType(AfriWalletBalanceCard), findsOneWidget);
    await tester.pumpWidget(_host(AfriPayoutStatusCard(
        key: UniqueKey(), available: 10, pending: 2, hold: 1)));
    expect(find.byType(AfriPayoutStatusCard), findsOneWidget);
  });

  testWidgets('AfriRoomStateBanner uses _title when no message is given',
      (tester) async {
    for (final s in AfriRoomState.values) {
      await tester.pumpWidget(_host(AfriRoomStateBanner(state: s)));
      expect(find.byType(AfriRoomStateBanner), findsOneWidget);
    }
  });

  testWidgets('AfriLiveTile avatar error-builder', (tester) async {
    const room = LiveRoom(
        id: 'r1',
        title: 'On',
        category: 'MUSIC',
        country: 'NG',
        language: 'pidgin',
        status: 'LIVE',
        hostName: 'Z',
        hostAvatarUrl: 'https://fail/a.png',
        viewerCount: 7);
    await tester.pumpWidget(_host(const SizedBox(
        width: 220,
        height: 300,
        child: AfriLiveTile(room: room, onTap: _noop))));
    await tester.pumpAndSettle();
    expect(find.byType(AfriLiveTile), findsOneWidget);
  });

  testWidgets('AfriHeroEventCard error-builder falls back to a gradient',
      (tester) async {
    const room = LiveRoom(
        id: 'r1',
        title: 'T',
        category: 'MUSIC',
        country: 'NG',
        language: 'pidgin',
        status: 'LIVE',
        hostName: 'Z',
        hostAvatarUrl: 'https://fail/a.png',
        viewerCount: 3);
    await tester.pumpWidget(_host(const SizedBox(
        width: 360,
        height: 460,
        child: AfriHeroEventCard(room: room, onJoin: _noop))));
    await tester.pumpAndSettle();
    expect(find.byType(AfriHeroEventCard), findsOneWidget);
  });

  testWidgets('AfriProfileHeader avatar error-builder', (tester) async {
    await tester.pumpWidget(_host(const AfriProfileHeader(
        role: 'CREATOR',
        userId: 'u1',
        isCreator: true,
        avatarUrl: 'https://fail/a.png')));
    await tester.pumpAndSettle();
    expect(find.byType(AfriProfileHeader), findsOneWidget);
  });

  testWidgets('AfriGiftAnimationLayer image error-builder', (tester) async {
    await tester.pumpWidget(_host(const AfriGiftAnimationLayer(
        giftLabel: 'Rose x1', imageUrl: 'https://fail/g.png')));
    await tester.pumpAndSettle();
    expect(find.byType(AfriGiftAnimationLayer), findsOneWidget);
  });

  testWidgets('AfriCreatorAvatar renders + avatar error-builder',
      (tester) async {
    await tester.pumpWidget(_host(AfriCreatorAvatar(
        key: UniqueKey(),
        name: 'Zola',
        viewerCount: 99,
        avatarUrl: 'https://fail/a.png')));
    await tester.pumpAndSettle();
    expect(find.byType(AfriCreatorAvatar), findsOneWidget);
  });

  testWidgets('showAfriEndRoomConfirmation confirms and cancels',
      (tester) async {
    bool? result;
    Widget harness(void Function(bool?) sink) => MaterialApp(
        home: Scaffold(
            body: Builder(
                builder: (ctx) => Center(
                    child: ElevatedButton(
                        onPressed: () async =>
                            sink(await showAfriEndRoomConfirmation(ctx)),
                        child: const Text('go'))))));
    await tester.pumpWidget(harness((r) => result = r));
    await tester.tap(find.text('go'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Keep Room Live')); // cancel path
    await tester.pumpAndSettle();
    expect(result, isFalse);
    await tester.tap(find.text('go'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('End Room')); // confirm path
    await tester.pumpAndSettle();
    expect(result, isTrue);
  });

  testWidgets('AfriLegalLinks opens terms and privacy', (tester) async {
    final fake = installFakeUrlLauncher();
    await tester.pumpWidget(_host(AfriLegalLinks(key: UniqueKey())));
    await tester.tap(find.text('Terms'));
    await tester.pump();
    await tester.tap(find.text('Privacy'));
    await tester.pump();
    expect(fake.launched.length, 2);
  });

  test('stageFallback maps ama/nandi seeds to the nandi asset', () {
    expect(stageFallback('Nandi Cele'), 'assets/stage/nandi-live.jpg');
    expect(stageFallback('Ama K'), 'assets/stage/nandi-live.jpg');
  });

  test('stageFallback maps studio previews to the creator control asset', () {
    expect(
      stageFallback('studio creator'),
      'assets/stage/creator-control.jpg',
    );
  });

  testWidgets('AfriCover fallback swallows asset load errors (errorBuilder)',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: DefaultAssetBundle(
        bundle: _ThrowingAssetBundle(),
        child: const SizedBox(
            width: 200,
            height: 200,
            child: AfriCover(category: 'MUSIC', initial: 'Zola')),
      ),
    ));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull); // errorBuilder ate the failure
  });

  // Regression (staging, 2026-07-14): on a short stage the host prompt column
  // overflowed and CLIPPED the publish button — the host could not go live.
  testWidgets('host publish prompt fits a short stage without overflow',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Center(
        child: SizedBox(
          width: 300,
          height: 120, // shorter than the prompt's natural height
          child: AfriVideoStage(
            video: const SizedBox.shrink(),
            ready: true,
            isHost: true,
            videoOn: false,
            roomEnded: false,
            onStartVideo: () {},
          ),
        ),
      ),
    ));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull); // no RenderFlex overflow
    expect(find.text('Go Live with Camera + Mic'), findsOneWidget);
  });

  test('asInt/asIntOrNull/asNumOr tolerate num, string, junk, and null', () {
    expect(asInt(7), 7);
    expect(asInt('620'), 620);
    expect(asInt(null), 0);
    expect(asInt('junk', 5), 5);
    expect(asIntOrNull(null), isNull);
    expect(asIntOrNull('42'), 42);
    expect(asIntOrNull(3.9), 3);
    expect(asIntOrNull('x'), isNull);
    expect(asNumOr('12.5'), 12.5);
    expect(asNumOr(8), 8);
    expect(asNumOr(null), 0);
    expect(asNumOr('junk', 1), 1);
  });
}

class _ThrowingAssetBundle extends CachingAssetBundle {
  @override
  Future<ByteData> load(String key) async => throw FlutterError('no asset: $key');
}
