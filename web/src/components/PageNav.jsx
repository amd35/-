import { NavLink } from 'react-router-dom'
import PhotoIcon from './PhotoIcon.jsx'
import { useI18n } from '../lib/i18n.jsx'

/**
 * شريط تنقل مشترك للصفحات التي لها هويتها الخاصة (الملف الشخصي والمحادثات).
 * الترتيب نفسه في التصميم: الرئيسية → اللعبة → المحادثات → أنا.
 * تصميم فقط: لا بيانات ولا منطق، والعنوان من الترجمة.
 */
const ITEMS = [
  { to: '/', icon: 'house', key: 'home' },
  { to: '/games', icon: 'dice', key: 'games' },
  { to: '/friends', icon: 'chat', key: 'chats' },
  { to: '/profile', icon: 'user', key: 'me' },
]

export default function PageNav({ testIdPrefix = 'page-nav' }) {
  const { t } = useI18n()

  return (
    <nav className="page-nav" aria-label="main">
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) => `page-nav-item${isActive ? ' is-active' : ''}`}
          data-testid={`${testIdPrefix}-${item.key}`}
        >
          <PhotoIcon name={item.icon} size={22} />
          <span>{t(item.key)}</span>
        </NavLink>
      ))}
    </nav>
  )
}
