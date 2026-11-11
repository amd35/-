import { useEffect, useState } from 'react'
import AccountCard from './components/AccountCard'
import { fetchAccounts, type Account } from './lib/api'

export default function App() {
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetchAccounts()
      .then((data) => active && setAccounts(data))
      .catch((err: Error) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [])

  return (
    <main className="mx-auto min-h-dvh w-full max-w-xl px-5 py-10">
      <header className="mb-8 text-center">
        <span className="inline-block rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-emerald-300">
          موثّق
        </span>
        <h1 className="mt-4 text-3xl leading-tight font-black text-white">تابع حساباتنا الرسمية</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          كل الأخبار والإعلانات تُنشر أولًا على هذه الحسابات. تأكد دائمًا من الاسم والرابط قبل
          المتابعة.
        </p>
      </header>

      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center text-sm text-red-200">
          {error}
        </p>
      )}

      {!error && accounts === null && (
        <p className="py-10 text-center text-sm text-slate-400">جارٍ التحميل…</p>
      )}

      {accounts !== null && accounts.length === 0 && (
        <p className="py-10 text-center text-sm text-slate-400">لا توجد حسابات مضافة بعد.</p>
      )}

      <div className="space-y-3">
        {accounts?.map((account) => (
          <AccountCard key={account.id} account={account} />
        ))}
      </div>

      <footer className="mt-10 text-center text-xs text-slate-500">
        الحسابات المزيفة كثيرة — هذا هو المصدر الوحيد المعتمد.
      </footer>
    </main>
  )
}
