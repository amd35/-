import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DataListPage from '../pages/DataListPage'
import FaqPage from '../pages/FaqPage'
import { installApiMock } from '../test/mockApi'

const ROOMS = [
  {
    id: 1,
    title: 'جلسة طرب',
    category: 'ونسة',
    host: 'أبو رعد',
    listeners: 1200,
    seats_taken: 8,
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
    listeners: 600,
    seats_taken: 3,
    seats_total: 4,
    language: 'العربية',
    is_battle: true,
    game: 'ludo',
    featured: true,
  },
]

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('قائمة الغرف', () => {
  it('يعرض كل الغرف من الـ API', async () => {
    installApiMock({ 'GET /api/rooms': () => ({ json: ROOMS }) })
    render(
      <MemoryRouter>
        <DataListPage />
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getAllByTestId('data-row')).toHaveLength(2))
  })

  it('يفلتر بالبحث حسب العنوان', async () => {
    const user = userEvent.setup()
    installApiMock({ 'GET /api/rooms': () => ({ json: ROOMS }) })
    render(
      <MemoryRouter>
        <DataListPage />
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getAllByTestId('data-row')).toHaveLength(2))

    await user.type(screen.getByTestId('data-search'), 'لودو')
    await waitFor(() => expect(screen.getAllByTestId('data-row')).toHaveLength(1))
    expect(screen.getByText('معركة لودو')).toBeInTheDocument()
  })

  it('يحذف غرفة ويحدّث القائمة', async () => {
    installApiMock({
      'GET /api/rooms': () => ({ json: ROOMS }),
      'DELETE /api/rooms/2': () => ({ status: 204 }),
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(
      <MemoryRouter>
        <DataListPage />
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getAllByTestId('data-row')).toHaveLength(2))

    screen.getByRole('button', { name: 'حذف معركة لودو' }).click()
    await waitFor(() => expect(screen.getAllByTestId('data-row')).toHaveLength(1))
    expect(screen.getByText(/تم حذف/)).toBeInTheDocument()
  })
})

describe('الأسئلة الشائعة', () => {
  it('يفتح سؤالًا ويغلق آخر', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <FaqPage />
      </MemoryRouter>,
    )

    const toggles = screen.getAllByTestId('faq-toggle')
    expect(toggles[0]).toHaveAttribute('aria-expanded', 'true')

    await user.click(toggles[1])
    expect(screen.getAllByTestId('faq-toggle')[1]).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByTestId('faq-toggle')[0]).toHaveAttribute('aria-expanded', 'false')

    await user.click(screen.getAllByTestId('faq-toggle')[1])
    expect(screen.getAllByTestId('faq-toggle')[1]).toHaveAttribute('aria-expanded', 'false')
  })
})
