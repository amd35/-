import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { Avatar, Icon, useToast } from '../../lib/ui';
import { AdminCard, Empty, Field, Table, Toggle, useAdminData } from './shared';
import { CosmeticPreview, EntryBanner, type CosmeticCategory } from '../Cosmetics';
import { ADMIN_BADGE_BY_RANK, AdminRoyalBadge } from '../AdminRoyal';

interface LookItem {
  id: string;
  slug: string;
  name: string;
  nameEn: string;
  kind: string;
  design: string | null;
  imageUrl: string | null;
  rarity: string;
  category: string;
}

interface PositionLook {
  frameId: string | null;
  namecardId: string | null;
  bubbleId: string | null;
  entryId: string | null;
  effectsEnabled: boolean;
}

interface Position {
  key: string;
  nameAr: string;
  color: string;
  holders: number;
  look: PositionLook;
}

interface Grant {
  userId: string;
  username: string;
  displayName: string;
  itemId: string;
  itemName: string;
  category: string;
  grantedAt: string;
}

interface AppearanceData {
  positions: Position[];
  items: Record<string, LookItem[]>;
  grants: Grant[];
}

const SECTIONS: { key: CosmeticCategory; field: keyof PositionLook; label: string }[] = [
  { key: 'frame', field: 'frameId', label: 'إطار الصورة' },
  { key: 'namecard', field: 'namecardId', label: 'بطاقة الاسم' },
  { key: 'bubble', field: 'bubbleId', label: 'فقاعة الدردشة' },
  { key: 'entry', field: 'entryId', label: 'دخولية الغرفة' },
];

function itemOf(items: LookItem[], id: string | null): LookItem | null {
  return id ? items.find((item) => item.id === id) ?? null : null;
}

function PositionEditor({
  position,
  items,
  onSaved,
}: {
  position: Position;
  items: Record<string, LookItem[]>;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<PositionLook>(position.look);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(position.look);
  }, [position.look]);

  const frame = itemOf(items.frame ?? [], draft.frameId);
  const namecard = itemOf(items.namecard ?? [], draft.namecardId);
  const bubble = itemOf(items.bubble ?? [], draft.bubbleId);
  const entry = itemOf(items.entry ?? [], draft.entryId);

  const save = async () => {
    setBusy(true);
    try {
      await api(`/admin/appearance/${position.key}`, { method: 'PUT', admin: true, body: draft });
      toast.push(`تم حفظ مظهر «${position.nameAr}» وتطبيقه على ${position.holders} عضو`, 'success');
      await onSaved();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-look-card" style={{ borderColor: `${position.color}55` }}>
      <div className="admin-look-head">
        {ADMIN_BADGE_BY_RANK[position.key] ? (
          <AdminRoyalBadge design={ADMIN_BADGE_BY_RANK[position.key]} size={24} label={position.nameAr} />
        ) : (
          <span className="admin-look-dot" style={{ background: position.color }} />
        )}
        <b>{position.nameAr}</b>
        <span className="tiny muted">{position.holders} عضو</span>
        <div className="spacer" />
        <Toggle
          checked={draft.effectsEnabled}
          onChange={(value) => setDraft({ ...draft, effectsEnabled: value })}
          label="المؤثرات"
        />
      </div>

      <div className="admin-look-previews">
        <div className="admin-look-preview">
          {frame ? (
            <Avatar
              user={{
                displayName: position.nameAr,
                frame: {
                  id: frame.id,
                  design: frame.design,
                  kind: frame.kind,
                  imageUrl: frame.imageUrl,
                  rarity: frame.rarity,
                },
              }}
              size={68}
            />
          ) : (
            <span className="tiny muted">بدون إطار</span>
          )}
        </div>
        {namecard ? (
          <CosmeticPreview
            cosmetic={namecard}
            category="namecard"
            sampleName={position.nameAr}
            sampleId="123456"
          />
        ) : null}
        {bubble ? <CosmeticPreview cosmetic={bubble} category="bubble" sampleName={position.nameAr} /> : null}
        {entry ? (
          <div className="admin-look-entry">
            <EntryBanner cosmetic={entry} name={position.nameAr} label={position.nameAr} />
          </div>
        ) : null}
      </div>

      <div className="admin-look-selects">
        {SECTIONS.map((section) => (
          <Field key={section.key} label={section.label}>
            <select
              className="select"
              value={(draft[section.field] as string | null) ?? ''}
              onChange={(event) =>
                setDraft({ ...draft, [section.field]: event.target.value || null })
              }
            >
              <option value="">بدون</option>
              {(items[section.key] ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
        ))}
        <div className="admin-look-save">
          <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>
            <Icon name="check" size={15} /> {busy ? 'جارٍ التطبيق…' : 'حفظ وتطبيق على المنصب'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminLookTab() {
  const toast = useToast();
  const { data, loading, reload } = useAdminData<AppearanceData>('/admin/appearance');
  const [grantUser, setGrantUser] = useState('');
  const [grantItem, setGrantItem] = useState('');
  const [granting, setGranting] = useState(false);

  const allItems = useMemo(
    () => SECTIONS.flatMap((section) => (data?.items[section.key] ?? []).map((item) => ({ ...item, section: section.label }))),
    [data]
  );

  const grant = async () => {
    if (!grantUser.trim() || !grantItem) {
      toast.push('أدخل آي دي المستخدم واختر التصميم', 'error');
      return;
    }
    setGranting(true);
    try {
      await api('/admin/appearance/grant', {
        method: 'POST',
        admin: true,
        body: { user: grantUser.trim(), itemId: grantItem },
      });
      toast.push('تم منح التصميم للمستخدم', 'success');
      setGrantUser('');
      setGrantItem('');
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setGranting(false);
    }
  };

  const revoke = async (row: Grant) => {
    try {
      await api('/admin/appearance/revoke', {
        method: 'POST',
        admin: true,
        body: { user: row.userId, itemId: row.itemId },
      });
      toast.push('تم سحب التصميم', 'success');
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  if (loading) return <div className="skeleton" style={{ height: 240 }} />;
  if (!data) return <Empty text="لا توجد بيانات" />;

  return (
    <div className="stack">
      <AdminCard
        title="الهوية الملكية للإدارة العامة"
        subtitle="إطار + بطاقة اسم + فقاعة دردشة + دخولية لكل منصب إداري — تُطبَّق على كل حاملي المنصب فوراً"
      >
        <div className="admin-look-grid">
          {data.positions.map((position) => (
            <PositionEditor key={position.key} position={position} items={data.items} onSaved={reload} />
          ))}
        </div>
      </AdminCard>

      <AdminCard title="منح وسحب التصاميم" subtitle="امنح أي تصميم إداري لمستخدم بعينه، أو اسحبه منه">
        <div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}
        >
          <Field label="آي دي المستخدم">
            <input
              className="input"
              dir="ltr"
              value={grantUser}
              onChange={(event) => setGrantUser(event.target.value)}
              placeholder="123456"
            />
          </Field>
          <Field label="التصميم">
            <select className="select" value={grantItem} onChange={(event) => setGrantItem(event.target.value)}>
              <option value="">اختر التصميم</option>
              {allItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.section} — {item.name}
                </option>
              ))}
            </select>
          </Field>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-primary" disabled={granting} onClick={() => void grant()}>
              <Icon name="user" size={15} /> {granting ? 'جارٍ المنح…' : 'منح التصميم'}
            </button>
          </div>
        </div>

        {data.grants.length === 0 ? (
          <Empty text="لا توجد تصاميم ممنوحة لمستخدمين بعد" />
        ) : (
          <Table head={['المستخدم', 'التصميم', 'القسم', 'تاريخ المنح', 'إجراء']}>
            {data.grants.map((row) => (
              <tr key={`${row.userId}-${row.itemId}`}>
                <td>
                  <b>{row.displayName}</b>
                  <div className="tiny muted" dir="ltr">
                    #{row.username}
                  </div>
                </td>
                <td>{row.itemName}</td>
                <td className="tiny">{SECTIONS.find((section) => section.key === row.category)?.label ?? row.category}</td>
                <td className="tiny" dir="ltr">
                  {new Date(row.grantedAt).toLocaleDateString('ar-IQ')}
                </td>
                <td>
                  <button className="btn btn-ghost btn-xs" onClick={() => void revoke(row)}>
                    <Icon name="trash" size={13} /> سحب
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
