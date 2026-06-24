import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/app_state.dart';
import '../models/models.dart';
import '../widgets/afri_live.dart';
import '../widgets/afri_ui.dart';
import 'room_screen.dart';

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  // Quick-browse categories (display label -> CreatorCategory enum value).
  static const _browseCategories = <(String, String)>[
    ('Music', 'MUSIC'),
    ('Comedy', 'COMEDY'),
    ('Dance', 'DANCE'),
    ('Talk', 'TALK'),
    ('Faith', 'FAITH'),
    ('Education', 'EDUCATION'),
    ('Football', 'FOOTBALL'),
    ('Gaming', 'GAMING'),
    ('Diaspora', 'DIASPORA'),
    ('Relationships', 'RELATIONSHIPS'),
  ];

  final _controller = TextEditingController();
  Future<List<LiveRoom>>? _results;
  String _query = '';
  // The last load run, so the error-retry button re-runs whatever produced the
  // current results (text search or category browse), not always a text search.
  Future<List<LiveRoom>> Function()? _lastLoad;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _run(String label, Future<List<LiveRoom>> Function() loader) {
    setState(() {
      _query = label;
      _lastLoad = loader;
      _results = loader();
    });
  }

  void _search(String q) {
    final query = q.trim();
    if (query.isEmpty) {
      setState(() {
        _query = '';
        _results = null;
        _lastLoad = null;
      });
      return;
    }
    _run(query, () => _fetch('/live-rooms?q=${Uri.encodeQueryComponent(query)}'));
  }

  void _browse(String label, String category) {
    _controller.clear();
    _run(label, () => _fetch('/live-rooms?category=$category'));
  }

  Future<List<LiveRoom>> _fetch(String path) async {
    final data = await context.read<AppState>().api.getList(path);
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
          ? ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const AfriEmptyState(
                  icon: Icons.search,
                  title: 'Find a live room',
                  body:
                      'Search by room title or creator name to jump into a stage.',
                ),
                const SizedBox(height: 24),
                Text('Browse by category',
                    style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    for (final (label, category) in _browseCategories)
                      GestureDetector(
                        onTap: () => _browse(label, category),
                        child: AfriChip(label: label),
                      ),
                  ],
                ),
              ],
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
                      onRetry: () =>
                          setState(() => _results = _lastLoad?.call()),
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
                      body:
                          'Try a different name, or check back when more creators are live.',
                    ),
                  );
                }
                return GridView.builder(
                  padding: const EdgeInsets.all(16),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    mainAxisSpacing: 14,
                    crossAxisSpacing: 14,
                    childAspectRatio: 0.76,
                  ),
                  itemCount: rooms.length,
                  itemBuilder: (context, i) => AfriLiveCard(
                    title: rooms[i].title,
                    category: rooms[i].category,
                    creator: rooms[i].hostName,
                    country: rooms[i].country,
                    imageUrl: rooms[i].hostAvatarUrl,
                    viewerCount: rooms[i].viewerCount,
                    width: double.infinity,
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                          builder: (_) => RoomScreen(room: rooms[i])),
                    ),
                  ),
                );
              },
            ),
    );
  }
}
