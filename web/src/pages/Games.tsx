import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { formatCoins, Icon, Spinner } from '../lib/ui';
import { AppShell } from '../components/AppShell';
import { CurrencyIcon } from '../components/CurrencyIcon';
import type { GameSnapshot } from '../lib/gameTypes';

/** Games section: a stage for the app's games only. */
export default function Games() {
  const { t, dir } = useI18n();
  const navigate = useNavigate();
  const [data, setData] = useState<GameSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setData(await api<GameSnapshot>('/game'));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const settings = data?.settings;
  const maxPrize = settings
    ? settings.maxEntry * 2 - Math.floor((settings.maxEntry * 2 * settings.appPercent) / 100)
    : 0;

  return (
    <AppShell title={t('gamesTitle')} subtitle={t('gamesSubtitle')} active="games">
      <div className="page games-page" dir={dir}>
        <section className="game-hero">
          <span className="game-hero-crown" aria-hidden="true">
            🎮
          </span>
          <h1>{t('gamesTitle')}</h1>
          <p className="game-hero-sub">{t('gamesHint')}</p>
          <div className="game-hero-board" aria-hidden="true">
            <span className="game-hero-ring" />
            <span className="game-hero-stone white s1" />
            <span className="game-hero-stone black s2" />
            <span className="game-hero-stone white s3" />
            <span className="game-hero-stone black s4" />
            <span className="game-hero-stone white s5" />
            <span className="game-hero-stone gold s6" />
          </div>
        </section>

        {loading && !data ? (
          <Spinner />
        ) : (
          <>
            <section className="games-stats">
              <div className="games-stat">
                <CurrencyIcon code="GOLD" size={18} />
                <b>{formatCoins(data?.gold ?? 0)}</b>
                <span>{t('gamesGold')}</span>
              </div>
              <div className="games-stat">
                <b>{data?.stats.wins ?? 0}</b>
                <span>{t('gamesWins')}</span>
              </div>
              <div className="games-stat">
                <b>{data?.stats.played ?? 0}</b>
                <span>{t('gamesPlayed')}</span>
              </div>
            </section>

            <button type="button" className="games-tile" onClick={() => navigate('/game')}>
              <span className="games-tile-art" aria-hidden="true">
                <span className="games-tile-stone white" />
                <span className="games-tile-stone black" />
                <span className="games-tile-stone gold" />
              </span>
              <span className="games-tile-body">
                <span className="games-tile-badge">
                  <span className="game-online-dot" aria-hidden="true" />
                  {settings?.enabled
                    ? t('gamesPlayersOnline', { n: data?.online ?? 0 })
                    : t('gamesOffline')}
                </span>
                <b className="games-tile-name">أم الحجار</b>
                <span className="games-tile-sub">لعبة الحجارة — مباريات حقيقية فقط</span>
                {settings?.enabled ? (
                  <span className="games-tile-meta">
                    <span>
                      {t('gamesEntryFrom')} <b>{formatCoins(settings.minEntry)}</b>
                    </span>
                    <span>
                      {t('gamesPrizeUpTo')} <b>{formatCoins(maxPrize)}</b>
                    </span>
                  </span>
                ) : null}
              </span>
              <span className="games-tile-cta">
                <Icon name="play" size={15} fill="currentColor" />
                {t('gamesPlayNow')}
              </span>
            </button>
          </>
        )}
      </div>
    </AppShell>
  );
}
