import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'

// The panel polls the server on this interval so the numbers stay current.
const REFRESH_MS = 15000

const GAME_STATUS = { waiting: 'بانتظار اللاعبين', playing: 'جارية' }

const KIND_LABEL = {
  reward: 'مكافأة',
  gift_sent: 'هدية مُرسلة',
  gift_received: 'هدية مُستلمة',
  transfer_in: 'تحويل وارد',
  transfer_out: 'تحويل صادر',
  recharge: 'شحن رصيد',
  withdrawal: 'سحب',
  admin_adjust: 'تعديل إداري من اللوحة',
  purchase: 'شراء من المتجر',
}

const CURRENCY_LABEL = { gold: 'ذهب', diamonds: 'ماس' }

const number = (value) => Number(value || 0).toLocaleString('en-US')

const clock = (value) => (value ? new Date(value).toLocaleTimeString('en-GB') : '—')

/**
 * Admin command panel: live user activity, active game tables and the wallet
 * flow of the last 24 hours. Every figure is read from the database through
 * `/api/admin/stats`, which is restricted to administrators on the server.
 */
export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const load = useCallback(async () => {
    try {
      setStats(await api.get('/api/admin/stats'))
      setUpdatedAt(new Date())
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!autoRefresh) return undefined
    const timer = window.setInterval(load, REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [autoRefresh, load])

  const header = (
    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <h1>لوحة التحكم</h1>
        <p className="muted">
          للمشرفين فقط · {autoRefresh ? `تحديث تلقائي كل ${REFRESH_MS / 1000} ثانية` : 'التحديث التلقائي متوقف'} · آخر تحديث{' '}
          {updatedAt ? clock(updatedAt) : '—'}
        </p>
      </div>
      <div className="row">
        <button
          type="button"
          className="btn"
          onClick={() => setAutoRefresh((on) => !on)}
          data-testid="admin-live-toggle"
        >
          {autoRefresh ? 'إيقاف التحديث التلقائي' : 'تشغيل التحديث التلقائي'}
        </button>
        <button type="button" className="btn btn-primary" onClick={load} data-testid="admin-refresh">
          تحديث الآن
        </button>
      </div>
    </div>
  )

  if (error && !stats) {
    return (
      <div>
        {header}
        <p className="error" data-testid="admin-dashboard-error">
          {error}
        </p>
      </div>
    )
  }

  if (!stats) {
    return (
      <div>
        {header}
        <p className="muted">…</p>
      </div>
    )
  }

  const { users, activity, rooms, game_rooms: games, wallet } = stats

  const activityCards = [
    ['متصل الآن', users.online],
    ['نشط خلال 15 دقيقة', activity.active_15m],
    ['نشط اليوم', activity.active_today],
    ['حسابات جديدة اليوم', users.new_today],
    ['داخل غرف الصوت', activity.in_voice_rooms],
    ['أعضاء على المقاعد', activity.seated],
    ['إجمالي المستخدمين', users.total],
    ['حسابات محظورة', users.banned],
  ]

  const followUpCards = [
    ['غرف صوتية مفتوحة', `${rooms.open} / ${rooms.total}`],
    ['أعضاء VIP', users.vip],
    ['طلبات شحن معلّقة', stats.orders.pending],
    ['طلبات سحب معلّقة', stats.withdrawals.pending],
    ['بلاغات مفتوحة', stats.reports.open],
    ['هدايا اليوم', stats.gifts.sent_today],
    ['إيراد IQD', number(stats.orders.revenue_iqd)],
    ['إيراد USD', (stats.orders.revenue_usd_cents / 100).toFixed(2)],
  ]

  return (
    <div data-testid="admin-dashboard">
      {header}
      {error ? <p className="error">{error}</p> : null}

      <h2>نشاط المستخدمين الآن</h2>
      <div className="grid" data-testid="admin-stats">
        {activityCards.map(([label, value]) => (
          <div className="stat" key={label}>
            <span>{label}</span>
            <strong>{number(value)}</strong>
          </div>
        ))}
      </div>

      <h2>الطاولات النشطة</h2>
      <div className="panel" data-testid="admin-live-tables">
        <div className="row">
          <span className="pill">بانتظار اللاعبين: {number(games.waiting)}</span>
          <span className="pill">جارية الآن: {number(games.playing)}</span>
          <span className="pill">لاعبون على الطاولات: {number(games.players)}</span>
          <span className="pill">انتهت اليوم: {number(games.finished_today)}</span>
        </div>

        {games.tables.length === 0 ? (
          <p className="muted" style={{ marginBottom: 0 }}>
            لا توجد طاولات نشطة الآن.
          </p>
        ) : (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>اللعبة</th>
                  <th>الطاولة</th>
                  <th>صاحب الطاولة</th>
                  <th>اللاعبون</th>
                  <th>الحالة</th>
                  <th>بدأت</th>
                </tr>
              </thead>
              <tbody>
                {games.tables.map((table) => (
                  <tr key={table.id}>
                    <td>{table.id}</td>
                    <td>{table.game_name}</td>
                    <td>{table.name}</td>
                    <td className="muted">{table.host || '—'}</td>
                    <td>
                      {table.player_count} / {table.max_players}
                    </td>
                    <td>
                      <span className="pill">{GAME_STATUS[table.status] || table.status}</span>
                    </td>
                    <td className="muted">{clock(table.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <h2>حركات المحفظة — آخر {wallet.window_hours} ساعة</h2>
      <div className="panel" data-testid="admin-wallet-flow">
        <div className="grid">
          {['gold', 'diamonds'].map((currency) => {
            const values = wallet.flow[currency]
            return (
              <div className="stat" key={currency}>
                <span>{CURRENCY_LABEL[currency]} — داخل / خارج</span>
                <strong>
                  +{number(values.in)} / -{number(values.out)}
                </strong>
                <span className="muted">
                  الصافي {number(values.net)} · {number(values.entries)} حركة
                </span>
              </div>
            )
          })}
          <div className="stat">
            <span>إجمالي الأرصدة الموجودة</span>
            <strong>{number(wallet.circulating.gold)}</strong>
            <span className="muted">
              ذهب · {number(wallet.circulating.diamonds)} ماس
            </span>
          </div>
        </div>

        {wallet.by_kind.length === 0 ? (
          <p className="muted" style={{ marginBottom: 0 }}>
            لا حركات في هذه الفترة.
          </p>
        ) : (
          <div className="table-wrap" style={{ marginTop: 14 }}>
            <table data-testid="admin-wallet-kinds">
              <thead>
                <tr>
                  <th>نوع الحركة</th>
                  <th>العملة</th>
                  <th>الصافي</th>
                  <th>عدد الحركات</th>
                </tr>
              </thead>
              <tbody>
                {wallet.by_kind.map((row) => (
                  <tr key={`${row.kind}-${row.currency}`}>
                    <td>{KIND_LABEL[row.kind] || row.kind}</td>
                    <td className="muted">{CURRENCY_LABEL[row.currency] || row.currency}</td>
                    <td className={row.total < 0 ? 'error' : 'success'}>{number(row.total)}</td>
                    <td>{number(row.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h2>أحدث الحركات</h2>
        {wallet.recent.length === 0 ? (
          <p className="muted" style={{ marginBottom: 0 }}>
            لا توجد حركات مسجّلة.
          </p>
        ) : (
          <div className="table-wrap">
            <table data-testid="admin-wallet-recent">
              <thead>
                <tr>
                  <th>#</th>
                  <th>المستخدم</th>
                  <th>النوع</th>
                  <th>المبلغ</th>
                  <th>الرصيد بعدها</th>
                  <th>الوقت</th>
                </tr>
              </thead>
              <tbody>
                {wallet.recent.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.id}</td>
                    <td className="muted">{entry.username}</td>
                    <td>{KIND_LABEL[entry.kind] || entry.kind}</td>
                    <td className={entry.amount < 0 ? 'error' : 'success'}>
                      {entry.amount > 0 ? '+' : ''}
                      {number(entry.amount)} {CURRENCY_LABEL[entry.currency] || entry.currency}
                    </td>
                    <td className="muted">{number(entry.balance_after)}</td>
                    <td className="muted">{new Date(entry.created_at).toLocaleString('en-GB')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <h2>المتابعة اليومية</h2>
      <div className="grid">
        {followUpCards.map(([label, value]) => (
          <div className="stat" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>

      <h2>حالة الخدمات الخارجية</h2>
      <div className="panel">
        <p className="muted">
          البريد: {stats.service.mail_configured ? 'مُعد' : 'غير مُعد'} · الدفع:{' '}
          {stats.service.payments_configured ? 'مُعد' : 'غير مُعد'} · خادم TURN:{' '}
          {stats.service.turn_configured ? 'مُعد' : 'غير مُعد'}
        </p>
        <p className="muted">
          بدون مزود دفع لن يُضاف أي رصيد تلقائياً؛ تبقى الطلبات معلّقة حتى تأكيد مزود الدفع أو موافقة الإدارة.
        </p>
      </div>
    </div>
  )
}
