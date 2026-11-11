import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { installApiMock } from '../test/mockApi'

const ROOM = {
  id: 1,
  title: 'غرفة اختبار',
  category: 'ونسة',
  host: 'أبو رعد',
  listeners: 12,
  seats_taken: 4,
  seats_total: 8,
  language: 'العربية',
  is_battle: false,
  game: null,
  featured: true,
}

const ME = {
  name: 'المستخدم',
  handle: '@me',
  level: 15,
  coins: 2450,
  diamonds: 86,
  bio: 'نبذة',
  language: 'ar',
  push_enabled: true,
  sound_enabled: true,
}

const METRICS = {
  rooms_total: 10,
  battle_rooms: 4,
  listeners_total: 4618,
  friends_online: 6,
  friends_total: 9,
  tasks_open: 3,
  tasks_done: 2,
  unread_notifications: 3,
  categories: [{ name: 'ألعاب', count: 4 }],
  activity_by_day: [{ day: '2026-11-11', count: 3 }],
  top_rooms: [{ title: 'غرفة اختبار', listeners: 12 }],
}

beforeEach(() => {
  installApiMock({
    'GET /api/me': () => ({ json: ME }),
    'GET /api/rooms': () => ({ json: [ROOM] }),
    'GET /api/metrics': () => ({ json: METRICS }),
    'GET /api/games': () => ({ json: [{ key: 'ludo', name: 'لودو', players: '2 - 4', accent: '#f59e0b' }] }),
    'GET /api/tasks': () => ({ json: [] }),
    'GET /api/notifications': () => ({ json: [] }),
    'GET /api/activity': () => ({ json: [] }),
    'GET /api/friends': () => ({ json: [] }),
    'GET /api/friend-requests': () => ({ json: [] }),
  })
  window.history.pushState({}, '', '/')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const PAGES: [string, string][] = [
  ['/dashboard', 'لوحة التحكم'],
  ['/data-list', 'قائمة الغرف'],
  ['/add-item', 'إضافة غرفة'],
  ['/analytics', 'التحليلات'],
  ['/tasks', 'المهام'],
  ['/profile', 'الملف الشخصي'],
  ['/settings', 'الإعدادات'],
  ['/notifications', 'التنبيهات'],
  ['/activity-log', 'سجل النشاط'],
  ['/faq', 'الأسئلة الشائعة'],
  ['/help', 'مركز المساعدة'],
  ['/contact', 'اتصل بنا'],
]

describe('مسارات التطبيق', () => {
  it.each(PAGES)('يفتح %s ويعرض عنوانه', async (path, heading) => {
    window.history.pushState({}, '', path)
    render(<App />)
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
  })

  it('يعرض اسم التطبيق «يلا فون» في الشريط العلوي', async () => {
    window.history.pushState({}, '', '/dashboard')
    render(<App />)
    expect(await screen.findByText('يلا فون')).toBeInTheDocument()
  })

  it('يفتح قائمة التنقل ويعرض كل الروابط', async () => {
    render(<App />)
    const toggle = await screen.findByTestId('menu-toggle')
    toggle.click()
    expect(await screen.findByText('لوحة التحكم')).toBeInTheDocument()
    expect(screen.getByText('سجل النشاط')).toBeInTheDocument()
    expect(screen.getByText('مركز المساعدة')).toBeInTheDocument()
  })
})
