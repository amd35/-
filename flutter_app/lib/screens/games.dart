import 'package:flutter/material.dart';

import '../api_client.dart';
import '../main.dart';
import '../theme.dart';
import '../widgets/die_face.dart';

const _gameLabel = {'ludo': '🎲 لودو', 'domino': '🁫 دومينو'};

class GamesScreen extends StatefulWidget {
  const GamesScreen({super.key});

  @override
  State<GamesScreen> createState() => _GamesScreenState();
}

class _GamesScreenState extends State<GamesScreen> {
  Map<String, dynamic>? _catalog;
  List<dynamic> _rooms = [];
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final state = AppScope.of(context);
      final catalog = await state.api.gameCatalog();
      final rooms = await state.api.gameRooms();
      if (!mounted) return;
      setState(() {
        _catalog = catalog;
        _rooms = (rooms['rooms'] as List?) ?? [];
        _error = null;
      });
    } on ApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    }
  }

  Future<void> _create(String game, int maxPlayers) async {
    try {
      final room = await AppScope.of(context).api.createGameRoom(game, maxPlayers: maxPlayers);
      if (!mounted) return;
      await Navigator.push(context, MaterialPageRoute<void>(builder: (_) => GameTableScreen(tableId: room['room']['id'] as int)));
      await _load();
    } on ApiException catch (err) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err.message)));
    }
  }

  Future<void> _join(int id) async {
    try {
      await AppScope.of(context).api.joinGameRoom(id);
      if (!mounted) return;
      await Navigator.push(context, MaterialPageRoute<void>(builder: (_) => GameTableScreen(tableId: id)));
      await _load();
    } on ApiException catch (err) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final games = (_catalog?['games'] as List?) ?? [];
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_error != null) Text(_error!, style: const TextStyle(color: AppColors.danger)),
          for (final game in games)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: GlassPanel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('${_gameLabel[game['key']]}', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 6),
                    Text(
                      game['enabled'] == true
                          ? 'متاحة · الحركات والنرد تتحقق على الخادم · مكافأة الفوز ${_catalog?['win_reward_diamonds'] ?? 200} ماس'
                          : 'معطّلة حالياً من لوحة الإدارة',
                      style: const TextStyle(color: AppColors.muted, fontSize: 12),
                    ),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 8,
                      children: [
                        for (final count in [2, 3, 4])
                          ElevatedButton(
                            onPressed: game['enabled'] == true ? () => _create('${game['key']}', count) : null,
                            child: Text('طاولة $count لاعبين'),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          const Text('الطاولات المفتوحة', style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          if (_rooms.isEmpty) const Text('لا توجد طاولات حالياً', style: TextStyle(color: AppColors.muted)),
          for (final room in _rooms)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: GlassPanel(
                child: Row(
                  children: [
                    Text('${_gameLabel[room['game']]}', style: const TextStyle(fontWeight: FontWeight.bold)),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        '${room['name']} · ${room['player_count']}/${room['max_players']} · ${room['status'] == 'playing' ? 'جارية' : 'مفتوحة'}',
                        style: const TextStyle(color: AppColors.muted, fontSize: 12),
                      ),
                    ),
                    ElevatedButton(
                      onPressed: room['status'] == 'waiting' ? () => _join(room['id'] as int) : null,
                      child: const Text('انضمام'),
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

class GameTableScreen extends StatefulWidget {
  const GameTableScreen({super.key, required this.tableId});

  final int tableId;

  @override
  State<GameTableScreen> createState() => _GameTableScreenState();
}

class _GameTableScreenState extends State<GameTableScreen> {
  Map<String, dynamic>? _room;
  Map<String, dynamic>? _geometry;
  String? _error;
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
      state.send({'type': 'game_join', 'game_room_id': widget.tableId});
      await _load();
    });
  }

  @override
  void dispose() {
    _appState?.unsubscribe(_listener);
    super.dispose();
  }

  void _onEvent(Map<String, dynamic> payload) {
    if (payload['type'] == 'game_state' && payload['state']?['id'] == widget.tableId) {
      setState(() => _room = payload['state'] as Map<String, dynamic>);
    } else if (payload['type'] == 'game_error') {
      setState(() => _error = '${payload['message']}');
    }
  }

  Future<void> _load() async {
    final api = AppScope.of(context).api;
    try {
      final room = await api.gameRoom(widget.tableId);
      final payload = room['room'] as Map<String, dynamic>;
      Map<String, dynamic>? geometry;
      if (payload['game'] == 'ludo') geometry = await api.ludoBoard();
      if (!mounted) return;
      setState(() {
        _room = payload;
        _geometry = geometry;
        _error = null;
      });
    } on ApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    }
  }

  Future<void> _act(String action, [Map<String, dynamic> payload = const {}]) async {
    final state = AppScope.of(context);
    final delivered = state.send({'type': 'game_action', 'game_room_id': widget.tableId, 'action': action, 'payload': payload});
    if (delivered) return;
    try {
      final room = await state.api.gameAction(widget.tableId, action, payload);
      if (mounted) setState(() => _room = room['room'] as Map<String, dynamic>);
    } on ApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    }
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
    final state = room['state'] as Map<String, dynamic>? ?? {};
    final players = (room['players'] as List?) ?? [];
    final mySeat = room['my_seat'] as int?;
    final myTurn = mySeat != null && state['turn'] == mySeat && room['status'] == 'playing';
    final isHost = room['host_id'] == AppScope.of(context).user?['id'];
    final winner = players.firstWhere((player) => player['user']['id'] == room['winner_id'], orElse: () => null);

    return SunsetScaffold(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        appBar: AppBar(
          title: Text('${_gameLabel[room['game']]} — ${room['name']}'),
          actions: [
            IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
            IconButton(
              icon: const Icon(Icons.logout),
              onPressed: () async {
                try {
                  await AppScope.of(context).api.leaveGameRoom(widget.tableId);
                } on ApiException {
                  // leaving twice is harmless
                }
                if (mounted) Navigator.pop(context);
              },
            ),
          ],
        ),
        body: ListView(
          padding: const EdgeInsets.all(14),
          children: [
            if (_error != null) Text(_error!, style: const TextStyle(color: AppColors.danger)),
            Text(
              room['status'] == 'playing'
                  ? (myTurn ? 'دورك الآن${state['dice'] != null ? ' · النرد ${state['dice']}' : ''}' : 'دور اللاعب ${(state['turn'] ?? 0) + 1}')
                  : room['status'] == 'finished'
                      ? 'انتهت المباراة${winner != null ? ' — الفائز ${winner['user']['display_name']}' : ''}'
                      : 'بانتظار اللاعبين',
              style: TextStyle(color: myTurn ? AppColors.ok : AppColors.muted),
            ),
            const SizedBox(height: 10),
            GlassPanel(
              child: Column(
                children: [
                  for (final player in players)
                    ListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      title: Text('${player['seat'] + 1}. ${player['user']['display_name']}'),
                      subtitle: Text('مستوى ${player['user']['level']}${room['game'] == 'domino' ? ' · ${player['score']} نقطة' : ''}'),
                      trailing: Text('${player['ready'] == true ? 'جاهز' : 'بانتظار'}'),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            if (room['status'] == 'waiting')
              Wrap(
                spacing: 8,
                children: [
                  OutlinedButton(onPressed: () => _act('ready', {'value': true}), child: const Text('جاهز')),
                  if (isHost)
                    ElevatedButton(
                      onPressed: () async {
                        try {
                          final data = await AppScope.of(context).api.startGameRoom(widget.tableId);
                          setState(() => _room = data['room'] as Map<String, dynamic>);
                        } on ApiException catch (err) {
                          setState(() => _error = err.message);
                        }
                      },
                      child: const Text('ابدأ المباراة'),
                    ),
                ],
              ),
            if (room['game'] == 'ludo' && room['status'] != 'waiting') ...[
              Row(
                children: [
                  ElevatedButton(onPressed: myTurn && state['dice'] == null ? () => _act('roll') : null, child: const Text('🎲 رمي النرد')),
                  const SizedBox(width: 10),
                  Text('النرد: ${state['dice'] ?? '—'}'),
                  if (state['dice'] != null) ...[
                    const SizedBox(width: 8),
                    DieFace(
                      value: (state['dice'] as num).toInt(),
                      imageUrl: '${AppScope.of(context).equipped['dice']?['image_url'] ?? ''}',
                      color: colorFromHex('${AppScope.of(context).equipped['dice']?['accent'] ?? ''}', AppColors.gold),
                      pipColor: colorFromHex('${AppScope.of(context).equipped['dice']?['pips'] ?? ''}', const Color(0xFF1A1224)),
                      size: 34,
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 10),
              _LudoGrid(
                geometry: _geometry,
                state: state,
                mySeat: mySeat,
                legal: (room['legal'] as List?) ?? [],
                onMove: (token) => _act('move', {'token': token}),
              ),
            ],
            if (room['game'] == 'domino' && room['status'] != 'waiting') ...[
              GlassPanel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('الطرف المفتوح: ${(state['board'] as List?)?.isEmpty ?? true ? '—' : '${state['board'][0][0]} / ${state['board'][state['board'].length - 1][1]}'}'),
                    Text('المخزن: ${state['boneyard_count'] ?? 0} · الجولة ${state['round']} · الهدف ${state['target']}',
                        style: const TextStyle(color: AppColors.muted, fontSize: 12)),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final tile in (state['players'] as List).firstWhere(
                        (player) => player['seat'] == mySeat,
                        orElse: () => {'hand': []},
                      )['hand'] as List)
                    Builder(
                      builder: (context) {
                        final index = ((state['players'] as List).firstWhere(
                          (player) => player['seat'] == mySeat,
                          orElse: () => {'hand': []},
                        )['hand'] as List)
                            .indexOf(tile);
                        final legal = ((room['legal'] as List?) ?? []).firstWhere(
                          (move) => move['tile'] == index,
                          orElse: () => null,
                        );
                        return ElevatedButton(
                          onPressed: myTurn && legal != null
                              ? () => _act('play', {'tile': index, 'side': (legal['sides'] as List).first})
                              : null,
                          child: Text('${tile[0]} | ${tile[1]}'),
                        );
                      },
                    ),
                ],
              ),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                children: [
                  OutlinedButton(onPressed: myTurn ? () => _act('draw') : null, child: const Text('سحب قطعة')),
                  OutlinedButton(onPressed: myTurn ? () => _act('pass') : null, child: const Text('تمرير الدور')),
                ],
              ),
            ],
            if (room['status'] == 'finished')
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Wrap(
                  spacing: 8,
                  children: [
                    if (room['game'] == 'domino')
                      ElevatedButton(onPressed: () => _act('next_round'), child: const Text('جولة جديدة')),
                    OutlinedButton(
                      onPressed: () async {
                        await AppScope.of(context).api.leaveGameRoom(widget.tableId);
                        if (mounted) Navigator.pop(context);
                      },
                      child: const Text('خروج'),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// 15x15 Ludo grid built from the server board geometry.
class _LudoGrid extends StatelessWidget {
  const _LudoGrid({required this.geometry, required this.state, required this.mySeat, required this.legal, required this.onMove});

  final Map<String, dynamic>? geometry;
  final Map<String, dynamic> state;
  final int? mySeat;
  final List<dynamic> legal;
  final void Function(int token) onMove;

  static const _colors = {
    'red': Color(0xFFD64545),
    'green': Color(0xFF2F9C63),
    'blue': Color(0xFF3D6FD6),
    'yellow': Color(0xFFD2A11F),
  };

  @override
  Widget build(BuildContext context) {
    final geo = geometry;
    if (geo == null) return const Center(child: CircularProgressIndicator());
    final size = geo['size'] as int;
    final track = (geo['track'] as List).map((cell) => '${cell[0]}-${cell[1]}').toList();

    String cellFor(int seat, int steps) {
      final starts = geo['starts'] as Map<String, dynamic>;
      if (steps == -1) {
        final yards = (geo['yards'] as Map<String, dynamic>)['$seat'] as List;
        final spot = yards[0] as List;
        return '${spot[0]}-${spot[1]}';
      }
      if (steps <= 50) return track[((starts['$seat'] as int) + steps) % track.length];
      if (steps < (geo['home'] as int)) {
        final column = (geo['home_columns'] as Map<String, dynamic>)['$seat'] as List;
        final cell = column[steps - 51] as List;
        return '${cell[0]}-${cell[1]}';
      }
      return '7-7';
    }

    final tokens = <String, List<Map<String, dynamic>>>{};
    for (final player in (state['players'] as List?) ?? []) {
      for (var index = 0; index < (player['tokens'] as List).length; index++) {
        final steps = (player['tokens'] as List)[index] as int;
        final key = cellFor(player['seat'] as int, steps);
        tokens.putIfAbsent(key, () => []).add({'seat': player['seat'], 'index': index, 'color': player['color'], 'playable': player['seat'] == mySeat && legal.any((move) => move['token'] == index && move['from'] == steps)});
      }
    }

    return AspectRatio(
      aspectRatio: 1,
      child: GridView.builder(
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: size, crossAxisSpacing: 1, mainAxisSpacing: 1),
        itemCount: size * size,
        itemBuilder: (context, position) {
          final row = position ~/ size;
          final col = position % size;
          final key = '$row-$col';
          final here = tokens[key] ?? const <Map<String, dynamic>>[];
          final inTrack = track.contains(key);
          return Container(
            decoration: BoxDecoration(
              color: inTrack ? Colors.white.withValues(alpha: 0.14) : Colors.white.withValues(alpha: 0.05),
              borderRadius: BorderRadius.circular(3),
            ),
            child: Stack(
              alignment: Alignment.center,
              children: [
                for (var i = 0; i < here.length; i++)
                  GestureDetector(
                    onTap: here[i]['playable'] == true ? () => onMove(here[i]['index'] as int) : null,
                    child: Container(
                      width: 12,
                      height: 12,
                      margin: EdgeInsets.only(left: (i % 2) * 6.0, top: (i ~/ 2) * 6.0),
                      decoration: BoxDecoration(
                        color: _colors['${here[i]['color']}'] ?? AppColors.gold,
                        shape: BoxShape.circle,
                        border: Border.all(color: here[i]['playable'] == true ? AppColors.gold : Colors.black45, width: here[i]['playable'] == true ? 2 : 0.5),
                      ),
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}
