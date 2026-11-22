# النشر على خادم VPS خاص (Docker)

هذا الدليل يشغّل المنظومة كاملة على خادم تملكه: **قاعدة بيانات PostgreSQL**، **الـ API**،
**موقع الويب**، **لوحة الإدارة**، و**شهادة HTTPS تلقائية** — كلها عبر
`docker-compose.prod.yml` و`deploy/`.

> ملفات النشر هذه لا تُستخدم في بيئة Base44 (تلك تشغّل `docker-compose.base44.yml`).
> لا يوجد أي تغيير في الواجهة أو الألوان: النشر طبقة تشغيل فقط.

```
الإنترنت ──▶ Caddy (80/443، HTTPS تلقائي)
                ├── app.example.com    → ملفات الويب + /api /media /ws → api:8000
                └── admin.example.com  → لوحة الإدارة + /api /media        → api:8000
                                                                    api ──▶ db (PostgreSQL)
```

---

## 1. متطلبات الخادم

| البند | الحد الأدنى |
| --- | --- |
| VPS | 2 vCPU · 2 GB RAM · 25 GB SSD (Ubuntu 22.04/24.04) |
| نظام | Linux مع Docker Engine 24+ وDocker Compose v2 |
| نطاقات | نطاقان أو نطاق + سجل فرعي: `app.example.com` و`admin.example.com` |
| منافذ مفتوحة | 22 (SSH) · 80 · 443 (TCP) · 443 (UDP، HTTP/3) |

الصوت بين شبكات الجوال يحتاج **TURN** (خطوة 8). بدونه يعمل الصوت على نفس الشبكة فقط.

---

## 2. DNS

أضف في مزوّد النطاق سجلّين من النوع **A** يشيران إلى IP الخادم:

| الاسم | النوع | القيمة |
| --- | --- | --- |
| `app.example.com` | A | `<IP الخادم>` |
| `admin.example.com` | A | `<IP الخادم>` |

تأكد قبل أول تشغيل:

```bash
dig +short app.example.com
dig +short admin.example.com
```

---

## 3. تثبيت Docker (Ubuntu)

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"   # ثم اخرج من الجلسة وادخل مرة أخرى
docker compose version
```

جدار الحماية (إن كان ufw مُفعّلًا):

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw enable
```

---

## 4. جلب الكود

```bash
sudo mkdir -p /srv && sudo chown "$USER" /srv
git clone <REPO_URL> /srv/yalla-lohan
cd /srv/yalla-lohan
git checkout <BRANCH>     # الفرع الذي تعمل عليه (مثال: social-chat-app)
```

---

## 5. إعداد الأسرار

```bash
cp deploy/.env.prod.example deploy/.env
openssl rand -hex 32      # استخدم الناتج لـ SECRET_KEY
openssl rand -hex 24      # استخدم الناتج لـ POSTGRES_PASSWORD
openssl rand -hex 24      # استخدم الناتج لـ ADMIN_PASSWORD
nano deploy/.env
```

املأ على الأقل:

```ini
APP_DOMAIN=app.example.com
ADMIN_DOMAIN=admin.example.com
POSTGRES_PASSWORD=<قيمة عشوائية طويلة>
SECRET_KEY=<قيمة عشوائية طويلة>
ADMIN_PASSWORD=<كلمة مرور قوية للوحة الإدارة>
```

- `deploy/.env` مُستثنى في `.gitignore` — لا يُرفع إلى المستودع أبدًا.
- المتغيرات الاختيارية (SMTP، Stripe، TURN) تُترك فارغة ويظل التطبيق يعمل: رموز التحقق تُكتب
  في سجل الـ API بدل إرسالها بالبريد، والشحن يبقى `pending` لاعتماده يدويًا من اللوحة.
- `API_WORKERS` يبقى **1**: نظام الغرف والألعاب والرسائل اللحظية يعمل داخل ذاكرة العملية الواحدة
  (راجع القسم 10).

---

## 6. التشغيل

```bash
docker compose --env-file deploy/.env -f docker-compose.prod.yml up -d --build
```

ما يحدث بالترتيب: `db` تقلع ← `migrate` ينفّذ `alembic upgrade head` ثم يخرج ← `api` يقلع
(ويُنشئ البيانات الأولية مرة واحدة: الهدايا، الباقات، الإعدادات، حساب الإدارة) ← `proxy` يبني
الويب ولوحة الإدارة ويطلب شهادتي HTTPS تلقائيًا.

متابعة الحالة:

```bash
docker compose --env-file deploy/.env -f docker-compose.prod.yml ps
docker compose --env-file deploy/.env -f docker-compose.prod.yml logs -f proxy api
```

أول تشغيل يستغرق عدة دقائق (بناء الواجهات + طلب الشهادات).

---

## 7. التحقق

```bash
curl -fsS https://app.example.com/api/health          # {"status":"ok", ...}
curl -fsS -o /dev/null -w '%{http_code}\n' https://app.example.com/          # 200
curl -fsS -o /dev/null -w '%{http_code}\n' https://admin.example.com/        # 200
```

ثم من المتصفح:

1. `https://app.example.com` — التسجيل/الدخول، الغرف الصوتية، الألعاب، المحفظة.
2. `https://admin.example.com` — الدخول بـ `admin` وكلمة `ADMIN_PASSWORD` من `deploy/.env`.

**التطبيق (APK)** يستخدم نفس النطاق كجذر للـ API:

```bash
cd flutter_app
flutter build apk --release --dart-define=API_BASE_URL=https://app.example.com
```

---

## 8. الصوت بين شبكات الجوال (TURN) — اختياري لكنه مطلوب عمليًا

الخيار الأول (بلا خادم): مفاتيح Cloudflare TURN المجانية في `deploy/.env`:

```ini
CLOUDFLARE_TURN_KEY_ID=...
CLOUDFLARE_TURN_API_TOKEN=...
```

الخيار الثاني (خادم coturn على نفس الـ VPS):

```ini
TURN_USERNAME=yalla
TURN_CREDENTIAL=<كلمة مرور قوية>
TURN_EXTERNAL_IP=<IP الخادم العام>
TURN_URL=turn:app.example.com:3478
```

```bash
sudo ufw allow 3478/tcp && sudo ufw allow 3478/udp
sudo ufw allow 49160:49200/udp
docker compose --env-file deploy/.env -f docker-compose.prod.yml --profile turn up -d
docker compose --env-file deploy/.env -f docker-compose.prod.yml restart api
```

القيم تُوزَّع على الويب وتطبيق Flutter تلقائيًا من `/api/meta/public`.

---

## 9. النسخ الاحتياطي

```bash
chmod +x deploy/backup-db.sh
./deploy/backup-db.sh /srv/backups
```

جدولة يومية (3:15 صباحًا) عبر `crontab -e`:

```cron
15 3 * * * /srv/yalla-lohan/deploy/backup-db.sh /srv/backups >> /var/log/yalla-backup.log 2>&1
```

الاستعادة:

```bash
gunzip -c /srv/backups/db-YYYYMMDD-HHMMSS.sql.gz | \
  docker compose --env-file deploy/.env -f docker-compose.prod.yml exec -T db \
  sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

ملفات الصوت/الصور المرفوعة في الحجم `media` — انسخها دوريًا أيضًا:

```bash
docker run --rm -v yalla-lohan_media:/data -v /srv/backups:/backup alpine \
  tar czf /backup/media-$(date -u +%Y%m%d).tar.gz -C /data .
```

---

## 10. ملاحظات مهمة

- **عامل واحد للـ API**: نظام الغرف والألعاب والرسائل اللحظية (WebSocket) وحدود المعدل تعيش في
  ذاكرة العملية. رفع `API_WORKERS` فوق 1 يقسّم المتصلين بين عمليات فلا تصلهم أحداث بعضهم.
  التوسّع الأفقي يحتاج نقل الـ hub إلى Redis/pub-sub أولًا.
- **HTTPS إلزامي**: الكوكيز والـ WebSocket وتطبيق الأندرويد تعتمد عليه؛ Caddy يجدّد الشهادات
  تلقائيًا (بياناته في الحجمين `caddy_data` و`caddy_config` — لا تحذفهما).
- **Stripe**: رابط الـ webhook هو `https://app.example.com/api/payments/stripe/webhook`،
  ويحتاج `STRIPE_SECRET_KEY` و`STRIPE_WEBHOOK_SECRET` في `deploy/.env` قبل اعتماد أي شحن.
- **التحديث**:

  ```bash
  cd /srv/yalla-lohan
  git pull
  docker compose --env-file deploy/.env -f docker-compose.prod.yml up -d --build
  ```

  الترحيلات تُطبَّق تلقائيًا عبر خدمة `migrate`، والبيانات في الأحجام لا تُمس.

- **مشاكل شائعة**:
  - `proxy` يعيد 502: الـ API لم يجهز أو فشل الترحيل — `logs api migrate`.
  - لا تُصدر شهادة: DNS لا يشير إلى الخادم أو المنفذ 80 مغلق — `logs proxy`.
  - `POSTGRES_PASSWORD is required`: لم تُشغّل الأمر بـ `--env-file deploy/.env`.
