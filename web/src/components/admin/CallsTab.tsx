import { useState } from 'react';
import { formatCoins, formatDuration, Icon } from '../../lib/ui';
import { AdminCard, Empty, Table, useAdminData } from './shared';

interface AdminCall {
  id: string;
  kind: string;
  status: string;
  is_free: boolean;
  rate_per_minute: number;
  coins_charged: number;
  coins_refunded: number;
  duration_seconds: number;
  created_at: string;
  end_reason: string | null;
  caller_name: string;
  callee_name: string;
}

export default function CallsTab() {
  const [kind, setKind] = useState('all');
  const [status, setStatus] = useState('all');
  const { data, loading } = useAdminData<{ calls: AdminCall[] }>(
    `/admin/calls?kind=${kind}&status=${status}`
  );

  const calls = data?.calls ?? [];

  const kindLabel: Record<string, string> = { voice: 'صوتية', video: 'فيديو' };
  const statusLabel: Record<string, string> = {
    ringing: 'يرن',
    accepted: 'مقبولة',
    ended: 'منتهية',
    rejected: 'مرفوضة',
    missed: 'فائتة',
    cancelled: 'ملغاة',
    failed: 'فاشلة',
  };

  return (
    <AdminCard
      title="المكالمات"
      subtitle="كل محاولة اتصال مع نتيجة الفوترة"
      actions={
        <div className="inline">
          <select className="select" style={{ width: 120 }} value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="all">كل الأنواع</option>
            <option value="voice">صوتية</option>
            <option value="video">فيديو</option>
          </select>
          <select className="select" style={{ width: 130 }} value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">كل الحالات</option>
            <option value="ringing">يرن</option>
            <option value="accepted">مقبولة</option>
            <option value="ended">منتهية</option>
            <option value="rejected">مرفوضة</option>
            <option value="missed">فائتة</option>
            <option value="cancelled">ملغاة</option>
            <option value="failed">فاشلة</option>
          </select>
        </div>
      }
    >
      {loading ? (
        <div className="skeleton" style={{ height: 200 }} />
      ) : calls.length === 0 ? (
        <Empty text="لا توجد مكالمات بعد" />
      ) : (
        <Table head={['الوقت', 'النوع', 'المتصل ← المستقبل', 'الحالة', 'المدة', 'المخصوم', 'المسترجع', 'الفوترة']}>
          {calls.map((call) => (
            <tr key={call.id}>
              <td className="tiny">{new Date(call.created_at).toLocaleString('ar-IQ')}</td>
              <td>
                <span className="inline" style={{ gap: 5 }}>
                  <Icon name={call.kind === 'video' ? 'video' : 'phone'} size={14} />
                  {kindLabel[call.kind] ?? call.kind}
                </span>
              </td>
              <td>
                {call.caller_name} ← {call.callee_name}
              </td>
              <td>
                <span
                  className={`pill ${
                    call.status === 'ended'
                      ? 'pill-green'
                      : call.status === 'missed' || call.status === 'rejected'
                        ? 'pill-red'
                        : 'pill-gold'
                  }`}
                  style={{ fontSize: 10 }}
                >
                  {statusLabel[call.status] ?? call.status}
                </span>
              </td>
              <td>{formatDuration(call.duration_seconds)}</td>
              <td className="amount">{formatCoins(call.coins_charged)}</td>
              <td className="amount plus">{formatCoins(call.coins_refunded)}</td>
              <td>
                <span className={`pill ${call.is_free ? 'pill-green' : 'pill-gold'}`} style={{ fontSize: 10 }}>
                  {call.is_free ? 'مجانية' : `${call.rate_per_minute}/دقيقة`}
                </span>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </AdminCard>
  );
}
