import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

/// REST + WebSocket client.
///
/// The Android build talks to the same FastAPI backend as the web client.
/// Point [baseUrl] at the deployed API (https://api.example.com) or, for a
/// local run, at `http://10.0.2.2:8000` from an Android emulator.
class ApiClient {
  ApiClient({required this.baseUrl});

  final String baseUrl;
  String? token;
  String? _cachedToken;

  static const _tokenKey = 'tonvoice.token';

  Future<String?> loadToken() async {
    final prefs = await SharedPreferences.getInstance();
    _cachedToken = prefs.getString(_tokenKey);
    token = _cachedToken;
    return token;
  }

  Future<void> saveToken(String? value) async {
    final prefs = await SharedPreferences.getInstance();
    if (value == null || value.isEmpty) {
      await prefs.remove(_tokenKey);
    } else {
      await prefs.setString(_tokenKey, value);
    }
    _cachedToken = value;
    token = value;
  }

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if ((_cachedToken ?? token) != null && (_cachedToken ?? token)!.isNotEmpty)
          'Authorization': 'Bearer ${_cachedToken ?? token}',
      };

  Uri _uri(String path) => Uri.parse('$baseUrl$path');

  Future<Map<String, dynamic>> _decode(http.Response response) async {
    final text = response.body;
    final dynamic payload = text.isEmpty ? <String, dynamic>{} : jsonDecode(text);
    if (response.statusCode >= 400) {
      final detail = payload is Map && payload['detail'] != null ? '${payload['detail']}' : 'حدث خطأ غير متوقع';
      throw ApiException(detail, response.statusCode);
    }
    return payload is Map<String, dynamic> ? payload : {'data': payload};
  }

  Future<Map<String, dynamic>> get(String path) async => _decode(await http.get(_uri(path), headers: _headers));

  Future<Map<String, dynamic>> post(String path, [Object? body]) async => _decode(
        await http.post(_uri(path), headers: _headers, body: jsonEncode(body ?? const <String, dynamic>{})),
      );

  Future<Map<String, dynamic>> patch(String path, Object? body) async => _decode(
        await http.patch(_uri(path), headers: _headers, body: jsonEncode(body ?? const <String, dynamic>{})),
      );

  Future<Map<String, dynamic>> delete(String path, [Object? body]) async => _decode(
        await http.delete(_uri(path), headers: _headers, body: jsonEncode(body ?? const <String, dynamic>{})),
      );

  // --- accounts ---------------------------------------------------------
  Future<Map<String, dynamic>> login(String identifier, String password) =>
      post('/api/auth/login', {'identifier': identifier, 'password': password});

  Future<Map<String, dynamic>> register({
    required String username,
    required String password,
    String? email,
    String? phone,
    String? displayName,
  }) =>
      post('/api/auth/register', {
        'username': username,
        'password': password,
        if (email != null && email.isNotEmpty) 'email': email,
        if (phone != null && phone.isNotEmpty) 'phone': phone,
        if (displayName != null && displayName.isNotEmpty) 'display_name': displayName,
      });

  Future<Map<String, dynamic>> me() => get('/api/auth/me');
  Future<Map<String, dynamic>> logout() => post('/api/auth/logout');

  /// حذف الحساب من داخل التطبيق (نفس مسار الويب: كلمة المرور + تأكيد صريح).
  Future<Map<String, dynamic>> deleteAccount(String password) =>
      delete('/api/auth/account', {'password': password, 'confirm': true});
  Future<Map<String, dynamic>> meta() => get('/api/meta/public');

  // --- wallet, store, gifts --------------------------------------------
  Future<Map<String, dynamic>> wallet() => get('/api/wallet');
  Future<Map<String, dynamic>> ledger() => get('/api/wallet/ledger');
  Future<Map<String, dynamic>> store() => get('/api/store');
  Future<Map<String, dynamic>> purchases() => get('/api/store/purchases');
  Future<Map<String, dynamic>> buyPack(int packId, String priceCurrency) =>
      post('/api/store/packs/$packId/purchase', {'price_currency': priceCurrency});
  Future<Map<String, dynamic>> cosmetics() => get('/api/store/cosmetics');
  Future<Map<String, dynamic>> buyItem(int itemId, String currency) =>
      post('/api/store/cosmetics/$itemId/purchase', {'currency': currency});
  Future<Map<String, dynamic>> equipItem(int itemId) => post('/api/store/cosmetics/$itemId/equip');
  /// نظام رويال: الحالة، المستويات الخمسة، وحزم الجواهر التي تمنح نقاط رويال.
  Future<Map<String, dynamic>> royal() => get('/api/royal');
  Future<Map<String, dynamic>> withdraw({
    required String currency,
    required int amount,
    required String method,
    required Map<String, dynamic> beneficiary,
    required String idempotencyKey,
  }) =>
      post('/api/wallet/withdraw', {
        'currency': currency,
        'amount': amount,
        'method': method,
        'beneficiary': beneficiary,
        'idempotency_key': idempotencyKey,
      });
  Future<Map<String, dynamic>> transfers() => get('/api/wallet/ledger?kind=transfer');
  Future<Map<String, dynamic>> gifts() => get('/api/gifts');
  Future<Map<String, dynamic>> sendGift({
    required int giftId,
    required String currency,
    int? receiverId,
    int? roomId,
    required String idempotencyKey,
  }) =>
      post('/api/gifts/send', {
        'gift_id': giftId,
        'currency': currency,
        if (receiverId != null) 'receiver_id': receiverId,
        if (roomId != null) 'room_id': roomId,
        'idempotency_key': idempotencyKey,
      });

  // --- rooms ------------------------------------------------------------
  Future<Map<String, dynamic>> rooms({String? query}) =>
      get('/api/rooms${query == null || query.isEmpty ? '' : '?q=$query'}');
  Future<Map<String, dynamic>> room(int id) => get('/api/rooms/$id');
  Future<Map<String, dynamic>> createRoom(Map<String, dynamic> payload) => post('/api/rooms', payload);
  Future<Map<String, dynamic>> joinRoom(int id, {String? password}) =>
      post('/api/rooms/$id/join', {if (password != null) 'password': password});
  Future<Map<String, dynamic>> leaveRoom(int id) => post('/api/rooms/$id/leave');
  Future<Map<String, dynamic>> takeSeat(int roomId, int seat) => post('/api/rooms/$roomId/seats/$seat/take');
  Future<Map<String, dynamic>> releaseSeat(int roomId, int seat) => post('/api/rooms/$roomId/seats/$seat/release');
  Future<Map<String, dynamic>> likeRoom(int roomId) => post('/api/rooms/$roomId/like');
  Future<Map<String, dynamic>> unseat(int roomId, int userId) =>
      post('/api/rooms/$roomId/members/$userId/unseat');
  Future<Map<String, dynamic>> banMember(int roomId, int userId, String duration, String reason) =>
      post('/api/rooms/$roomId/members/$userId/ban', {'duration': duration, 'reason': reason});
  Future<Map<String, dynamic>> roomBans(int roomId) => get('/api/rooms/$roomId/bans');
  Future<Map<String, dynamic>> unbanMember(int roomId, int userId) =>
      delete('/api/rooms/$roomId/bans/$userId');
  Future<Map<String, dynamic>> setBanPermission(int roomId, int userId, bool value) =>
      post('/api/rooms/$roomId/members/$userId/permissions', {'can_ban': value});
  Future<Map<String, dynamic>> setMic(int roomId, int userId, bool value) =>
      post('/api/rooms/$roomId/members/$userId/mic', {'value': value});
  Future<Map<String, dynamic>> roomMessages(int roomId) => get('/api/rooms/$roomId/messages?limit=50');
  Future<Map<String, dynamic>> postRoomMessage(int roomId, String text) =>
      post('/api/rooms/$roomId/messages', {'text': text});

  // --- friends ----------------------------------------------------------
  Future<Map<String, dynamic>> friends() => get('/api/friends');
  Future<Map<String, dynamic>> friendRequests() => get('/api/friends/requests');
  Future<Map<String, dynamic>> searchUsers(String query) => get('/api/users/search?q=$query');
  Future<Map<String, dynamic>> addFriend(int userId) => post('/api/friends/requests', {'user_id': userId});
  Future<Map<String, dynamic>> respondRequest(int requestId, bool accept) =>
      post('/api/friends/requests/$requestId/${accept ? 'accept' : 'reject'}');
  Future<Map<String, dynamic>> conversations() => get('/api/friends/conversations');
  Future<Map<String, dynamic>> sendDirect(int userId, String text) =>
      post('/api/friends/messages', {'user_id': userId, 'text': text});
  Future<Map<String, dynamic>> directMessages(int userId) => get('/api/friends/messages/$userId');

  // --- games ------------------------------------------------------------
  Future<Map<String, dynamic>> gameCatalog() => get('/api/games/catalog');
  Future<Map<String, dynamic>> gameRooms({String? game}) =>
      get('/api/games/rooms${game == null ? '' : '?game=$game'}');
  Future<Map<String, dynamic>> gameRoom(int id) => get('/api/games/rooms/$id');
  Future<Map<String, dynamic>> createGameRoom(String game, {int maxPlayers = 4}) =>
      post('/api/games/rooms', {'game': game, 'max_players': maxPlayers});
  Future<Map<String, dynamic>> joinGameRoom(int id) => post('/api/games/rooms/$id/join');
  Future<Map<String, dynamic>> leaveGameRoom(int id) => post('/api/games/rooms/$id/leave');
  Future<Map<String, dynamic>> startGameRoom(int id) => post('/api/games/rooms/$id/start');
  Future<Map<String, dynamic>> readyGameRoom(int id, bool value) =>
      post('/api/games/rooms/$id/ready?value=$value');
  Future<Map<String, dynamic>> gameAction(int id, String action, [Map<String, dynamic> payload = const {}]) =>
      post('/api/games/rooms/$id/action', {'action': action, 'payload': payload});
  Future<Map<String, dynamic>> ludoBoard() => get('/api/games/board/ludo');

  // --- notifications ----------------------------------------------------
  Future<Map<String, dynamic>> notifications() => get('/api/notifications?limit=50');
  Future<Map<String, dynamic>> report({required String targetType, required int targetId, required String reason}) =>
      post('/api/reports', {'target_type': targetType, 'target_id': targetId, 'reason': reason});
}

class ApiException implements Exception {
  ApiException(this.message, this.status);

  final String message;
  final int status;

  @override
  String toString() => message;
}

/// Live socket: room events, WebRTC signalling, chat, notifications and games.
class Realtime {
  Realtime({required this.baseUrl, required this.token});

  final String baseUrl;
  final String token;
  WebSocketChannel? _channel;
  final _events = StreamController<Map<String, dynamic>>.broadcast();

  Stream<Map<String, dynamic>> get events => _events.stream;

  Future<void> connect() async {
    final wsBase = baseUrl.replaceFirst('https://', 'wss://').replaceFirst('http://', 'ws://');
    _channel = WebSocketChannel.connect(Uri.parse('$wsBase/ws?token=$token'));
    _channel!.stream.listen(
      (dynamic data) {
        try {
          final decoded = jsonDecode('$data');
          if (decoded is Map<String, dynamic>) _events.add(decoded);
        } catch (_) {
          // ignore malformed frames
        }
      },
      onDone: () => _events.add({'type': 'socket_closed'}),
      cancelOnError: true,
    );
  }

  void send(Map<String, dynamic> payload) {
    _channel?.sink.add(jsonEncode(payload));
  }

  void dispose() {
    _channel?.sink.close();
    _events.close();
  }
}
