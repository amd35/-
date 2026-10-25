import { useCallback, useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { api, getToken, setToken } from './api.js'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Users from './pages/Users.jsx'
import RoomsAdmin from './pages/RoomsAdmin.jsx'
import GamesAdmin from './pages/GamesAdmin.jsx'
import GiftsAdmin from './pages/GiftsAdmin.jsx'
import StoreAdmin from './pages/StoreAdmin.jsx'
import RoyalAdmin from './pages/RoyalAdmin.jsx'
import Finance from './pages/Finance.jsx'
import SettingsAdmin from './pages/SettingsAdmin.jsx'
import Moderation from './pages/Moderation.jsx'

const SECTIONS = [
  { to: '/dashboard', label: '📊 لوحة التحكم' },
  { to: '/users', label: '👤 المستخدمون' },
  { to: '/rooms', label: '🎙️ الغرف' },
  { to: '/games', label: '🎲 الألعاب' },
  { to: '/gifts', label: '🎁 الهدايا' },
  { to: '/store', label: '🛍️ المتجر' },
  { to: '/royal', label: '👑 مستويات رويال' },
  { to: '/finance', label: '💳 الشحن والسحب' },
  { to: '/settings', label: '⚙️ الإعدادات' },
  { to: '/moderation', label: '🚨 البلاغات والسجل' },
]

export default function App() {
  const navigate = useNavigate()
  const [admin, setAdmin] = useState(null)
  const [loading, setLoading] = useState(Boolean(getToken()))
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!getToken()) {
      setLoading(false)
      return
    }
    try {
      const data = await api.get('/api/admin/me')
      setAdmin(data)
    } catch (err) {
      setError(err.message)
      setToken('')
      setAdmin(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const logout = () => {
    setToken('')
    setAdmin(null)
    navigate('/login')
  }

  if (loading) return <p className="muted" style={{ padding: 20 }}>جارِ التحميل…</p>

  return (
    <Routes>
      <Route path="/login" element={<Login onSignedIn={load} />} />
      <Route
        path="*"
        element={
          admin ? (
            <>
              <header className="topbar">
                <strong>TON Voice — لوحة الإدارة</strong>
                <span className="muted">{admin.user.username} · {admin.role}</span>
                <div style={{ flex: 1 }} />
                <button type="button" className="btn" onClick={logout}>
                  خروج
                </button>
              </header>
              <div className="layout">
                <nav className="sidebar">
                  {SECTIONS.map((section) => (
                    <NavLink key={section.to} to={section.to} end={section.to === '/'}>
                      {section.label}
                    </NavLink>
                  ))}
                </nav>
                <main className="content">
                  <Routes>
                    {/* "/dashboard" is the panel's route; "/" stays a working alias. */}
                    <Route path="/dashboard" element={<Dashboard admin={admin} />} />
                    <Route path="/" element={<Dashboard admin={admin} />} />
                    <Route path="/users" element={<Users admin={admin} />} />
                    <Route path="/rooms" element={<RoomsAdmin />} />
                    <Route path="/games" element={<GamesAdmin />} />
                    <Route path="/gifts" element={<GiftsAdmin />} />
                    <Route path="/store" element={<StoreAdmin />} />
                    <Route path="/royal" element={<RoyalAdmin />} />
                    <Route path="/finance" element={<Finance />} />
                    <Route path="/settings" element={<SettingsAdmin admin={admin} />} />
                    <Route path="/moderation" element={<Moderation />} />
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                  </Routes>
                </main>
              </div>
            </>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
    </Routes>
  )
}
