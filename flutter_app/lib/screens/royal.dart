import 'package:flutter/material.dart';

import '../api_client.dart';
import '../main.dart';
import '../theme.dart';

/// لوحة رويال: المستوى الحالي، النقاط المتبقية للترقية، المستويات الخمسة
/// وحزم الجواهر التي تمنح نقاط رويال. كل قيمة تأتي من الخادم (`/api/royal`)،
/// والرصيد لا يُضاف إلا بعد تأكيد الدفع على الخادم.
class RoyalSheet extends StatefulWidget {
  const RoyalSheet({super.key});

  @override
  State<RoyalSheet> createState() => _RoyalSheetState();
}

class _RoyalSheetState extends State<RoyalSheet> {
  Map<String, dynamic>? _data;
  String? _error;
  String? _message;
  int? _busyPack;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    try {
      final data = await AppScope.of(context).api.royal();
      if (!mounted) return;
      setState(() {
        _data = data;
        _error = null;
      });
    } on ApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    }
  }

  Future<void> _buy(Map<String, dynamic> pack) async {
    final state = AppScope.of(context);
    setState(() {
      _busyPack = pack['id'] as int;
      _message = null;
      _error = null;
    });
    try {
      final result = await state.api.buyPack(pack['id'] as int, 'IQD');
      final payment = result['payment'] as Map<String, dynamic>?;
      if (!mounted) return;
      setState(() => _message = '${payment?['message'] ?? 'تم إنشاء طلب الشحن'}');
      await state.refresh();
      await _load();
    } on ApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    } finally {
      if (mounted) setState(() => _busyPack = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = (_data?['status'] as Map<String, dynamic>?) ?? const <String, dynamic>{};
    final tier = (status['tier'] as Map<String, dynamic>?) ?? const <String, dynamic>{};
    final tiers = (_data?['tiers'] as List?) ?? const <dynamic>[];
    final packages = (_data?['packages'] as List?) ?? const <dynamic>[];
    final points = (status['points'] as num?)?.toInt() ?? 0;
    final toNext = (status['points_to_next'] as num?)?.toInt() ?? 0;
    final progress = ((status['progress'] as num?)?.toInt() ?? 0) / 100;
    final currentLevel = (status['level'] as num?)?.toInt() ?? 0;

    return GlassPanel(
      radius: 22,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Text('مستوى رويال', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              const Spacer(),
              IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close)),
            ],
          ),
          if (_error != null) Text(_error!, style: const TextStyle(color: AppColors.danger)),
          if (_message != null) Text(_message!, style: const TextStyle(color: AppColors.ok)),
          const SizedBox(height: 6),
          Text(
            '${tier['name_ar'] ?? 'رويال 1'}',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: AppColors.gold),
          ),
          Text(
            'الحالية: $points نقطة رويال · للترقية لا تزال بحاجة: $toNext',
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.muted, fontSize: 12),
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(value: progress.clamp(0, 1), minHeight: 10),
          ),
          const SizedBox(height: 14),
          const Text('المستويات الخمسة', style: TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          for (final raw in tiers)
            if (raw is Map<String, dynamic>)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(
                  children: [
                    Icon(
                      ((raw['level'] as num?)?.toInt() ?? 0) <= currentLevel
                          ? Icons.workspace_premium
                          : Icons.lock_outline,
                      size: 16,
                      color: ((raw['level'] as num?)?.toInt() ?? 0) <= currentLevel
                          ? AppColors.gold
                          : AppColors.muted,
                    ),
                    const SizedBox(width: 8),
                    Expanded(child: Text('${raw['name_ar']}')),
                    Text(
                      '${raw['required_points']} نقطة',
                      style: const TextStyle(color: AppColors.muted, fontSize: 12),
                    ),
                  ],
                ),
              ),
          const Divider(height: 22),
          const Text('حزم الجواهر ونقاط رويال', style: TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          for (final raw in packages)
            if (raw is Map<String, dynamic>)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('${raw['amount']} جوهرة · +${raw['royal_points']} نقطة رويال'),
                          Text(
                            '${raw['price_iqd']} IQD',
                            style: const TextStyle(color: AppColors.muted, fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                    ElevatedButton(
                      onPressed: _busyPack == null ? () => _buy(raw) : null,
                      child: Text(_busyPack == raw['id'] ? '...' : 'شحن'),
                    ),
                  ],
                ),
              ),
          if (_data == null && _error == null)
            const Padding(
              padding: EdgeInsets.only(top: 10),
              child: Center(child: CircularProgressIndicator()),
            ),
          const SizedBox(height: 6),
          const Text(
            'لا يُضاف الرصيد ولا نقاط رويال إلا بعد تأكيد مزود الدفع على الخادم.',
            style: TextStyle(color: AppColors.muted, fontSize: 11),
          ),
        ],
      ),
    );
  }
}
