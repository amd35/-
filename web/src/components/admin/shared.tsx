import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api } from '../../lib/api';
import { Icon, Spinner } from '../../lib/ui';

export function AdminCard({
  title,
  subtitle,
  actions,
  children,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {title ? (
        <div className="section-head">
          <div>
            <h2 style={{ fontSize: 16 }}>{title}</h2>
            {subtitle ? <span className="tiny muted">{subtitle}</span> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className="stat">
      <span className="label">{label}</span>
      <span className="value" style={accent ? { color: accent } : undefined}>
        {value}
      </span>
      {hint ? <span className="delta">{hint}</span> : null}
    </div>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            {head.map((title) => (
              <th key={title}>{title}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function useAdminData<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api<T>(path, { admin: true });
      setData(response);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, reload: load };
}

export function AdminLoading({ label }: { label?: string }) {
  return <Spinner label={label} />;
}

const ADMIN_ERRORS: [RegExp, string][] = [
  [/Wrong admin credentials/i, 'بيانات الدخول غير صحيحة'],
  [/Enter credentials/i, 'أدخل اسم المستخدم وكلمة المرور'],
  [/Current password is wrong/i, 'كلمة المرور الحالية غير صحيحة'],
  [/at least 8/i, 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل'],
  [/Password is too long/i, 'كلمة المرور طويلة جداً'],
  [/Too many attempts/i, 'محاولات كثيرة — حاول لاحقاً'],
];

export function adminError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  for (const [pattern, arabic] of ADMIN_ERRORS) {
    if (pattern.test(message)) return arabic;
  }
  return message;
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className="row static"
      onClick={() => onChange(!checked)}
      style={{ background: 'transparent' }}
    >
      <div className="row-main">
        <div className="row-title">{label}</div>
      </div>
      <span
        style={{
          width: 44,
          height: 26,
          borderRadius: 999,
          background: checked ? 'var(--grad)' : 'rgba(255,255,255,0.14)',
          border: '1px solid var(--line)',
          display: 'grid',
          placeItems: 'center',
          transition: 'background .2s ease',
        }}
      >
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: '#fff',
            justifySelf: checked ? 'end' : 'start',
            marginInline: 4,
          }}
        />
      </span>
    </button>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <Icon name="sparkle" size={22} />
      <span className="tiny">{text}</span>
    </div>
  );
}
