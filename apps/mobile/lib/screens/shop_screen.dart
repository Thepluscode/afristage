import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/afri_theme.dart';
import '../core/app_state.dart';
import '../widgets/afri_ui.dart';

/// The seller's side of the marketplace: open a shop, list what you sell, and
/// see the state of each item. Pinning happens in the live room (see
/// RoomScreen), because that is where a host decides what to show and when.
class ShopScreen extends StatefulWidget {
  const ShopScreen({super.key});

  @override
  State<ShopScreen> createState() => _ShopScreenState();
}

class _ShopScreenState extends State<ShopScreen> {
  Map<String, dynamic>? _shop;
  List<Map<String, dynamic>> _products = const [];
  bool _loading = true;
  String? _error;

  AppState get _state => context.read<AppState>();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      // No shop yet is a legitimate state, not an error — the API answers with
      // an empty body and the screen offers to open one.
      final shop = await _state.api.getOptionalMap('/shops/me');
      final products = shop == null
          ? const <dynamic>[]
          : await _state.api.getList('/shops/me/products');
      if (!mounted) return;
      setState(() {
        _shop = shop;
        _products = products.cast<Map<String, dynamic>>();
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    }
  }

  void _toast(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _createShop() async {
    final name = await _promptText(
      title: 'Open your shop',
      label: 'Shop name',
      helper: 'Buyers see this next to every product.',
    );
    if (name == null || name.trim().isEmpty) return;
    try {
      await _state.api.post('/shops', {'name': name.trim()});
      _toast('Shop created. An admin reviews it before you can sell.');
      await _load();
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  Future<void> _addProduct() async {
    final title = await _promptText(
      title: 'New product',
      label: 'Product name',
      helper: 'What are you selling?',
    );
    if (title == null || title.trim().isEmpty) return;
    if (!mounted) return;

    final priceText = await _promptText(
      title: 'Price',
      label: 'Price in coins',
      helper: 'What a viewer pays. 100 coins ≈ ₦1,000.',
      numeric: true,
    );
    final price = int.tryParse((priceText ?? '').trim());
    if (price == null || price < 1) {
      if (priceText != null) _toast('Enter a price of at least 1 coin.');
      return;
    }
    if (!mounted) return;

    final stockText = await _promptText(
      title: 'Stock',
      label: 'How many do you have?',
      helper: 'Leave blank for unlimited.',
      numeric: true,
    );
    final stock = int.tryParse((stockText ?? '').trim());

    try {
      await _state.api.post('/shops/me/products', {
        'title': title.trim(),
        'priceCoins': price,
        if (stock != null) 'stock': stock,
      });
      _toast('Added $title. Set it live to sell it.');
      await _load();
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  Future<void> _setStatus(Map<String, dynamic> product, String status) async {
    try {
      await _state.api
          .patch('/shops/me/products/${product['id']}', {'status': status});
      await _load();
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  Future<String?> _promptText({
    required String title,
    required String label,
    String? helper,
    bool numeric = false,
  }) =>
      showDialog<String>(
        context: context,
        builder: (_) => _ShopPrompt(
            title: title, label: label, helper: helper, numeric: numeric),
      );

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      // A plain spinner, not AfriLoadingState — that widget is a full-screen
      // Scaffold and cannot sit inside AfriScaffold's scrolling children.
      return const AfriScaffold(
        title: 'Shop',
        children: [
          SizedBox(
              height: 240,
              child: Center(child: CircularProgressIndicator(strokeWidth: 2))),
        ],
      );
    }
    if (_error != null) {
      return AfriScaffold(
        title: 'Shop',
          children: [
          AfriErrorState(
              title: 'Shop unavailable', body: _error!, onRetry: _load)
        ],
      );
    }

    final shop = _shop;
    if (shop == null) {
      return AfriScaffold(
        title: 'Shop',
        onRefresh: _load,
        children: [
          const AfriEmptyState(
            icon: CupertinoIcons.bag,
            title: 'Sell to the room you already have',
            body:
                'Open a shop, list what you sell, and pin an item while you are live. '
                'Buyers pay in coins and the money lands in your earnings.',
          ),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: _createShop,
            icon: const Icon(CupertinoIcons.add),
            label: const Text('Open my shop'),
          ),
        ],
      );
    }

    final status = shop['status'] as String? ?? 'PENDING';
    return AfriScaffold(
      title: 'Shop',
      onRefresh: _load,
      children: [
        _ShopStatusCard(name: shop['name'] as String? ?? 'My shop', status: status),
        const SizedBox(height: 16),
        AfriSectionHeader(
          title: 'Products',
          trailing: TextButton.icon(
            onPressed: _addProduct,
            icon: const Icon(CupertinoIcons.add, size: 16),
            label: const Text('Add'),
          ),
        ),
        if (_products.isEmpty)
          const AfriEmptyState(
            icon: CupertinoIcons.cube_box,
            title: 'Nothing listed yet',
            body: 'Add your first product, then set it live to sell it.',
          ),
        for (final product in _products) ...[
          _ProductCard(
            product: product,
            onSetStatus: (next) => _setStatus(product, next),
          ),
          const SizedBox(height: 10),
        ],
      ],
    );
  }
}

/// The controller lives in this State, so it is disposed only after the dialog
/// route is fully removed — disposing it right after `showDialog` returns lets
/// the still-animating TextField read a dead controller (same reason as
/// creator_screen's _PromptDialog).
class _ShopPrompt extends StatefulWidget {
  const _ShopPrompt({
    required this.title,
    required this.label,
    this.helper,
    this.numeric = false,
  });

  final String title;
  final String label;
  final String? helper;
  final bool numeric;

  @override
  State<_ShopPrompt> createState() => _ShopPromptState();
}

class _ShopPromptState extends State<_ShopPrompt> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.title),
      content: TextField(
        controller: _controller,
        autofocus: true,
        keyboardType:
            widget.numeric ? TextInputType.number : TextInputType.text,
        decoration:
            InputDecoration(labelText: widget.label, helperText: widget.helper),
      ),
      actions: [
        TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel')),
        FilledButton(
          onPressed: () => Navigator.pop(context, _controller.text),
          child: const Text('Save'),
        ),
      ],
    );
  }
}

class _ShopStatusCard extends StatelessWidget {
  const _ShopStatusCard({required this.name, required this.status});

  final String name;
  final String status;

  @override
  Widget build(BuildContext context) {
    // Approval is the gate on selling, so the screen says plainly where the
    // shop stands rather than letting a creator wonder why nothing sells.
    final (message, accent) = switch (status) {
      'APPROVED' => (
          'Approved. Pin a product while you are live to start selling.',
          AfriColors.teal
        ),
      'SUSPENDED' => (
          'Suspended. Your products are not on sale. Contact support.',
          AfriColors.gold
        ),
      _ => (
          'Awaiting review. You can list products now; they go on sale once an admin approves the shop.',
          AfriColors.gold
        ),
    };
    return AfriCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Expanded(
              child: Text(name,
                  style: const TextStyle(
                      fontWeight: FontWeight.w900, fontSize: 16)),
            ),
            AfriChip(label: status, selected: accent == AfriColors.teal),
          ]),
          const SizedBox(height: 8),
          Text(message,
              style: TextStyle(
                  fontSize: 12.5, color: Colors.white.withValues(alpha: 0.7))),
        ],
      ),
    );
  }
}

class _ProductCard extends StatelessWidget {
  const _ProductCard({required this.product, required this.onSetStatus});

  final Map<String, dynamic> product;
  final ValueChanged<String> onSetStatus;

  @override
  Widget build(BuildContext context) {
    final status = product['status'] as String? ?? 'DRAFT';
    final stock = product['stock'];
    return AfriCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Expanded(
              child: Text(product['title'] as String? ?? 'Item',
                  style: const TextStyle(fontWeight: FontWeight.w800)),
            ),
            AfriChip(label: status, selected: status == 'ACTIVE'),
          ]),
          const SizedBox(height: 6),
          Row(children: [
            const Icon(CupertinoIcons.money_dollar_circle_fill,
                color: AfriColors.gold, size: 14),
            const SizedBox(width: 4),
            Text('${product['priceCoins'] ?? 0}',
                style: const TextStyle(
                    color: AfriColors.gold, fontWeight: FontWeight.w800)),
            const SizedBox(width: 12),
            // null stock is unlimited — showing "0 left" would read as sold out.
            Text(stock == null ? 'Unlimited' : '$stock in stock',
                style: TextStyle(
                    fontSize: 12, color: Colors.white.withValues(alpha: 0.6))),
          ]),
          const SizedBox(height: 10),
          Row(children: [
            if (status != 'ACTIVE')
              FilledButton(
                onPressed: () => onSetStatus('ACTIVE'),
                child: const Text('Set live'),
              ),
            if (status == 'ACTIVE')
              OutlinedButton(
                onPressed: () => onSetStatus('DRAFT'),
                child: const Text('Take down'),
              ),
            const SizedBox(width: 8),
            if (status != 'ARCHIVED')
              TextButton(
                onPressed: () => onSetStatus('ARCHIVED'),
                child: const Text('Archive'),
              ),
          ]),
        ],
      ),
    );
  }
}
