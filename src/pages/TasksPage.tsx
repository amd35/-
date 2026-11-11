import { useEffect, useState } from 'react'
import { Check, Plus, Trash2 } from 'lucide-react'
import { Card, Notice, PageHeader, inputClass } from '../components/ui'
import { api, type Task } from '../lib/api'

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [title, setTitle] = useState('')
  const [project, setProject] = useState('عام')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    api
      .tasks()
      .then((data) => active && setTasks(data))
      .catch((err: Error) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [])

  async function add(event: React.FormEvent) {
    event.preventDefault()
    if (title.trim().length < 2) return
    try {
      const created = await api.createTask({ title: title.trim(), project })
      setTasks((list) => [created, ...(list ?? [])])
      setTitle('')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function toggle(task: Task) {
    try {
      const updated = await api.updateTask(task.id, !task.done)
      setTasks((list) => (list ?? []).map((item) => (item.id === updated.id ? updated : item)))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function remove(task: Task) {
    try {
      await api.deleteTask(task.id)
      setTasks((list) => (list ?? []).filter((item) => item.id !== task.id))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const done = (tasks ?? []).filter((task) => task.done).length
  const total = tasks?.length ?? 0

  return (
    <div>
      <PageHeader title="المهام" subtitle={`${done} منجزة من ${total}`} />

      <div className="mb-3 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-emerald-400 transition-all"
          style={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }}
        />
      </div>

      <form onSubmit={add} className="mb-3 flex gap-2">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="مهمة جديدة…"
          className={inputClass}
          data-testid="task-input"
        />
        <select
          value={project}
          onChange={(event) => setProject(event.target.value)}
          className="w-24 rounded-xl border border-white/10 bg-white/5 px-2 text-[11px] text-white focus:outline-none"
        >
          {['عام', 'التطوير', 'التصميم', 'الجودة', 'المحتوى'].map((item) => (
            <option key={item} value={item} className="bg-[#12101c]">
              {item}
            </option>
          ))}
        </select>
        <button
          type="submit"
          aria-label="إضافة مهمة"
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-fuchsia-600 text-white"
        >
          <Plus size={18} />
        </button>
      </form>

      {error && <Notice tone="rose">{error}</Notice>}

      <ul className="space-y-2" data-testid="task-list">
        {tasks === null && <li className="py-8 text-center text-xs text-slate-400">جارٍ التحميل…</li>}
        {tasks !== null && tasks.length === 0 && (
          <li className="rounded-2xl border border-white/10 bg-white/5 py-8 text-center text-xs text-slate-400">
            لا مهام بعد — أضف أول مهمة.
          </li>
        )}
        {tasks?.map((task) => (
          <li
            key={task.id}
            data-testid="task-row"
            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3"
          >
            <button
              type="button"
              onClick={() => toggle(task)}
              aria-label={task.done ? `إعادة فتح ${task.title}` : `إنجاز ${task.title}`}
              aria-pressed={task.done}
              className={`flex size-7 shrink-0 items-center justify-center rounded-full border ${
                task.done
                  ? 'border-emerald-400 bg-emerald-500 text-white'
                  : 'border-white/25 text-transparent'
              }`}
            >
              <Check size={14} />
            </button>
            <div className="min-w-0 flex-1">
              <p
                className={`truncate text-sm font-bold ${
                  task.done ? 'text-slate-500 line-through' : 'text-white'
                }`}
              >
                {task.title}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-500">{task.project}</p>
            </div>
            <button
              type="button"
              onClick={() => remove(task)}
              aria-label={`حذف ${task.title}`}
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-rose-500/10 text-rose-300"
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>

      <Card className="mt-4">
        <p className="text-[11px] text-slate-400">
          كل تعديل (إنشاء، إنجاز، حذف) يُسجَّل تلقائيًا في سجل النشاط.
        </p>
      </Card>
    </div>
  )
}
