# AGENTS.md — ملاحظات تشغيل غير بديهية

## تشغيل بيئة التطوير
- كل شيء عبر `docker-compose.base44.yml` (من جذر المستودع). الخدمات: `db` → `migrate`
  (ينفّذ `alembic upgrade head` ثم يخرج) → `api` → `web` (3000) و`admin` (3001).
- الكود يُربط من المستودع (bind mount) وتُشغَّل `npm install` و`uvicorn --reload` عند الإقلاع،
  لذلك أي تعديل يظهر بدون إعادة بناء. `docker compose restart api` يكفي لتغيير في متغيرات البيئة.
- `WATCHFILES_FORCE_POLLING=true` مضبوط لأن أحداث الملفات لا تعبر دائمًا عبر bind mount.

## قواعد يجب معرفتها قبل التعديل
- **كل تغيير مالي** يمر عبر `app/economy.py` فقط: قفل صف المحفظة (`FOR UPDATE`) + صف في
  `ledger_entries` بمرجع `ref` فريد. لا تكتب في `wallets.coins/gold` من أي مكان آخر.
- **العملات الذرية للتكرار**: الهدايا/الشحن/السحب/المهام تأخذ `idempotency_key` أو `ref` فريدًا؛
  تكرار نفس الطلب يعيد السجل الأصلي بدل تنفيذ العملية مرتين.
- **متجر الزينة (نرد/موضوع)**: الشراء يمر عبر `economy.purchase_item` بمرجع فريد
  `item:<user>:<item>` (نفس الطلب يعيد السجل الأصلي ولا يخصم مرتين)، والملكية/المُستخدم في
  جدول `user_items` عبر `app/inventory.py` — عنصر واحد مُستخدم لكل نوع، ويُعاد في استجابة
  الدخول و`/api/auth/me` ضمن `equipped_items`. صورة العنصر اختيارية في عمود `image_url`،
  وبدونها يرسم التطبيق وجه النرد بألوان العنصر (`accent`/`pips`).
- **صلاحيات الإدارة على الخادم**: `get_admin_user` + `ROLE_PERMISSIONS` في `routers/admin.py`.
  إخفاء الأزرار في اللوحة ليس أمانًا — أي مسار إداري جديد يجب أن يضيف `require_permission`.
- **الألعاب**: القواعد في `app/games/*.py` نقية وقابلة للاختبار (تقبل قيمة نرد مُمرَّرة في الاختبارات)،
  والتوصيل بقاعدة البيانات/الوقت الحقيقي في `app/games/service.py`. لا تسمح للعميل بإرسال نتيجة
  النرد أو بحفظ الحالة بنفسه: كل إجراء يذهب إلى `service.apply_action`.
  حالة دومينو تُنقّى قبل الإرسال (`_redact`) فلا تُكشف أيدي الخصوم.
- **WebSocket**: قناة واحدة `/ws`. غرف الصوت تستخدم `hub.room_sockets`، والألعاب تستخدم
  القنوات العامة `hub.channels` باسم `game:<id>`.

## بيانات البيئة
- الأسرار: `/.env.base44-defaults` (قيم مؤقتة، مُلتزَمة) ثم `/run/base44/app.env` (أسرار المنصة، الأخيرة تفوز).
  لا تضع أبدًا أي مفتاح حقيقي في ملفات المستودع أو في `environment:` داخل Compose.
- حساب الإدارة يُنشأ من `ADMIN_USERNAME`/`ADMIN_PASSWORD`؛ تغيير `ADMIN_PASSWORD` وإعادة التشغيل
  يحدّث كلمة مروره (`seed._seed_admin`).
- بذور البيانات idempotent: لا تُكرر الصفوف ولا تُلغي تعديلات الإدارة.

## هوية الخلفية
- خلفية التطبيق صورة فوتوغرافية على مكتبة الأصول (`--app-backdrop` في `web/src/styles.css`
  و`AppColors.backdropUrl` في `flutter_app/lib/theme.dart`). تُحمّل من الشبكة، وبدون إنترنت
  يعود الويب إلى لون `--bg-1` وFlutter إلى تدرّج `AppColors.sunset`، فتبقى الواجهات مقروءة.
- غرف الصوت تحتفظ بتدرّجاتها الخاصة (`bg-*` في الويب و`roomBackgrounds` في Flutter) ولا تستخدم الصورة.

## التحقق
- اختبارات الـ Backend: `docker compose -f docker-compose.base44.yml exec -T api python -m pytest -q`
  (تحتاج خدمة `db` تعمل؛ تُنشئ قاعدة `app_test` تلقائيًا).
- فحص سريع: `curl -s localhost:8000/api/health` ثم `curl -s -o /dev/null -w '%{http_code}' localhost:3000/`.
- لا يمكن اختبار الصوت أو بناء APK داخل هذه البيئة (لا مايك ولا Android SDK) — راجع قسم
  «الصدق والتغطية» في `README.md` قبل إعلان أي شيء مكتمل.
