import { render, screen, waitFor } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Room } from '../lib/api'
import MainApp from '../pages/MainApp'
import { installApiMock, type MockHandlers } from '../test/mockApi'

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

const ROOMS: Room[] = [
  {
    id: 1,
    title: 'جلسة ونسة',
    category: 'ونسة',
    host: 'أبو رعد',
    listeners: 120,
    seats_taken: 4,
    seats_total: 8,
    language: 'العربية',
    is_battle: false,
    game: null,
    featured: true,
  },
  {
    id: 2,
    title: 'معركة لودو',
    category: 'ألعاب',
    host: 'كابتن علي',
    listeners: 60,
    seats_taken: 3,
    seats_total: 4,
    language: 'العربية',
    is_battle: true,
    game: 'ludo',
    featured: false,
  },
]

type Call = { key: string; body: unknown }

function renderApp(extra: MockHandlers = {}) {
  const { calls, mock } = installApiMock({
    'GET /api/me': () => ({ json: ME }),
    'GET /api/rooms': () => ({ json: ROOMS }),
    'POST /api/rooms/1/join': () => ({ json: ROOMS[0] }),
    'POST /api/rooms/1/leave': () => ({ json: ROOMS[0] }),
    'POST /api/rooms/2/join': () => ({ json: ROOMS[1] }),
    'POST /api/rooms/2/leave': () => ({ json: ROOMS[1] }),
    ...extra,
  })
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/']}>
      <MainApp />
    </MemoryRouter>,
  )
  return { calls, mock, user }
}

function roomCards() {
  return screen.getAllByTestId('room-card')
}

function roomCard(id: number) {
  const card = roomCards().find((element) => element.getAttribute('data-room-id') === String(id))
  if (!card) throw new Error(`لم يتم العثور على بطاقة الغرفة ${id}`)
  return card
}

function countCalls(calls: Call[], key: string) {
  return calls.filter((call) => call.key === key).length
}

async function openRoom(user: UserEvent, room: Room) {
  await waitFor(() => expect(roomCards().length).toBeGreaterThan(0))
  await user.click(roomCard(room.id))
  expect(await screen.findByRole('heading', { level: 2, name: room.title })).toBeInTheDocument()
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('تدفق دخول الغرف الصوتية وتفعيل المايك', () => {
  it('يعرض الغرف القادمة من الـ API قبل الدخول دون إرسال طلب انضمام', async () => {
    const { calls } = renderApp()

    await waitFor(() => expect(roomCards().length).toBeGreaterThanOrEqual(ROOMS.length))
    expect(screen.getAllByText(ROOMS[0].title).length).toBeGreaterThan(0)
    expect(screen.getAllByText(ROOMS[1].title).length).toBeGreaterThan(0)
    expect(countCalls(calls, 'POST /api/rooms/1/join')).toBe(0)
    expect(screen.queryByTestId('mic-toggle')).not.toBeInTheDocument()
  })

  it('ينضم للغرفة عند الضغط على بطاقتها ويرسل طلب انضمام واحد فقط', async () => {
    const { calls, user } = renderApp()

    await openRoom(user, ROOMS[0])

    await waitFor(() => expect(countCalls(calls, 'POST /api/rooms/1/join')).toBe(1))
    expect(countCalls(calls, 'POST /api/rooms/1/join')).toBe(1)
    expect(countCalls(calls, 'POST /api/rooms/1/leave')).toBe(0)
    expect(screen.getAllByText(ROOMS[0].host).length).toBeGreaterThan(0)
  })

  it('يبدأ المايك مطفأً، ويتحول إلى مفعّل عند الضغط دون أي طلب شبكة إضافي', async () => {
    const { calls, user } = renderApp()

    await openRoom(user, ROOMS[0])
    await waitFor(() => expect(countCalls(calls, 'POST /api/rooms/1/join')).toBe(1))

    const mic = screen.getByTestId('mic-toggle')
    expect(mic).toHaveAttribute('aria-pressed', 'false')
    expect(mic.querySelector('.lucide-mic-off')).not.toBeNull()
    expect(mic.querySelector('.lucide-mic')).toBeNull()

    const callsBeforeMic = calls.length
    await user.click(mic)

    expect(mic).toHaveAttribute('aria-pressed', 'true')
    expect(mic.className).toContain('bg-emerald-500')
    expect(mic.querySelector('.lucide-mic')).not.toBeNull()
    expect(mic.querySelector('.lucide-mic-off')).toBeNull()
    expect(calls.length).toBe(callsBeforeMic)

    await user.click(mic)

    expect(mic).toHaveAttribute('aria-pressed', 'false')
    expect(mic.className).not.toContain('bg-emerald-500')
    expect(mic.querySelector('.lucide-mic-off')).not.toBeNull()
    expect(calls.length).toBe(callsBeforeMic)
    expect(countCalls(calls, 'POST /api/rooms/1/join')).toBe(1)
  })

  it('يغادر الغرفة عند الضغط على زر الخروج ويغلق شاشة الغرفة', async () => {
    const { calls, user } = renderApp()

    await openRoom(user, ROOMS[0])
    expect(screen.getByTestId('mic-toggle')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'خروج' }))

    await waitFor(() => expect(screen.queryByTestId('mic-toggle')).not.toBeInTheDocument())
    expect(countCalls(calls, 'POST /api/rooms/1/leave')).toBe(1)
    expect(countCalls(calls, 'POST /api/rooms/1/join')).toBe(1)
    expect(roomCards().length).toBeGreaterThanOrEqual(ROOMS.length)
  })

  it('يغادر الغرفة عند الضغط على Escape بنفس طريقة زر الخروج', async () => {
    const { calls, user } = renderApp()

    await openRoom(user, ROOMS[0])
    await waitFor(() => expect(countCalls(calls, 'POST /api/rooms/1/join')).toBe(1))

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByTestId('mic-toggle')).not.toBeInTheDocument())
    expect(countCalls(calls, 'POST /api/rooms/1/leave')).toBe(1)
  })

  it('يعيد الانضمام ويصفّر المايك عند إعادة فتح نفس الغرفة', async () => {
    const { calls, user } = renderApp()

    await openRoom(user, ROOMS[0])
    await user.click(screen.getByTestId('mic-toggle'))
    expect(screen.getByTestId('mic-toggle')).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'خروج' }))
    await waitFor(() => expect(screen.queryByTestId('mic-toggle')).not.toBeInTheDocument())

    await openRoom(user, ROOMS[0])

    expect(screen.getByTestId('mic-toggle')).toHaveAttribute('aria-pressed', 'false')
    await waitFor(() => expect(countCalls(calls, 'POST /api/rooms/1/join')).toBe(2))
    expect(countCalls(calls, 'POST /api/rooms/1/leave')).toBe(1)
  })

  it('ينضم ويغادر بالمعرّف الصحيح عند فتح غرفة أخرى', async () => {
    const { calls, user } = renderApp()

    await openRoom(user, ROOMS[1])

    await waitFor(() => expect(countCalls(calls, 'POST /api/rooms/2/join')).toBe(1))
    expect(countCalls(calls, 'POST /api/rooms/1/join')).toBe(0)

    const mic = screen.getByTestId('mic-toggle')
    await user.click(mic)
    expect(mic).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'خروج' }))

    await waitFor(() => expect(screen.queryByTestId('mic-toggle')).not.toBeInTheDocument())
    expect(countCalls(calls, 'POST /api/rooms/2/leave')).toBe(1)
    expect(countCalls(calls, 'POST /api/rooms/1/leave')).toBe(0)
  })

  it('يفتح الغرفة ويسمح بتفعيل المايك حتى لو فشل طلب الانضمام', async () => {
    const { calls, user } = renderApp({
      'POST /api/rooms/1/join': () => ({ status: 500, json: { detail: 'الغرفة ممتلئة' } }),
    })

    await openRoom(user, ROOMS[0])
    await waitFor(() => expect(countCalls(calls, 'POST /api/rooms/1/join')).toBe(1))

    const mic = screen.getByTestId('mic-toggle')
    await user.click(mic)
    expect(mic).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'خروج' }))
    await waitFor(() => expect(screen.queryByTestId('mic-toggle')).not.toBeInTheDocument())
    expect(countCalls(calls, 'POST /api/rooms/1/leave')).toBe(1)
  })
})
