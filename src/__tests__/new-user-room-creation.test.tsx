import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import type { Room } from '../lib/api'
import { installApiMock } from '../test/mockApi'

// مستخدم جديد: اسم مستخدم جديد ورمزه (المعرّف) الخاص به.
const NEW_USER = {
  name: 'ليلى',
  handle: '@laila_92',
  level: 3,
  coins: 120,
  diamonds: 4,
  bio: 'حساب جديد',
  language: 'ar',
  push_enabled: true,
  sound_enabled: true,
}

const EXISTING_ROOM: Room = {
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
  featured: false,
}

const CREATED_ROOM_ID = 21
const NEW_ROOM_TITLE = 'غرفة اختبار'

// نفس بيانات الإنشاء المستخدمة في اختبارات تدفق الغرفة.
const NEW_ROOM_PAYLOAD = {
  title: NEW_ROOM_TITLE,
  category: 'ونسة',
  seats_total: 8,
  is_battle: false,
  game: null,
}

function renderApp(path = '/') {
  window.history.pushState({}, '', path)
  const user = userEvent.setup()
  let rooms: Room[] = [EXISTING_ROOM]

  const createdRoom: Room = {
    id: CREATED_ROOM_ID,
    ...NEW_ROOM_PAYLOAD,
    // الخادم يعيّن المضيف الافتراضي عندما لا يُرسل مع الطلب.
    host: 'المستخدم',
    listeners: 1,
    seats_taken: 1,
    language: 'العربية',
    featured: false,
  }

  const { calls } = installApiMock({
    'GET /api/me': () => ({ json: NEW_USER }),
    'PATCH /api/me': (body) => ({ json: { ...NEW_USER, ...(body as object) } }),
    'GET /api/rooms': () => ({ json: rooms }),
    'GET /api/games': () => ({
      json: [{ key: 'ludo', name: 'لودو', players: '4', accent: 'amber' }],
    }),
    'POST /api/rooms': () => {
      rooms = [createdRoom, ...rooms]
      return { status: 201, json: createdRoom }
    },
    [`POST /api/rooms/${CREATED_ROOM_ID}/join`]: () => ({ json: createdRoom }),
    [`POST /api/rooms/${CREATED_ROOM_ID}/leave`]: () => ({ json: createdRoom }),
  })

  render(<App />)
  return { calls, user, createdRoom }
}

function countCalls(calls: { key: string }[], key: string) {
  return calls.filter((call) => call.key === key).length
}

async function createRoomThroughForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByTestId('create-room-link'))
  expect(await screen.findByRole('heading', { level: 1, name: 'إضافة غرفة' })).toBeInTheDocument()

  await user.type(screen.getByPlaceholderText('مثال: جلسة ونسة الليل'), NEW_ROOM_TITLE)
  await user.click(screen.getByRole('button', { name: 'أنشئ الغرفة' }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('مستخدم جديد ينشئ غرفة صوتية', () => {
  it('يعرض اسم المستخدم الجديد في الشاشة الرئيسية', async () => {
    renderApp()

    expect(await screen.findByText(NEW_USER.name)).toBeInTheDocument()
    expect(await screen.findByTestId('create-room-link')).toBeInTheDocument()
  })

  it('يعرض اسم المستخدم الجديد ورمزه (@handle) في الملف الشخصي', async () => {
    renderApp('/profile')

    expect(await screen.findByDisplayValue(NEW_USER.name)).toBeInTheDocument()
    expect(screen.getByDisplayValue(NEW_USER.handle)).toBeInTheDocument()
  })

  it('ينشئ غرفة بنفس البيانات ويظهرها في الرئيسية', async () => {
    const { calls, user } = renderApp()

    await createRoomThroughForm(user)

    await waitFor(() => expect(countCalls(calls, 'POST /api/rooms')).toBe(1))
    const creation = calls.find((call) => call.key === 'POST /api/rooms')
    expect(creation?.body).toEqual(NEW_ROOM_PAYLOAD)

    // العودة للرئيسية وإعادة جلب الغرف بعد الإنشاء.
    expect(await screen.findByTestId('create-room-link')).toBeInTheDocument()
    await waitFor(() => expect(countCalls(calls, 'GET /api/rooms')).toBe(2))
    const card = await screen.findByText(NEW_ROOM_TITLE)
    expect(card).toBeInTheDocument()
  })

  it('يدخل الغرفة المنشأة ويفعّل المايك ثم يخرج منها', async () => {
    const { calls, user } = renderApp()

    await createRoomThroughForm(user)
    await waitFor(() => expect(countCalls(calls, 'POST /api/rooms')).toBe(1))

    const newCard = (await screen.findByText(NEW_ROOM_TITLE)).closest(
      '[data-testid="room-card"]',
    ) as HTMLElement | null
    expect(newCard).not.toBeNull()
    expect(newCard?.getAttribute('data-room-id')).toBe(String(CREATED_ROOM_ID))

    await user.click(newCard as HTMLElement)

    expect(
      await screen.findByRole('heading', { level: 2, name: NEW_ROOM_TITLE }),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(countCalls(calls, `POST /api/rooms/${CREATED_ROOM_ID}/join`)).toBe(1),
    )

    const mic = screen.getByTestId('mic-toggle')
    expect(mic).toHaveAttribute('aria-pressed', 'false')
    await user.click(mic)
    expect(mic).toHaveAttribute('aria-pressed', 'true')
    await user.click(mic)
    expect(mic).toHaveAttribute('aria-pressed', 'false')

    await user.click(screen.getByRole('button', { name: 'خروج' }))

    await waitFor(() => expect(screen.queryByTestId('mic-toggle')).not.toBeInTheDocument())
    expect(countCalls(calls, `POST /api/rooms/${CREATED_ROOM_ID}/leave`)).toBe(1)
    expect(await screen.findByTestId('create-room-link')).toBeInTheDocument()
  })

  it('يحفظ المستخدم الجديد رمزه الجديد (@handle) في الملف الشخصي', async () => {
    const { calls, user } = renderApp('/profile')

    const handleInput = await screen.findByDisplayValue(NEW_USER.handle)
    await user.clear(handleInput)
    await user.type(handleInput, '@laila_new')

    await user.click(screen.getByRole('button', { name: 'حفظ التغييرات' }))

    expect(await screen.findByText('تم تحديث الملف الشخصي')).toBeInTheDocument()
    const update = calls.find((call) => call.key === 'PATCH /api/me')
    expect(update?.body).toMatchObject({ name: NEW_USER.name, handle: '@laila_new' })
  })
})
