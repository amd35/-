import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Avatar from '../components/Avatar.jsx'
import HomeCountries from '../components/HomeCountries.jsx'
import HomeHero from '../components/HomeHero.jsx'
import HomeRankings from '../components/HomeRankings.jsx'
import HomeTiles from '../components/HomeTiles.jsx'
import PageNav from '../components/PageNav.jsx'
import PhotoIcon from '../components/PhotoIcon.jsx'
import UserSheet from '../components/UserSheet.jsx'
import { api } from '../lib/api.js'
import { useAuth } from '../lib/store.jsx'
import { useI18n } from '../lib/i18n.jsx'

/**
 * الصفحة الرئيسية بترتيب التصميم: الشريط العلوي (بحث · الملف · تبويبات الغرف)،
 * الشريط الدوّار، لوحات الترتيب الثلاث، صف الدول، ثم شبكة البطاقات الكبيرة.
 * كل شيء من `/api/home` (طلب واحد) — لا رقم ولا اسم ولا صورة وهمية.
 */
export default function Home() {
  const { user } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [tab, setTab] = useState('popular')
  const [country, setCountry] = useState('')
  const [showAllCountries, setShowAllCountries] = useState(true)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [sheetUserId, setSheetUserId] = useState(null)

  const load = useCallback(async () => {
    try {
      setData(await api.get(`/api/home?tab=${tab}`))
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [tab])

  useEffect(() => {
    load()
  }, [load])

  const countryCounts = useMemo(
    () => Object.fromEntries((data?.countries || []).map((row) => [row.code, row.count])),
    [data],
  )

  // تصفية الدولة تُطبَّق على الغرف (بجنسية مالك الغرفة) وعلى الأعضاء الجدد.
  const rooms = useMemo(() => {
    const list = data?.rooms || []
    if (!country) return list
    return list.filter((room) => (room.owner?.country || '').toUpperCase() === country)
  }, [data, country])

  const newUsers = useMemo(() => {
    const list = data?.new_users || []
    if (!country) return list
    return list.filter((member) => (member.country || '').toUpperCase() === country)
  }, [data, country])

  const topUsers = data?.top_users || []

  const activityRoom = useMemo(() => {
    if (!data) return null
    if (country) return rooms[0] || null
    return data.activity_room || null
  }, [data, country, rooms])

  const openRoom = (room) => navigate(`/rooms/${room.id}`)

  // بطاقة العضو تُفتح بمعرّفه الحقيقي (لا الكائن كامل).
  const openUser = (member) => setSheetUserId(member.id)

  const openMyRoom = () => {
    if (data?.my_room_id) navigate(`/rooms/${data.my_room_id}`)
    else navigate('/rooms')
  }

  const toggleShowAllCountries = () => {
    const next = !showAllCountries
    setShowAllCountries(next)
    if (!next && country && !countryCounts[country]) setCountry('')
  }

  return (
    <div className="home-screen" data-testid="home-page">
      <header className="home-bar">
        <nav className="home-tabs">
          <button type="button" className="home-tab home-tab-mine" onClick={openMyRoom} data-testid="home-my-room">
            <PhotoIcon name="mic" size={15} />
            {t('myRoom')}
          </button>
          <button
            type="button"
            className={`home-tab${tab === 'popular' ? ' is-active' : ''}`}
            onClick={() => setTab('popular')}
            data-testid="home-tab-popular"
          >
            {t('homePopularRooms')}
          </button>
          <button
            type="button"
            className={`home-tab${tab === 'visited' ? ' is-active' : ''}`}
            onClick={() => setTab('visited')}
            data-testid="home-tab-visited"
          >
            {t('homeVisitedRooms')}
          </button>
        </nav>
        <span className="topbar-spacer" />
        <Link className="home-bar-avatar" to="/profile" data-testid="home-profile" aria-label={t('profile')}>
          <Avatar user={user} size={34} />
        </Link>
        <button
          type="button"
          className="home-bar-btn"
          onClick={() => navigate('/search')}
          aria-label={t('search')}
          data-testid="home-search"
        >
          <PhotoIcon name="search" size={20} />
        </button>
      </header>

      {!data && !error ? <p className="muted">{t('loading')}</p> : null}

      {data ? (
        <>
          <HomeHero rooms={rooms} onOpenRoom={openRoom} onOpenUser={openUser} onCreate={() => navigate('/rooms')} />

          <HomeRankings rankings={data.rankings} onOpenUser={openUser} />

          <HomeCountries
            counts={countryCounts}
            selected={country}
            onSelect={setCountry}
            showAll={showAllCountries}
            onToggleShowAll={toggleShowAllCountries}
          />

          <HomeTiles
            activityRoom={activityRoom}
            newUsers={newUsers}
            topUsers={topUsers}
            user={user}
            country={country}
            onOpenUser={openUser}
            onOpenRoom={openRoom}
          />
        </>
      ) : null}

      {error ? (
        <p className="error-text" data-testid="home-error">
          {error}
        </p>
      ) : null}

      <PageNav testIdPrefix="home-nav" />

      {sheetUserId ? <UserSheet userId={sheetUserId} onClose={() => setSheetUserId(null)} /> : null}
    </div>
  )
}
