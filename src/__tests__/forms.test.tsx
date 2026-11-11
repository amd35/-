import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ContactPage from '../pages/ContactPage'
import ProfilePage from '../pages/ProfilePage'
import SettingsPage from '../pages/SettingsPage'
import TasksPage from '../pages/TasksPage'
import { installApiMock } from '../test/mockApi'

const ME = {
  name: 'المستخدم',
  handle: '@me',
  level: 15,
  coins: 2450,
  diamonds: 86,
  bio: 'نبذة أصلية',
  language: 'ar',
  push_enabled: true,
  sound_enabled: true,
}

const TASK = { id: 7, title: 'مهمة اختبار', project: 'عام', done: false, created_at: '2026-11-11T00:00:00Z' }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('المهام', () => {
  it('ينشئ مهمة جديدة، ينجزها، ثم يحذفها', async () => {
    const user = userEvent.setup()
    let current = { ...TASK }
    const { calls } = installApiMock({
      'GET /api/tasks': () => ({ json: [] }),
      'POST /api/tasks': (body) => {
        current = { ...TASK, title: (body as { title: string }).title }
        return { status: 201, json: current }
      },
      'PATCH /api/tasks/7': () => {
        current = { ...current, done: !current.done }
        return { json: current }
      },
      'DELETE /api/tasks/7': () => ({ status: 204 }),
    })

    render(<TasksPage />)
    await user.type(screen.getByTestId('task-input'), 'مهمة اختبار')
    await user.click(screen.getByRole('button', { name: 'إضافة مهمة' }))

    const row = await screen.findByTestId('task-row')
    expect(row).toHaveTextContent('مهمة اختبار')

    const toggle = row.querySelector('button[aria-pressed]') as HTMLElement
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await user.click(toggle)
    await waitFor(() => expect(toggle).toHaveAttribute('aria-pressed', 'true'))

    await user.click(row.querySelector('button[aria-label^="حذف"]') as HTMLElement)
    await waitFor(() => expect(screen.queryByTestId('task-row')).not.toBeInTheDocument())

    expect(calls.map((call) => call.key)).toEqual([
      'GET /api/tasks',
      'POST /api/tasks',
      'PATCH /api/tasks/7',
      'DELETE /api/tasks/7',
    ])
  })
})

describe('الإعدادات', () => {
  it('يحفظ تفضيلات الصوت عبر الـ API', async () => {
    const user = userEvent.setup()
    const { calls } = installApiMock({
      'GET /api/me': () => ({ json: ME }),
      'PATCH /api/me': (body) => ({ json: { ...ME, ...(body as object) } }),
    })

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByTestId('sound-toggle')).toBeChecked())
    await user.click(screen.getByTestId('sound-toggle'))
    await user.click(screen.getByRole('button', { name: 'حفظ الإعدادات' }))

    expect(await screen.findByText('تم حفظ الإعدادات')).toBeInTheDocument()
    const patch = calls.find((call) => call.key === 'PATCH /api/me')
    expect(patch?.body).toMatchObject({ sound_enabled: false })
  })
})

describe('الملف الشخصي', () => {
  it('يحفظ الاسم والنبذة', async () => {
    const user = userEvent.setup()
    const { calls } = installApiMock({
      'GET /api/me': () => ({ json: ME }),
      'PATCH /api/me': (body) => ({ json: { ...ME, ...(body as object) } }),
    })

    render(<ProfilePage />)
    const nameInput = await screen.findByDisplayValue('المستخدم')
    await user.clear(nameInput)
    await user.type(nameInput, 'علي')
    await user.click(screen.getByRole('button', { name: 'حفظ التغييرات' }))

    expect(await screen.findByText('تم تحديث الملف الشخصي')).toBeInTheDocument()
    expect(calls.find((call) => call.key === 'PATCH /api/me')?.body).toMatchObject({ name: 'علي' })
  })
})

describe('اتصل بنا', () => {
  it('يرسل النموذج ويعرض تأكيد الإرسال', async () => {
    const user = userEvent.setup()
    const { calls } = installApiMock({
      'POST /api/contact': () => ({ status: 201, json: { status: 'received' } }),
    })

    render(<ContactPage />)
    await user.type(screen.getByPlaceholderText('اسمك'), 'أحمد')
    await user.type(screen.getByPlaceholderText('name@example.com'), 'ahmed@example.com')
    await user.type(screen.getByPlaceholderText('اكتب تفاصيل طلبك…'), 'استفسار عن الغرف')
    await user.click(screen.getByRole('button', { name: /إرسال الرسالة/ }))

    expect(await screen.findByText(/تم إرسال رسالتك/)).toBeInTheDocument()
    expect(calls.some((call) => call.key === 'POST /api/contact')).toBe(true)
  })
})
