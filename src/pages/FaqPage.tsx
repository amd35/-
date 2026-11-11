import { Link } from 'react-router-dom'
import { MessageCircleQuestion, Minus, Plus } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '../components/ui'

const ITEMS = [
  {
    q: 'كيف أنشئ غرفة صوتية جديدة؟',
    a: 'من الرئيسية اضغط «أنشئ غرفة جديدة» أو من القائمة اختر «إضافة غرفة»، ثم أدخل الاسم وعدد المقاعد واختر القسم. الغرفة تظهر فورًا في القائمة.',
  },
  {
    q: 'كيف أنضم إلى غرفة معركة؟',
    a: 'افتح تبويب «المعركة»، اختر اللعبة لتصفية الغرف، ثم اضغط على الغرفة للدخول والاستماع. زر المايك في الأسفل يسمح لك بالحديث.',
  },
  {
    q: 'لماذا لا أسمع صوتًا؟',
    a: 'تأكد أولًا من تشغيل المايك من داخل الغرفة، ومن أن صوت الجهاز غير مكتوم. إذا استمرت المشكلة جرّب الخروج من الغرفة والدخول من جديد.',
  },
  {
    q: 'كيف أضيف صديقًا؟',
    a: 'من تبويب «الأصدقاء» استخدم أيقونة الإضافة، أو اقبل طلبًا واردًا من قسم «الطلبات». تظهر حالة الاتصال لكل صديق تلقائيًا.',
  },
  {
    q: 'هل يمكنني حذف غرفة أنشأتها؟',
    a: 'نعم، من «قائمة الغرف» اضغط أيقونة الحذف بجانب الغرفة. يُسجَّل الحذف في سجل النشاط.',
  },
  {
    q: 'ما معنى النقاط والجواهر؟',
    a: 'العملات تُكتسب من المعارك والجوائز، والجواهر تُستخدم للهدايا داخل الغرف. رصيدك ظاهر في أعلى الرئيسية وفي ملفك الشخصي.',
  },
]

export default function FaqPage() {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <div>
      <PageHeader title="الأسئلة الشائعة" subtitle="أجوبة سريعة لأكثر ما يسأل عنه المستخدمون" />

      <ul className="space-y-2" data-testid="faq-list">
        {ITEMS.map((item, index) => {
          const expanded = open === index
          return (
            <li key={item.q} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : index)}
                aria-expanded={expanded}
                data-testid="faq-toggle"
                className="flex w-full items-center gap-2 px-4 py-3 text-right"
              >
                <MessageCircleQuestion size={15} className="shrink-0 text-fuchsia-300" />
                <span className="flex-1 text-xs font-bold text-white">{item.q}</span>
                {expanded ? (
                  <Minus size={15} className="shrink-0 text-slate-400" />
                ) : (
                  <Plus size={15} className="shrink-0 text-slate-400" />
                )}
              </button>
              {expanded && (
                <p className="border-t border-white/10 px-4 py-3 text-[11px] leading-relaxed text-slate-300">
                  {item.a}
                </p>
              )}
            </li>
          )
        })}
      </ul>

      <Link
        to="/contact"
        className="mt-4 block rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-center text-[11px] font-bold text-fuchsia-300"
      >
        لم تجد إجابتك؟ راسلنا
      </Link>
    </div>
  )
}
