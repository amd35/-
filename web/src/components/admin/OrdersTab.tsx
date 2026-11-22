import { useState } from 'react';
import { api } from '../../lib/api';
import { formatCoins, useToast } from '../../lib/ui';
import { AdminCard, Empty, Table, useAdminData } from './shared';

interface Order {
  id: string;
  user_name: string;
  user_username: string;
  package_name: string | null;
  coins: number;
  amount: number;
  currency: string;
  provider: string;
  status: string;
  provider_ref: string | null;
  note: string | null;
  created_at: string;
  paid_at: string | null;
}

export default function OrdersTab() {
  const toast = useToast();
  const [status, setStatus] = useState('pending');
  const { data, loading, reload } = useAdminData<{ orders: Order[] }>(`/admin/orders?status=${status}`);

  const act = async (order: Order, action: 'confirm' | 'reject') => {
    try {
      await api(`/admin/orders/${order.id}/${action}`, {
        method: 'POST',
        admin: true,
        body: action === 'confirm' ? { providerRef: `manual-${Date.now()}` } : {},
      });
      toast.push(action === 'confirm' ? 'Payment confirmed, coins added' : 'Order rejected', 'success');
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  return (
    <AdminCard
      title="Recharge orders"
      subtitle="Coins are credited only after confirmation"
      actions={
        <select className="select" style={{ width: 140 }} value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="failed">Failed</option>
          <option value="all">All</option>
        </select>
      }
    >
      {loading ? (
        <div className="skeleton" style={{ height: 180 }} />
      ) : (data?.orders.length ?? 0) === 0 ? (
        <Empty text="No orders" />
      ) : (
        <Table head={['When', 'User', 'Package', 'Coins', 'Amount', 'Provider', 'Status', 'Actions']}>
          {data?.orders.map((order) => (
            <tr key={order.id}>
              <td className="tiny">{new Date(order.created_at).toLocaleString('en-GB')}</td>
              <td>
                <div style={{ fontWeight: 600 }}>{order.user_name}</div>
                <div className="tiny muted">@{order.user_username}</div>
              </td>
              <td>{order.package_name ?? '—'}</td>
              <td className="amount plus">{formatCoins(order.coins)}</td>
              <td>
                {formatCoins(order.amount)} {order.currency}
              </td>
              <td>{order.provider}</td>
              <td>
                <span
                  className={`pill ${order.status === 'paid' ? 'pill-green' : order.status === 'pending' ? 'pill-gold' : 'pill-red'}`}
                  style={{ fontSize: 10 }}
                >
                  {order.status}
                </span>
              </td>
              <td>
                {order.status === 'pending' ? (
                  <div className="inline">
                    <button className="btn btn-primary btn-xs" onClick={() => void act(order, 'confirm')}>
                      Confirm
                    </button>
                    <button className="btn btn-danger btn-xs" onClick={() => void act(order, 'reject')}>
                      Reject
                    </button>
                  </div>
                ) : (
                  <span className="tiny muted">{order.paid_at ? new Date(order.paid_at).toLocaleDateString('en-GB') : '—'}</span>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </AdminCard>
  );
}
