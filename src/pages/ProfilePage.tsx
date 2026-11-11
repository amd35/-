import { useEffect, useState } from 'react'
import { Coins, Gem, Sparkles } from 'lucide-react'
import Avatar from '../components/Avatar'
import { Card, Field, Notice, PageHeader, PrimaryButton, inputClass } from '../components/ui'
import { api, type Me } from '../lib/api'

export default function ProfilePage() {
  const [me, setMe] = useState<Me | null>(null)
  const [name, setName] = useState('')
  const [handle, setHandle] = useState('')
  const [bio, setBio] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    api
      .me()
      .then((profile) => {
        if (!active) return
        setMe(profile)
        setName(profile.name)
        setHandle(profile.handle)
        setBio(profile.bio)
      })
      .catch((err: Error) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setNotice(null)
    try {
      const updated = await api.updateMe({ name: name.trim(), handle: handle.trim(), bio: bio.trim() })
      setMe(updated)
      setNotice('تم تحديث الملف الشخصي')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader title="الملف الشخصي" subtitle="عدّل معلوماتك الظاهرة للأصدقاء" />

      {me && (
        <Card className="mb-3 flex items-center gap-3">
          <Avatar name={me.name} size={56} online />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-white">{me.name}</p>
            <p className="text-[11px] text-slate-400" dir="ltr">
              {me.handle}
            </p>
            <p className="mt-1 flex items-center gap-2 text-[10px]">
              <span className="rounded-full bg-fuchsia-500/15 px-2 py-0.5 font-bold text-fuchsia-300">
                Lv {me.level}
              </span>
              <span className="flex items-center gap-1 text-amber-300">
                <Coins size={11} /> {me.coins}
              </span>
              <span className="flex items-center gap-1 text-cyan-300">
                <Gem size={11} /> {me.diamonds}
              </span>
            </p>
          </div>
        </Card>
      )}

      <form onSubmit={save} className="space-y-3">
        <Field label="الاسم">
          <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} />
        </Field>
        <Field label="المعرّف">
          <input
            value={handle}
            onChange={(event) => setHandle(event.target.value)}
            className={inputClass}
            dir="ltr"
          />
        </Field>
        <Field label="نبذة">
          <textarea
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            rows={3}
            className={inputClass}
          />
        </Field>

        {notice && <Notice>{notice}</Notice>}
        {error && <Notice tone="rose">{error}</Notice>}

        <PrimaryButton type="submit" disabled={saving || name.trim().length < 2}>
          {saving ? 'جارٍ الحفظ…' : 'حفظ التغييرات'}
        </PrimaryButton>
      </form>

      <Card className="mt-4 flex items-start gap-2">
        <Sparkles size={15} className="mt-0.5 shrink-0 text-fuchsia-300" />
        <p className="text-[11px] leading-relaxed text-slate-400">
          تغيير الاسم يظهر فورًا في الغرف والأصدقاء. تفضيلات الإشعارات والمظهر في صفحة
          الإعدادات.
        </p>
      </Card>
    </div>
  )
}
