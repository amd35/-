import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Icon, useToast } from '../../lib/ui';
import { AdminCard, Empty, Field, Stat, Table, adminError, useAdminData } from './shared';

interface EngineMap {
  text: boolean;
  image: boolean;
  video: boolean;
  voice: boolean;
  fraud: boolean;
  spam: boolean;
  impersonation: boolean;
  account: boolean;
}

interface SecurityConfig {
  enabled: boolean;
  engines: EngineMap;
  sensitivity: 'low' | 'normal' | 'high';
  auto_penalties: boolean;
  custom_blocked_words: string[];
  whitelist_words: string[];
  appeal_auto_accept_confidence: number;
  media_provider: 'auto' | 'local';
}

interface Violation {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  engine: string;
  category: string;
  categoryLabel: string;
  severity: string;
  confidence: number;
  surface: string;
  excerpt: string | null;
  decision: string;
  strike: number;
  status: string;
  createdAt: string;
}

interface Overview {
  today: {
    violations: number;
    warnings: number;
    rejectedMedia: number;
    messageViolations: number;
    profanityCases: number;
    fraudCases: number;
    impersonationCases: number;
    spamCases: number;
  };
  totals: { violations: number; permanentBans: number };
  suspendedAccounts: number;
  topCategories: { category: string; label: string; count: number }[];
  engines: { engine: string; count: number }[];
  recent: Violation[];
  appeals: { pending: number; total: number };
  provider: { externalMedia: boolean };
}

interface Appeal {
  id: string;
  username: string;
  displayName: string;
  message: string;
  status: string;
  resolution: string | null;
  autoResolved: boolean;
  categoryLabel: string | null;
  decision: string | null;
  createdAt: string;
}

const ENGINE_LABELS: { key: keyof EngineMap; label: string }[] = [
  { key: 'text', label: 'Text Moderation — النصوص' },
  { key: 'image', label: 'Image Moderation — الصور' },
  { key: 'video', label: 'Video Moderation — الفيديو' },
  { key: 'voice', label: 'Voice Moderation — الصوت' },
  { key: 'fraud', label: 'Fraud Detection — الاحتيال' },
  { key: 'spam', label: 'Anti-Spam — الإزعاج' },
  { key: 'impersonation', label: 'Impersonation — الانتحال' },
  { key: 'account', label: 'Account Protection — الحسابات' },
];

const DECISION_LABELS: Record<string, string> = {
  block: 'رفض المحتوى',
  suspend: 'إيقاف الحساب',
  ban: 'حظر دائم',
  warn: 'تحذير',
};

export default function AiSecurityTab() {
  const toast = useToast();
  const { data, loading, reload } = useAdminData<{ overview: Overview; config: SecurityConfig }>(
    '/admin/security/overview'
  );
  const appeals = useAdminData<{ appeals: Appeal[] }>('/admin/security/appeals?status=pending');
  const hashes = useAdminData<{ hashes: { hash: string; reason: string; created_at: string }[] }>(
    '/admin/security/hashes'
  );

  const [config, setConfig] = useState<SecurityConfig | null>(null);
  const [words, setWords] = useState('');
  const [hash, setHash] = useState('');
  const [hashReason, setHashReason] = useState('');
  const [testText, setTestText] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data?.config) {
      setConfig(data.config);
      setWords(data.config.custom_blocked_words.join(', '));
    }
  }, [data?.config]);

  const saveConfig = async (patch: Partial<SecurityConfig>) => {
    if (!config) return;
    const next = { ...config, ...patch };
    setConfig(next);
    try {
      await api('/admin/security/settings', { method: 'PUT', admin: true, body: patch });
      toast.push('تم حفظ إعدادات الحماية', 'success');
    } catch (error) {
      toast.push(adminError(error), 'error');
      void reload();
    }
  };

  const saveWords = async () => {
    const list = words
      .split(/[,\n]/)
      .map((word) => word.trim())
      .filter(Boolean);
    await saveConfig({ custom_blocked_words: list });
  };

  const act = async (violation: Violation, action: 'dismiss' | 'uphold') => {
    try {
      await api(`/admin/security/violations/${violation.id}/${action}`, {
        method: 'POST',
        admin: true,
        body: {},
      });
      toast.push(action === 'dismiss' ? 'تم رفع العقوبة' : 'تم تثبيت العقوبة', 'success');
      await reload();
    } catch (error) {
      toast.push(adminError(error), 'error');
    }
  };

  const resolveAppeal = async (appeal: Appeal, status: 'accepted' | 'rejected') => {
    try {
      await api(`/admin/security/appeals/${appeal.id}/resolve`, {
        method: 'POST',
        admin: true,
        body: { status },
      });
      toast.push(status === 'accepted' ? 'تم قبول الاعتراض' : 'تم رفض الاعتراض', 'success');
      await appeals.reload();
      await reload();
    } catch (error) {
      toast.push(adminError(error), 'error');
    }
  };

  const runTest = async () => {
    setBusy(true);
    try {
      const response = await api<{ classification: { clean: boolean; category: string | null; severity: string | null; confidence: number; matches: { term: string }[] } }>(
        '/admin/security/test',
        { method: 'POST', admin: true, body: { text: testText } }
      );
      const c = response.classification;
      setTestResult(
        c.clean
          ? 'سليم — لن يتم اتخاذ أي إجراء'
          : `تصنيف: ${c.category} • الخطورة: ${c.severity} • الثقة: ${Math.round(c.confidence * 100)}% • الكلمات: ${c.matches
              .map((m) => m.term)
              .join('، ')}`
      );
    } catch (error) {
      setTestResult(adminError(error));
    } finally {
      setBusy(false);
    }
  };

  const addHash = async () => {
    try {
      await api('/admin/security/hashes', {
        method: 'POST',
        admin: true,
        body: { hash, reason: hashReason || 'محظور من الإدارة' },
      });
      setHash('');
      setHashReason('');
      toast.push('تمت إضافة بصمة الوسائط', 'success');
      await hashes.reload();
    } catch (error) {
      toast.push(adminError(error), 'error');
    }
  };

  const overview = data?.overview;

  return (
    <div className="stack">
      <AdminCard
        title="YALLA PHONE AI SECURITY"
        subtitle="محركات الحماية تعمل على الخادم 24 ساعة وتطبّق العقوبات تلقائياً"
        actions={
          <span className={`pill ${config?.enabled ? 'pill-green' : 'pill-gold'}`} style={{ fontSize: 11 }}>
            <Icon name="shield" size={12} /> {config?.enabled ? 'مفعّل' : 'متوقف'}
          </span>
        }
      >
        {loading || !overview ? (
          <div className="skeleton" style={{ height: 140 }} />
        ) : (
          <div className="stat-grid">
            <Stat label="مخالفات اليوم" value={overview.today.violations} accent="var(--neon-pink)" />
            <Stat label="التحذيرات المرسلة" value={overview.today.warnings} />
            <Stat label="الحسابات الموقوفة" value={overview.suspendedAccounts} accent="var(--gold)" />
            <Stat label="صور/فيديو مرفوضة" value={overview.today.rejectedMedia} />
            <Stat label="رسائل مخالفة" value={overview.today.messageViolations} />
            <Stat label="سب وشتم" value={overview.today.profanityCases} />
            <Stat label="احتيال" value={overview.today.fraudCases} accent="var(--neon-pink)" />
            <Stat label="انتحال شخصية" value={overview.today.impersonationCases} />
          </div>
        )}
        <div className="tiny muted" style={{ lineHeight: 1.8 }}>
          {overview?.provider.externalMedia
            ? 'فحص الصور يعمل بمزوّد ذكاء اصطناعي خارجي + بصمات الحظر المحلية.'
            : 'فحص الصور يعمل حالياً ببصمات الحظر المحلية وأسماء الملفات؛ أضف OPENAI_API_KEY لتشغيل التحليل البصري الكامل.'}
        </div>
      </AdminCard>

      <AdminCard title="إعدادات المحركات" subtitle="كل محرك مستقل ويمكن إيقافه دون تحديث التطبيق">
        {config ? (
          <div className="stack">
            <div className="grid-2">
              <Field label="حساسية الاكتشاف">
                <select
                  className="input"
                  value={config.sensitivity}
                  onChange={(event) => void saveConfig({ sensitivity: event.target.value as SecurityConfig['sensitivity'] })}
                >
                  <option value="low">منخفضة (تقلل الإنذارات الكاذبة)</option>
                  <option value="normal">متوازنة</option>
                  <option value="high">عالية (أشد صرامة)</option>
                </select>
              </Field>
              <Field label="قبول الاعتراض التلقائي" hint="إذا كانت ثقة التصنيف أقل من هذه النسبة تُرفع العقوبة آلياً">
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={99}
                  value={Math.round(config.appeal_auto_accept_confidence * 100)}
                  onChange={(event) =>
                    void saveConfig({ appeal_auto_accept_confidence: Number(event.target.value) / 100 })
                  }
                  dir="ltr"
                />
              </Field>
            </div>
            <div className="grid-2">
              {ENGINE_LABELS.map((engine) => (
                <label key={engine.key} className="row static" style={{ cursor: 'pointer' }}>
                  <div className="row-main">
                    <div className="row-title" style={{ fontSize: 13 }}>{engine.label}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.engines[engine.key]}
                    onChange={(event) =>
                      void saveConfig({ engines: { ...config.engines, [engine.key]: event.target.checked } })
                    }
                  />
                </label>
              ))}
            </div>
            <Field label="كلمات محظورة إضافية" hint="افصل بينها بفاصلة — تُحدَّث فوراً على الخادم">
              <textarea className="textarea" value={words} onChange={(event) => setWords(event.target.value)} />
            </Field>
            <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => void saveWords()}>
              حفظ الكلمات
            </button>
            <div className="inline">
              <button
                className={`btn btn-sm ${config.enabled ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => void saveConfig({ enabled: !config.enabled })}
              >
                {config.enabled ? 'إيقاف الحماية التلقائية' : 'تشغيل الحماية التلقائية'}
              </button>
              <span className="tiny muted">
                العقوبات التلقائية: {config.auto_penalties ? 'مفعّلة' : 'معطلة'}
              </span>
            </div>
          </div>
        ) : (
          <div className="skeleton" style={{ height: 120 }} />
        )}
      </AdminCard>

      <AdminCard title="آخر العقوبات التلقائية" subtitle="قرارات الخادم مع إمكانية المراجعة والرفع">
        {loading ? (
          <div className="skeleton" style={{ height: 140 }} />
        ) : (overview?.recent.length ?? 0) === 0 ? (
          <Empty text="لا توجد مخالفات مسجلة" />
        ) : (
          <Table head={['الوقت', 'المستخدم', 'المحرك', 'النوع', 'المحتوى', 'القرار', 'الحالة', 'إجراء']}>
            {overview?.recent.map((violation) => (
              <tr key={violation.id}>
                <td className="tiny">{new Date(violation.createdAt).toLocaleString('ar-IQ')}</td>
                <td>
                  <div style={{ fontWeight: 600 }}>{violation.displayName}</div>
                  <div className="tiny muted">#{violation.username}</div>
                </td>
                <td className="tiny">{violation.engine}</td>
                <td>
                  {violation.categoryLabel}
                  <div className="tiny muted">
                    {violation.severity} • {Math.round(violation.confidence * 100)}%
                  </div>
                </td>
                <td className="tiny" style={{ maxWidth: 200, whiteSpace: 'normal' }}>
                  {violation.excerpt || '—'}
                </td>
                <td>
                  <span className="pill" style={{ fontSize: 10 }}>
                    {DECISION_LABELS[violation.decision] ?? violation.decision}
                  </span>
                  <div className="tiny muted">مخالفة #{violation.strike}</div>
                </td>
                <td className="tiny">{violation.status === 'dismissed' ? 'مرفوعة' : violation.status === 'upheld' ? 'مثبتة' : 'تلقائي'}</td>
                <td>
                  <div className="inline">
                    <button className="btn btn-ghost btn-xs" onClick={() => void act(violation, 'dismiss')}>
                      رفع
                    </button>
                    <button className="btn btn-ghost btn-xs" onClick={() => void act(violation, 'uphold')}>
                      تثبيت
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </AdminCard>

      <AdminCard
        title="الاعتراضات والاستئناف"
        subtitle={`${overview?.appeals.pending ?? 0} اعتراض بانتظار المراجعة`}
      >
        {appeals.loading ? (
          <div className="skeleton" style={{ height: 120 }} />
        ) : (appeals.data?.appeals.length ?? 0) === 0 ? (
          <Empty text="لا توجد اعتراضات معلقة" />
        ) : (
          <Table head={['الوقت', 'المستخدم', 'سبب العقوبة', 'الاعتراض', 'إجراء']}>
            {appeals.data?.appeals.map((appeal) => (
              <tr key={appeal.id}>
                <td className="tiny">{new Date(appeal.createdAt).toLocaleString('ar-IQ')}</td>
                <td>
                  <div style={{ fontWeight: 600 }}>{appeal.displayName}</div>
                  <div className="tiny muted">#{appeal.username}</div>
                </td>
                <td className="tiny">{appeal.categoryLabel ?? '—'}</td>
                <td className="tiny" style={{ maxWidth: 260, whiteSpace: 'normal' }}>{appeal.message}</td>
                <td>
                  <div className="inline">
                    <button className="btn btn-primary btn-xs" onClick={() => void resolveAppeal(appeal, 'accepted')}>
                      قبول
                    </button>
                    <button className="btn btn-ghost btn-xs" onClick={() => void resolveAppeal(appeal, 'rejected')}>
                      رفض
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </AdminCard>

      <div className="grid-2">
        <AdminCard title="اختبار المحرك" subtitle="جرّب أي نص وشاهد تصنيف الخادم قبل نشره">
          <div className="stack">
            <textarea
              className="textarea"
              placeholder="اكتب رسالة للاختبار…"
              value={testText}
              onChange={(event) => setTestText(event.target.value)}
            />
            <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} disabled={busy || !testText.trim()} onClick={() => void runTest()}>
              فحص النص
            </button>
            {testResult ? <div className="tiny" style={{ color: 'var(--gold)' }}>{testResult}</div> : null}
          </div>
        </AdminCard>

        <AdminCard title="بصمات الوسائط المحظورة" subtitle="SHA-256 لصورة أو فيديو معروف — يُرفض فوراً عند الرفع">
          <div className="stack">
            <Field label="بصمة SHA-256">
              <input className="input" value={hash} onChange={(event) => setHash(event.target.value)} dir="ltr" />
            </Field>
            <Field label="السبب">
              <input className="input" value={hashReason} onChange={(event) => setHashReason(event.target.value)} />
            </Field>
            <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} disabled={!hash.trim()} onClick={() => void addHash()}>
              إضافة البصمة
            </button>
            {(hashes.data?.hashes.length ?? 0) > 0 ? (
              <div className="stack">
                {hashes.data?.hashes.slice(0, 6).map((row) => (
                  <div key={row.hash} className="row static">
                    <div className="row-main">
                      <div className="row-title tiny" style={{ fontFamily: 'monospace' }}>{row.hash.slice(0, 20)}…</div>
                      <div className="row-sub tiny">{row.reason}</div>
                    </div>
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={async () => {
                        await api(`/admin/security/hashes/${row.hash}`, { method: 'DELETE', admin: true });
                        await hashes.reload();
                      }}
                    >
                      حذف
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </AdminCard>
      </div>
    </div>
  );
}
