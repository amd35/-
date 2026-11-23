import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { Avatar, EmptyState, formatCoins, formatCoinsCompact, Icon, Sheet, Spinner, useToast } from '../lib/ui';
import { AppShell } from '../components/AppShell';
import type { FrameInfo } from '../components/AvatarFrame';
import { CosmeticPreview, type CosmeticCategory } from '../components/Cosmetics';

interface FrameItem {
  id: string;
  slug: string;
  name: string;
  nameEn: string;
  kind: string;
  design: string | null;
  imageUrl: string | null;
  price: number;
  rarity: string;
  durationDays: number;
  isRare: boolean;
  category: CosmeticCategory;
  /** 0 = anyone, 1..5 = needs an active VIP of that tier. */
  minVip: number;
  owned: boolean;
  expiresAt: string | null;
  equipped: boolean;
}

type Tab = 'all' | 'owned' | 'rare';
type CategoryKey = 'all' | CosmeticCategory | 'premium';

interface PremiumIdItem {
  id: string;
  code: string;
  price: number;
  mine: boolean;
}

const CATEGORIES: { key: CategoryKey; label: string }[] = [
  { key: 'all', label: 'catAll' },
  { key: 'frame', label: 'catFrames' },
  { key: 'id', label: 'catIds' },
  { key: 'namecard', label: 'catNameCards' },
  { key: 'bubble', label: 'catBubbles' },
  { key: 'entry', label: 'catEntry' },
  { key: 'premium', label: 'catPremium' },
];

function frameInfoOf(frame: FrameItem): FrameInfo {
  return { id: frame.id, design: frame.design, kind: frame.kind, imageUrl: frame.imageUrl, rarity: frame.rarity };
}

export default function Frames() {
  const { t, lang } = useI18n();
  const { me, refresh } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [frames, setFrames] = useState<FrameItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('all');
  const [category, setCategory] = useState<CategoryKey>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tryFrame, setTryFrame] = useState<FrameItem | null>(null);
  const [premiumIds, setPremiumIds] = useState<PremiumIdItem[]>([]);

  const load = useCallback(async () => {
    try {
      const [response, premium] = await Promise.all([
        api<{ frames: FrameItem[] }>('/frames'),
        api<{ ids: PremiumIdItem[] }>('/frames/premium-ids'),
      ]);
      setFrames(response.frames);
      setPremiumIds(premium.ids);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const rarityLabel = (rarity: string) => t(`rarity${rarity.charAt(0).toUpperCase()}${rarity.slice(1)}`);
  const myVipTier = me?.vip?.tier ?? 0;
  const vipBlocked = (frame: FrameItem) => frame.minVip > 0 && myVipTier < frame.minVip;

  const buy = async (frame: FrameItem) => {
    setBusyId(frame.id);
    try {
      await api(`/frames/${frame.id}/buy`, { method: 'POST' });
      toast.push(t('frameBought'), 'success');
      await Promise.all([load(), refresh()]);
    } catch (error) {
      const code = (error as { code?: string }).code;
      toast.push(
        code === 'already_owned'
          ? t('frameAlreadyOwned')
          : code === 'vip_required'
            ? t('vipRequiredHint')
            : (error as Error).message,
        'error'
      );
    } finally {
      setBusyId(null);
    }
  };

  const equip = async (frame: FrameItem) => {
    setBusyId(frame.id);
    try {
      await api(`/frames/${frame.id}/equip`, { method: 'POST' });
      toast.push(t('frameEquipped'), 'success');
      await Promise.all([load(), refresh()]);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const unequip = async (frame: FrameItem) => {
    setBusyId('unequip');
    try {
      await api('/frames/unequip', { method: 'POST', body: { category: frame.category } });
      toast.push(t('frameRemoved'), 'success');
      await Promise.all([load(), refresh()]);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const buyPremiumId = async (item: PremiumIdItem) => {
    setBusyId(item.id);
    try {
      const response = await api<{ code: string }>(`/frames/premium-ids/${item.id}/buy`, { method: 'POST' });
      toast.push(`${t('premiumIdBought')} — #${response.code}`, 'success');
      await Promise.all([load(), refresh()]);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const visible = useMemo(() => {
    if (category === 'premium') return [];
    const inCategory = (frame: FrameItem) =>
      category === 'all' || (frame.category ?? 'frame') === category;
    if (tab === 'owned') return frames.filter((frame) => frame.owned && inCategory(frame));
    if (tab === 'rare')
      return frames.filter(
        (frame) =>
          inCategory(frame) &&
          (frame.isRare || frame.rarity === 'vip' || frame.rarity === 'legendary')
      );
    return frames.filter(inCategory);
  }, [frames, tab, category]);

  const sample = (frame: FrameInfo | null) => ({
    displayName: me?.user.displayName ?? '',
    avatarUrl: me?.user.avatarUrl ?? null,
    frame,
  });

  return (
    <AppShell
      title={t('framesStore')}
      subtitle={t('framesSub')}
      active="profile"
      right={
        <div className="inline">
          <span className="pill pill-green">
            <Icon name="coins" size={12} /> {formatCoinsCompact(me?.wallet.balance ?? 0)}
          </span>
          <button className="icon-btn" onClick={() => navigate(-1)} aria-label="back">
            <Icon name="arrowRight" size={19} />
          </button>
        </div>
      }
    >
      <div className="page page-tight">
        <div className="hscroll store-cats">
          {CATEGORIES.map((item) => (
            <button
              key={item.key}
              className={`chip ${category === item.key ? 'chip-on' : ''}`}
              onClick={() => setCategory(item.key)}
            >
              {t(item.label)}
            </button>
          ))}
        </div>

        <div className="tabs">
          {(['all', 'owned', 'rare'] as Tab[]).map((item) => (
            <button key={item} className={`tab ${tab === item ? 'active' : ''}`} onClick={() => setTab(item)}>
              {item === 'all' ? t('all') : item === 'owned' ? t('myFrames') : t('rareFrames')}
            </button>
          ))}
        </div>

        {loading ? (
          <Spinner label={t('loading')} />
        ) : category === 'premium' ? (
          premiumIds.length === 0 ? (
            <EmptyState icon="sparkle" title={t('premiumIdEmpty')} />
          ) : (
            <div className="frames-grid">
              {premiumIds.map((item) => (
                <div key={item.id} className={`premium-id-card ${item.mine ? 'on' : ''}`}>
                  <span className="premium-id-code">#{item.code}</span>
                  <span className="frame-price">
                    {item.price > 0 ? (
                      <>
                        <Icon name="coins" size={13} /> {formatCoins(item.price)}
                      </>
                    ) : (
                      <span className="pill pill-green" style={{ fontSize: 10 }}>
                        {t('freeFrame')}
                      </span>
                    )}
                  </span>
                  {item.mine ? (
                    <span className="pill pill-green" style={{ fontSize: 10 }}>
                      {t('premiumIdOwned')}
                    </span>
                  ) : (
                    <button
                      className="btn btn-primary btn-xs grow"
                      disabled={busyId === item.id}
                      onClick={() => void buyPremiumId(item)}
                    >
                      {item.price > 0 ? t('buy') : t('getFree')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )
        ) : visible.length === 0 ? (
          <EmptyState icon="sparkle" title={tab === 'owned' ? t('noOwnedFrames') : t('noFrames')} />
        ) : (
          <div className="frames-grid">
            {visible.map((frame) => (
              <div key={frame.id} className={`frame-card ${frame.equipped ? 'on' : ''}`}>
                <div className="frame-preview">
                  {frame.category === 'frame' ? (
                    <Avatar user={sample(frameInfoOf(frame))} size={82} />
                  ) : (
                    <CosmeticPreview
                      cosmetic={frameInfoOf(frame)}
                      category={frame.category}
                      sampleName={me?.user.displayName ?? ''}
                      avatarUrl={me?.user.avatarUrl ?? null}
                    />
                  )}
                </div>
                <div className="frame-name">{lang === 'ar' ? frame.name : frame.nameEn || frame.name}</div>
                <div className="inline" style={{ gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <span className={`pill rarity-${frame.rarity}`} style={{ fontSize: 10 }}>
                    {rarityLabel(frame.rarity)}
                  </span>
                  {frame.minVip > 0 ? (
                    <span className={`pill ${vipBlocked(frame) ? 'pill-red' : 'rarity-vip'}`} style={{ fontSize: 10 }}>
                      <Icon name={vipBlocked(frame) ? 'lock' : 'sparkle'} size={10} /> VIP {frame.minVip}
                    </span>
                  ) : null}
                  <span className="tiny muted">
                    {frame.durationDays > 0 ? `${frame.durationDays} ${t('days')}` : t('permanent')}
                  </span>
                </div>
                <div className="frame-price">
                  {frame.price > 0 ? (
                    <>
                      <Icon name="coins" size={13} /> {formatCoins(frame.price)}
                    </>
                  ) : (
                    <span className="pill pill-green" style={{ fontSize: 10 }}>
                      {t('freeFrame')}
                    </span>
                  )}
                </div>
                <div className="frame-actions">
                  {frame.equipped ? (
                    <button className="btn btn-outline btn-xs grow" disabled={busyId === 'unequip'} onClick={() => void unequip(frame)}>
                      {t('unequip')}
                    </button>
                  ) : frame.owned ? (
                    <button className="btn btn-primary btn-xs grow" disabled={busyId === frame.id} onClick={() => void equip(frame)}>
                      {t('equip')}
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary btn-xs grow"
                      disabled={busyId === frame.id || vipBlocked(frame)}
                      onClick={() => void buy(frame)}
                    >
                      {vipBlocked(frame)
                        ? `${t('vipRequired')} ${frame.minVip}`
                        : frame.price > 0
                          ? t('buy')
                          : t('getFree')}
                    </button>
                  )}
                  <button className="btn btn-ghost btn-xs" onClick={() => setTryFrame(frame)}>
                    {t('tryFrame')}
                  </button>
                </div>
                {frame.equipped ? (
                  <span className="frame-equipped-badge">
                    <Icon name="check" size={11} /> {t('equipped')}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <Sheet open={Boolean(tryFrame)} onClose={() => setTryFrame(null)} title={tryFrame?.name} center>
        {tryFrame ? (
          <div className="stack center-col" style={{ gap: 14 }}>
            {tryFrame.category === 'frame' ? (
              <Avatar user={sample(frameInfoOf(tryFrame))} size={132} />
            ) : (
              <CosmeticPreview
                cosmetic={frameInfoOf(tryFrame)}
                category={tryFrame.category}
                sampleName={me?.user.displayName ?? ''}
                avatarUrl={me?.user.avatarUrl ?? null}
              />
            )}
            <span className="tiny muted">{t('tryFrameHint')}</span>
            {tryFrame.equipped ? (
              <span className="pill pill-green">{t('equipped')}</span>
            ) : tryFrame.owned ? (
              <button className="btn btn-primary btn-block" onClick={() => void equip(tryFrame).then(() => setTryFrame(null))}>
                {t('equip')}
              </button>
            ) : (
              <>
                {tryFrame.minVip > 0 ? (
                  <span className={`pill ${vipBlocked(tryFrame) ? 'pill-red' : 'rarity-vip'}`}>
                    <Icon name={vipBlocked(tryFrame) ? 'lock' : 'sparkle'} size={11} /> {t('vipRequired')}{' '}
                    {tryFrame.minVip}
                  </span>
                ) : null}
                <button
                  className="btn btn-primary btn-block"
                  disabled={vipBlocked(tryFrame)}
                  onClick={() => void buy(tryFrame).then(() => setTryFrame(null))}
                >
                  {tryFrame.price > 0 ? `${t('buy')} • ${formatCoins(tryFrame.price)} ${t('coins')}` : t('getFree')}
                </button>
              </>
            )}
          </div>
        ) : null}
      </Sheet>
    </AppShell>
  );
}
