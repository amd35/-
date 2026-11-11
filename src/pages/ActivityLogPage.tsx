import { useEffect, useState } from 'react'
import {
  Bell,
  CheckSquare,
  History,
  LogOut,
  Mic,
  PlusCircle,
  Trash2,
  UserCheck,
  UserPlus,
} from 'lucide-react'
import { PageHeader } from '../components/ui'
import { api, type ActivityEntry } from '../lib/api'

const ICONS: Record<string, typeof History> = {
  room_created: PlusCircle,
  room_deleted: Trash2,
  room_joined: Mic,
  room_left: LogOut,
  task_created: CheckSquare,
  task_completed: CheckSquare,
  task_reopened: CheckSquare,
  task_deleted: Trash2,
  friend_added: UserPlus,
  profile_updated: UserCheck,
  notification_read: Bell,
  contact_message: Bell,
}

const LABELS: Record<string, string> = {
  room_created: 'إنشاء غرفة',
  room_deleted: 'حذف غرفة',
  room_joined: 'انضمام لغرفة',
  room_left: 'خروج من غرفة',
  task_created: 'مهمة جديدة',
  task_completed: 'إنجاز مهمة',
  task_reopened: 'إعادة فتح مهمة',
  task_deleted: 'حذف مهمة',
  friend_added: 'صديق جديد',
  profile_updated: 'تحديث الملف',
  notification_read: 'تنبيه',
  contact_message: 'رسالة دعم',
}

function when(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('ar', { day: 'numeric', month: 'short' })
}

export default function ActivityLogPage() {
  const [items, setItems] = useState<ActivityEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    api
      .activity()
      .then((data) => active && setItems(data))
      .catch((err: Error) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [])

  return (
    <div>
      <PageHeader title="سجل النشاط" subtitle="آخر الإجراءات داخل التطبيق مرتبة زمنيًا" />

      {error && <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-xs text-rose-200">{error}</p>}
      {items === null && !error && <p className="py-10 text-center text-xs text-slate-400">جارٍ التحميل…</p>}

      <ol className="relative mt-2 space-y-2 border-s border-white/10 ps-4" data-testid="activity-list">
        {items !== null && items.length === 0 && (
          <li className="text-xs text-slate-400">لا نشاط مسجّل بعد.</li>
        )}
        {items?.map((item) => {
          const Icon = ICONS[item.action] ?? History
          return (
            <li key={item.id} data-testid="activity-row" className="relative">
              <span className="absolute -start-[26px] top-2 flex size-5 items-center justify-center rounded-full border border-white/15 bg-[#120c1e] text-fuchsia-300">
                <Icon size={11} />
              </span>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-bold tracking-wide text-fuchsia-300">
                    {LABELS[item.action] ?? item.action}
                  </p>
                  <span className="shrink-0 text-[10px] text-slate-500">{when(item.created_at)}</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-300">{item.detail}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
