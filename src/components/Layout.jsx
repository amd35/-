import { NavLink, Outlet } from 'react-router-dom'
import { useSettings } from '../store/settings.jsx'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/data-management', label: 'Data Management' },
  { to: '/item-details', label: 'Item Details' },
  { to: '/entry-form', label: 'Entry Form' },
  { to: '/settings', label: 'Settings' },
]

export default function Layout() {
  const { settings } = useSettings()

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">R</span>
          <span className="brand-name">Records</span>
        </div>
        <nav className="nav" aria-label="Main">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-link${isActive ? ' nav-link-active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="sidebar-user">{settings.displayName || 'Your account'}</span>
          <span className="sidebar-meta">{settings.theme === 'dark' ? 'Dark theme' : 'Light theme'}</span>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
