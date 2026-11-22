import { useState } from 'react';
import { api } from '../../lib/api';
import { formatCoins, useToast } from '../../lib/ui';
import { AdminCard, Empty, Field, Table, useAdminData } from './shared';

interface Pack {
  id: string;
  name: string;
  coins: number;
  bonus_coins: number;
  price_iqd: number;
  price_usd_cents: number;
  is_active: boolean;
  sort_order: number;
}

export default function PackagesTab() {
  const toast = useToast();
  const { data, loading, reload } = useAdminData<{ packages: Pack[] }>('/admin/packages');
  const [drafts, setDrafts] = useState<Record<string, Partial<Pack>>>({});
  const [newPack, setNewPack] = useState({ name: '', coins: 500, bonusCoins: 0, priceIqd: 2500, priceUsdCents: 199 });

  const value = <K extends keyof Pack>(pack: Pack, key: K): Pack[K] =>
    (drafts[pack.id]?.[key] as Pack[K]) ?? pack[key];

  const setDraft = (id: string, key: keyof Pack, next: unknown) =>
    setDrafts((current) => ({ ...current, [id]: { ...current[id], [key]: next } }));

  const save = async (pack: Pack) => {
    try {
      await api(`/admin/packages/${pack.id}`, {
        method: 'PUT',
        admin: true,
        body: {
          name: value(pack, 'name'),
          coins: Number(value(pack, 'coins')),
          bonusCoins: Number(value(pack, 'bonus_coins')),
          priceIqd: Number(value(pack, 'price_iqd')),
          priceUsdCents: Number(value(pack, 'price_usd_cents')),
          isActive: Boolean(value(pack, 'is_active')),
        },
      });
      toast.push('Package saved', 'success');
      setDrafts((current) => {
        const next = { ...current };
        delete next[pack.id];
        return next;
      });
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const create = async () => {
    try {
      await api('/admin/packages', { method: 'POST', admin: true, body: newPack });
      toast.push('Package created', 'success');
      setNewPack({ name: '', coins: 500, bonusCoins: 0, priceIqd: 2500, priceUsdCents: 199 });
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const deactivate = async (pack: Pack) => {
    try {
      await api(`/admin/packages/${pack.id}`, { method: 'DELETE', admin: true });
      toast.push('Package deactivated', 'success');
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  return (
    <div className="stack">
      <AdminCard title="Recharge packages" subtitle="Prices shown in the app immediately">
        {loading ? (
          <div className="skeleton" style={{ height: 180 }} />
        ) : (data?.packages.length ?? 0) === 0 ? (
          <Empty text="No packages" />
        ) : (
          <Table head={['Name', 'Coins', 'Bonus', 'Price IQD', 'Price USD ¢', 'Active', 'Actions']}>
            {data?.packages.map((pack) => (
              <tr key={pack.id}>
                <td>
                  <input
                    className="input"
                    style={{ width: 130, padding: '6px 10px' }}
                    value={String(value(pack, 'name'))}
                    onChange={(event) => setDraft(pack.id, 'name', event.target.value)}
                  />
                </td>
                <td>
                  <input
                    className="input"
                    type="number"
                    style={{ width: 90, padding: '6px 10px' }}
                    value={Number(value(pack, 'coins'))}
                    onChange={(event) => setDraft(pack.id, 'coins', Number(event.target.value))}
                    dir="ltr"
                  />
                </td>
                <td>
                  <input
                    className="input"
                    type="number"
                    style={{ width: 80, padding: '6px 10px' }}
                    value={Number(value(pack, 'bonus_coins'))}
                    onChange={(event) => setDraft(pack.id, 'bonus_coins', Number(event.target.value))}
                    dir="ltr"
                  />
                </td>
                <td>
                  <input
                    className="input"
                    type="number"
                    style={{ width: 100, padding: '6px 10px' }}
                    value={Number(value(pack, 'price_iqd'))}
                    onChange={(event) => setDraft(pack.id, 'price_iqd', Number(event.target.value))}
                    dir="ltr"
                  />
                </td>
                <td>
                  <input
                    className="input"
                    type="number"
                    style={{ width: 90, padding: '6px 10px' }}
                    value={Number(value(pack, 'price_usd_cents'))}
                    onChange={(event) => setDraft(pack.id, 'price_usd_cents', Number(event.target.value))}
                    dir="ltr"
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={Boolean(value(pack, 'is_active'))}
                    onChange={(event) => setDraft(pack.id, 'is_active', event.target.checked)}
                  />
                </td>
                <td>
                  <div className="inline">
                    <button className="btn btn-primary btn-xs" onClick={() => void save(pack)}>
                      Save
                    </button>
                    <button className="btn btn-ghost btn-xs" onClick={() => void deactivate(pack)}>
                      Off
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </AdminCard>

      <AdminCard title="New package">
        <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
          <Field label="Name">
            <input
              className="input"
              value={newPack.name}
              onChange={(event) => setNewPack({ ...newPack, name: event.target.value })}
            />
          </Field>
          <Field label="Coins">
            <input
              className="input"
              type="number"
              value={newPack.coins}
              onChange={(event) => setNewPack({ ...newPack, coins: Number(event.target.value) })}
              dir="ltr"
            />
          </Field>
          <Field label="Bonus">
            <input
              className="input"
              type="number"
              value={newPack.bonusCoins}
              onChange={(event) => setNewPack({ ...newPack, bonusCoins: Number(event.target.value) })}
              dir="ltr"
            />
          </Field>
          <Field label="Price IQD">
            <input
              className="input"
              type="number"
              value={newPack.priceIqd}
              onChange={(event) => setNewPack({ ...newPack, priceIqd: Number(event.target.value) })}
              dir="ltr"
            />
          </Field>
          <Field label="Price USD ¢">
            <input
              className="input"
              type="number"
              value={newPack.priceUsdCents}
              onChange={(event) => setNewPack({ ...newPack, priceUsdCents: Number(event.target.value) })}
              dir="ltr"
            />
          </Field>
        </div>
        <div className="inline" style={{ justifyContent: 'space-between' }}>
          <span className="tiny muted">
            Total: {formatCoins(newPack.coins + newPack.bonusCoins)} coins
          </span>
          <button className="btn btn-primary" onClick={() => void create()}>
            Create package
          </button>
        </div>
      </AdminCard>
    </div>
  );
}
