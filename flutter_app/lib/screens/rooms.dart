import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

import '../api_client.dart';
import '../main.dart';
import '../theme.dart';

const _backgrounds = ['sunset', 'night', 'desert', 'sea', 'royal', 'aurora'];
const _roleLabel = {'owner': 'مالك', 'moderator': 'مشرف', 'assistant': 'مساعد', 'member': 'عضو'};

class RoomsScreen extends StatefulWidget {
  const RoomsScreen({super.key});

  @override
  State<RoomsScreen> createState() => _RoomsScreenState();
}

class _RoomsScreenState extends State<RoomsScreen> {
  List<dynamic> _rooms = [];
  String? _error;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await AppScope.of(context).api.rooms(query: _query);
      if (!mounted) return;
      setState(() {
        _rooms = (data['rooms'] as List?) ?? [];
        _error = null;
      });
    } on ApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    }
  }

  Future<void> _create() async {
    final name = TextEditingController();
    final description = TextEditingController();
    final password = TextEditingController();
    var seats = 20;
    var isPrivate = false;
    final created = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          backgroundColor: const Color(0xFF1A1224),
          title: const Text('إنشاء غرفة صوتية'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(controller: name, decoration: const InputDecoration(labelText: 'اسم الغرفة')),
                TextField(controller: description, decoration: const InputDecoration(labelText: 'الوصف')),
                TextField(controller: password, obscureText: true, decoration: const InputDecoration(labelText: 'كلمة المرور (للغرف الخاصة)')),
                Row(
                  children: [
                    const Text('عدد المقاعد'),
                    Expanded(
                      child: Slider(
                        value: seats.toDouble(),
                        min: 4,
                        max: 20,
                        divisions: 16,
                        label: '$seats',
                        onChanged: (value) => setDialogState(() => seats = value.round()),
                      ),
                    ),
                    Text('$seats'),
                  ],
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('غرفة خاصة'),
                  value: isPrivate,
                  onChanged: (value) => setDialogState(() => isPrivate = value),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('إلغاء')),
            ElevatedButton(
              onPressed: () async {
                try {
                  await AppScope.of(context).api.createRoom({
                    'name': name.text.trim(),
                    'description': description.text.trim(),
                    'seat_count': seats,
                    'is_private': isPrivate,
                    if (password.text.isNotEmpty) 'password': password.text,
                  });
                  if (context.mounted) Navigator.pop(context, true);
                } on ApiException catch (err) {
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err.message)));
                  }
                }
              },
              child: const Text('إنشاء'),
            ),
          ],
        ),
      ),
    );
    if (created == true) await _load();
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            children: [
              Expanded(
                child: TextField(
                  decoration: const InputDecoration(hintText: 'ابحث عن غرفة…'),
                  onSubmitted: (value) {
                    _query = value.trim();
                    _load();
                  },
                ),
              ),
              const SizedBox(width: 8),
              ElevatedButton(onPressed: _create, child: const Text('إنشاء غرفة')),
            ],
          ),
          if (_error != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text(_error!, style: const TextStyle(color: AppColors.danger))),
          const SizedBox(height: 10),
          for (final room in _rooms)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: GlassPanel(
                child: Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(colors: AppColors.roomBackgrounds['${room['background']}'] ?? AppColors.roomBackgrounds['sunset']!),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: const Icon(Icons.mic, size: 20),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('${room['name']}', style: const TextStyle(fontWeight: FontWeight.bold)),
                          Text('👥 ${room['member_count']} · ${room['owner']['display_name']} ${(room['password_required'] == true) ? '· 🔒' : ''}',
                              style: const TextStyle(color: AppColors.muted, fontSize: 12)),
                        ],
                      ),
                    ),
                    ElevatedButton(
                      onPressed: () => Navigator.push(
                        context,
                        MaterialPageRoute<void>(builder: (_) => RoomScreen(roomId: room['id'] as int)),
                      ),
                      child: const Text('دخول'),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Voice room: real WebRTC mesh, seats, permissions, chat, gifts.
class RoomScreen extends StatefulWidget {
  const RoomScreen({super.key, required this.roomId});

  final int roomId;

  @override
  State<RoomScreen> createState() => _RoomScreenState();
}

class _RoomScreenState extends State<RoomScreen> {
  Map<String, dynamic>? _room;
  List<dynamic> _messages = [];
  final _message = TextEditingController();
  final _peers = <int, RTCPeerConnection>{};
  final _renderers = <int, RTCVideoRenderer>{};
  final _pendingIce = <int, List<RTCIceCandidate>>{};
  AppState? _appState;
  MediaStream? _localStream;
  bool _micOn = false;
  double _volume = 1;
  String? _error;
  String? _notice;
  late final void Function(Map<String, dynamic>) _listener = _onEvent;

  int get _myId => (AppScope.of(context).user?['id'] ?? 0) as int;

  Map<String, dynamic>? get _myMember {
    final members = (_room?['members'] as List?) ?? [];
    for (final member in members) {
      if ((member['user']['id'] as int) == _myId) return member as Map<String, dynamic>;
    }
    return null;
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final state = AppScope.of(context);
      _appState = state;
      state.subscribe(_listener);
      state.send({'type': 'join_room', 'room_id': widget.roomId});
      _load();
    });
  }

  @override
  void dispose() {
    _appState?.unsubscribe(_listener);
    _leaveVoice();
    _message.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final api = AppScope.of(context).api;
    try {
      final room = await api.room(widget.roomId);
      Map<String, dynamic> messages = {};
      final members = (room['room']?['members'] as List?) ?? [];
      if (members.any((member) => (member['user']['id'] as int) == _myId)) {
        messages = await api.roomMessages(widget.roomId);
      }
      if (!mounted) return;
      setState(() {
        _room = room['room'] as Map<String, dynamic>;
        _messages = (messages['messages'] as List?) ?? _messages;
      });
    } on ApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    }
  }

  void _onEvent(Map<String, dynamic> payload) async {
    switch (payload['type']) {
      case 'room_state':
        final room = payload['room'];
        if (room is Map<String, dynamic> && room['id'] == widget.roomId) {
          setState(() => _room = room);
          _syncPeers();
        }
        break;
      case 'chat':
        if (payload['room_id'] == widget.roomId) setState(() => _messages = [..._messages, payload['message']]);
        break;
      case 'gift':
        if (payload['room_id'] == widget.roomId) {
          final sender = payload['sender']['display_name'] ?? payload['sender']['username'];
          setState(() => _messages = [..._messages, {'kind': 'system', 'text': '$sender أرسل ${payload['gift']['emoji']} ${payload['gift']['name']}'}]);
        }
        break;
      case 'webrtc_offer':
        _handleOffer(payload['from'] as int, payload['payload'] as Map<String, dynamic>);
        break;
      case 'webrtc_answer':
        _peers[payload['from'] as int]
            ?.setRemoteDescription(RTCSessionDescription(payload['payload']['sdp'] as String?, 'answer'));
        break;
      case 'webrtc_ice':
        final from = payload['from'] as int;
        final candidate = RTCIceCandidate(
          payload['payload']['candidate'] as String?,
          payload['payload']['sdpMid'] as String?,
          payload['payload']['sdpMLineIndex'] as int?,
        );
        final peer = _peers[from];
        if (peer != null && await _hasRemote(peer)) {
          await peer.addCandidate(candidate);
        } else {
          _pendingIce.putIfAbsent(from, () => []).add(candidate);
        }
        break;
      case 'muted':
        if (payload['value'] == true) {
          _disableMic();
          setState(() => _notice = 'تم كتم المايك من الإدارة');
        }
        _load();
        break;
      default:
        break;
    }
  }

  Future<bool> _hasRemote(RTCPeerConnection peer) async {
    final description = await peer.getRemoteDescription();
    return description != null;
  }

  // --- WebRTC -----------------------------------------------------------

  Future<RTCPeerConnection> _peerFor(int userId) async {
    final existing = _peers[userId];
    if (existing != null) return existing;

    final config = <String, dynamic>{
      'iceServers': (AppScope.of(context).meta?['ice_servers'] as List?) ?? [
        {'urls': 'stun:stun.l.google.com:19302'},
      ],
    };
    final peer = await createPeerConnection(config);
    peer.onIceCandidate = (candidate) {
      if (candidate.candidate != null && candidate.candidate!.isNotEmpty) {
        AppScope.of(context).send({
          'type': 'webrtc_ice',
          'to': userId,
          'payload': {'candidate': candidate.candidate, 'sdpMid': candidate.sdpMid, 'sdpMLineIndex': candidate.sdpMLineIndex},
        });
      }
    };
    peer.onTrack = (event) {
      if (event.streams.isNotEmpty) {
        final renderer = _renderers.putIfAbsent(userId, RTCVideoRenderer.new);
        renderer.srcObject = event.streams.first;
      }
    };
    peer.onConnectionState = (state) {
      if (state == RTCPeerConnectionState.RTCPeerConnectionStateFailed) _closePeer(userId);
    };
    final locals = _localStream;
    if (locals != null) {
      for (final track in locals.getTracks()) {
        await peer.addTrack(track, locals);
      }
    }
    _peers[userId] = peer;
    return peer;
  }

  Future<void> _handleOffer(int from, Map<String, dynamic> payload) async {
    final peer = await _peerFor(from);
    await peer.setRemoteDescription(RTCSessionDescription(payload['sdp'] as String?, 'offer'));
    for (final candidate in _pendingIce[from] ?? <RTCIceCandidate>[]) {
      await peer.addCandidate(candidate);
    }
    _pendingIce.remove(from);
    final answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    AppScope.of(context).send({
      'type': 'webrtc_answer',
      'to': from,
      'payload': {'type': 'answer', 'sdp': peer.localDescription?.sdp},
    });
    if (!_renderers.containsKey(from)) _renderers[from] = RTCVideoRenderer();
  }

  Future<void> _negotiate(int userId) async {
    final peer = await _peerFor(userId);
    final offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    AppScope.of(context).send({
      'type': 'webrtc_offer',
      'to': userId,
      'payload': {'type': 'offer', 'sdp': peer.localDescription?.sdp},
    });
  }

  /// One connection per member who has a live microphone (mesh topology).
  void _syncPeers() {
    final members = (_room?['members'] as List?) ?? [];
    final speaking = <int>{};
    for (final member in members) {
      final id = member['user']['id'] as int;
      if (member['seat_index'] != null && member['mic_on'] == true && id != _myId) speaking.add(id);
    }
    for (final id in _peers.keys.toList()) {
      if (!speaking.contains(id)) _closePeer(id);
    }
    for (final id in speaking) {
      if (_peers.containsKey(id)) continue;
      if (_myId > id) {
        _negotiate(id);
      } else {
        _peerFor(id);
      }
    }
  }

  void _closePeer(int userId) {
    _peers.remove(userId)?.close();
    _renderers.remove(userId)?.dispose();
  }

  Future<void> _enableMic() async {
    final state = AppScope.of(context);
    setState(() => _error = null);
    try {
      _localStream = await navigator.mediaDevices.getUserMedia({'audio': true, 'video': false});
      await state.api.setMic(widget.roomId, _myId, true); // the server checks seat + permission
      state.send({'type': 'mic', 'room_id': widget.roomId, 'value': true});
      setState(() => _micOn = true);
      await _load();
      _syncPeers();
    } on ApiException catch (err) {
      _localStream?.getTracks().forEach((track) => track.stop());
      _localStream = null;
      if (mounted) setState(() => _error = err.message);
    } catch (err) {
      if (mounted) setState(() => _error = 'تعذر الوصول إلى المايك: $err');
    }
  }

  Future<void> _disableMic() async {
    _localStream?.getTracks().forEach((track) => track.stop());
    _localStream = null;
    final state = AppScope.of(context);
    for (final peer in _peers.values) {
      for (final sender in await peer.getSenders()) {
        if (sender.track?.kind == 'audio') await peer.removeTrack(sender);
      }
    }
    state.send({'type': 'mic', 'room_id': widget.roomId, 'value': false});
    try {
      await state.api.setMic(widget.roomId, _myId, false);
    } catch (_) {
      // the socket update is enough for the room state
    }
    if (mounted) setState(() => _micOn = false);
  }

  void _leaveVoice() {
    _localStream?.getTracks().forEach((track) => track.stop());
    _localStream = null;
    for (final id in _peers.keys.toList()) {
      _closePeer(id);
    }
  }

  // --- actions ----------------------------------------------------------

  Future<void> _guard(Future<void> Function() action) async {
    try {
      await action();
    } on ApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    }
  }

  Future<void> _join() => _guard(() async {
        await AppScope.of(context).api.joinRoom(widget.roomId);
        AppScope.of(context).send({'type': 'join_room', 'room_id': widget.roomId});
        await _load();
      });

  Future<void> _leave() async {
    _leaveVoice();
    await _guard(() async {
      await AppScope.of(context).api.leaveRoom(widget.roomId);
      AppScope.of(context).send({'type': 'leave_room', 'room_id': widget.roomId});
    });
    if (mounted) Navigator.pop(context);
  }

  Future<void> _sendGift() async {
    final api = AppScope.of(context).api;
    final gifts = await api.gifts();
    final list = (gifts['gifts'] as List?) ?? [];
    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => GlassPanel(
        child: SizedBox(
          height: 300,
          child: GridView.count(
            crossAxisCount: 3,
            children: [
              for (final gift in list)
                InkWell(
                  onTap: () async {
                    Navigator.pop(context);
                    await _guard(() async {
                      final sent = await api.sendGift(
                        giftId: gift['id'] as int,
                        currency: 'diamonds',
                        roomId: widget.roomId,
                        idempotencyKey: DateTime.now().microsecondsSinceEpoch.toString(),
                      );
                      setState(() => _notice = 'تم إرسال ${sent['gift']['emoji']} ${sent['gift']['name']}');
                    });
                  },
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text('${gift['emoji']}', style: const TextStyle(fontSize: 30)),
                      Text('${gift['name']}', style: const TextStyle(fontSize: 12)),
                      Text('${gift['price_diamonds']} 💎', style: const TextStyle(fontSize: 11, color: AppColors.gold)),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _memberSheet(Map<String, dynamic> member) async {
    final api = AppScope.of(context).api;
    final myRank = {'owner': 3, 'moderator': 2, 'assistant': 1, 'member': 0}[_myMember?['role']] ?? -1;
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => GlassPanel(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('${member['user']['display_name']} · ${_roleLabel[member['role']]} · مستوى ${member['user']['level']}'),
            const SizedBox(height: 10),
            if (myRank >= 1)
              OutlinedButton(
                onPressed: () async {
                  Navigator.pop(context);
                  await _guard(() async {
                    await api.post('/api/rooms/${widget.roomId}/members/${member['user']['id']}/mute', {'value': !(member['muted_by_mod'] == true)});
                    await _load();
                  });
                },
                child: Text(member['muted_by_mod'] == true ? 'إلغاء الكتم' : 'كتم'),
              ),
            if (myRank >= 1 && member['hand_raised'] == true)
              ElevatedButton(
                onPressed: () async {
                  Navigator.pop(context);
                  await _guard(() async {
                    await api.post('/api/rooms/${widget.roomId}/hands/${member['user']['id']}/approve');
                    await _load();
                  });
                },
                child: const Text('الموافقة على المايك'),
              ),
            if (myRank >= 2)
              OutlinedButton(
                onPressed: () async {
                  Navigator.pop(context);
                  await _guard(() async {
                    await api.post('/api/rooms/${widget.roomId}/members/${member['user']['id']}/kick');
                    await _load();
                  });
                },
                child: const Text('طرد من الغرفة'),
              ),
            if (myRank >= 2)
              OutlinedButton(
                onPressed: () async {
                  Navigator.pop(context);
                  await _guard(() async {
                    await api.post('/api/rooms/${widget.roomId}/members/${member['user']['id']}/ban');
                    await _load();
                  });
                },
                child: const Text('حظر'),
              ),
            if (myRank >= 3)
              OutlinedButton(
                onPressed: () async {
                  Navigator.pop(context);
                  await _guard(() async {
                    await api.post('/api/rooms/${widget.roomId}/members/${member['user']['id']}/role', {'role': 'moderator'});
                    await _load();
                  });
                },
                child: const Text('تعيين مشرف'),
              ),
            OutlinedButton(
              onPressed: () async {
                Navigator.pop(context);
                await _guard(() async {
                  await api.report(targetType: 'user', targetId: member['user']['id'] as int, reason: 'إساءة');
                  setState(() => _notice = 'تم إرسال بلاغ إلى الإدارة');
                });
              },
              child: const Text('إبلاغ عن المستخدم'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final room = _room;
    if (room == null) {
      return SunsetScaffold(
        child: Scaffold(
          backgroundColor: Colors.transparent,
          appBar: AppBar(),
          body: Center(child: _error != null ? Text(_error!) : const CircularProgressIndicator()),
        ),
      );
    }
    final members = (room['members'] as List?) ?? [];
    final background = AppColors.roomBackgrounds['${room['background']}'] ?? AppColors.roomBackgrounds['sunset']!;
    final seated = <int, Map<String, dynamic>>{};
    for (final member in members) {
      if (member['seat_index'] != null) seated[member['seat_index'] as int] = member as Map<String, dynamic>;
    }
    final locked = ((room['locked_seats'] as List?) ?? []).map((value) => value as int).toSet();
    final myMember = _myMember;
    final listening = members.where((member) => member['hand_raised'] == true).length;

    return SunsetScaffold(
      colors: background,
      child: Scaffold(
        backgroundColor: Colors.transparent,
        appBar: AppBar(
          title: Column(
            children: [
              Text('${room['name']}', style: const TextStyle(fontSize: 16)),
              Text('ID: ${room['id']} · 👑 ${room['owner']['display_name']}', style: const TextStyle(fontSize: 11, color: AppColors.muted)),
            ],
          ),
          actions: [
            Padding(
              padding: const EdgeInsets.only(left: 8),
              child: Center(child: Text('👥 ${room['member_count']} · 🎤 ${members.where((m) => m['mic_on'] == true).length} · ✋ $listening')),
            ),
          ],
        ),
        body: ListView(
          padding: const EdgeInsets.all(14),
          children: [
            GlassPanel(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              child: Text(
                '${room['rules'] ?? ''}'.split('\n').first,
                style: const TextStyle(fontSize: 12),
              ),
            ),
            const SizedBox(height: 12),
            GridView.count(
              crossAxisCount: 4,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisSpacing: 8,
              mainAxisSpacing: 8,
              childAspectRatio: 0.92,
              children: [
                for (var seat = 0; seat < (room['seat_count'] as int); seat++)
                  _SeatTile(
                    index: seat,
                    member: seated[seat],
                    locked: locked.contains(seat),
                    isOwnerSeat: seat == 0,
                    onTap: () async {
                      final occupant = seated[seat];
                      if (occupant != null && occupant['user']['id'] != _myId) {
                        await _memberSheet(occupant);
                        return;
                      }
                      await _guard(() async {
                        if (occupant != null) {
                          await AppScope.of(context).api.releaseSeat(widget.roomId, seat);
                        } else {
                          await AppScope.of(context).api.takeSeat(widget.roomId, seat);
                        }
                        await _load();
                      });
                    },
                  ),
              ],
            ),
            const SizedBox(height: 12),
            if (myMember == null)
              ElevatedButton(onPressed: _join, child: const Text('دخول الغرفة'))
            else
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  OutlinedButton(
                    onPressed: () => _guard(() async {
                      await AppScope.of(context).api.raiseHand(widget.roomId, !(myMember['hand_raised'] == true));
                      await _load();
                    }),
                    child: Text(myMember['hand_raised'] == true ? 'إنزال اليد' : 'رفع اليد ✋'),
                  ),
                  ElevatedButton(
                    onPressed: _micOn ? _disableMic : _enableMic,
                    child: Text(_micOn ? 'إيقاف المايك' : 'تشغيل المايك'),
                  ),
                  OutlinedButton(onPressed: _sendGift, child: const Text('🎁 هدية')),
                  OutlinedButton(onPressed: _leave, child: const Text('خروج')),
                ],
              ),
            const SizedBox(height: 10),
            if (myMember != null)
              Text(
                '${_roleLabel[myMember['role']]} · ${myMember['seat_index'] == null ? 'بدون مقعد' : 'مقعد ${(myMember['seat_index'] as int) + 1}'} · '
                '${myMember['mic_granted'] == true ? 'مسموح بالمايك' : 'بانتظار الموافقة'}',
                style: const TextStyle(color: AppColors.muted, fontSize: 12),
              ),
            if (room['gifts_enabled'] != true)
              const Text('الهدايا معطلة في هذه الغرفة', style: TextStyle(color: AppColors.muted, fontSize: 12)),
            Row(
              children: [
                const Icon(Icons.volume_up, size: 18),
                Expanded(
                  child: Slider(
                    value: _volume,
                    onChanged: (value) {
                      setState(() => _volume = value);
                      _localStream?.getAudioTracks().forEach((track) => track.setVolume(value));
                      for (final renderer in _renderers.values) {
                        renderer.audioOutput = value > 0;
                      }
                    },
                  ),
                ),
              ],
            ),
            if (_error != null) Text(_error!, style: const TextStyle(color: AppColors.danger)),
            if (_notice != null) Text(_notice!, style: const TextStyle(color: AppColors.ok)),
            const SizedBox(height: 6),
            if ((_myMember?['role'] == 'owner' || _myMember?['role'] == 'moderator'))
              Wrap(
                spacing: 6,
                children: [
                  const Text('الخلفية:', style: TextStyle(color: AppColors.muted)),
                  for (final name in _backgrounds)
                    ActionChip(
                      label: Text(name),
                      onPressed: () => _guard(() async {
                        await AppScope.of(context).api.post('/api/rooms/${widget.roomId}/background', {'background': name});
                        await _load();
                      }),
                    ),
                ],
              ),
            const SizedBox(height: 10),
            GlassPanel(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('قوانين الغرفة', style: TextStyle(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 6),
                  for (final line in '${room['rules'] ?? ''}'.split('\n'))
                    Text(line, style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                ],
              ),
            ),
            const SizedBox(height: 10),
            GlassPanel(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text('الدردشة', style: TextStyle(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  for (final message in _messages)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Text(
                        '${message['sender']?['display_name'] ?? ''} ${message['text'] ?? ''}',
                        style: TextStyle(fontSize: 13, color: message['kind'] == 'system' ? AppColors.gold : AppColors.text),
                      ),
                    ),
                  Row(
                    children: [
                      Expanded(child: TextField(controller: _message, decoration: const InputDecoration(hintText: 'اكتب رسالتك…'))),
                      IconButton(
                        icon: const Icon(Icons.send),
                        onPressed: () async {
                          final text = _message.text.trim();
                          if (text.isEmpty) return;
                          _message.clear();
                          final delivered = AppScope.of(context).send({'type': 'chat', 'room_id': widget.roomId, 'text': text});
                          if (!delivered) {
                            await _guard(() async {
                              final message = await AppScope.of(context).api.postRoomMessage(widget.roomId, text);
                              setState(() => _messages = [..._messages, message]);
                            });
                          }
                        },
                      ),
                    ],
                  ),
                ],
              ),
            ),
            // Remote audio: flutter_webrtc plays audio through the renderer view.
            for (final entry in _renderers.entries)
              SizedBox(height: 1, width: 1, child: RTCVideoView(entry.value, objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover)),
          ],
        ),
      ),
    );
  }
}

class _SeatTile extends StatelessWidget {
  const _SeatTile({
    required this.index,
    required this.member,
    required this.locked,
    required this.isOwnerSeat,
    required this.onTap,
  });

  final int index;
  final Map<String, dynamic>? member;
  final bool locked;
  final bool isOwnerSeat;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final speaking = member != null && member!['mic_on'] == true;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: speaking ? 0.22 : 0.10),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: speaking ? AppColors.ok : const Color(0x33FFFFFF), width: speaking ? 2 : 1),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (isOwnerSeat) const Text('👑', style: TextStyle(fontSize: 12)),
            if (member == null)
              Icon(locked ? Icons.lock_outline : Icons.mic_none, size: 20, color: const Color(0xCCFFFFFF))
            else
              CircleAvatar(
                radius: 15,
                backgroundColor: AppColors.accent,
                child: Text('${(member!['user']['display_name'] ?? 'U').toString().characters.first}', style: const TextStyle(fontSize: 13)),
              ),
            const SizedBox(height: 3),
            Text(
              member == null ? (locked ? 'مقفل' : '${index + 1}') : '${member!['user']['display_name']}'.split(' ').first,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 10),
            ),
            if (member != null) Text('Lv ${member!['user']['level']} ${speaking ? '🎙️' : member!['muted_by_mod'] == true ? '🔇' : ''}', style: const TextStyle(fontSize: 9, color: AppColors.muted)),
          ],
        ),
      ),
    );
  }
}
