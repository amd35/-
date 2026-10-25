import 'package:flutter/material.dart';

import '../api_client.dart';
import '../main.dart';
import '../theme.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _formKey = GlobalKey<FormState>();
  final _identifier = TextEditingController();
  final _password = TextEditingController();
  final _username = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  bool _register = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _identifier.dispose();
    _password.dispose();
    _username.dispose();
    _email.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    final state = AppScope.of(context);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (_register) {
        await state.register({
          'username': _username.text.trim(),
          'password': _password.text,
          'email': _email.text.trim(),
          'phone': _phone.text.trim(),
          'display_name': _username.text.trim(),
        });
      } else {
        await state.login(_identifier.text.trim(), _password.text);
      }
    } on ApiException catch (err) {
      setState(() => _error = err.message);
    } catch (err) {
      setState(() => _error = '$err');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SunsetScaffold(
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 20),
              Center(
                child: Container(
                  width: 74,
                  height: 74,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(colors: [AppColors.gold, AppColors.goldDeep]),
                    borderRadius: BorderRadius.circular(22),
                  ),
                  child: const Text('T', style: TextStyle(fontSize: 36, fontWeight: FontWeight.bold, color: Color(0xFF2B1533))),
                ),
              ),
              const SizedBox(height: 12),
              const Center(
                child: Text('TON Voice', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
              ),
              const Center(
                child: Text('غرف صوتية · ألعاب · هدايا', style: TextStyle(color: AppColors.muted)),
              ),
              const SizedBox(height: 24),
              GlassPanel(
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (_register) ...[
                        TextFormField(
                          controller: _username,
                          decoration: const InputDecoration(labelText: 'اسم المستخدم'),
                          validator: (value) => (value == null || value.trim().length < 3) ? 'اسم المستخدم قصير' : null,
                        ),
                        const SizedBox(height: 12),
                        TextFormField(
                          controller: _email,
                          decoration: const InputDecoration(labelText: 'البريد الإلكتروني (اختياري)'),
                          keyboardType: TextInputType.emailAddress,
                        ),
                        const SizedBox(height: 12),
                        TextFormField(
                          controller: _phone,
                          decoration: const InputDecoration(labelText: 'رقم الهاتف (اختياري)'),
                          keyboardType: TextInputType.phone,
                        ),
                        const SizedBox(height: 12),
                      ] else ...[
                        TextFormField(
                          controller: _identifier,
                          decoration: const InputDecoration(labelText: 'اسم المستخدم أو البريد أو الهاتف'),
                          validator: (value) => (value == null || value.trim().isEmpty) ? 'أدخل بيانات الدخول' : null,
                        ),
                        const SizedBox(height: 12),
                      ],
                      TextFormField(
                        controller: _password,
                        decoration: const InputDecoration(labelText: 'كلمة المرور'),
                        obscureText: true,
                        validator: (value) => (value == null || value.length < 6) ? 'كلمة المرور 6 أحرف على الأقل' : null,
                      ),
                      const SizedBox(height: 18),
                      ElevatedButton(
                        onPressed: _busy ? null : _submit,
                        child: Text(_busy ? '…' : (_register ? 'إنشاء حساب' : 'تسجيل الدخول')),
                      ),
                      TextButton(
                        onPressed: _busy
                            ? null
                            : () => setState(() {
                                  _register = !_register;
                                  _error = null;
                                }),
                        child: Text(_register ? 'لدي حساب بالفعل' : 'إنشاء حساب جديد'),
                      ),
                      if (_error != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Text(_error!, style: const TextStyle(color: AppColors.danger)),
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
