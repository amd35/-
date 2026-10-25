import 'package:flutter/material.dart';

import '../api_client.dart';
import '../main.dart';
import '../theme.dart';
import '../widgets/die_face.dart';
import 'dice_store.dart';
import 'friends.dart';
import 'games.dart';
import 'rooms.dart';
import 'royal.dart';

/// The four main sections, in the order fixed by the specification:
/// home & store · games · voice rooms · friends.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    return SunsetScaffold(
      child: SafeArea(
        child: Scaffold(
          backgroundColor: Colors.transparent,
          appBar: AppBar(
            title: const Text('TON Voice'),
            actions: [
              _Chip(label: '🪙 ${state.coins}', color: AppColors.gold),
              const SizedBox(width: 6),
              _Chip(label: '🏆 ${state.gold}', color: AppColors.goldDeep),
              IconButton(
                tooltip: 'الإشعارات',
                icon: Badge(
                  isLabelVisible: state.notifications.isNotEmpty,
                  label: Text('${state.notifications.length}'),
                  child: const Icon(Icons.notifications_none),
                ),
                onPressed: () => _showNotifications(context, state),
              ),
              IconButton(
                tooltip: 'ملفي الشخصي',
                icon: const Icon(Icons.person_outline),
                onPressed: () => showModalBottomSheet<void>(
                  context: context,
                  backgroundColor: Colors.transparent,
                  isScrollControlled: true,
                  builder: (_) => const ProfileSheet(),
                ),
              ),
            ],
          ),
          body: IndexedStack(
            index: _index,
            children: const [HomeTab(), GamesScreen(), RoomsScreen(), FriendsScreen()],
          ),
          bottomNavigationBar: NavigationBar(
            selectedIndex: _index,
            onDestinationSelected: (value) => setState(() => _index = value),
            destinations: const [
              NavigationDestination(icon: Icon(Icons.home_outlined), label: 'الرئيسية والمتجر'),
              NavigationDestination(icon: Icon(Icons.casino_outlined), label: 'الألعاب'),
              NavigationDestination(icon: Icon(Icons.mic_none), label: 'الغرف الصوتية'),
              NavigationDestination(icon: Icon(Icons.people_outline), label: 'الأصدقاء'),
            ],
          ),
        ),
      ),
    );
  }

  void _showNotifications(BuildContext context, AppState state) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => GlassPanel(
        child: SizedBox(
          height: 380,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('الإشعارات', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 10),
              Expanded(
                child: state.notifications.isEmpty
                    ? const Center(child: Text('لا توجد إشعارات', style: TextStyle(color: AppColors.muted)))
                    : ListView.builder(
                        itemCount: state.notifications.length,
                        itemBuilder: (_, index) {
                          final item = state.notifications[index];
                          return ListTile(
                            dense: true,
                            title: Text('${item['title']}'),
                            subtitle: Text('${item['body']}'),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      alignment: Alignment.center,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.22),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.6)),
      ),
      child: Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w600)),
    );
  }
}

/// Home & store: balance, in-app adverts and offers, coin/gold packs, and the
/// Royal levels sheet (which replaces the old crown membership).
class HomeTab extends StatefulWidget {
  const HomeTab({super.key});

  @override
  State<HomeTab> createState() => _HomeTabState();
}

class _HomeTabState extends State<HomeTab> {
  Map<String, dynamic>? _store;
  List<dynamic> _orders = [];
  List<dynamic> _ledger = [];
  String? _message;
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final api = AppScope.of(context).api;
    try {
      final store = await api.store();
      final orders = await api.purchases();
      final ledger = await api.ledger();
      if (!mounted) return;
      setState(() {
        _store = store;
        _orders = (orders['orders'] as List?) ?? [];
        _ledger = (ledger['entries'] as List?) ?? [];
        _error = null;
      });
    } on ApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    }
  }

  Future<void> _buyPack(Map<String, dynamic> pack) async {
    final state = AppScope.of(context);
    setState(() {
      _busy = true;
      _error = null;
      _message = null;
    });
    try {
      final result = await state.api.buyPack(pack['id'] as int, '${_store?['currency_default'] ?? 'IQD'}');
      final payment = result['payment'] as Map<String, dynamic>?;
      setState(() => _message = '${payment?['message'] ?? 'تم إنشاء طلب الشحن'}');
      await _load();
    } on ApiException catch (err) {
      setState(() => _error = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openRoyal() async {
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => const RoyalSheet(),
    );
    if (mounted) await _load();
  }

  Future<void> _requestWithdraw() async {
    final state = AppScope.of(context);
    final amount = TextEditingController();
    final method = TextEditingController();
    final account = TextEditingController();
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1A1224),
        title: const Text('طلب سحب'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('الحد الأدنى: ${state.meta?['withdrawal_min_coins'] ?? 50000} كوين · الرسوم ${state.meta?['withdrawal_fee_percent'] ?? 10}%'),
            const SizedBox(height: 8),
            TextField(controller: amount, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'المبلغ')),
            TextField(controller: method, decoration: const InputDecoration(labelText: 'طريقة الدفع (ZainCash، FastPay، تحويل بنكي)')),
            TextField(controller: account, decoration: const InputDecoration(labelText: 'بيانات المستفيد')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('إلغاء')),
          ElevatedButton(
            onPressed: () async {
              Navigator.pop(context);
              try {
                await state.api.withdraw(
                  currency: 'coins',
                  amount: int.tryParse(amount.text.trim()) ?? 0,
                  method: method.text.trim(),
                  beneficiary: {'account': account.text.trim()},
                  idempotencyKey: DateTime.now().microsecondsSinceEpoch.toString(),
                );
                setState(() => _message = 'تم إرسال طلب السحب إلى الإدارة');
                await _load();
              } on ApiException catch (err) {
                setState(() => _error = err.message);
              }
            },
            child: const Text('إرسال الطلب'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final packs = (_store?['packs'] as List?) ?? [];
    final ads = (state.meta?['ads'] as List?) ?? [];
    final offers = (state.meta?['offers'] as List?) ?? [];

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          GlassPanel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text('الرصيد', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                Row(
                  children: [
                    _Chip(label: '🪙 ${state.coins} كوين', color: AppColors.gold),
                    const SizedBox(width: 8),
                    _Chip(label: '🏆 ${state.gold} ذهب', color: AppColors.goldDeep),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _requestWithdraw,
                        child: const Text('طلب سحب'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: ElevatedButton(
                        onPressed: _openRoyal,
                        child: const Text('رويال'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          if (ads.isNotEmpty) ...[
            const SizedBox(height: 12),
            GlassPanel(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('إعلانات داخلية', style: TextStyle(fontWeight: FontWeight.bold)),
                  for (final ad in ads) Padding(padding: const EdgeInsets.only(top: 6), child: Text('• ${ad['title']}: ${ad['body']}')),
                ],
              ),
            ),
          ],
          if (offers.isNotEmpty) ...[
            const SizedBox(height: 12),
            GlassPanel(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('العروض', style: TextStyle(fontWeight: FontWeight.bold)),
                  for (final offer in offers)
                    Padding(padding: const EdgeInsets.only(top: 6), child: Text('• ${offer['title']}: ${offer['body']}')),
                ],
              ),
            ),
          ],
          const SizedBox(height: 12),
          GlassPanel(
            child: Row(
              children: [
                DieFace(
                  imageUrl: '${state.equipped['dice']?['image_url'] ?? ''}',
                  color: colorFromHex('${state.equipped['dice']?['accent'] ?? ''}', AppColors.gold),
                  pipColor: colorFromHex('${state.equipped['dice']?['pips'] ?? ''}', const Color(0xFF1A1224)),
                  size: 48,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('متجر النردات', style: TextStyle(fontWeight: FontWeight.bold)),
                      Text(
                        state.equipped['dice'] == null
                            ? 'لم تشترِ نرداً بعد — نردك الحالي هو النرد الافتراضي'
                            : 'نردك الحالي: ${state.equipped['dice']!['name']}',
                        style: const TextStyle(color: AppColors.muted, fontSize: 12),
                      ),
                    ],
                  ),
                ),
                ElevatedButton(
                  onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const DiceStoreScreen())),
                  child: const Text('افتح'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          const Text('باقات الشحن', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisSpacing: 10,
            mainAxisSpacing: 10,
            childAspectRatio: 1.35,
            children: [
              for (final pack in packs)
                GlassPanel(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('${pack['name']}', style: const TextStyle(fontWeight: FontWeight.bold)),
                      Text('${pack['amount']} + ${pack['bonus']} ${pack['kind'] == 'gold' ? 'ذهب' : 'كوين'}',
                          style: const TextStyle(color: AppColors.muted, fontSize: 12)),
                      Text('${pack['price_iqd']} IQD · ${((pack['price_usd_cents'] ?? 0) / 100).toStringAsFixed(2)} USD',
                          style: const TextStyle(color: AppColors.gold, fontSize: 12)),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: _busy ? null : () => _buyPack(pack as Map<String, dynamic>),
                          child: const Text('شراء'),
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
          if (_message != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text(_message!, style: const TextStyle(color: AppColors.ok))),
          if (_error != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text(_error!, style: const TextStyle(color: AppColors.danger))),
          const SizedBox(height: 12),
          const Text('سجل العمليات', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          GlassPanel(
            child: Column(
              children: [
                if (_ledger.isEmpty) const Text('لا توجد عمليات', style: TextStyle(color: AppColors.muted)),
                for (final entry in _ledger.take(20))
                  ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    title: Text('${entry['kind']} · ${entry['amount']} ${entry['currency']}'),
                    subtitle: Text('${entry['note']} — الرصيد بعدها ${entry['balance_after']}'),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          GlassPanel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('طلبات الشحن', style: TextStyle(fontWeight: FontWeight.bold)),
                if (_orders.isEmpty) const Text('لا توجد طلبات', style: TextStyle(color: AppColors.muted)),
                for (final order in _orders.take(10))
                  Text('طلب #${order['id']} · ${order['amount']} ${order['currency']} · ${order['status']}'),
                const SizedBox(height: 6),
                Text(
                  (state.meta?['payments_configured'] ?? false)
                      ? 'بوابة الدفع جاهزة: يتم إضافة الرصيد بعد تأكيد إشعار مزود الدفع.'
                      : 'الشحن الإلكتروني غير مُفعّل بعد: يحتاج المشروع إلى مفاتيح مزود الدفع (Stripe) قبل أن يُضاف الرصيد تلقائياً.',
                  style: const TextStyle(color: AppColors.muted, fontSize: 12),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Profile, settings and sign-out.
class ProfileSheet extends StatefulWidget {
  const ProfileSheet({super.key});

  @override
  State<ProfileSheet> createState() => _ProfileSheetState();
}

class _ProfileSheetState extends State<ProfileSheet> {
  final _display = TextEditingController();
  final _bio = TextEditingController();
  String? _message;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final user = AppScope.of(context).user;
    _display.text = '${user?['display_name'] ?? ''}';
    _bio.text = '${user?['bio'] ?? ''}';
  }

  @override
  void dispose() {
    _display.dispose();
    _bio.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final state = AppScope.of(context);
    setState(() => _busy = true);
    try {
      await state.api.patch('/api/users/me', {'display_name': _display.text.trim(), 'bio': _bio.text.trim()});
      await state.refresh();
      setState(() => _message = 'تم الحفظ');
    } on ApiException catch (err) {
      setState(() => _message = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final user = state.user ?? {};
    return GlassPanel(
      radius: 22,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              CircleAvatar(radius: 26, child: Text('${(user['display_name'] ?? user['username'] ?? '?').toString().characters.first}')),
              const SizedBox(width: 12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${user['display_name'] ?? user['username']}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                  Text(
                      'ID: ${user['id']} · المستوى ${user['level']} · ${user['royal_name'] ?? 'رويال ${user['royal_level'] ?? 1}'}',
                      style: const TextStyle(color: AppColors.muted, fontSize: 12)),
                ],
              ),
            ],
          ),
          const SizedBox(height: 12),
          TextField(controller: _display, decoration: const InputDecoration(labelText: 'الاسم الظاهر')),
          const SizedBox(height: 10),
          TextField(controller: _bio, maxLines: 2, decoration: const InputDecoration(labelText: 'الوصف الشخصي')),
          const SizedBox(height: 10),
          ElevatedButton(onPressed: _busy ? null : _save, child: const Text('حفظ التعديلات')),
          if (_message != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_message!)),
          const Divider(height: 26),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('صلاحيات الإدارة'),
            subtitle: Text(user['is_admin'] == true ? '${user['admin_role']}' : 'حساب عضو'),
            trailing: const Icon(Icons.shield_outlined),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('تسجيل الخروج'),
            trailing: const Icon(Icons.logout),
            onTap: () async {
              await state.logout();
              if (context.mounted) Navigator.pop(context);
            },
          ),
        ],
      ),
    );
  }
}
