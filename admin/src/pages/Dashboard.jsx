import { useEffect, useState } from 'react'
import { api } from '../api.js'

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get('/api/admin/stats')
      .then(setStats)
      .catch((err) => setError(err.message))
  }, [])

  if (error) return <p className="error">{error}</p>
  if (!stats) return <p className="muted">…</p>

  const cards = [
    ['إجمالي المستخدمين', stats.users.total],
    ['متصل الآن', stats.users.online],
    ['حسابات جديدة اليوم', stats.users.new_today],
    ['حسابات محظورة', stats.users.banned],
    ['أعضاء VIP', stats.users.vip],
    ['الغرف', `${stats.rooms.open} / ${stats.rooms.total}`],
    ['طلبات شحن معلّقة', stats.orders.pending],
    ['طلبات سحب معلّقة', stats.withdrawals.pending],
    ['بلاغات مفتوحة', stats.reports.open],
    ['هدايا اليوم', stats.gifts.sent_today],
    ['إيراد IQD', stats.orders.revenue_iqd],
    ['إيراد USD', (stats.orders.revenue_usd_cents / 100).toFixed(2)],
  ]

  return (
    <div>
      <h1>الإحصائيات</h1>
      <div className="grid" data-testid="admin-stats">
        {cards.map(([label, value]) => (
          <div className="stat" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <h2>حالة الخدمات الخارجية</h2>
      <div className="panel">
        <p className="muted">
          البريد: {stats.service.mail_configured ? 'مُعد' : 'غير مُعد'} · الدفع: {stats.service.payments_configured ? 'مُعد' : 'غير مُعد'} · خادم TURN:{' '}
          {stats.service.turn_configured ? 'مُعد' : 'غير مُعد'}
        </p>
        <p className="muted">
          بدون مزود دفع لن يُضاف أي رصيد تلقائياً؛ تبقى الطلبات معلّقة حتى تأكيد مزود الدفع أو موافقة الإدارة.
        </p>
      </div>
    </div>
  )
}
