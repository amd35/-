import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'

export default function Users({ admin }) {
  const [users, setUsers] = useState([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [adjust, setAdjust] = useState({ currency: 'coins', amount: 100, note: '' })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await api.get(`/api/admin/users${query ? `?query=${encodeURIComponent(query)}` : ''}`)
      setUsers(data.users)
    } catch (err) {
      setError(err.message)
    }
  }, [query])

  useEffect(() => {
    load()
  }, [load])

  const patch = async (body) => {
    setError('')
    try {
      const result = await api.patch(`/api/admin/users/${selected.id}`, body)
      setSelected({ ...selected, ...result.user, wallet: result.wallet })
      setMessage('تم التحديث')
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const adjustWallet = async (event) => {
    event.preventDefault()
    setError('')
    try {
      const result = await api.post(`/api/admin/users/${selected.id}/wallet`, {
        currency: adjust.currency,
        amount: Number(adjust.amount),
        note: adjust.note || 'تعديل إداري',
      })
      setSelected({ ...selected, wallet: result.wallet })
      setMessage(`تم تعديل الرصيد (${result.wallet.coins} كوين / ${result.wallet.gold} ذهب)`)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <h1>المستخدمون</h1>
      <div className="panel">
        <div className="row">
          <input
            data-testid="admin-user-search"
            placeholder="ابحث بالاسم أو البريد أو الهاتف"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="button" className="btn" onClick={load}>
            بحث
          </button>
        </div>
      </div>

      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error" data-testid="admin-users-error">{error}</p> : null}

      <div className="panel table-wrap">
        <table data-testid="admin-users-table">
          <thead>
            <tr>
              <th>#</th>
              <th>المستخدم</th>
              <th>البريد/الهاتف</th>
              <th>الحالة</th>
              <th>الرصيد</th>
              <th>الدور</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.id}</td>
                <td>
                  <strong>{user.display_name}</strong>
                  <div className="muted">@{user.username}</div>
                </td>
                <td className="muted">{user.email || user.phone || '—'}</td>
                <td>
                  <span className="pill">{user.status}</span>
                </td>
                <td>🪙 {user.wallet.coins} · 🏆 {user.wallet.gold}</td>
                <td className="muted">{user.is_admin ? user.admin_role : '—'}</td>
                <td>
                  <button type="button" className="btn" onClick={() => setSelected(user)}>
                    إدارة
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="panel" data-testid="admin-user-panel">
          <h2>إدارة: {selected.username}</h2>
          <div className="row">
            <label style={{ margin: 0 }}>حالة الحساب</label>
            <select
              value={selected.status}
              onChange={(event) => patch({ status: event.target.value, note: 'تحديث إداري' })}
              style={{ width: 160 }}
            >
              {['active', 'suspended', 'banned', 'deleted'].map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <button type="button" className="btn" onClick={() => patch({ vip_days: 30 })}>
              +30 يوم VIP
            </button>
            {admin.role === 'owner' ? (
              <>
                <button type="button" className="btn" onClick={() => patch({ is_admin: !selected.is_admin, admin_role: selected.is_admin ? '' : 'support' })}>
                  {selected.is_admin ? 'إزالة صلاحية الإدارة' : 'منح صلاحية الإدارة'}
                </button>
                <select
                  value={selected.admin_role || ''}
                  onChange={(event) => patch({ admin_role: event.target.value })}
                  style={{ width: 150 }}
                >
                  <option value="">بدون</option>
                  <option value="owner">owner</option>
                  <option value="admin">admin</option>
                  <option value="moderator">moderator</option>
                  <option value="support">support</option>
                </select>
              </>
            ) : null}
            <button type="button" className="btn" onClick={() => setSelected(null)}>
              إغلاق
            </button>
          </div>

          <form className="row" style={{ marginTop: 14 }} onSubmit={adjustWallet}>
            <div>
              <label>العملة</label>
              <select value={adjust.currency} onChange={(event) => setAdjust({ ...adjust, currency: event.target.value })}>
                <option value="coins">كوين</option>
                <option value="gold">ذهب</option>
              </select>
            </div>
            <div>
              <label>المبلغ (± )</label>
              <input
                type="number"
                value={adjust.amount}
                onChange={(event) => setAdjust({ ...adjust, amount: event.target.value })}
              />
            </div>
            <div>
              <label>ملاحظة</label>
              <input value={adjust.note} onChange={(event) => setAdjust({ ...adjust, note: event.target.value })} />
            </div>
            <button type="submit" className="btn btn-gold" data-testid="admin-adjust-wallet">
              تعديل الرصيد
            </button>
          </form>
          <p className="muted">كل تعديل يُسجّل في سجل التدقيق وفي سجل العمليات المالية للمستخدم.</p>
        </div>
      ) : null}
    </div>
  )
}
