import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../core/api_client.dart';
import '../core/afri_theme.dart';
import '../core/app_state.dart';
import '../models/models.dart';
import '../widgets/afri_live.dart';
import '../widgets/afri_ui.dart';
import 'livekit_room_view.dart';
import 'creator_profile_screen.dart';
import 'report_screen.dart';

class RoomScreen extends StatefulWidget {
  const RoomScreen(
      {super.key,
      required this.room,
      this.hostToken,
      this.livekitUrl,
      this.socketFactory});
  final LiveRoom room;
  // When present, this screen is the host's own session (publishes camera/mic).
  // Absent => viewer (fetches a viewer token and subscribes).
  final String? hostToken;
  final String? livekitUrl;
  // Seam for tests: defaults to io.io (a real socket) in production.
  final io.Socket Function(String uri, dynamic opts)? socketFactory;

  bool get isHost => hostToken != null;

  @override
  State<RoomScreen> createState() => _RoomScreenState();
}

class _RoomScreenState extends State<RoomScreen> {
  final _messages = <ChatMessage>[];
  final _input = TextEditingController();
  final _scroll = ScrollController();
  io.Socket? _socket;
  bool _connected = false;
  // True once we've connected at least once, so the "rejoined" banner only
  // fires on a genuine reconnect — not on the very first connect.
  bool _everConnected = false;
  String? _error;
  String? _lkUrl;
  String? _lkToken;
  bool _videoOn = false;
  bool _roomEnded = false;
  bool _cameraOn = true;
  bool _micOn = true;
  bool _ending = false;
  String? _lastGift;
  String? _lastGiftImage;
  bool _following = false;
  bool _lowData = false;
  bool _poorNetwork = false;
  bool _chatVisible = true;
  bool _userMuted = false;
  bool _userBanned = false;
  bool _roomSuspended = false;
  late int _viewerCount = widget.room.viewerCount;
  int _giftCount = 0;
  int _earningsEstimate = 0;
  final _reactions = <String>[];
  // Live top supporters, fetched from the backend leaderboard endpoint.
  List<(String, String)> _topGifters = const [];
  AfriRoomState? _bannerState;
  String? _bannerMessage;
  bool _disposed = false;

  AppState get _state => context.read<AppState>();
  bool get _canUpdate => mounted && !_disposed;

  @override
  void initState() {
    super.initState();
    // Host already holds its publish token from start(); viewer fetches one.
    if (widget.isHost) {
      _lkUrl = widget.livekitUrl;
      _lkToken = widget.hostToken;
    }
    _connect();
    _loadTopGifters();
  }

  // Top-supporters leaderboard for this room. Refreshed when gifts arrive.
  Future<void> _loadTopGifters() async {
    try {
      final rows =
          await _state.api.getList('/live-rooms/${widget.room.id}/top-gifters');
      if (!_canUpdate) return;
      setState(() => _topGifters = rows
          .cast<Map<String, dynamic>>()
          .map((r) => (
                (r['displayName'] as String?) ?? 'Supporter',
                '${r['totalCoins'] ?? 0}'
              ))
          .toList());
    } on ApiException {
      // Leaderboard is non-critical; leave it empty on failure (strip hides itself).
    }
  }

  Future<void> _connect() async {
    final api = _state.api;
    try {
      // Viewers register + receive a (subscribe-only) LiveKit token + url.
      if (!widget.isHost) {
        final join = await api.post('/live-rooms/${widget.room.id}/join-token');
        _lkUrl = join['livekitUrl'] as String?;
        _lkToken = join['viewerToken'] as String?;
      }
    } on ApiException catch (e) {
      if (!_canUpdate) return;
      setState(() => _error = e.message);
      return;
    }
    if (!_canUpdate) return;

    final socket = (widget.socketFactory ?? io.io)(
      '${api.wsOrigin}/chat',
      io.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .setAuth({'token': api.token})
          .build(),
    );
    socket
      ..onConnect((_) {
        if (!_canUpdate) return;
        socket.emit('room.join', {'roomId': widget.room.id});
        final rejoined = _everConnected;
        setState(() {
          _connected = true;
          _everConnected = true;
          _poorNetwork = false;
        });
        if (rejoined) {
          _showBanner(AfriRoomState.socketRejoined,
              'Chat rejoined. You are back in the room.');
        }
      })
      ..onDisconnect((_) {
        if (!_canUpdate) return;
        setState(() {
          _connected = false;
          _poorNetwork = true;
        });
        _showBanner(AfriRoomState.reconnectingSocket,
            'Chat is reconnecting. Video can continue while we retry.');
      })
      ..on('connect_error', (_) {
        if (!_canUpdate) return;
        setState(() => _poorNetwork = true);
        _showBanner(AfriRoomState.poorNetwork,
            'Network is unstable. Low-data mode may help.');
      })
      ..on('chat.message_created', (data) {
        if (!_canUpdate) return;
        if (data is Map) _addMessage(data);
      })
      ..on('gift.sent', (data) {
        if (!_canUpdate) return;
        if (data is Map) {
          final name = data['giftName'] as String? ?? 'a gift';
          final qty = int.tryParse('${data['quantity'] ?? 1}') ?? 1;
          _flashGift('$name x$qty', data['animationUrl'] as String?);
          _addSystem('$name x$qty');
          setState(() {
            _giftCount += qty;
          });
          _loadTopGifters(); // a gift changes the standings
        }
      })
      ..on('reaction.sent', (data) {
        if (!_canUpdate) return;
        if (data is Map) {
          _addReaction(data['reactionType'] as String? ?? 'heart',
              emitSocket: false);
        }
      })
      ..on('room.viewer_count_updated', (data) {
        if (!_canUpdate) return;
        final count = data is Map ? (data['count'] as num?)?.toInt() : null;
        if (count != null) setState(() => _viewerCount = count);
      })
      ..on('user.muted', (data) {
        if (!_canUpdate) return;
        final userId = data is Map ? data['userId'] as String? : null;
        if (userId == _state.userId) {
          setState(() => _userMuted = true);
          _showBanner(AfriRoomState.muted,
              'You can keep watching, but chat is muted in this room.');
        } else {
          _addSystem('A viewer was muted by the host.');
        }
      })
      ..on('room.suspended', (_) {
        if (!_canUpdate) return;
        setState(() => _roomSuspended = true);
        _showBanner(
            AfriRoomState.suspended, 'This room was suspended by moderation.');
      })
      ..on('user.banned', (data) {
        if (!_canUpdate) return;
        final userId = data is Map ? data['userId'] as String? : null;
        if (userId == _state.userId) {
          setState(() => _userBanned = true);
          _showBanner(AfriRoomState.banned,
              'You were removed from this room by moderation.');
        }
      })
      ..on('room.ended', (_) {
        if (!_canUpdate) {
          return;
        }
        setState(() => _roomEnded = true);
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('This room has ended.')));
      })
      ..connect();
    _socket = socket;
  }

  void _showBanner(AfriRoomState state, String message) {
    if (!_canUpdate) return;
    setState(() {
      _bannerState = state;
      _bannerMessage = message;
    });
    Future<void>.delayed(const Duration(seconds: 4), () {
      if (_canUpdate && _bannerMessage == message) {
        setState(() {
          _bannerState = null;
          _bannerMessage = null;
        });
      }
    });
  }

  void _addSystem(String text) {
    if (!_canUpdate) {
      return;
    }
    setState(() => _messages.add(ChatMessage(sender: '•', text: text)));
    _scrollToEnd();
  }

  void _flashGift(String text, [String? animationUrl]) {
    if (!mounted) {
      return;
    }
    setState(() {
      _lastGift = text;
      _lastGiftImage = (animationUrl != null && animationUrl.isNotEmpty)
          ? animationUrl
          : null;
    });
    Future<void>.delayed(const Duration(milliseconds: 3200), () {
      if (mounted && _lastGift == text) {
        setState(() {
          _lastGift = null;
          _lastGiftImage = null;
        });
      }
    });
  }

  void _addMessage(Map data) {
    final sender = data['sender'] as Map?;
    final profile = sender?['profile'] as Map?;
    setState(() {
      _messages.add(ChatMessage(
        sender: (profile?['displayName'] as String?) ?? 'Someone',
        text: (data['message'] as String?) ?? '',
        senderId: data['senderId'] as String?,
      ));
    });
    _scrollToEnd();
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(_scroll.position.maxScrollExtent,
            duration: const Duration(milliseconds: 200), curve: Curves.easeOut);
      }
    });
  }

  void _sendMessage() {
    final text = _input.text.trim();
    if (_userMuted) {
      _showBanner(AfriRoomState.muted,
          'You can watch, but your chat is muted in this room.');
      return;
    }
    if (_userBanned || _roomSuspended || _roomEnded) {
      _showBanner(
          _roomSuspended ? AfriRoomState.suspended : AfriRoomState.ended,
          'This room is not accepting new chat messages.');
      return;
    }
    if (text.isEmpty) {
      return;
    }
    if (_socket == null || !_connected) {
      _showBanner(AfriRoomState.reconnectingSocket,
          'Chat is reconnecting. Try again in a moment.');
      return;
    }
    _socket!.emit('chat.message', {
      'roomId': widget.room.id,
      'message': text,
      'clientMessageId': DateTime.now().microsecondsSinceEpoch.toString(),
    });
    _input.clear();
  }

  // Follow/unfollow the room's creator. Optimistic toggle with rollback so the
  // button reflects the real backend state, not just a local flip.
  Future<void> _toggleFollow() async {
    final hostId = widget.room.hostId;
    if (hostId == null) return;
    final next = !_following;
    setState(() => _following = next);
    try {
      if (next) {
        await _state.api.post('/users/$hostId/follow');
      } else {
        await _state.api.delete('/users/$hostId/follow');
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _following = !next); // rollback
      _toast(e.message);
    }
  }

  void _addReaction(String reaction, {bool emitSocket = true}) {
    if (_roomEnded || _roomSuspended || _userBanned) return;
    setState(() => _reactions.add(reaction));
    if (emitSocket && _socket != null && _connected) {
      _socket!.emit('reaction.sent', {
        'roomId': widget.room.id,
        'reactionType': reaction,
      });
    }
    Future<void>.delayed(const Duration(milliseconds: 1800), () {
      if (mounted && _reactions.isNotEmpty) {
        setState(() => _reactions.removeAt(0));
      }
    });
  }

  Future<void> _openGiftSheet() async {
    final api = _state.api;
    List<Gift> gifts;
    try {
      gifts = (await api.getList('/gifts'))
          .cast<Map<String, dynamic>>()
          .map(Gift.fromJson)
          .toList();
    } on ApiException catch (e) {
      _toast(e.message);
      return;
    }
    if (!mounted) {
      return;
    }
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: AfriColors.surface,
      showDragHandle: true,
      builder: (sheetContext) => AfriGiftDrawer(
        gifts: gifts,
        coinBalance: _state.wallet.coinBalance,
        onBuyCoins: () {
          Navigator.pop(sheetContext);
          _toast('Open Wallet to buy coins.');
        },
        onGiftSelected: (gift) {
          Navigator.pop(sheetContext);
          _sendGift(gift);
        },
      ),
    );
  }

  Future<void> _sendGift(Gift gift) async {
    if (_state.wallet.coinBalance < gift.coinPrice) {
      _showBanner(AfriRoomState.connected,
          'Insufficient coins. Open Wallet to buy more coins.');
      _toast('Not enough coins for ${gift.name}.');
      return;
    }
    try {
      final res = await _state.api.post('/live-rooms/${widget.room.id}/gifts', {
        'giftId': gift.id,
        'quantity': 1,
        'idempotencyKey': 'gift-${DateTime.now().microsecondsSinceEpoch}',
      });
      await _state.refreshWallet();
      _flashGift(gift.name);
      setState(() {
        _giftCount += 1;
        _earningsEstimate +=
            int.tryParse('${res['creatorEarningMinor'] ?? gift.coinPrice}') ??
                gift.coinPrice;
      });
      _toast(
          'Sent ${gift.name}! Creator earned ${res['creatorEarningMinor']} coins');
    } on ApiException catch (e) {
      _showBanner(AfriRoomState.connected, 'Gift failed. ${e.message}');
      _toast('Gift failed. ${e.message}');
    }
  }

  void _toast(String message) {
    if (!mounted) {
      return;
    }
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _endRoom() async {
    final confirmed = await showAfriEndRoomConfirmation(context);
    if (!confirmed) {
      return;
    }
    if (!mounted) {
      return;
    }
    setState(() => _ending = true);
    final navigator = Navigator.of(context);
    try {
      await _state.api.post('/live-rooms/${widget.room.id}/end');
      if (!mounted) {
        return;
      }
      setState(() => _roomEnded = true);
      navigator.pop();
    } on ApiException catch (e) {
      _toast(e.message);
    } finally {
      if (mounted) {
        setState(() => _ending = false);
      }
    }
  }

  Future<void> _muteLatestViewer() async {
    final target = _messages.reversed.firstWhere(
      (m) => m.senderId != null && m.senderId != _state.userId,
      orElse: () => const ChatMessage(sender: '•', text: ''),
    );
    if (target.senderId == null) {
      _toast('No recent viewer to mute yet.');
      return;
    }
    try {
      await _state.api
          .post('/live-rooms/${widget.room.id}/mute/${target.senderId}', {
        'seconds': 600,
        'reason': 'Host muted from live controls',
      });
      _addSystem('${target.sender} was muted for 10 minutes.');
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _socket?.dispose();
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Widget _buildVideoPanel() {
    if (_error != null) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: AfriRoomStateBanner(
            state: AfriRoomState.hostDisconnected,
            message:
                'Could not connect to video. Check your network and retry.',
          ),
        ),
      );
    }
    if (_videoOn && _lkUrl != null && _lkToken != null) {
      return LiveKitRoomView(
          url: _lkUrl!, token: _lkToken!, publish: widget.isHost);
    }
    final ready = _lkUrl != null && _lkToken != null;
    // Full-bleed creator cover behind the connect prompt, so the stage reads like
    // a live broadcast even before video attaches (matches the room mockup).
    return Stack(
      fit: StackFit.expand,
      children: [
        AfriCover(
          imageUrl: widget.room.hostAvatarUrl,
          category: widget.room.category,
          initial: widget.room.hostName,
        ),
        Center(
          child: FilledButton.icon(
            onPressed: ready ? () => setState(() => _videoOn = true) : null,
            icon: Icon(
                widget.isHost ? Icons.videocam : Icons.play_circle_outline),
            label: Text(
                widget.isHost ? 'Go Live with Camera + Mic' : 'Connect Video'),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final coins = context.watch<AppState>().wallet.coinBalance;
    final blocked = _roomEnded || _roomSuspended || _userBanned;
    final bannerState = _roomSuspended
        ? AfriRoomState.suspended
        : _userBanned
            ? AfriRoomState.banned
            : _userMuted
                ? AfriRoomState.muted
                : _bannerState ??
                    (!_connected
                        ? AfriRoomState.reconnectingSocket
                        : _poorNetwork
                            ? AfriRoomState.poorNetwork
                            : AfriRoomState.connected);
    final bannerMessage = _roomSuspended
        ? 'This room was suspended by moderation.'
        : _userBanned
            ? 'You were removed from this room.'
            : _userMuted
                ? 'You can watch, but chat is muted in this room.'
                : _bannerMessage;

    return AfriLiveRoomShell(
      stage: AfriVideoStage(
        video: _buildVideoPanel(),
        ready: _lkUrl != null && _lkToken != null,
        isHost: widget.isHost,
        videoOn: _videoOn,
        roomEnded: _roomEnded,
        coverImageUrl: widget.room.hostAvatarUrl,
        coverCategory: widget.room.category,
        coverInitial: widget.room.hostName,
        onStartVideo: blocked ? null : () => setState(() => _videoOn = true),
        overlay: AfriLiveTopBar(
          creatorName: widget.room.hostName ?? 'Creator',
          avatarUrl: widget.room.hostAvatarUrl,
          category: widget.room.category,
          language: widget.room.language,
          following: _following,
          viewerCount: _viewerCount,
          onClose: () => Navigator.pop(context),
          onFollow: blocked ? null : _toggleFollow,
          // Viewers can open the creator's profile; a host wouldn't tap into
          // their own profile from their own room.
          onCreatorTap: widget.isHost || widget.room.hostId == null
              ? null
              : () => Navigator.push(
                    context,
                    MaterialPageRoute(
                        builder: (_) => CreatorProfileScreen(
                            creatorId: widget.room.hostId!)),
                  ),
          onReport: widget.isHost
              ? null
              : () => Navigator.push(
                    context,
                    MaterialPageRoute(
                        builder: (_) => ReportScreen(
                            roomId: widget.room.id,
                            targetUserId: widget.room.hostId,
                            label: 'room')),
                  ),
        ),
        banner: bannerState == AfriRoomState.connected
            ? null
            : AfriRoomStateBanner(state: bannerState, message: bannerMessage),
        reactionLayer: AfriReactionLayer(reactions: _reactions),
        giftAnimationLayer: AfriGiftAnimationLayer(
            giftLabel: _lastGift, imageUrl: _lastGiftImage),
      ),
      bottomMeta: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          AfriTopGifterStrip(gifters: _topGifters),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 2),
            child: Row(
              children: [
                const AfriLiveBadge(),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    [
                      widget.room.category,
                      widget.room.country,
                      widget.room.language,
                    ].where((value) => value.trim().isNotEmpty).join(' · '),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ),
                Text('$coins coins',
                    style: Theme.of(context).textTheme.labelMedium),
              ],
            ),
          ),
        ],
      ),
      hostControls: widget.isHost
          ? AfriHostControlsPanel(
              viewerCount: _viewerCount,
              giftCount: _giftCount,
              earningsEstimate: _earningsEstimate,
              cameraOn: _cameraOn,
              micOn: _micOn,
              chatVisible: _chatVisible,
              lowData: _lowData,
              poorNetwork: _poorNetwork,
              socketConnected: _connected,
              ending: _ending,
              onCameraChanged: (v) => setState(() => _cameraOn = v),
              onMicChanged: (v) => setState(() => _micOn = v),
              onChatVisibleChanged: (v) => setState(() => _chatVisible = v),
              onLowDataChanged: (v) => setState(() => _lowData = v),
              onMuteUser: _muteLatestViewer,
              onSafety: () => Navigator.push(
                context,
                MaterialPageRoute(
                    builder: (_) =>
                        ReportScreen(roomId: widget.room.id, label: 'room')),
              ),
              onEndRoom: _endRoom,
            )
          : null,
      chat: _chatVisible
          ? AfriChatOverlay(messages: _messages, controller: _scroll)
          : const Center(child: Text('Chat hidden by host controls')),
      input: AfriChatInput(
        controller: _input,
        enabled: !blocked && !_userMuted && _connected,
        mutedLabel: _userMuted
            ? 'You can watch, but chat is muted in this room.'
            : blocked
                ? 'This room is no longer accepting chat.'
                : 'Chat is reconnecting.',
        onSend: _sendMessage,
        onGift: blocked
            ? () => _toast('Gifts are closed for this room.')
            : _openGiftSheet,
        onReaction: _addReaction,
      ),
    );
  }
}
