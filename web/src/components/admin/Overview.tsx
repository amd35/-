import { useId } from 'react';
import { formatCoins } from '../../lib/ui';
import { AdminCard, AdminLoading, Stat, useAdminData } from './shared';

interface OverviewResponse {
  stats: Record<string, number>;
  series: { day: string; calls: number; coins: number; admin_profit: number; signups: number }[];
  settings: Record<string, number | boolean | string>;
  onlineUsers: number;
}

function AreaChart({
  data,
  valueKey,
  color,
  height = 150,
}: {
  data: { day: string; [key: string]: number | string }[];
  valueKey: string;
  color: string;
  height?: number;
}) {
  const gradientId = useId().replace(/[:]/g, '');
  const width = 300;
  const chartHeight = 60;
  const values = data.map((item) => Number(item[valueKey] || 0));
  const max = Math.max(1, ...values);
  const step = data.length > 1 ? width / (data.length - 1) : width;
  const points = values.map((value, index) => [
    index * step,
    chartHeight - (value / max) * (chartHeight - 6) - 3,
  ]);
  const line = points.map(([x, y]) => `${x},${y}`).join(' ');
  const area = `0,${chartHeight} ${line} ${width},${chartHeight}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <svg
        viewBox={`0 0 ${width} ${chartHeight}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.55" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polygon points={area} fill={`url(#${gradientId})`} />
        <polyline
          points={line}
          fill="none"
          stroke={color}
          strokeWidth="1.4"
          vectorEffect="non-scaling-stroke"
        />
        {points.map(([x, y], index) => (
          <circle key={index} cx={x} cy={y} r="1.6" fill={color} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="inline" style={{ justifyContent: 'space-between' }}>
        {data.map((item) => (
          <span key={String(item.day)} className="tiny muted" style={{ fontSize: 10 }}>
            {String(item.day).slice(5)}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Overview() {
  const { data, loading, error } = useAdminData<OverviewResponse>('/admin/overview');

  if (loading) return <AdminLoading label="جارٍ تحميل النظرة العامة…" />;
  if (error) return <div className="error-text">{error}</div>;
  if (!data) return null;

  const s = data.stats;

  return (
    <div className="stack">
      <div className="stat-grid">
        <Stat label="مكالمات اليوم" value={formatCoins(s.calls_today)} hint={`${s.voice_today} صوتية • ${s.video_today} فيديو`} />
        <Stat label="الكونز المستهلكة اليوم" value={formatCoins(s.coins_today)} accent="#ffd75e" hint={`الإجمالي ${formatCoins(s.coins_total)}`} />
        <Stat label="أرباح الإدارة اليوم" value={formatCoins(s.admin_profit_today)} accent="#86efac" hint={`الإجمالي ${formatCoins(s.admin_profit_total)}`} />
        <Stat label="أرباح المستضيفين اليوم" value={formatCoins(s.host_profit_today)} />
        <Stat label="الإيرادات اليوم (دينار)" value={formatCoins(s.revenue_iqd_today)} />
        <Stat label="الكونز المبيعة اليوم" value={formatCoins(s.coins_sold_today)} />
        <Stat label="المكالمات النشطة" value={s.active_calls} accent="#c4b5fd" />
        <Stat label="المستخدمون" value={formatCoins(s.total_users)} hint={`${data.onlineUsers} متصل • ${s.banned_users} محظور`} />
        <Stat label="المحاولات المجانية المستخدمة اليوم" value={formatCoins(s.free_used_today)} hint={`الحد ${data.settings.free_calls_per_day} لكل مستخدم`} />
        <Stat label="الرسائل اليوم" value={formatCoins(s.messages_today)} />
        <Stat label="بلاغات مفتوحة" value={s.open_reports} accent="#fca5a5" />
        <Stat label="طلبات سحب معلّقة" value={s.pending_withdrawals} accent="#ffd75e" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 12 }}>
        <AdminCard title="الكونز المستهلكة — آخر 7 أيام" subtitle="حسب يوم بغداد">
          <AreaChart data={data.series} valueKey="coins" color="#d63384" />
        </AdminCard>
        <AdminCard title="المكالمات — آخر 7 أيام" subtitle="جميع محاولات الاتصال">
          <AreaChart data={data.series} valueKey="calls" color="#8b5cf6" />
        </AdminCard>
      </div>

      <AdminCard title="الأسعار الحالية" subtitle="تُطبَّق على المكالمات الجديدة فقط">
        <div className="stat-grid">
          <Stat label="سعر الصوت / دقيقة" value={`${data.settings.voice_price} كونز`} />
          <Stat label="سعر الفيديو / دقيقة" value={`${data.settings.video_price} كونز`} />
          <Stat label="محاولات مجانية / يوم" value={String(data.settings.free_calls_per_day)} />
          <Stat label="نسبة الإدارة" value={`${data.settings.admin_percent}%`} />
          <Stat label="نسبة المستضيف" value={`${data.settings.host_percent}%`} />
        </div>
      </AdminCard>
    </div>
  );
}
