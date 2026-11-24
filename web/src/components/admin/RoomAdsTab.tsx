import { useState } from 'react';
import { api } from '../../lib/api';
import { formatCoins, Icon, useToast } from '../../lib/ui';
import { AdminCard, Empty, Field, Table, adminError, useAdminData } from './shared';

interface AdminGift {
  id: string;
  name: string;
  price: number;
  rarity: string;
  isActive: boolean;
}

interface AdminRoomAd {
  id: string;
  title: string;
  price: number;
  isActive: boolean;
  sortOrder: number;
  giftActive: boolean;
  gift: { id: string; name: string; price: number };
}

/**
 * «إعلانات الغرفة»: the horizontal banners shown on the left of the room stage.
 * Each ad sells one gift for diamonds; buying it drops the gift into the
 * member's gift bag. The rail rotates one ad per Baghdad day, so the featured
 * gift changes daily and no gift repeats until every ad has had its turn.
 */
export default function RoomAdsTab() {
  const toast = useToast();
  const { data, loading, reload } = useAdminData<{ ads: AdminRoomAd[]; gifts: AdminGift[] }>(
    '/admin/room-ads'
  );
  const [form, setForm] = useState({ giftId: '', title: '', price: '', sortOrder: 0 });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const pickGift = (giftId: string) => {
    const gift = data?.gifts.find((item) => item.id === giftId);
    setForm((current) => ({
      ...current,
      giftId,
      price: gift ? String(gift.price) : current.price,
      title: current.title || gift?.name || '',
    }));
  };

  const create = async () => {
    if (!form.giftId) {
      toast.push('اختر الهدية أولاً', 'error');
      return;
    }
    setBusy(true);
    try {
      await api('/admin/room-ads', {
        admin: true,
        method: 'POST',
        body: {
          giftId: form.giftId,
          title: form.title,
          price: Number(form.price || 0),
          sortOrder: Number(form.sortOrder || 0),
        },
      });
      setForm({ giftId: '', title: '', price: '', sortOrder: 0 });
      toast.push('تمت إضافة الإعلان', 'success');
      void reload();
    } catch (err) {
      toast.push(adminError(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const savePrice = async (ad: AdminRoomAd, raw: string) => {
    const price = Number(raw);
    if (!Number.isFinite(price) || price < 0 || price === ad.price) return;
    try {
      await api(`/admin/room-ads/${ad.id}`, { admin: true, method: 'PATCH', body: { price } });
      toast.push('تم تحديث السعر', 'success');
      void reload();
    } catch (err) {
      toast.push(adminError(err), 'error');
    }
  };

  const toggle = async (ad: AdminRoomAd) => {
    try {
      await api(`/admin/room-ads/${ad.id}`, {
        admin: true,
        method: 'PATCH',
        body: { isActive: !ad.isActive },
      });
      void reload();
    } catch (err) {
      toast.push(adminError(err), 'error');
    }
  };

  const remove = async (ad: AdminRoomAd) => {
    try {
      await api(`/admin/room-ads/${ad.id}`, { admin: true, method: 'DELETE' });
      toast.push('تم حذف الإعلان', 'success');
      void reload();
    } catch (err) {
      toast.push(adminError(err), 'error');
    }
  };

  return (
    <div className="admin-stack">
      <AdminCard title="إعلان جديد" subtitle="مستطيل أفقي يظهر يسار المسرح — هدية تُشترى وتدخل جنطة الهدايا">
        <Field label="الهدية">
          <select className="input" value={form.giftId} onChange={(event) => pickGift(event.target.value)}>
            <option value="">— اختر هدية —</option>
            {(data?.gifts ?? []).map((gift) => (
              <option key={gift.id} value={gift.id}>
                {gift.name} · {formatCoins(gift.price)} ماسة{gift.isActive ? '' : ' (موقوفة)'}
              </option>
            ))}
          </select>
        </Field>
        <Field label="عنوان الإعلان" hint="اتركه فارغاً لاستخدام اسم الهدية">
          <input
            className="input"
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
          />
        </Field>
        <Field label="السعر بالماس">
          <input
            className="input"
            type="number"
            min={0}
            dir="ltr"
            value={form.price}
            onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}
          />
        </Field>
        <Field label="الترتيب" hint="الأقل يظهر أولاً">
          <input
            className="input"
            type="number"
            dir="ltr"
            value={form.sortOrder}
            onChange={(event) =>
              setForm((current) => ({ ...current, sortOrder: Number(event.target.value) || 0 }))
            }
          />
        </Field>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void create()}>
          <Icon name="plus" size={14} /> {busy ? 'جارٍ الإضافة…' : 'إضافة الإعلان'}
        </button>
      </AdminCard>

      <AdminCard title="الإعلانات" subtitle="هدية اليوم تتبدّل تلقائياً كل يوم بغداد — بدون تكرار">
        {loading ? (
          <span className="tiny muted">جارٍ التحميل…</span>
        ) : (data?.ads.length ?? 0) === 0 ? (
          <Empty text="لا توجد إعلانات بعد" />
        ) : (
          <Table head={['الهدية', 'العنوان', 'السعر', 'الحالة', '']}>
            {(data?.ads ?? []).map((ad) => (
              <tr key={ad.id}>
                <td>{ad.gift.name}</td>
                <td>{ad.title || ad.gift.name}</td>
                <td>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    dir="ltr"
                    style={{ width: 96 }}
                    value={drafts[ad.id] ?? String(ad.price)}
                    onChange={(event) =>
                      setDrafts((current) => ({ ...current, [ad.id]: event.target.value }))
                    }
                    onBlur={(event) => {
                      void savePrice(ad, event.target.value);
                      setDrafts((current) => {
                        const next = { ...current };
                        delete next[ad.id];
                        return next;
                      });
                    }}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className={`btn btn-sm ${ad.isActive ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => void toggle(ad)}
                  >
                    {ad.isActive ? 'ظاهر' : 'موقوف'}
                  </button>
                </td>
                <td>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => void remove(ad)}>
                    <Icon name="trash" size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </AdminCard>
    </div>
  );
}
