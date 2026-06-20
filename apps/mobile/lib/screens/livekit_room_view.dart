import 'package:flutter/material.dart';
import 'package:livekit_client/livekit_client.dart';

import '../core/afri_theme.dart';

/// Renders a LiveKit session for one room. Host (`publish: true`) publishes
/// camera+mic; viewer subscribes and renders the first remote video track.
/// Owns the full connect/disconnect lifecycle and cleans up on dispose.
class LiveKitRoomView extends StatefulWidget {
  const LiveKitRoomView({
    super.key,
    required this.url,
    required this.token,
    required this.publish,
  });

  final String url;
  final String token;
  final bool publish;

  @override
  State<LiveKitRoomView> createState() => _LiveKitRoomViewState();
}

class _LiveKitRoomViewState extends State<LiveKitRoomView> {
  final Room _room = Room();
  String _status = 'Connecting…';
  bool _connected = false;

  @override
  void initState() {
    super.initState();
    _room.addListener(_onRoomChange);
    _connect();
  }

  Future<void> _connect() async {
    try {
      await _room.connect(widget.url, widget.token);
      if (widget.publish) {
        await _room.localParticipant?.setCameraEnabled(true);
        await _room.localParticipant?.setMicrophoneEnabled(true);
      }
      if (mounted) setState(() => _connected = true);
    } catch (_) {
      if (mounted) {
        setState(() => _status =
            'Could not connect to video. Check your network and retry.');
      }
    }
  }

  void _onRoomChange() {
    if (mounted) setState(() {});
  }

  /// First available video track: the host's own (publish) or any remote (viewer).
  VideoTrack? _activeVideoTrack() {
    if (widget.publish) {
      for (final pub
          in _room.localParticipant?.videoTrackPublications ?? const []) {
        final track = pub.track;
        if (track != null) return track;
      }
      return null;
    }
    for (final participant in _room.remoteParticipants.values) {
      for (final pub in participant.videoTrackPublications) {
        final track = pub.track;
        if (track != null) return track;
      }
    }
    return null;
  }

  @override
  void dispose() {
    _room.removeListener(_onRoomChange);
    _room.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final track = _activeVideoTrack();
    if (track != null) return VideoTrackRenderer(track);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: AfriColors.surface.withValues(alpha: 0.86),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: AfriColors.border),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.videocam_off_outlined,
                  color: AfriColors.teal, size: 34),
              const SizedBox(height: 10),
              Text(
                _connected
                    ? (widget.publish
                        ? 'Starting camera preview…'
                        : 'Waiting for creator video…')
                    : _status,
                style: const TextStyle(color: Colors.white70),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
