import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FriendsPage from '../pages/FriendsPage'
import { installApiMock } from '../test/mockApi'

const FRIENDS = [
  { id: 1, name: 'سارة', handle: '@sara', level: 21, online: true, room: 'قهوة الصباح', last_seen: null },
  { id: 2, name: 'ليلى', handle: '@layla', level: 9, online: true, room: null, last_seen: null },
  { id: 3, name: 'حسن', handle: '@hassan', level: 12, online: false, room: null, last_seen: 'قبل 25 دقيقة' },
]

const REQUESTS = [
  { id: 11, name: 'ريم', handle: '@reem', mutual: 4 },
  { id: 12, name: 'أنس', handle: '@anas', mutual: 2 },
]

function setup() {
  return installApiMock({
    'GET /api/friends': () => ({ json: FRIENDS }),
    'GET /api/friend-requests': () => ({ json: REQUESTS }),
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('صفحة الأصدقاء', () => {
  it('يعرض عدّادات الاتصال والغرف من بيانات الـ API', async () => {
    setup()
    render(<FriendsPage />)

    await screen.findByTestId('friends-list')
    expect(screen.getByTestId('online-count')).toHaveTextContent('2')
    expect(screen.getByTestId('in-room-count')).toHaveTextContent('1')
    expect(screen.getByTestId('offline-count')).toHaveTextContent('1')
    expect(screen.getByTestId('friends-summary')).toHaveTextContent('3 صديق')
  })

  it('يعرض حالة مختلفة لكل صديق حسب الـ API', async () => {
    setup()
    render(<FriendsPage />)
    await screen.findByTestId('friends-list')

    const rows = screen.getAllByTestId('friend-row')
    const byStatus = rows.reduce<Record<string, number>>((acc, row) => {
      const status = row.getAttribute('data-status') ?? 'unknown'
      acc[status] = (acc[status] ?? 0) + 1
      return acc
    }, {})

    expect(byStatus).toEqual({ room: 1, online: 1, offline: 1 })
    expect(screen.getByText(/في غرفة · قهوة الصباح/)).toBeInTheDocument()
    expect(screen.getByText('متصل الآن')).toBeInTheDocument()
    expect(screen.getByText(/آخر ظهور قبل 25 دقيقة/)).toBeInTheDocument()
  })

  it('يعطّل زر المراسلة لغير المتصل', async () => {
    setup()
    render(<FriendsPage />)
    await screen.findByTestId('friends-list')
    expect(screen.getByRole('button', { name: 'مراسلة حسن' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'مراسلة سارة' })).toBeEnabled()
  })

  it('يفلتر البحث القائمة ويحفظ التجميع', async () => {
    const user = userEvent.setup()
    setup()
    render(<FriendsPage />)
    await screen.findByTestId('friends-list')

    await user.type(screen.getByPlaceholderText('ابحث عن صديق'), 'سارة')
    await waitFor(() => expect(screen.getAllByTestId('friend-row')).toHaveLength(1))

    await user.clear(screen.getByPlaceholderText('ابحث عن صديق'))
    await waitFor(() => expect(screen.getAllByTestId('friend-row')).toHaveLength(3))
  })

  it('يقبل طلب صداقة ويزيله من القائمة', async () => {
    const user = userEvent.setup()
    setup()
    render(<FriendsPage />)
    await screen.findByTestId('friends-list')

    await user.click(screen.getByTestId('requests-tab'))
    await waitFor(() => expect(screen.getAllByTestId('request-row')).toHaveLength(2))

    await user.click(screen.getAllByTestId('accept-request')[0])
    await waitFor(() => expect(screen.getAllByTestId('request-row')).toHaveLength(1))
  })
})
