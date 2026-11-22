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

  return (
    <AdminCard
      title="Calls"
      subtitle="Every call attempt with its billing outcome"
      actions={
        <div className="inline">
          <select className="select" style={{ width: 120 }} value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="all">All types</option>
            <option value="voice">Voice</option>
            <option value="video">Video</option>
          </select>
          <select className="select" style={{ width: 130 }} value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="ringing">Ringing</option>
            <option value="accepted">Accepted</option>
            <option value="ended">Ended</option>
            <option value="rejected">Rejected</option>
            <option value="missed">Missed</option>
            <option value="cancelled">Cancelled</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      }
    >
      {loading ? (
        <div className="skeleton" style={{ height: 200 }} />
      ) : calls.length === 0 ? (
        <Empty text="No calls yet" />
      ) : (
        <Table head={['When', 'Type', 'Caller → Callee', 'Status', 'Duration', 'Charged', 'Refund', 'Billing']}>
          {calls.map((call) => (
            <tr key={call.id}>
              <td className="tiny">{new Date(call.created_at).toLocaleString('en-GB')}</td>
              <td>
                <span className="inline" style={{ gap: 5 }}>
                  <Icon name={call.kind === 'video' ? 'video' : 'phone'} size={14} />
                  {call.kind}
                </span>
              </td>
              <td>
                {call.caller_name} → {call.callee_name}
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
                  {call.status}
                </span>
              </td>
              <td>{formatDuration(call.duration_seconds)}</td>
              <td className="amount">{formatCoins(call.coins_charged)}</td>
              <td className="amount plus">{formatCoins(call.coins_refunded)}</td>
              <td>
                <span className={`pill ${call.is_free ? 'pill-green' : 'pill-gold'}`} style={{ fontSize: 10 }}>
                  {call.is_free ? 'free' : `${call.rate_per_minute}/min`}
                </span>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </AdminCard>
  );
}
