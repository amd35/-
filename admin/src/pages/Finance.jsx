import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'

export default function Finance() {
  const [orders, setOrders] = useState([])
  const [withdrawals, setWithdrawals] = useState([])
  const [note, setNote] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [payment, setPayment] = useState(null)

  const load = useCallback(async () => {
    try {
      const [orderData, withdrawalData, paymentStatus] = await Promise.all([
        api.get('/api/admin/orders'),
        api.get('/api/admin/withdrawals'),
        api.get('/api/payments/status'),
      ])
      setOrders(orderData.orders)
      setWithdrawals(withdrawalData.requests)
      setPayment(paymentStatus)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const decideOrder = async (order, action) => {
    setError('')
    try {
      await api.post(`/api/admin/orders/${order.id}/${action}`, { note })
      setMessage(action === 'approve' ? `تم تأكيد الطلب #${order.id} وإضافة الرصيد` : `تم رفض الطلب #${order.id}`)
      setNote('')
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const decideWithdrawal = async (request, action) => {
    setError('')
    try {
      await api.post(`/api/admin/withdrawals/${request.id}/${action}`, { note })
      setMessage(action === 'approve' ? `تمت الموافقة على طلب السحب #${request.id}` : `تم رفض طلب السحب #${request.id} وإرجاع الرصيد`)
      setNote('')
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <h1>الشحن والسحب</h1>
      {payment ? (
        <div className="panel">
          <p className={payment.configured ? 'success' : 'error'} data-testid="finance-payment-status">
            {payment.configured ? 'مزود الدفع مُعد — يُضاف الرصيد بعد تأكيد الدفع.' : payment.message}
          </p>
          <p className="muted">
            تأكيد الإدارة يضيف الرصيد مرة واحدة فقط (مرجع فريد لكل طلب) ويسجّل العملية في سجل التدقيق.
          </p>
        </div>
      ) : null}

      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <div className="panel">
        <label>ملاحظة تُرفق بالقرار</label>
        <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="مثال: تم التحقق من التحويل" />
      </div>

      <h2>طلبات الشحن</h2>
      <div className="panel table-wrap">
        <table data-testid="admin-orders-table">
          <thead>
            <tr>
              <th>#</th>
              <th>المستخدم</th>
              <th>الرصيد</th>
              <th>السعر</th>
              <th>الحالة</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>{order.id}</td>
                <td className="muted">{order.username}</td>
                <td>
                  {order.amount} {order.currency === 'gold' ? '🏆' : '💎'}
                </td>
                <td>
                  {order.price_amount} {order.price_currency}
                </td>
                <td>
                  <span className="pill">{order.status}</span>
                </td>
                <td>
                  {order.status === 'pending' ? (
                    <div className="row">
                      <button type="button" className="btn btn-gold" onClick={() => decideOrder(order, 'approve')}>
                        تأكيد الدفع
                      </button>
                      <button type="button" className="btn btn-danger" onClick={() => decideOrder(order, 'reject')}>
                        رفض
                      </button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>طلبات السحب</h2>
      <div className="panel table-wrap">
        <table data-testid="admin-withdrawals-table">
          <thead>
            <tr>
              <th>#</th>
              <th>المستخدم</th>
              <th>المبلغ</th>
              <th>الرسم</th>
              <th>الصافي</th>
              <th>الطريقة</th>
              <th>الحالة</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {withdrawals.map((request) => (
              <tr key={request.id}>
                <td>{request.id}</td>
                <td className="muted">{request.username}</td>
                <td>{request.amount}</td>
                <td>{request.fee}</td>
                <td>{request.net_amount}</td>
                <td className="muted">
                  {request.method}
                  <div className="muted">{JSON.stringify(request.beneficiary)}</div>
                </td>
                <td>
                  <span className="pill">{request.status}</span>
                </td>
                <td>
                  {request.status === 'pending' ? (
                    <div className="row">
                      <button type="button" className="btn btn-gold" onClick={() => decideWithdrawal(request, 'approve')}>
                        موافقة
                      </button>
                      <button type="button" className="btn btn-danger" onClick={() => decideWithdrawal(request, 'reject')}>
                        رفض
                      </button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">
        الدفع الفعلي للمستفيد يتم من مزود الدفع؛ اللوحة تعتمد الطلب فقط. المبالغ الافتراضية لا تُحوَّل نقداً إلا وفق قواعد النظام.
      </p>
    </div>
  )
}
