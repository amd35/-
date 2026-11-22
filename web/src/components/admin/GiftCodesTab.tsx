import { useState } from 'react';
import { api } from '../../lib/api';
import { formatCoins, Icon, useToast } from '../../lib/ui';
import { AdminCard, Empty, Field, Table, useAdminData } from './shared';

interface GiftCode {
  id: string;
  code: string;
  coins: number;
  max_uses: number;
  used_count: number;
  redemptions: number;
  note: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

const EMPTY_FORM = { coins: 100, count: 1, maxUses: 1, note: '', expiresAt: '' };

export default function GiftCodesTab() {
  const toast = useToast();
  const { data, loading, reload } = useAdminData<{ codes: GiftCode[] }>('/admin/gift-codes');
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<GiftCode[]>([]);

  const create = async () => {
    setBusy(true);
    try {
      const response = await api<{ codes: GiftCode[] }>('/admin/gift-codes', {
        method: 'POST',
        admin: true,
        body: {
          coins: Number(form.coins),
          count: Number(form.count),
          maxUses: Number(form.maxUses),
          note: form.note,
          expiresAt: form.expiresAt || null,
        },
      });
      setFresh(response.codes);
      toast.push(`${response.codes.length} code(s) created`, 'success');
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.push('Copied', 'success');
    } catch {
      toast.push('Copy failed', 'error');
    }
  };

  const toggle = async (gift: GiftCode) => {
    try {
      await api(`/admin/gift-codes/${gift.id}`, {
        method: 'PATCH',
        admin: true,
        body: { isActive: !gift.is_active },
      });
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  return (
    <div className="stack">
      <AdminCard
        title="Create gift codes"
        subtitle="Users redeem the code from the app and the coins land in their wallet"
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 12,
          }}
        >
          <Field label="Coins per code">
            <input
              className="input"
              type="number"
              min={1}
              dir="ltr"
              value={form.coins}
              onChange={(event) => setForm({ ...form, coins: Number(event.target.value) })}
            />
          </Field>
          <Field label="How many codes (max 50)">
            <input
              className="input"
              type="number"
              min={1}
              max={50}
              dir="ltr"
              value={form.count}
              onChange={(event) => setForm({ ...form, count: Number(event.target.value) })}
            />
          </Field>
          <Field label="Uses per code">
            <input
              className="input"
              type="number"
              min={1}
              dir="ltr"
              value={form.maxUses}
              onChange={(event) => setForm({ ...form, maxUses: Number(event.target.value) })}
            />
          </Field>
          <Field label="Expiry (optional)">
            <input
              className="input"
              type="datetime-local"
              dir="ltr"
              value={form.expiresAt}
              onChange={(event) => setForm({ ...form, expiresAt: event.target.value })}
            />
          </Field>
          <Field label="Note (optional)">
            <input
              className="input"
              value={form.note}
              onChange={(event) => setForm({ ...form, note: event.target.value })}
              placeholder="Ramadan campaign"
            />
          </Field>
        </div>
        <div className="inline">
          <button className="btn btn-primary" onClick={() => void create()} disabled={busy}>
            <Icon name="gift" size={16} /> {busy ? 'Creating…' : 'Generate codes'}
          </button>
        </div>

        {fresh.length > 0 ? (
          <div className="stack">
            <span className="tiny muted">New codes — copy and share them:</span>
            <div className="gift-code-list">
              {fresh.map((gift) => (
                <button key={gift.id} className="gift-code-pill" onClick={() => void copy(gift.code)}>
                  <b dir="ltr">{gift.code}</b>
                  <span className="tiny muted">{formatCoins(gift.coins)} coins</span>
                  <Icon name="copy" size={13} />
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </AdminCard>

      <AdminCard title="Issued codes" subtitle="Latest 200">
        {loading ? (
          <div className="skeleton" style={{ height: 160 }} />
        ) : (data?.codes.length ?? 0) === 0 ? (
          <Empty text="No gift codes yet" />
        ) : (
          <Table head={['Code', 'Coins', 'Used', 'Status', 'Expires', 'Note', 'Actions']}>
            {data?.codes.map((gift) => {
              const expired = gift.expires_at ? new Date(gift.expires_at).getTime() < Date.now() : false;
              const done = gift.used_count >= gift.max_uses;
              return (
                <tr key={gift.id}>
                  <td>
                    <b dir="ltr">{gift.code}</b>
                  </td>
                  <td>{formatCoins(gift.coins)}</td>
                  <td dir="ltr">
                    {gift.used_count} / {gift.max_uses}
                  </td>
                  <td>
                    <span
                      className={`pill ${
                        !gift.is_active ? 'pill-red' : expired ? 'pill-gold' : done ? 'pill-gold' : 'pill-green'
                      }`}
                      style={{ fontSize: 10 }}
                    >
                      {!gift.is_active ? 'disabled' : expired ? 'expired' : done ? 'used up' : 'active'}
                    </span>
                  </td>
                  <td className="tiny" dir="ltr">
                    {gift.expires_at ? new Date(gift.expires_at).toLocaleString() : '—'}
                  </td>
                  <td className="tiny">{gift.note || '—'}</td>
                  <td>
                    <div className="inline">
                      <button className="btn btn-ghost btn-xs" onClick={() => void copy(gift.code)}>
                        <Icon name="copy" size={13} /> Copy
                      </button>
                      <button className="btn btn-ghost btn-xs" onClick={() => void toggle(gift)}>
                        {gift.is_active ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </AdminCard>
    </div>
  );
}
