import 'package:flutter/material.dart';

import '../api_client.dart';
import '../main.dart';
import '../theme.dart';
import '../widgets/die_face.dart';

/// Dice store: buy a dice skin with coins/gold from the wallet, then equip it.
class DiceStoreScreen extends StatefulWidget {
  const DiceStoreScreen({super.key});

  @override
  State<DiceStoreScreen> createState() => _DiceStoreScreenState();
}

class _DiceStoreScreenState extends State<DiceStoreScreen> {
  List<dynamic> _items = [];
  bool _loading = true;
  bool _busy = false;
  String? _error;
  String? _message;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final state = AppScope.of(context);
    try {
      final data = await state.api.cosmetics();
      if (!mounted) return;
      setState(() {
        _items = (data['items'] as List?) ?? [];
        _loading = false;
        _error = null;
      });
    } on ApiException catch (err) {
      if (mounted) {
        setState(() {
          _error = err.message;
          _loading = false;
        });
      }
    }
  }

  Future<void> _buy(Map<String, dynamic> item, String currency) async {
    final state = AppScope.of(context);
    setState(() {
      _busy = true;
      _error = null;
      _message = null;
    });
    try {
      final data = await state.api.buyItem(item['id'] as int, currency);
      setState(
        () => _message = data['created'] == true
            ? 'تم شراء ${item['name']} وأصبح نردك الحالي'
            : '${item['name']} موجود في مخزونك مسبقاً',
      );
      await state.refresh();
      await _load();
    } on ApiException catch (err) {
      setState(() => _error = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _equip(Map<String, dynamic> item) async {
    final state = AppScope.of(context);
    setState(() {
      _busy = true;
      _error = null;
      _message = null;
    });
    try {
      await state.api.equipItem(item['id'] as int);
      setState(() => _message = 'تم استخدام ${item['name']}');
      await state.refresh();
      await _load();
    } on ApiException catch (err) {
      setState(() => _error = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    return SunsetScaffold(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        appBar: AppBar(title: const Text('متجر النردات')),
        body: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              GlassPanel(
                child: Row(
                  children: [
                    const Text('الرصيد', style: TextStyle(fontWeight: FontWeight.bold)),
                    const Spacer(),
                    Text('🪙 ${state.coins} كوين · 🏆 ${state.gold} ذهب', style: const TextStyle(color: AppColors.gold)),
                  ],
                ),
              ),
              if (_message != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text(_message!, style: const TextStyle(color: AppColors.ok))),
              if (_error != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text(_error!, style: const TextStyle(color: AppColors.danger))),
              const SizedBox(height: 12),
              if (_loading) const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator())),
              for (final entry in _items)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: _ItemCard(
                    item: entry as Map<String, dynamic>,
                    busy: _busy,
                    onBuy: _buy,
                    onEquip: _equip,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ItemCard extends StatelessWidget {
  const _ItemCard({required this.item, required this.busy, required this.onBuy, required this.onEquip});

  final Map<String, dynamic> item;
  final bool busy;
  final void Function(Map<String, dynamic> item, String currency) onBuy;
  final void Function(Map<String, dynamic> item) onEquip;

  @override
  Widget build(BuildContext context) {
    final owned = item['owned'] == true;
    final equipped = item['equipped'] == true;
    final coins = (item['price_coins'] ?? 0) as int;
    final gold = (item['price_gold'] ?? 0) as int;
    return GlassPanel(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          DieFace(
            imageUrl: '${item['image_url'] ?? ''}',
            color: colorFromHex('${item['accent'] ?? ''}', AppColors.gold),
            pipColor: colorFromHex('${item['pips'] ?? ''}', const Color(0xFF1A1224)),
            size: 56,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(child: Text('${item['name']}', style: const TextStyle(fontWeight: FontWeight.bold))),
                    if (equipped) const Text('مُستخدم', style: TextStyle(color: AppColors.ok, fontSize: 12)),
                  ],
                ),
                Text('${item['kind'] == 'theme' ? 'موضوع الطاولة' : 'نرد'} · ${item['description']}',
                    style: const TextStyle(color: AppColors.muted, fontSize: 12)),
                const SizedBox(height: 8),
                if (!owned)
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      if (coins > 0)
                        ElevatedButton(onPressed: busy ? null : () => onBuy(item, 'coins'), child: Text('شراء بـ $coins 🪙')),
                      if (gold > 0)
                        ElevatedButton(onPressed: busy ? null : () => onBuy(item, 'gold'), child: Text('شراء بـ $gold 🏆')),
                    ],
                  )
                else if (!equipped)
                  OutlinedButton(onPressed: busy ? null : () => onEquip(item), child: const Text('استخدام'))
                else
                  const Text('في مخزونك', style: TextStyle(color: AppColors.muted, fontSize: 12)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
