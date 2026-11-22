# تطبيق Android — Connect+ (Capacitor)

الواجهة (`web/`) مغلّفة الآن داخل مشروع Android أصلي عبر **Capacitor 8**، فتُبنى كملف APK/AAB
قابل للتثبيت بدلاً من صفحة ويب فقط. نفس الكود ونفس الـ API يُستخدمان في الويب وفي التطبيق.

## ما هو معدّ في المستودع

| العنصر | القيمة / المسار |
| --- | --- |
| إعداد Capacitor | `web/capacitor.config.ts` — `appId = com.connectplus.app`، `appName = Connect+`، `webDir = dist` |
| مشروع Android (Gradle) | `web/android/` — Gradle 8.14.3، AGP 8.13، Java 21، `compileSdk/targetSdk 36`، `minSdk 24` |
| إضافات Capacitor | `@capacitor/app` (زر الرجوع)، `@capacitor/splash-screen`، `@capacitor/status-bar` |
| الأيقونة و Splash | أيقونة تكيفية (قلب + سماعة) وخلفية متدرجة بنفسوية + صور splash في `web/android/app/src/main/res/` |
| تهيئة الغلاف | `web/src/lib/native.ts` (شريط الحالة، Splash، زر الرجوع) — لا يعمل إلا داخل التطبيق |
| عنوان الـ API | `VITE_API_URL` في `web/src/lib/api.ts` + `assetUrl()` لروابط `/uploads` |

### الأذونات المعلنة (`AndroidManifest.xml`)

`INTERNET`, `ACCESS_NETWORK_STATE`, `CAMERA`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`,
`WAKE_LOCK`, `POST_NOTIFICATIONS` — الكاميرا والميكروفون مطلوبان لمكالمات WebRTC، ويُطلبان من
المستخدم عند أول مكالمة.

### الشبكة

- كل الاتصالات في نسخة الإصدار عبر **HTTPS/WSS** (`res/xml/network_security_config.xml` يمنع
  النص الصريح). الاستثناء الوحيد لعناوين التطوير المحلية `10.0.2.2` و`localhost` و`127.0.0.1`.
- لأن الـ WebView يُقدَّم من `https://localhost` فإن طلبات الـ API تصبح cross-origin، لذلك
  السيرفر يضيف ترويسات CORS لقائمة `CORS_ORIGINS` (افتراضياً: `https://localhost`,
  `capacitor://localhost`, `http://localhost`, `http://10.0.2.2`). الويب يبقى same-origin
  ولا يتأثر.

## متطلبات البناء

- Node.js 20+ (المشروع يستخدم 22)
- **JDK 21**
- Android Studio (Ladybug أو أحدث) أو Android SDK Platform 36 + Build-Tools
- جهاز/محاكي Android 7.0 (API 24) أو أحدث

> بيئة المعاينة لا تحتوي Android SDK، لذلك بناء APK يتم على جهازك أو في CI، وليس داخل المعاينة.

## خطوات البناء

```bash
cd web
npm ci

# 1) وجّه الواجهة إلى سيرفرك العام (HTTPS، بدون /api وبدون / في النهاية)
export VITE_API_URL="https://api.example.com"

# 2) ابنِ الواجهة وانسخها + الإضافات إلى مشروع أندرويد
npm run sync:android

# 3) افتح Android Studio وابنِ APK من: Build ▸ Build Bundle(s)/APK(s) ▸ Build APK(s)
npm run open:android
```

أو من سطر الأوامر بدون Android Studio:

```bash
cd web
npm run apk:debug
# الناتج: web/android/app/build/outputs/apk/debug/app-debug.apk

cd android && ./gradlew bundleRelease
# الناتج: web/android/app/build/outputs/bundle/release/app-release.aab  (لمتجر Play)
```

بعد كل تعديل على `web/` أعد تنفيذ `npm run sync:android` (أو `npx cap sync android`) قبل البناء.

### توقيع نسخة الإصدار

مشروع الإصدار يحتاج keystore خاص بك (غير مضمّن في المستودع):

```bash
keytool -genkey -v -keystore connectplus-release.jks -alias connectplus \
  -keyalg RSA -keysize 2048 -validity 10000
```

ثم أضف `web/android/key.properties` (خارج git) و`signingConfigs` في
`web/android/app/build.gradle` كما في توثيق Android الرسمي.

## الاختبار على محاكي مقابل سيرفر محلي

- المحاكي يصل إلى جهازك عبر `10.0.2.2`، لذا يمكن بناء نسخة تجريبية بـ
  `VITE_API_URL=http://10.0.2.2:8000` (منفذ الـ API المنشور) — مسموح بالنص الصريح لهذا العنوان فقط.
- للاختبار على جهاز حقيقي داخل نفس الشبكة استخدم HTTPS (مثلاً نفقًا مثل ngrok/cloudflared)
  لأن العنوان المحلي غير مسموح بالنص الصريح.

## ما يعمل داخل التطبيق

- تسجيل الدخول/التسجيل بالبريد أو الهاتف وOTP (الجلسة بـ Bearer token في تخزين WebView).
- الدردشة الفورية عبر WebSocket، ورفع الصور/الملفات من منتقي ملفات أندرويد.
- مكالمات صوتية/فيديو WebRTC بعد منح إذن الكاميرا والميكروفون.
- زر الرجوع في أندرويد يتنقل داخل التطبيق ويخرج فقط من الشاشة الرئيسية.
- شريط حالة داكن + Splash بهوية التطبيق.

## غير مضمّن بعد

- **Push عند إغلاق التطبيق (FCM)**: يحتاج مشروع Firebase، وضع `google-services.json` في
  `web/android/app/`، وإضافة `@capacitor/push-notifications` + تسجيل التوكن على السيرفر.
- **تسجيل الدخول بـ Google داخل WebView**: يحتاج ضبط OAuth (client id للأندرويد + أصل
  `https://localhost`)؛ حاليًا يفضل إخفاء زر Google في نسخة Android أو استخدام متصفح النظام.
- **OTP برسالة حقيقية**: يحتاج مزوّد SMS (`SMS_PROVIDER_URL`/`SMS_PROVIDER_KEY`).
- **نشر على Google Play**: يتطلب حساب مطوّر + توقيع release + سياسة خصوصية.
