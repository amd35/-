import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'api_client.dart';
import 'screens/auth.dart';
import 'screens/home.dart';
import 'theme.dart';

/// API base URL. Override at build time:
///   flutter build apk --dart-define=API_BASE_URL=https://api.example.com
const apiBaseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://10.0.2.2:8000');

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const TonVoiceApp());
}

class TonVoiceApp extends StatefulWidget {
  const TonVoiceApp({super.key});

  @override
  State<TonVoiceApp> createState() => _TonVoiceAppState();
}

class _TonVoiceAppState extends State<TonVoiceApp> {
  late final AppState state = AppState(ApiClient(baseUrl: apiBaseUrl));

  @override
  void initState() {
    super.initState();
    state.bootstrap();
  }

  @override
  void dispose() {
    state.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AppScope(
      state: state,
      child: MaterialApp(
        title: 'TON Voice',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(),
        locale: const Locale('ar'),
        supportedLocales: const [Locale('ar'), Locale('en')],
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        builder: (context, child) => Directionality(textDirection: TextDirection.rtl, child: child!),
        home: const _Gate(),
      ),
    );
  }
}

class _Gate extends StatelessWidget {
  const _Gate();

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    if (state.loading) {
      return const SunsetScaffold(child: Center(child: CircularProgressIndicator()));
    }
    return state.user == null ? const AuthScreen() : const HomeShell();
  }
}

/// Shared application state: session, wallet, metadata and the live socket.
class AppState extends ChangeNotifier {
  AppState(this.api);

  final ApiClient api;
  Realtime? realtime;
  Map<String, dynamic>? user;
  Map<String, dynamic> wallet = {'coins': 0, 'gold': 0};
  Map<String, dynamic>? meta;
  bool loading = true;
  String? lastError;
  final List<Map<String, dynamic>> notifications = [];
  final List<void Function(Map<String, dynamic>)> _listeners = [];

  int get coins => (wallet['coins'] ?? 0) as int;
  int get gold => (wallet['gold'] ?? 0) as int;

  Future<void> bootstrap() async {
    await api.loadToken();
    try {
      meta = await api.meta();
    } catch (_) {
      meta = null;
    }
    if (api.token != null && api.token!.isNotEmpty) {
      await refresh();
    } else {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> refresh() async {
    try {
      final data = await api.me();
      user = data['user'] as Map<String, dynamic>?;
      wallet = (data['wallet'] as Map<String, dynamic>?) ?? wallet;
      _connectSocket();
    } catch (_) {
      await api.saveToken(null);
      user = null;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  void _connectSocket() {
    if (api.token == null || realtime != null) return;
    final socket = Realtime(baseUrl: apiBaseUrl, token: api.token!);
    realtime = socket;
    socket.events.listen((payload) {
      if (payload['type'] == 'notification') {
        notifications.insert(0, payload['notification'] as Map<String, dynamic>);
      }
      for (final listener in List.of(_listeners)) {
        listener(payload);
      }
    });
    socket.connect();
  }

  void subscribe(void Function(Map<String, dynamic>) listener) => _listeners.add(listener);

  void unsubscribe(void Function(Map<String, dynamic>) listener) => _listeners.remove(listener);

  bool send(Map<String, dynamic> payload) {
    if (realtime == null) return false;
    realtime!.send(payload);
    return true;
  }

  Future<void> login(String identifier, String password) async {
    final data = await api.login(identifier, password);
    await api.saveToken(data['token'] as String?);
    user = data['user'] as Map<String, dynamic>?;
    wallet = (data['wallet'] as Map<String, dynamic>?) ?? wallet;
    _connectSocket();
    notifyListeners();
  }

  Future<void> register(Map<String, dynamic> payload) async {
    final data = await api.register(
      username: payload['username'] as String,
      password: payload['password'] as String,
      email: payload['email'] as String?,
      phone: payload['phone'] as String?,
      displayName: payload['display_name'] as String?,
    );
    await api.saveToken(data['token'] as String?);
    user = data['user'] as Map<String, dynamic>?;
    wallet = (data['wallet'] as Map<String, dynamic>?) ?? wallet;
    _connectSocket();
    notifyListeners();
  }

  Future<void> logout() async {
    try {
      await api.logout();
    } catch (_) {
      // the token may already be invalid
    }
    await api.saveToken(null);
    realtime?.dispose();
    realtime = null;
    user = null;
    notifications.clear();
    notifyListeners();
  }

  @override
  void dispose() {
    realtime?.dispose();
    super.dispose();
  }
}

class AppScope extends InheritedNotifier<AppState> {
  const AppScope({super.key, required AppState state, required super.child}) : super(notifier: state);

  static AppState of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<AppScope>();
    assert(scope != null, 'AppScope is missing');
    return scope!.notifier!;
  }
}
