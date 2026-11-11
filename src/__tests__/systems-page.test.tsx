import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SystemsPage from '../pages/SystemsPage'
import { installApiMock } from '../test/mockApi'

const META = {
  total: 1000,
  specialties_total: 40,
  users_total: 24672297,
  uptime_avg: 95.88,
  specialties: [
    { name: 'المصارف', count: 25 },
    { name: 'الرعاية الصحية', count: 25 },
  ],
  statuses: [
    { name: 'يعمل', count: 789 },
    { name: 'صيانة', count: 70 },
  ],
}

function system(id: number, name: string, specialty = 'المصارف') {
  return {
    id,
    code: `SYS-${String(id).padStart(4, '0')}`,
    name,
    specialty,
    vendor: 'شركة الرافدين للأنظمة',
    governorate: 'بغداد',
    status: 'يعمل',
    version: '3.2.1',
    users: 1200,
    uptime: 99.9,
    description: 'وصف',
    created_at: '2024-01-01',
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('صفحة دليل الأنظمة', () => {
  it('يعرض الإجمالي وقائمة الأنظمة ويضيف الصفحة التالية', async () => {
    installApiMock({
      'GET /api/systems/meta': () => ({ json: META }),
      'GET /api/systems': (_body, url) => {
        const page = Number(new URL(url, 'http://x').searchParams.get('page') ?? '1')
        return {
          json: {
            items:
              page === 1
                ? [system(1, 'نظام الحسابات والودائع'), system(2, 'نظام القروض والتمويل')]
                : [system(3, 'نظام التحويلات المحلية')],
            total: 3,
            page,
            page_size: 24,
            pages: 2,
          },
        }
      },
    })

    render(
      <MemoryRouter>
        <SystemsPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('نظام الحسابات والودائع')).toBeInTheDocument()
    expect(screen.getAllByTestId('system-row')).toHaveLength(2)
    expect(await screen.findByTestId('systems-total')).toHaveTextContent('1,000')
    expect(screen.getByText(/1,000 نظام في 40 اختصاصًا/)).toBeInTheDocument()

    await userEvent.click(screen.getByTestId('systems-more'))
    expect(await screen.findByText('نظام التحويلات المحلية')).toBeInTheDocument()
    expect(screen.getAllByTestId('system-row')).toHaveLength(3)
  })

  it('يرسل البحث والاختصاص إلى الخادم', async () => {
    const { mock } = installApiMock({
      'GET /api/systems/meta': () => ({ json: META }),
      'GET /api/systems': () => ({
        json: { items: [system(1, 'نظام الحسابات والودائع')], total: 1, page: 1, page_size: 24, pages: 1 },
      }),
    })

    render(
      <MemoryRouter>
        <SystemsPage />
      </MemoryRouter>,
    )

    await screen.findByText('نظام الحسابات والودائع')

    await userEvent.click(screen.getByTestId('specialty-المصارف'))
    await waitFor(() => {
      const urls = mock.mock.calls.map((call) => String(call[0]))
      expect(urls.some((url) => url.includes('specialty='))).toBe(true)
    })

    await userEvent.type(screen.getByPlaceholderText('ابحث بالاسم أو الاختصاص أو الجهة'), 'بغداد')
    await waitFor(() => {
      const urls = mock.mock.calls.map((call) => String(call[0]))
      expect(urls.some((url) => url.includes('q='))).toBe(true)
    })
  })

  it('يعرض حالة فراغ عند عدم وجود نتائج', async () => {
    installApiMock({
      'GET /api/systems/meta': () => ({ json: { ...META, total: 0 } }),
      'GET /api/systems': () => ({
        json: { items: [], total: 0, page: 1, page_size: 24, pages: 0 },
      }),
    })

    render(
      <MemoryRouter>
        <SystemsPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('لا توجد أنظمة مطابقة لبحثك.')).toBeInTheDocument()
    expect(screen.queryByTestId('systems-more')).not.toBeInTheDocument()
  })
})
