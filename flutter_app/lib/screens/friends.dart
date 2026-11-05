import 'package:flutter/material.dart';

import '../api_client.dart';
import '../main.dart';
import '../theme.dart';

class FriendsScreen extends StatefulWidget {
  const FriendsScreen({super.key});

  @override
  State<FriendsScreen> createState() => _FriendsScreenState();
}

class _FriendsScreenState extends State<FriendsScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 3, vsync: this);
  List<dynamic> _friends = [];
  List<dynamic> _requests = [];
  List<dynamic> _results = [];
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final api = AppScope.of(context).api;
    try {
      final friends = await api.friends();
      final requests = await api.friendRequests();
      if (!mounted) return;
      setState(() {
        _friends = (friends['friends'] as List?) ?? [];
        _requests = (requests['requests'] as List?) ?? [];
        _error = null;
      });
    } on ApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    }
  }

  Future<void> _search(String query) async {
    if (query.trim().isEmpty) return;
    try {
      final data = await AppScope.of(context).api.searchUsers(query.trim());
      if (mounted) setState(() => _results = (data['users'] as List?) ?? []);
    } on ApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        TabBar(
          controller: _tabs,
          labelColor: AppColors.gold,
          unselectedLabelColor: AppColors.muted,
          tabs: const [
            Tab(text: 'الأصدقاء'),
            Tab(text: 'الطلبات'),
            Tab(text: 'بحث'),
          ],
        ),
        if (_error != null) Padding(padding: const EdgeInsets.all(8), child: Text(_error!, style: const TextStyle(color: AppColors.danger))),
        Expanded(
          child: TabBarView(
            controller: _tabs,
            children: [
              RefreshIndicator(
                onRefresh: _load,
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    if (_friends.isEmpty) const Text('لا يوجد أصدقاء بعد', style: TextStyle(color: AppColors.muted)),
                    for (final friend in _friends)
                      GlassPanel(
                        child: ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: CircleAvatar(child: Text('${'${friend['display_name']}'.characters.first}')),
                          title: Text('${friend['display_name']}'),
                          subtitle: Text('ID: ${friend['id']} · ${friend['online'] == true ? 'متصل الآن' : 'غير متصل'} · مستوى ${friend['level']}'),
                          trailing: const Icon(Icons.chat_bubble_outline),
                          onTap: () => Navigator.push(
                            context,
                            MaterialPageRoute<void>(builder: (_) => DirectChatScreen(user: friend as Map<String, dynamic>)),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (_requests.isEmpty) const Text('لا توجد طلبات صداقة', style: TextStyle(color: AppColors.muted)),
                  for (final request in _requests)
                    GlassPanel(
                      child: Row(
                        children: [
                          Expanded(child: Text('${request['user']['display_name']} · مستوى ${request['user']['level']}')),
                          ElevatedButton(
                            onPressed: () async {
                              await AppScope.of(context).api.respondRequest(request['id'] as int, true);
                              await _load();
                            },
                            child: const Text('قبول'),
                          ),
                          const SizedBox(width: 6),
                          OutlinedButton(
                            onPressed: () async {
                              await AppScope.of(context).api.respondRequest(request['id'] as int, false);
                              await _load();
                            },
                            child: const Text('رفض'),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
              ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  TextField(
                    decoration: const InputDecoration(hintText: 'ابحث بالاسم أو المعرّف'),
                    onSubmitted: _search,
                  ),
                  const SizedBox(height: 10),
                  for (final user in _results)
                    GlassPanel(
                      child: Row(
                        children: [
                          Expanded(child: Text('${user['display_name']} · ID ${user['id']}')),
                          ElevatedButton(
                            onPressed: () async {
                              try {
                                await AppScope.of(context).api.addFriend(user['id'] as int);
                                if (mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم إرسال طلب الصداقة')));
                                }
                              } on ApiException catch (err) {
                                if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err.message)));
                              }
                            },
                            child: const Text('إضافة صديق'),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// Private conversation: live over the socket, REST as fallback.
class DirectChatScreen extends StatefulWidget {
  const DirectChatScreen({super.key, required this.user});

  final Map<String, dynamic> user;

  @override
  State<DirectChatScreen> createState() => _DirectChatScreenState();
}

class _DirectChatScreenState extends State<DirectChatScreen> {
  final _controller = TextEditingController();
  List<dynamic> _messages = [];
  AppState? _appState;
  late final void Function(Map<String, dynamic>) _listener = _onEvent;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      final state = AppScope.of(context);
      _appState = state;
      state.subscribe(_listener);
      try {
        final data = await state.api.directMessages(widget.user['id'] as int);
        if (!mounted) return;
        setState(() => _messages = (data['messages'] as List?) ?? []);
      } on ApiException catch (err) {
        if (mounted) setState(() => _messages = _messages);
      }
    });
  }

  @override
  void dispose() {
    _appState?.unsubscribe(_listener);
    _controller.dispose();
    super.dispose();
  }

  void _onEvent(Map<String, dynamic> payload) {
    final message = payload['message'];
    if (payload['type'] == 'dm' && message is Map<String, dynamic> && message['sender']?['id'] == widget.user['id']) {
      setState(() => _messages = [..._messages, message]);
    } else if (payload['type'] == 'dm_sent' && message is Map<String, dynamic>) {
      setState(() => _messages = [..._messages, message]);
    }
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    _controller.clear();
    final state = AppScope.of(context);
    if (!state.send({'type': 'dm', 'to': widget.user['id'], 'text': text})) {
      try {
        final message = await state.api.sendDirect(widget.user['id'] as int, text);
        if (mounted) setState(() => _messages = [..._messages, message]);
      } on ApiException catch (err) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err.message)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return SunsetScaffold(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        appBar: AppBar(
          title: Text('${widget.user['display_name']}'),
          actions: [
            IconButton(
              tooltip: 'حظر',
              icon: const Icon(Icons.block),
              onPressed: () async {
                try {
                  await AppScope.of(context).api.post('/api/friends/blocks', {'user_id': widget.user['id']});
                  if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم الحظر')));
                } on ApiException catch (err) {
                  if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err.message)));
                }
              },
            ),
            IconButton(
              tooltip: 'إبلاغ',
              icon: const Icon(Icons.report_outlined),
              onPressed: () async {
                try {
                  await AppScope.of(context).api.report(targetType: 'user', targetId: widget.user['id'] as int, reason: 'إساءة');
                  if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم إرسال بلاغ')));
                } on ApiException catch (err) {
                  if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err.message)));
                }
              },
            ),
          ],
        ),
        body: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(14),
                children: [
                  for (final message in _messages)
                    Align(
                      alignment: message['sender_id'] == AppScope.of(context).user?['id'] ? Alignment.centerLeft : Alignment.centerRight,
                      child: Container(
                        margin: const EdgeInsets.only(bottom: 6),
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        decoration: BoxDecoration(
                          color: message['sender_id'] == AppScope.of(context).user?['id']
                              ? AppColors.accent.withValues(alpha: 0.45)
                              : Colors.white.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Text('${message['text']}'),
                      ),
                    ),
                ],
              ),
            ),
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(10),
                child: Row(
                  children: [
                    Expanded(child: TextField(controller: _controller, decoration: const InputDecoration(hintText: 'اكتب رسالة…'))),
                    IconButton(icon: const Icon(Icons.send), onPressed: _send),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
