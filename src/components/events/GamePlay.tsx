import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  Coins,
  Crown,
  Flame,
  Loader2,
  Lock,
  Play,
  Sparkles,
  Trophy,
  Users,
  X,
} from 'lucide-react'
import { api, type Me } from '../../lib/api'
import {
  eventsApi,
  type EventQuestion,
  type GameEvent,
} from '../../lib/eventsApi'
import { prizeText, teamLabel } from '../../lib/eventFormat'

export default function GamePlay({
  event,
  onUpdated,
}: {
  event: GameEvent
  onUpdated: (event: GameEvent) => void
}) {
  const [me, setMe] = useState<Me | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [questions, setQuestions] = useState<EventQuestion[] | null>(null)
  const [answers, setAnswers] = useState<number[]>([])
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [team, setTeam] = useState<'violet' | 'fire'>('violet')

  useEffect(() => {
    api
      .me()
      .then((profile) => setMe(profile))
      .catch(() => undefined)
  }, [event.id])

  useEffect(() => {
    const participation = event.my_participation
    if (participation?.status === 'playing' && event.questions?.length) {
      setQuestions(event.questions)
      setAnswers((previous) =>
        event.questions!.map((_, index) =>
          typeof previous[index] === 'number' ? previous[index] : -1,
        ),
      )
      setResult(null)
    } else if (participation?.status === 'finished') {
      setQuestions(null)
      setResult(participation.detail ?? null)
    } else {
      setQuestions(null)
      setResult(null)
    }
  }, [event.id, event.my_participation?.status, event.questions])

  const canJoin = event.phase === 'active' || event.phase === 'ending'
  const playing = event.my_participation?.status === 'playing' && !!questions
  const finished = event.my_participation?.status === 'finished'

  async function joinNow() {
    setBusy(true)
    setError(null)
    try {
      const response = await eventsApi.join(
        event.id,
        event.game_key === 'group_game' ? { team } : {},
      )
      onUpdated(response.event)
      setConfirm(false)
      if (response.questions?.length) {
        setQuestions(response.questions)
        setAnswers(response.questions.map(() => -1))
      }
      if (response.result) setResult(response.result)
      if (event.entry_fee_gold > 0) {
        api.me().then(setMe).catch(() => undefined)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّرت المشاركة')
    } finally {
      setBusy(false)
    }
  }

  async function submitAnswers() {
    if (!questions) return
    if (answers.some((value) => value < 0)) {
      setError('أجب عن جميع الأسئلة قبل التسليم.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const response = await eventsApi.submit(event.id, answers)
      setResult(response.result ?? null)
      setQuestions(null)
      onUpdated(response.event)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر تسليم الإجابات')
    } finally {
      setBusy(false)
    }
  }

  const topPrize = event.prizes[0]
  const myRank = event.leaderboard.find(
    (row) => row.user_id === (event.my_participation?.user_id ?? 1),
  )?.rank

  return (
    <section className="glass-deep rounded-[26px] border border-gold/25 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-[10px] font-black tracking-wide text-gold uppercase">
            <Flame size={11} /> {event.game_name}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-blush-200/70">
            {event.game_rules || 'نتائج هذه اللعبة تُحسب على الخادم فقط.'}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-[10px] font-bold text-blush-200">
          ⏱ {event.game_duration} ثانية
        </span>
      </div>

      {error && (
        <p className="mt-3 flex items-start gap-1.5 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}

      {/* مسابقة الأسئلة: الإجابات تُقيَّم على الخادم */}
      {playing && questions && (
        <div className="mt-3 space-y-3" data-testid="quiz-form">
          {questions.map((question, questionIndex) => (
            <div
              key={`${questionIndex}-${question.prompt}`}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"
            >
              <p className="text-xs font-bold text-white">
                {questionIndex + 1}. {question.prompt}
              </p>
              <div className="mt-2 grid gap-1.5" role="radiogroup" aria-label={question.prompt}>
                {question.options.map((option, optionIndex) => {
                  const selected = answers[questionIndex] === optionIndex
                  return (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      data-testid={`quiz-option-${questionIndex}-${optionIndex}`}
                      onClick={() =>
                        setAnswers((current) => {
                          const next = [...current]
                          next[questionIndex] = optionIndex
                          return next
                        })
                      }
                      className={`rounded-xl border px-3 py-2 text-start text-[11px] font-semibold transition ${
                        selected
                          ? 'border-gold/60 bg-gold/15 text-gold'
                          : 'border-white/10 bg-white/[0.03] text-blush-100 hover:bg-white/[0.07]'
                      }`}
                    >
                      {option}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          <button
            type="button"
            data-testid="submit-quiz"
            onClick={submitAnswers}
            disabled={busy}
            className="gold-btn flex w-full items-center justify-center gap-1.5 rounded-full py-2.5 text-xs font-black disabled:opacity-60"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            تسليم الإجابات
          </button>
        </div>
      )}

      {/* النتيجة بعد المشاركة */}
      {finished && result && !playing && (
        <div className="mt-3 rounded-2xl border border-emerald-300/25 bg-emerald-400/[0.07] p-3" data-testid="event-result">
          <p className="flex items-center gap-1.5 text-xs font-black text-emerald-200">
            <CheckCircle2 size={14} /> {String(result.headline ?? 'تم تسجيل نتيجتك')}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-black text-amber-200">
              {event.my_participation?.score ?? 0} نقطة
            </span>
            {myRank ? (
              <span className="rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-[10px] font-bold text-blush-200">
                ترتيبك الحالي #{myRank}
              </span>
            ) : null}
            {event.my_participation?.team ? (
              <span className="rounded-full border border-fuchsia-300/25 bg-fuchsia-400/10 px-2.5 py-1 text-[10px] font-bold text-fuchsia-200">
                {teamLabel(event.my_participation.team)}
              </span>
            ) : null}
          </div>
          {typeof result.correct === 'number' && typeof result.total === 'number' && (
            <p className="mt-2 text-[10px] text-blush-200/65">
              إجابات صحيحة: {result.correct} من {result.total} — مكافأة سرعة {String(result.speed_bonus ?? 0)}
            </p>
          )}
          {Array.isArray(result.rounds) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(result.rounds as number[]).map((value, index) => (
                <span
                  key={`${index}-${value}`}
                  className="rounded-lg border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] font-bold text-blush-100"
                >
                  جولة {index + 1}: {value}
                </span>
              ))}
            </div>
          )}
          {typeof result.dice === 'number' && (
            <p className="mt-2 text-[10px] text-blush-200/65">
              النرد: {result.dice} — مكافأة الحظ: {String(result.bonus ?? 0)}
            </p>
          )}
          {typeof result.segment === 'string' && (
            <p className="mt-2 text-[10px] text-blush-200/65">القطاع: {result.segment}</p>
          )}
          {typeof result.box === 'number' && (
            <p className="mt-2 text-[10px] text-blush-200/65">الصندوق المفتوح: {result.box}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              to="/my-events"
              className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[10px] font-bold text-blush-100"
            >
              جوائزي وسجلي
            </Link>
            <Link
              to="/leaderboard"
              className="rounded-full border border-gold/30 bg-gold/10 px-3 py-1.5 text-[10px] font-bold text-gold"
            >
              المتصدرون
            </Link>
          </div>
        </div>
      )}

      {/* زر المشاركة */}
      {!event.joined && (
        <div className="mt-3">
          {canJoin ? (
            <button
              type="button"
              data-testid="join-event"
              onClick={() => {
                setError(null)
                setConfirm(true)
              }}
              className="gold-btn flex w-full items-center justify-center gap-1.5 rounded-full py-3 text-sm font-black transition active:scale-[0.99]"
            >
              <Play size={15} /> شارك الآن
            </button>
          ) : (
            <p className="flex items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.04] py-3 text-[11px] font-bold text-blush-200/60">
              <Lock size={13} /> المشاركة غير متاحة في هذه المرحلة
            </p>
          )}
          {!event.game_enabled && (
            <p className="mt-2 text-center text-[10px] font-bold text-amber-200/80">
              اللعبة موقوفة مؤقتًا من الإدارة.
            </p>
          )}
        </div>
      )}

      {event.joined && !playing && !finished && (
        <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] text-blush-200/60">
          لديك مشاركة مسجلة في هذه الفعالية.
        </p>
      )}

      {/* تأكيد المشاركة: الجائزة والشروط قبل الدفع */}
      {confirm && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="إغلاق"
            onClick={() => setConfirm(false)}
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="تأكيد المشاركة"
            className="glass-deep relative z-10 max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] border border-gold/25 p-4 sm:rounded-[28px]"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-black tracking-wide text-gold uppercase">قبل المشاركة</p>
                <h3 className="font-display mt-1 text-lg font-bold text-white">{event.title}</h3>
              </div>
              <button
                type="button"
                aria-label="إغلاق"
                onClick={() => setConfirm(false)}
                className="flex size-8 items-center justify-center rounded-full bg-white/10 text-white"
              >
                <X size={15} />
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {topPrize && (
                <div className="flex items-center gap-2 rounded-2xl border border-gold/30 bg-gold/10 px-3 py-2">
                  <Crown size={16} className="shrink-0 text-gold" />
                  <p className="text-[11px] font-bold text-gold">
                    الجائزة الأولى: {prizeText(topPrize)}
                  </p>
                </div>
              )}
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] leading-relaxed text-blush-200/80">
                <p className="mb-1 flex items-center gap-1 font-bold text-white">
                  <Trophy size={12} className="text-gold" /> طريقة اللعب
                </p>
                {event.rules || event.game_rules || 'تُحسب النتيجة على الخادم فور تأكيد المشاركة.'}
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] leading-relaxed text-blush-200/80">
                <p className="mb-1 flex items-center gap-1 font-bold text-white">
                  <Sparkles size={12} className="text-gold" /> الشروط
                </p>
                {event.conditions || 'مشاركة واحدة لكل حساب، ويُمنع التلاعب أو تعدد الحسابات.'}
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
                <span className="flex items-center gap-1 text-[11px] font-bold text-blush-100">
                  <Coins size={13} className="text-gold" /> رسوم الدخول
                </span>
                <span className="text-[11px] font-black text-amber-200">
                  {event.entry_fee_gold > 0 ? `${event.entry_fee_gold} ذهب` : 'مجانية'}
                </span>
              </div>
              {event.entry_fee_gold > 0 && (
                <p className="text-end text-[10px] text-blush-200/55">
                  رصيدك الحالي: {me?.gold ?? 0} ذهب
                </p>
              )}
              {event.game_key === 'group_game' && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
                  <p className="mb-1.5 text-[11px] font-bold text-white">اختر فريقك</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setTeam('violet')}
                      className={`rounded-xl border px-2 py-2 text-[11px] font-bold transition ${
                        team === 'violet'
                          ? 'border-fuchsia-300/60 bg-fuchsia-500/20 text-fuchsia-100'
                          : 'border-white/10 bg-white/[0.03] text-blush-200/70'
                      }`}
                    >
                      🟣 بنفسجي
                    </button>
                    <button
                      type="button"
                      onClick={() => setTeam('fire')}
                      className={`rounded-xl border px-2 py-2 text-[11px] font-bold transition ${
                        team === 'fire'
                          ? 'border-red-300/60 bg-red-500/20 text-red-100'
                          : 'border-white/10 bg-white/[0.03] text-blush-200/70'
                      }`}
                    >
                      🔥 ناري
                    </button>
                  </div>
                </div>
              )}
              <p className="flex items-center gap-1 text-[10px] text-blush-200/45">
                <Users size={10} /> {event.participants} مشارك حتى الآن · النتائج تُحسب على الخادم
              </p>
            </div>

            <button
              type="button"
              data-testid="confirm-join"
              onClick={joinNow}
              disabled={busy}
              className="gold-btn sticky bottom-0 mt-3 flex w-full items-center justify-center gap-1.5 rounded-full py-3 text-sm font-black shadow-[0_-8px_22px_rgba(8,3,20,0.75)] disabled:opacity-60"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Flame size={15} />}
              تأكيد المشاركة
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
