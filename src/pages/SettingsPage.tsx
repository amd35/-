import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, ChevronLeft, Globe, User, Volume2 } from 'lucide-react'
import { Card, Notice, PageHeader, PrimaryButton } from '../components/ui'
import { api, type Me } from '../lib/api'

function Toggle({
  label,
  hint,
  checked,
  onChange,
  testId,
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (value: boolean) => void
  testId: string
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
      <span>
        <span className="block text-xs font-bold text-white">{label}</span>
        <span className="mt-0.5 block text-[10px] text-slate-400">{hint}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-5 shrink-0 accent-fuchsia-500"
        data-testid={testId}
      />
    </label>
  )
}

export default function SettingsPage() {
  const [me, setMe] = useState<Me | null>(null)
  const [language, setLanguage] = useState('ar')
  const [push, setPush] = useState(true)
  const [sound, setSound] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    api
      .me()
      .then((profile) => {
        if (!active) return
        setMe(profile)
        setLanguage(profile.language)
        setPush(profile.push_enabled)
        setSound(profile.sound_enabled)
      })
      .catch((err: Error) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [])

  async function save() {
    try {
      const updated = await api.updateMe({
        language,
        push_enabled: push,
        sound_enabled: sound,
      })
      setMe(updated)
      setNotice('تم حفظ الإعدادات')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div>
      <PageHeader title="الإعدادات" subtitle="تحكم بالإشعارات واللغة والمظهر" />

      <Card className="mb-3 space-y-2">
        <p className="flex items-center gap-2 text-xs font-bold text-white">
          <Globe size={14} className="text-fuchsia-300" /> اللغة
        </p>
        <select
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white focus:outline-none"
          data-testid="language-select"
        >
          <option value="ar" className="bg-[#12101c]">
            العربية
          </option>
          <option value="en" className="bg-[#12101c]">
            English
          </option>
        </select>
      </Card>

      <div className="space-y-2">
        <Toggle
          label="إشعارات الدفع"
          hint="تنبيهات الغرف وطلبات الصداقة"
          checked={push}
          onChange={setPush}
          testId="push-toggle"
        />
        <Toggle
          label="أصوات التطبيق"
          hint="نغمات الدخول والهدايا"
          checked={sound}
          onChange={setSound}
          testId="sound-toggle"
        />
      </div>

      {notice && (
        <div className="mt-3">
          <Notice>{notice}</Notice>
        </div>
      )}
      {error && (
        <div className="mt-3">
          <Notice tone="rose">{error}</Notice>
        </div>
      )}

      <div className="mt-3">
        <PrimaryButton onClick={save} disabled={!me}>
          حفظ الإعدادات
        </PrimaryButton>
      </div>

      <div className="mt-4 space-y-2">
        <Link
          to="/profile"
          className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xs font-bold text-slate-200"
        >
          <span className="flex items-center gap-2">
            <User size={14} className="text-fuchsia-300" /> تعديل الملف الشخصي
          </span>
          <ChevronLeft size={15} className="text-slate-500" />
        </Link>
        <Link
          to="/notifications"
          className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xs font-bold text-slate-200"
        >
          <span className="flex items-center gap-2">
            <Bell size={14} className="text-amber-300" /> إدارة التنبيهات
          </span>
          <ChevronLeft size={15} className="text-slate-500" />
        </Link>
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xs font-bold text-slate-200">
          <span className="flex items-center gap-2">
            <Volume2 size={14} className="text-emerald-300" /> الإصدار
          </span>
          <span className="text-[11px] font-semibold text-slate-400">0.1 تجريبي</span>
        </div>
      </div>
    </div>
  )
}
