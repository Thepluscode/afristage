import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/app_state.dart';
import '../models/models.dart';
import '../widgets/afri_ui.dart';
import 'room_screen.dart';

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final _controller = TextEditingController();
  Future<List<LiveRoom>>? _results;
  String _query = '';

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _search(String q) {
    final query = q.trim();
    if (query.isEmpty) {
      setState(() {
        _query = '';
        _results = null;
      });
      return;
    }
    setState(() {
      _query = query;
      _results = _load(query);
    });
  }

  Future<List<LiveRoom>> _load(String q) async {
    final data =
        await context.read<AppState>().api.getList('/live-rooms?q=${Uri.encodeQueryComponent(q)}');
    return data
        .cast<Map<String, dynamic>>()
        .map(LiveRoom.fromJson)
        .where((r) => r.status == 'LIVE')
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: TextField(
          controller: _controller,
          autofocus: true,
          textInputAction: TextInputAction.search,
          onSubmitted: _search,
          decoration: const InputDecoration(
            hintText: 'Search live rooms or creators',
            border: InputBorder.none,
          ),
        ),
        actions: [
          IconButton(
            tooltip: 'Search',
            onPressed: () => _search(_controller.text),
            icon: const Icon(Icons.search),
          ),
        ],
      ),
      body: _results == null
          ? const Padding(
              padding: EdgeInsets.all(16),
              child: AfriEmptyState(
                icon: Icons.search,
                title: 'Find a live room',
                body: 'Search by room title or creator name to jump into a stage.',
              ),
            )
          : FutureBuilder<List<LiveRoom>>(
              future: _results,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snapshot.hasError) {
                  return Padding(
                    padding: const EdgeInsets.all(16),
                    child: AfriErrorState(
                      title: 'Search failed',
                      body: 'Check your connection and try again.',
                      onRetry: () => _search(_query),
                    ),
                  );
                }
                final rooms = snapshot.data ?? const [];
                if (rooms.isEmpty) {
                  return Padding(
                    padding: const EdgeInsets.all(16),
                    child: AfriEmptyState(
                      icon: Icons.live_tv_outlined,
                      title: 'No live rooms for "$_query"',
                      body: 'Try a different name, or check back when more creators are live.',
                    ),
                  );
                }
                return ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: rooms.length,
                  itemBuilder: (context, i) => Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: AfriLiveRoomCard(
                      room: rooms[i],
                      viewerCount: 0,
                      onTap: () => Navigator.push(
                        context,
                        MaterialPageRoute(builder: (_) => RoomScreen(room: rooms[i])),
                      ),
                    ),
                  ),
                );
              },
            ),
    );
  }
}
