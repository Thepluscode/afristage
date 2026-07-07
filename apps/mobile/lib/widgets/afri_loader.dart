import 'package:flutter/material.dart';

import 'afri_ui.dart';

/// The one async-screen ladder (load → spinner / error+retry / empty / data)
/// that every list screen used to hand-roll: a `late Future` field, initState
/// kick-off, `_refresh`, `mounted` guards, and the four-branch
/// `ConnectionState` switch. Screens now declare WHAT loads and how the three
/// terminal states look; this widget owns HOW loading behaves.
///
/// The rendered tree intentionally matches the old hand-rolled screens
/// byte-for-byte (spinner centering, ListView paddings, the 60px empty-state
/// inset) so existing widget tests hold across the migration.
class AfriLoader<T> extends StatefulWidget {
  const AfriLoader({
    super.key,
    required this.load,
    required this.builder,
    required this.errorTitle,
    this.errorBody = 'Check your connection and try again.',
    this.isEmpty,
    this.emptyBuilder,
    this.refreshable = true,
  });

  /// Kicked off once on mount, again on retry/reload/pull-to-refresh.
  final Future<T> Function() load;

  /// Content for loaded, non-empty data. Must be scrollable when
  /// [refreshable] (every migrated screen already builds a ListView).
  /// [refresh] lets in-content actions (claim, unblock…) reload in place.
  final Widget Function(
      BuildContext context, T data, Future<void> Function() refresh) builder;

  final String errorTitle;
  final String errorBody;

  /// When provided and true for the loaded data, [emptyBuilder] renders
  /// instead of [builder] — inside the standard scrollable empty layout.
  /// It receives [refresh] so empty states can offer a retry action.
  final bool Function(T data)? isEmpty;
  final Widget Function(BuildContext context, Future<void> Function() refresh)?
      emptyBuilder;

  /// Wraps everything in a RefreshIndicator (the default for list screens).
  final bool refreshable;

  @override
  AfriLoaderState<T> createState() => AfriLoaderState<T>();
}

/// Public so screens with out-of-content actions can reach reload/refresh
/// through a GlobalKey<AfriLoaderState<T>> — no controller class needed.
class AfriLoaderState<T> extends State<AfriLoader<T>> {
  late Future<T> _future;

  @override
  void initState() {
    super.initState();
    _future = widget.load();
  }

  /// Fire-and-forget re-load (error retry, post-action reloads).
  void reload() {
    setState(() {
      _future = widget.load();
    });
  }

  /// Awaitable re-load (pull-to-refresh keeps its spinner until done).
  Future<void> refresh() async {
    final f = widget.load();
    setState(() {
      _future = f;
    });
    // The ladder shows the error state on failure; the indicator just closes.
    try {
      await f;
    } catch (_) {
      /* rendered by the error branch, never thrown into the indicator */
    }
  }

  @override
  Widget build(BuildContext context) {
    final ladder = FutureBuilder<T>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              AfriErrorState(
                title: widget.errorTitle,
                body: widget.errorBody,
                onRetry: reload,
              ),
            ],
          );
        }
        final data = snapshot.data as T;
        if (widget.isEmpty?.call(data) == true) {
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [widget.emptyBuilder!(context, refresh)],
          );
        }
        return widget.builder(context, data, refresh);
      },
    );
    if (!widget.refreshable) return ladder;
    return RefreshIndicator(onRefresh: refresh, child: ladder);
  }
}
