import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RoomOverlay from '../components/RoomOverlay'
import AddItemPage from '../pages/AddItemPage'
import type { Room } from '../lib/api'

const room: Room = {
  id: 1,
  title: 'غرفة اختبار',
  category: 'ونسة',
  host: 'أبو رعد',
  listeners: 10,
  seats_taken: 4,
  seats_total: 8,
  language: 'العربية',
  is_battle: false,
  game: null,
  featured: false,
}

const roomJson = JSON.stringify(room)
const calls: string[] = []

function jsonResponse(body: string, status = 200) {
  return {
    ok: status < 400,
    status,
    json: () => Promise.resolve(JSON.parse(body)),
  } as Response
}

beforeEach(() => {
  calls.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push(`${init?.method ?? 'GET'} ${url}`)
      if (url === '/api/games') return Promise.resolve(jsonResponse('[]'))
      return Promise.resolve(jsonResponse(roomJson, 201))
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('تیار إنشاء غرفة والانضمام وتفعيل المايك', () => {
  it('ينشئ غرفة جديدة ويرسل بيانات النموذج إلى الـ API', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/add-item']}>
        <AddItemPage />
      </MemoryRouter>,
    )

    await user.type(screen.getByPlaceholderText('مثال: جلسة ونسة الليل'), 'غرفة اختبار')
    await user.click(screen.getByRole('button', { name: 'أنشئ الغرفة' }))

    expect(calls).toContain('POST /api/rooms')
    const fetchMock = globalThis.fetch as unknown as { mock: { calls: [string, RequestInit][] } }
    const body = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1].body))
    expect(body).toMatchObject({ title: 'غرفة اختبار', category: 'ونسة', seats_total: 8 })
    expect(body.is_battle).toBe(false)
  })

  it('ينضم للغرفة عند فتحها، ويشغّل المايك، ويخرج منها', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<RoomOverlay room={room} onClose={onClose} />)

    expect(calls).toContain('POST /api/rooms/1/join')

    const mic = screen.getByTestId('mic-toggle')
    expect(mic).toHaveAttribute('aria-pressed', 'false')
    await user.click(mic)
    expect(mic).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'خروج' }))
    expect(calls).toContain('POST /api/rooms/1/leave')
    expect(onClose).toHaveBeenCalled()
  })
})
