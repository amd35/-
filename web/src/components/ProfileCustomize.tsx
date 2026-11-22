import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { Avatar, Icon, Sheet, Spinner, useToast } from '../lib/ui';
import type { FrameInfo } from './AvatarFrame';

interface CatalogFrame {
  id: string;
  name: string;
  nameEn: string;
  category: string;
  design: string | null;
  kind: string;
  imageUrl: string | null;
  rarity: string;
  owned: boolean;
  equipped: boolean;
}

function infoOf(frame: CatalogFrame): FrameInfo {
  return {
    id: frame.id,
    design: frame.design,
    kind: frame.kind,
    imageUrl: frame.imageUrl,
    rarity: frame.rarity,
  };
}

/**
 * Opened by tapping the profile photo: shows the frames the user already bought so
 * one tap equips them, plus a shortcut to edit the personal details.
 */
export function ProfileCustomize({
  open,
  onClose,
  onEditInfo,
}: {
  open: boolean;
  onClose: () => void;
  onEditInfo: () => void;
}) {
  const { me, refresh } = useAuth();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const [frames, setFrames] = useState<CatalogFrame[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api<{ frames: CatalogFrame[] }>('/frames');
      setFrames(response.frames);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const owned = useMemo(
    () => frames.filter((frame) => frame.owned && (frame.category ?? 'frame') === 'frame'),
    [frames]
  );

  const apply = async (frameId: string | null) => {
    setBusy(frameId ?? 'clear');
    try {
      if (frameId) await api(`/frames/${frameId}/equip`, { method: 'POST' });
      else await api('/frames/unequip', { method: 'POST', body: { category: 'frame' } });
      await Promise.all([load(), refresh()]);
      toast.push(frameId ? t('frameEquipped') : t('frameRemoved'), 'success');
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  if (!me) return null;

  return (
    <Sheet open={open} onClose={onClose} title={t('customizeProfile')}>
      <div className="stack">
        <div className="stack" style={{ alignItems: 'center', gap: 8 }}>
          <Avatar user={me.user} size={116} />
          <span className="tiny muted center">{t('customizeHint')}</span>
        </div>

        <button
          className="btn btn-outline btn-block"
          onClick={() => {
            onClose();
            onEditInfo();
          }}
        >
          <Icon name="user" size={16} /> {t('editProfile')}
        </button>

        <div className="section-head">
          <h2>{t('myFrames')}</h2>
          <button className="btn btn-ghost btn-xs" onClick={() => navigate('/frames')}>
            {t('framesStore')} <Icon name="arrowLeft" size={13} />
          </button>
        </div>

        {loading ? (
          <Spinner label={t('loading')} />
        ) : (
          <div className="frames-grid">
            <div className={`frame-card ${me.user.frame ? '' : 'on'}`}>
              <div className="frame-preview">
                <Avatar user={{ ...me.user, frame: null }} size={82} />
              </div>
              <div className="frame-name">{t('noFrame')}</div>
              <div className="frame-actions">
                {me.user.frame ? (
                  <button
                    className="btn btn-outline btn-xs grow"
                    disabled={busy === 'clear'}
                    onClick={() => void apply(null)}
                  >
                    {t('unequip')}
                  </button>
                ) : (
                  <span className="pill pill-green" style={{ fontSize: 10 }}>
                    {t('equipped')}
                  </span>
                )}
              </div>
            </div>

            {owned.map((frame) => (
              <div key={frame.id} className={`frame-card ${frame.equipped ? 'on' : ''}`}>
                <div className="frame-preview">
                  <Avatar user={{ ...me.user, frame: infoOf(frame) }} size={82} />
                </div>
                <div className="frame-name">{lang === 'ar' ? frame.name : frame.nameEn || frame.name}</div>
                <div className="frame-actions">
                  {frame.equipped ? (
                    <span className="pill pill-green" style={{ fontSize: 10 }}>
                      {t('equipped')}
                    </span>
                  ) : (
                    <button
                      className="btn btn-primary btn-xs grow"
                      disabled={busy === frame.id}
                      onClick={() => void apply(frame.id)}
                    >
                      {t('equip')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && owned.length === 0 ? (
          <p className="tiny muted center">{t('noOwnedFrames')}</p>
        ) : null}
      </div>
    </Sheet>
  );
}
