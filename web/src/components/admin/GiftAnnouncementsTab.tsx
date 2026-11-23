import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/ui';
import { GiftCover } from '../GiftAnimation';
import { AdminCard, Field, Toggle, useAdminData } from './shared';

type Effect = 'light' | 'medium' | 'strong';

interface AnnouncementSettings {
  gift_announcements_enabled: boolean;
  gift_announcement_duration: number;
  gift_announcement_effects: boolean;
  gift_announcement_color: string;
  gift_announcement_glow: string;
  gift_announcement_scope: 'all' | 'selected';
  gift_announcement_gift_ids: string[];
  gift_announcement_rarity_effects: Record<string, Effect>;
}

interface AdminGift {
  id: string;
  name: string;
  coverUrl: string | null;
  design: string | null;
  rarity: string;
  isActive: boolean;
}

const RARITIES: { key: string; label: string }[] = [
  { key: 'common', label: 'عادي' },
  { key: 'rare', label: 'نادر' },
  { key: 'epic', label: 'ملحمي' },
  { key: 'legendary', label: 'أسطوري' },
  { key: 'vip', label: 'VIP' },
];

const EFFECTS: { key: Effect; label: string }[] = [
  { key: 'light', label: 'خفيف' },
  { key: 'medium', label: 'متوسط' },
  { key: 'strong', label: 'قوي' },
];

const DEFAULT_EFFECTS: Record<string, Effect> = {
  common: 'light',
  rare: 'medium',
  epic: 'strong',
  legendary: 'strong',
  vip: 'strong',
};

const KEYS: (keyof AnnouncementSettings)[] = [
  'gift_announcements_enabled',
  'gift_announcement_duration',
  'gift_announcement_effects',
  'gift_announcement_color',
  'gift_announcement_glow',
  'gift_announcement_scope',
  'gift_announcement_gift_ids',
  'gift_announcement_rarity_effects',
];

export default function GiftAnnouncementsTab() {
  const toast = useToast();
  const { data, loading, reload } = useAdminData<{ settings: AnnouncementSettings }>(
    '/admin/settings'
  );
  const { data: giftsData } = useAdminData<{ gifts: AdminGift[] }>('/admin/gifts');
  const [form, setForm] = useState<AnnouncementSettings | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    setForm({
      ...data.settings,
      gift_announcement_rarity_effects: {
        ...DEFAULT_EFFECTS,
        ...(data.settings.gift_announcement_rarity_effects ?? {}),
      },
    });
  }, [data]);

  if (loading || !form) return <div className="skeleton" style={{ height: 320 }} />;

  const gifts = giftsData?.gifts ?? [];
  const set = <K extends keyof AnnouncementSettings>(key: K, value: AnnouncementSettings[K]) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));

  const setEffect = (rarity: string, effect: Effect) =>
    set('gift_announcement_rarity_effects', {
      ...form.gift_announcement_rarity_effects,
      [rarity]: effect,
    });

  const toggleGift = (giftId: string) => {
    const ids = form.gift_announcement_gift_ids;
    set(
      'gift_announcement_gift_ids',
      ids.includes(giftId) ? ids.filter((id) => id !== giftId) : [...ids, giftId]
    );
  };

  const save = async () => {
    setBusy(true);
    try {
      const payload: Partial<AnnouncementSettings> = {};
      for (const key of KEYS) {
        (payload as Record<string, unknown>)[key] = form[key];
      }
      await api('/admin/settings', { method: 'PUT', admin: true, body: payload });
      toast.push('تم حفظ إعدادات إعلانات الهدايا', 'success');
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <AdminCard
        title="إعلانات الهدايا"
        subtitle="شريط يظهر أعلى غرف الدردشة الصوتية فور نجاح إرسال الهدية، متزامن لكل من في الغرفة"
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => void save()} disabled={busy}>
            {busy ? <span className="spinner" /> : 'حفظ التغييرات'}
          </button>
        }
      >
        <Toggle
          checked={form.gift_announcements_enabled}
          onChange={(value) => set('gift_announcements_enabled', value)}
          label="تشغيل إعلانات الهدايا داخل الغرف"
        />
        <Toggle
          checked={form.gift_announcement_effects}
          onChange={(value) => set('gift_announcement_effects', value)}
          label="تأثيرات بصرية خفيفة (توهج وشرارات)"
        />
        <div
          className="stat-grid"
          style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}
        >
          <Field label="مدة ظهور الإعلان (ثانية)" hint="من 2 إلى 15 ثانية">
            <input
              className="input"
              type="number"
              min={2}
              max={15}
              value={form.gift_announcement_duration}
              onChange={(event) => set('gift_announcement_duration', Number(event.target.value))}
              dir="ltr"
            />
          </Field>
          <Field label="اللون الناري">
            <input
              className="input"
              type="color"
              value={form.gift_announcement_color}
              onChange={(event) => set('gift_announcement_color', event.target.value)}
            />
          </Field>
          <Field label="لون التوهج الذهبي">
            <input
              className="input"
              type="color"
              value={form.gift_announcement_glow}
              onChange={(event) => set('gift_announcement_glow', event.target.value)}
            />
          </Field>
        </div>
      </AdminCard>

      <AdminCard title="المؤثرات حسب فئة الهدية" subtitle="كل فئة لها شدة مؤثرات مختلفة داخل الشريط">
        <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
          {RARITIES.map((rarity) => (
            <Field key={rarity.key} label={rarity.label}>
              <select
                className="input"
                value={form.gift_announcement_rarity_effects[rarity.key] ?? 'medium'}
                onChange={(event) => setEffect(rarity.key, event.target.value as Effect)}
              >
                {EFFECTS.map((effect) => (
                  <option key={effect.key} value={effect.key}>
                    {effect.label}
                  </option>
                ))}
              </select>
            </Field>
          ))}
        </div>
      </AdminCard>

      <AdminCard
        title="الهدايا المشمولة"
        subtitle="أعلن عن جميع الهدايا أو اختر هدايا محددة فقط"
      >
        <div className="row-group" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`btn btn-sm ${form.gift_announcement_scope === 'all' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => set('gift_announcement_scope', 'all')}
          >
            جميع الهدايا
          </button>
          <button
            type="button"
            className={`btn btn-sm ${form.gift_announcement_scope === 'selected' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => set('gift_announcement_scope', 'selected')}
          >
            هدايا محددة ({form.gift_announcement_gift_ids.length})
          </button>
        </div>

        {form.gift_announcement_scope === 'selected' ? (
          <div className="gift-grid">
            {gifts.map((gift) => {
              const picked = form.gift_announcement_gift_ids.includes(gift.id);
              return (
                <button
                  key={gift.id}
                  type="button"
                  className={`gift-card ${picked ? 'selected' : ''}`}
                  onClick={() => toggleGift(gift.id)}
                  style={{ opacity: gift.isActive ? 1 : 0.55 }}
                >
                  <GiftCover gift={gift} className="gift-card-art" />
                  <span className="gift-card-name">{gift.name}</span>
                  <span className="tiny muted">{picked ? '✓ مشمولة' : 'غير مشمولة'}</span>
                </button>
              );
            })}
            {gifts.length === 0 ? <span className="tiny muted">لا توجد هدايا بعد</span> : null}
          </div>
        ) : null}
      </AdminCard>

      <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>
        {busy ? <span className="spinner" /> : 'حفظ التغييرات'}
      </button>
    </div>
  );
}
