import { Link } from 'react-router-dom'
import { BookOpen, Compass, Gamepad2, LayoutDashboard, Mic, Users } from 'lucide-react'
import { Card, PageHeader } from '../components/ui'

const TOPICS = [
  {
    Icon: Compass,
    title: 'البدء السريع',
    steps: [
      'افتح التطبيق من المتصفح — لا حاجة لتثبيت.',
      'استعرض الغرف النشطة في الرئيسية أو ابحث باسم المضيف.',
      'اضغط على أي غرفة للدخول والاستماع مجانًا.',
    ],
  },
  {
    Icon: Mic,
    title: 'الغرف الصوتية',
    steps: [
      'داخل الغرفة يظهر المضيف في المقعد الأول مع تاج.',
      'اضغط زر المايك الكبير للحديث، ومرة أخرى للكتم.',
      '«خروج» في الأسفل ينهي الجلسة ويحرّر مقعدك.',
    ],
  },
  {
    Icon: Gamepad2,
    title: 'قسم المعركة',
    steps: [
      'اختر لعبة (لودو، دومينو، أونو، بلياردو) لتصفية الغرف.',
      'ادخل غرفة معركة واستمع للشرح قبل البدء.',
      'الفائز يكسب نقاط بطولة الأسبوع.',
    ],
  },
  {
    Icon: Users,
    title: 'الأصدقاء',
    steps: [
      'تبويب الأصدقاء يعرض المتصلين أولًا مع حالتهم.',
      'شارة «في غرفة» تخبرك أين يتحدث صديقك الآن.',
      'اقبل الطلبات الواردة لتظهر في قائمتك.',
    ],
  },
  {
    Icon: LayoutDashboard,
    title: 'إدارة المحتوى',
    steps: [
      'لوحة التحكم تعرض ملخص المؤشرات فورًا.',
      'قائمة الغرف تتيح البحث والحذف.',
      'إضافة غرفة تنشئ غرفة جديدة تظهر في الرئيسية.',
    ],
  },
]

export default function HelpPage() {
  return (
    <div>
      <PageHeader title="مركز المساعدة" subtitle="أدلة قصيرة خطوة بخطوة داخل التطبيق" />

      <Card className="mb-3 flex items-start gap-2.5">
        <BookOpen size={16} className="mt-0.5 shrink-0 text-fuchsia-300" />
        <p className="text-[11px] leading-relaxed text-slate-300">
          كل ما تحتاجه للبدء خلال دقيقة: الغرف، المعارك، الأصدقاء، وإدارة المحتوى.
        </p>
      </Card>

      <div className="space-y-2.5">
        {TOPICS.map(({ Icon, title, steps }) => (
          <section key={title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <h2 className="flex items-center gap-2 text-xs font-bold text-white">
              <Icon size={15} className="text-fuchsia-300" /> {title}
            </h2>
            <ol className="mt-2 space-y-1.5">
              {steps.map((step, index) => (
                <li key={step} className="flex gap-2 text-[11px] leading-relaxed text-slate-300">
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-white/10 text-[9px] font-bold text-slate-300">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link
          to="/faq"
          className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-center text-[11px] font-bold text-slate-200"
        >
          الأسئلة الشائعة
        </Link>
        <Link
          to="/contact"
          className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-center text-[11px] font-bold text-slate-200"
        >
          اتصل بالدعم
        </Link>
      </div>
    </div>
  )
}
