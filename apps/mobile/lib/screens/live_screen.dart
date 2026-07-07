import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/app_state.dart';
import '../models/models.dart';
import '../widgets/afri_live.dart';
import '../widgets/afri_loader.dart';
import '../widgets/afri_ui.dart';
import 'room_screen.dart';

/// "Live" tab — a grid of every room broadcasting right now.
class LiveScreen extends StatefulWidget {
  const LiveScreen({super.key});

  @override
  State<LiveScreen> createState() => _LiveScreenState();
}

class _LiveScreenState extends State<LiveScreen> {
  Future<List<LiveRoom>> _load() async {
    final data = await context.read<AppState>().api.getList('/live-rooms');
    return data
        .cast<Map<String, dynamic>>()
        .map(LiveRoom.fromJson)
        .where((r) => r.status == 'LIVE')
        .toList();
  }

  void _open(LiveRoom r) => Navigator.push(
      context, MaterialPageRoute(builder: (_) => RoomScreen(room: r)));

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Live now')),
      body: AfriLoader<List<LiveRoom>>(
        load: _load,
        errorTitle: 'Could not load live rooms',
        isEmpty: (rooms) => rooms.isEmpty,
        emptyBuilder: (_, refresh) => Padding(
          padding: const EdgeInsets.only(top: 80),
          child: AfriEmptyState(
            icon: Icons.live_tv,
            title: 'No rooms live right now',
            body: 'Check back soon when creators are on stage.',
            action:
                FilledButton(onPressed: refresh, child: const Text('Refresh')),
          ),
        ),
        builder: (context, rooms, refresh) {
          return GridView.builder(
            padding: const EdgeInsets.all(16),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisSpacing: 14,
              crossAxisSpacing: 14,
              childAspectRatio: 0.76,
            ),
            itemCount: rooms.length,
            itemBuilder: (_, i) => AfriLiveCard(
              title: rooms[i].title,
              category: rooms[i].category,
              creator: rooms[i].hostName,
              country: rooms[i].country,
              imageUrl: rooms[i].hostAvatarUrl,
              viewerCount: rooms[i].viewerCount,
              width: double.infinity,
              onTap: () => _open(rooms[i]),
            ),
          );
        },
      ),
    );
  }
}
