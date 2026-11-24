import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Icon, Sheet, useToast } from '../../lib/ui';

interface Restriction {
  id: string;
  capability: string;
  label: string;
  reason: string;
  expiresAt: string | null;
  permanent: boolean;
  createdAt: string;
}

interface Warning {
  id: string;
  engine: string;
  category: string;
  categoryLabel: string;
  severity: string;
  decision: string;
  strike: number;
  excerpt: string | null;
  createdAt: string;
}

interface Appeal {
  id: string;
  violationId: string | null;
  message: string;
  status: 'pending' | 'accepted' | 'rejected';
  resolution: string | null;
  autoResolved: boolean;
  createdAt: string;
  resolvedAt: string | null;
}

interface SecurityStatus {
  strikes: number;
  suspended: boolean;
  suspendedUntil: string | null;
  banned: boolean;
  banReason: string | null;
  restrictions: Restriction[];
  warnings: Warning[];
  appeals: Appeal[];
}

const DECISION_LABELS: Record<string, string> = {
  block: 'رفض المحتوى',
  suspend: 'إيقاف مؤقت',
  ban: 'حظر دائم',
  warn: 'تحذير',
  auto: 'تلقائي',
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('ar-IQ', {
    timeZone: 'Asia/Baghdad',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * «الاعتراض على العقوبة» — the user sees the reason, the remaining duration,
 * can explain their position, and follows the result. Low-confidence penalties
 * are lifted automatically by the server when the appeal is filed.
 */
export function SecurityCenterSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await api<SecurityStatus>('/security/status'));
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const submit = async () => {
    if (message.trim().length < 10) {
      toast.push('اكتب توضيحاً لا يقل عن 10 أحرف', 'error');
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ status: string; autoResolved: boolean }>('/security/appeals', {
        method: 'POST',
        body: { message },
      });
      toast.push(
        result.status === 'accepted'
          ? 'تم قبول اعتراضك وإعادة صلاحيات حسابك'
          : 'تم استلام اعتراضك وسيُراجع من فريق السلامة',
        'success'
      );
      setMessage('');
      await load();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="مركز الحماية والاعتراض">
      <div className="stack">
        {loading && !status ? <div className="skeleton" style={{ height: 120 }} /> : null}

        {status?.banned ? (
          <div className="card" style={{ borderColor: 'rgba(255,80,120,0.45)' }}>
            <div className="row-title" style={{ color: 'var(--neon-pink)' }}>
              <Icon name="shield" size={16} /> الحساب محظور نهائياً
            </div>
            <div className="tiny muted" style={{ lineHeight: 1.8 }}>
              {status.banReason || 'بسبب مخالفة سياسة السلامة.'}
            </div>
          </div>
        ) : status?.suspended ? (
          <div className="card" style={{ borderColor: 'rgba(240,196,106,0.45)' }}>
            <div className="row-title" style={{ color: 'var(--gold)' }}>
              <Icon name="clock" size={16} /> الحساب موقوف مؤقتاً
            </div>
            <div className="tiny muted">ينتهي الإيقاف: {formatDate(status.suspendedUntil)}</div>
          </div>
        ) : null}

        <div className="row static">
          <div className="row-main">
            <div className="row-title">التحذيرات المسجلة</div>
            <div className="row-sub tiny">
              {status?.strikes ?? 0} مخالفة — بعد 3 مخالفات يُوقف الحساب تلقائياً
            </div>
          </div>
          <span className="pill pill-gold" style={{ fontSize: 12 }}>
            {status?.strikes ?? 0}
          </span>
        </div>

        {status?.restrictions.length ? (
          <div className="stack">
            <div className="section-title tiny">القيود الحالية</div>
            {status.restrictions.map((restriction) => (
              <div key={restriction.id} className="row static">
                <Icon name="lock" size={16} />
                <div className="row-main">
                  <div className="row-title" style={{ fontSize: 13 }}>{restriction.label}</div>
                  <div className="row-sub tiny">
                    {restriction.reason} • {restriction.permanent ? 'دائم' : `حتى ${formatDate(restriction.expiresAt)}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {status?.warnings.length ? (
          <div className="stack">
            <div className="section-title tiny">سجل المخالفات</div>
            {status.warnings.slice(0, 10).map((warning) => (
              <div key={warning.id} className="row static">
                <div className="row-main">
                  <div className="row-title" style={{ fontSize: 13 }}>{warning.categoryLabel}</div>
                  <div className="row-sub tiny">
                    {formatDate(warning.createdAt)} • {DECISION_LABELS[warning.decision] ?? warning.decision} • مخالفة #{warning.strike}
                  </div>
                </div>
                <span className="pill" style={{ fontSize: 10 }}>{warning.severity}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="tiny muted">لا توجد مخالفات مسجلة على حسابك — شكراً لالتزامك بالقواعد.</div>
        )}

        <div className="field">
          <label>الاعتراض على العقوبة</label>
          <textarea
            className="textarea"
            placeholder="اشرح موقفك: لماذا تعتقد أن القرار غير صحيح؟"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </div>
        <button className="btn btn-primary btn-block" disabled={busy || message.trim().length < 10} onClick={() => void submit()}>
          {busy ? <span className="spinner" /> : 'إرسال الاعتراض'}
        </button>
        <div className="tiny muted" style={{ lineHeight: 1.8 }}>
          يُراجع الاعتراض آلياً عندما يكون تصنيف المخالفة غير مؤكد، ويُعاد فوراً. الحالات الأخرى
          يراجعها فريق السلامة. تُحلَّل الرسائل لغرض السلامة فقط.
        </div>

        {status?.appeals.length ? (
          <div className="stack">
            <div className="section-title tiny">اعتراضاتي</div>
            {status.appeals.map((appeal) => (
              <div key={appeal.id} className="row static">
                <div className="row-main">
                  <div className="row-title" style={{ fontSize: 13 }}>
                    {appeal.status === 'pending' ? 'بانتظار المراجعة' : appeal.status === 'accepted' ? 'مقبول' : 'مرفوض'}
                    {appeal.autoResolved ? ' • آلي' : ''}
                  </div>
                  <div className="row-sub tiny">
                    {formatDate(appeal.createdAt)}
                    {appeal.resolution ? ` • ${appeal.resolution}` : ''}
                  </div>
                </div>
                <span
                  className={`pill ${appeal.status === 'accepted' ? 'pill-green' : appeal.status === 'rejected' ? 'pill-pink' : 'pill-gold'}`}
                  style={{ fontSize: 10 }}
                >
                  {appeal.status === 'pending' ? 'معلق' : appeal.status === 'accepted' ? 'مقبول' : 'مرفوض'}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
