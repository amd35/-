import { useEffect, useState } from 'react'
import { Bell, CheckCheck, Gift, Mail, ShieldAlert, Users } from 'lucide-react'
import { PageHeader } from '../components/ui'
import { api, type Notification } from '../lib/api'

const ICONS: Record<string, typeof Bell> = {
  info: Bell,
  reward: Gift,
  social: Users,
  alert: ShieldAlert,
  message: Mail,
}

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    api
      .notifications()
      .then((data) => active && setItems(data))
      .catch((err: Error) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [])

  async function markOne(item: Notification) {
    try {
      await api.readNotification(item.id)
      setItems((list) => (list ?? []).map((row) => (row.id === item.id ? { ...row, read: true } : row)))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function markAll() {
    try {
      await api.readAllNotifications()
      setItems((list) => (list ?? []).map((row) => ({ ...row, read: true })))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const unread = (items ?? []).filter((item) => !item.read).length

  return (
    <div>
      <PageHeader
        title="التنبيهات"
        subtitle={items ? `${unread} غير مقروء من ${items.length}` : undefined}
        action={
          <button
            type="button"
            onClick={markAll}
            disabled={unread === 0}
            data-testid="mark-all"
            className="flex shrink-0 items-center gap-1 rounded-xl bg-white/10 px-3 py-2 text-[11px] font-bold text-slate-200 disabled:opacity-40"
          >
            <CheckCheck size={14} /> قراءة الكل
          </button>
        }
      />

      {error && <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-xs text-rose-200">{error}</p>}
      {items === null && !error && <p className="py-10 text-center text-xs text-slate-400">جارٍ التحميل…</p>}

      <ul className="space-y-2" data-testid="notification-list">
        {items !== null && items.length === 0 && (
          <li className="rounded-2xl border border-white/10 bg-white/5 py-8 text-center text-xs text-slate-400">
            لا تنبيهات حاليًا.
          </li>
        )}
        {items?.map((item) => {
          const Icon = ICONS[item.kind] ?? Bell
          return (
            <li
              key={item.id}
              data-testid="notification-row"
              data-read={item.read ? 'true' : 'false'}
              className={`rounded-2xl border p-3 transition ${
                item.read
                  ? 'border-white/10 bg-white/[0.02]'
                  : 'border-fuchsia-400/25 bg-fuchsia-500/[0.07]'
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
                    item.read ? 'bg-white/5 text-slate-400' : 'bg-fuchsia-500/20 text-fuchsia-300'
                  }`}
                >
                  <Icon size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-bold ${item.read ? 'text-slate-300' : 'text-white'}`}>
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{item.body}</p>
                  {!item.read && (
                    <button
                      type="button"
                      onClick={() => markOne(item)}
                      data-testid="mark-read"
                      className="mt-2 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-slate-200"
                    >
                      تحديد كمقروء
                    </button>
                  )}
                </div>
                {!item.read && <span className="mt-1 size-2 shrink-0 rounded-full bg-fuchsia-400" />}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
