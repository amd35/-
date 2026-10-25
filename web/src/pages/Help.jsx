import { Link } from 'react-router-dom'
import PageBar from '../components/PageBar.jsx'
import { api } from '../lib/api.js'
import { useRemote } from '../lib/hooks.js'
import { usePageText } from '../lib/pageText.js'

/** Help center: real guides, live game/payment state and answers. */
export default function Help() {
  const s = usePageText()

  const { data, error, loading } = useRemote(async () => {
    const [catalog, wallet, payments, royal] = await Promise.all([
      api.get('/api/games/catalog'),
      api.get('/api/wallet'),
      api.get('/api/payments/status'),
      api.get('/api/royal'),
    ])
    return { catalog, wallet, payments, royal }
  })

  const guides = [
    { title: 'إنشاء غرفة صوتية', steps: ['من صفحة الغرف اضغط «إنشاء غرفة» أو افتح «نموذج الإدخال» /entry-form.', 'اختر الاسم والخلفية وعدد المقاعد وهل الغرفة خاصة.', 'تُنشأ الغرفة على الخادم ويمكنك دعوة أصدقائك إليها.'] },
    { title: 'المقعد والصوت', steps: ['اضغط مقعدًا فارغًا للانضمام إليه، وللمقاعد المقفلة ارفع يدك.', 'يمنح المالك أو المشرف المايك، والمتحدث يظهر بإطار أخضر.', 'السماع يطلب إذن الميكروفون من المتصفح مرة واحدة.'] },
    { title: 'إرسال الهدايا', steps: ['من داخل الغرفة افتح الهدايا واختر الهدية.', 'اختر الماس أو الذهب — الرصيد يُخصم من محفظتك الحقيقية.', 'تُسجَّل كل هدية في سجل الحركات ويمكنك مراجعتها من لوحة القيادة.'] },
    { title: 'الألعاب: لودو ودومينو', steps: ['من صفحة الألعاب أنشئ طاولة أو انضم إلى طاولة مفتوحة.', 'اضغط «جاهز» وينتظر الجميع بدء المضيف.', 'قواعد اللعبة تُحسب على الخادم فقط، ولا يشارك اللعب أي مال.'] },
    { title: 'شحن الرصيد', steps: ['افتح «شحن الرصيد» واختر الباقة.', 'يُنشأ طلب بحالة «معلق» حتى يأتي تأكيد مزود الدفع.', 'لا يُضاف أي رصيد قبل التأكيد؛ ترى حالة كل طلب في سجل الطلبات.'] },
    { title: 'سحب الرصيد', steps: ['يُفعَّل السحب من لوحة الإدارة مع تحديد الحد الأدنى والرسم.', 'أرسل طلب سحب من ملفك الشخصي مع رقم المستفيد.', 'يراجع المشرف الطلب ثم يوافق أو يرفض.'] },
    { title: 'نظام رويال والمستويات', steps: ['افتح صفحة «رويال» من الصفحة الرئيسية لمشاهدة تاج كل مستوى وامتيازاته.', 'نقاط رويال تُكتسب من شحن حزم الجواهر فقط، وكل حزمة تعرض نقاطها قبل الشراء.', 'المستوى يُحسب من نقاطك مقابل عتبة يحدّدها المشرف من لوحة الإدارة، وتظهر لك النقاط المتبقية للترقية.'] },
  ]

  const faq = [
    ['كيف أغيّر صورتي أو اسمي؟', 'من صفحة الملف الشخصي: عدّل الاسم الظاهر والنبذة وارفع صورة جديدة.'],
    ['كيف أحظر مستخدمًا؟', 'من صفحة الأصدقاء يمكنك الحظر أو الإبلاغ، ويصل الإبلاغ إلى لوحة الإدارة.'],
    ['هل الألعاب تحتاج رصيدًا؟', 'لا، ألعاب لودو والدومينو لا تعتمد على أي مبلغ، والمكافأة تُمنح من إعدادات الخادم عند الفوز.'],
    ['كم يستغرق ظهور الرصيد بعد الدفع؟', 'بعد تأكيد مزود الدفع فقط؛ إن لم يكن المزود مُعدًّا يبقى الطلب معلقًا ولا يُضاف رصيد.'],
    ['لماذا لا يعمل الصوت بين شبكات مختلفة؟', 'الصوت يعمل عبر STUN على نفس الشبكة، ويحتاج خادم TURN لعبور الشبكات المقيدة.'],
    ['هل يمكن حذف الحساب داخل التطبيق؟', 'نعم: من «الإعدادات» ← «حذف الحساب» تكتب كلمة المرور وتؤكد الحذف، فيُغلق الحساب ويُمنع الدخول إليه فورًا ولا تظهر بياناتك الشخصية لأحد.'],
    ['كيف أحصل على تطبيق الأندرويد (APK)؟', 'مشروع Flutter داخل المستودع، ويحتاج بناءً محليًا بأدوات Flutter وAndroid SDK؛ لا يمكن بناؤه من بيئة المعاينة.'],
  ]

  return (
    <div data-testid="help-page">
      <PageBar title={s.help} back="/settings" testId="help" />

      <p className="muted" style={{ margin: '0 2px 12px' }}>
        {s.helpSub}
      </p>
      {error ? <p className="error-text">{error}</p> : null}

      <div className="card glass">
        <h3 className="section-title" style={{ marginTop: 0 }}>
          {s.gamesState}
        </h3>
        {loading && !data ? <p className="muted">{s.loading}</p> : null}
        {(data?.catalog?.games || []).map((game) => (
          <div className="ledger-row" key={game.key}>
            <span>
              {game.name} · {game.min_players}-{game.max_players}
            </span>
            <span className={`status-pill status-${game.enabled ? 'paid' : 'pending'}`}>
              {game.enabled ? s.configured : s.notConfigured}
            </span>
          </div>
        ))}
        {data ? (
          <p className="muted" style={{ marginTop: 8 }} data-testid="help-royal">
            {`مستوى رويال الحالي: ${data.royal.status.tier?.name_ar || 'رويال 1'} · ${data.royal.status.points} نقطة رويال · للترقية لا تزال بحاجة ${data.royal.status.points_to_next} · مكافأة الفوز ${data.catalog.win_reward_diamonds} ماس`}
          </p>
        ) : null}
      </div>

      <div className="card glass">
        <h3 className="section-title" style={{ marginTop: 0 }}>
          {s.paymentState}
        </h3>
        {data ? (
          <>
            <div className="ledger-row">
              <span>{data.payments.provider}</span>
              <span className={`status-pill status-${data.payments.configured ? 'paid' : 'pending'}`}>
                {data.payments.configured ? s.configured : s.notConfigured}
              </span>
            </div>
            <div className="ledger-row">
              <span>عملة العرض</span>
              <span className="chip chip-gold">{data.payments.display_currency_default}</span>
            </div>
            <div className="ledger-row">
              <span>السحب</span>
              <span className={`status-pill status-${data.wallet.withdrawal.enabled ? 'paid' : 'pending'}`}>
                {data.wallet.withdrawal.enabled ? s.configured : s.notConfigured}
              </span>
            </div>
            <p className="muted" style={{ marginTop: 8 }}>
              حد أدنى {data.wallet.withdrawal.minimum} · رسم {data.wallet.withdrawal.fee_percent}% ·{' '}
              {data.wallet.withdrawal.exchange_rate_usd_iqd} IQD/دولار
            </p>
            {data.payments.message ? <p className="notice">{data.payments.message}</p> : null}
          </>
        ) : null}
      </div>

      <h2 className="section-title">{s.guides}</h2>
      {guides.map((guide) => (
        <div className="card glass" key={guide.title}>
          <strong>{guide.title}</strong>
          <ol className="rules-list" style={{ marginTop: 8 }}>
            {guide.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      ))}

      <h2 className="section-title">{s.faq}</h2>
      <div className="card glass">
        {faq.map(([question, answer]) => (
          <details key={question} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{question}</summary>
            <p className="muted" style={{ marginTop: 6 }}>
              {answer}
            </p>
          </details>
        ))}
      </div>

      <Link className="btn btn-primary" style={{ marginTop: 14 }} to="/contact">
        {s.contactCta}
      </Link>
    </div>
  )
}
