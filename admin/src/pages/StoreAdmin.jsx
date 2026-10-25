import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'

const EMPTY = {
  kind: 'gold',
  name: '',
  amount: 500,
  bonus: 0,
  royal_points: 0,
  price_iqd: 5000,
  price_usd_cents: 399,
  badge: '',
  sort: 99,
}

export default function StoreAdmin() {
  const [packs, setPacks] = useState([])
  const [draft, setDraft] = useState(EMPTY)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await api.get('/api/admin/packs')
      setPacks(data.packs)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const patch = async (pack, body) => {
    setError('')
    try {
      await api.patch(`/api/admin/packs/${pack.id}`, body)
      setMessage(`تم تحديث ${pack.name}`)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const create = async (event) => {
    event.preventDefault()
    try {
      await api.post('/api/admin/packs', {
        ...draft,
        amount: Number(draft.amount),
        bonus: Number(draft.bonus),
        royal_points: Number(draft.royal_points),
        price_iqd: Number(draft.price_iqd),
        price_usd_cents: Number(draft.price_usd_cents),
      })
      setDraft(EMPTY)
      setMessage('تمت إضافة باقة')
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <h1>المتجر والباقات</h1>
      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <div className="panel table-wrap">
        <table data-testid="admin-packs-table">
          <thead>
            <tr>
              <th>#</th>
              <th>الباقة</th>
              <th>النوع</th>
              <th>الكمية</th>
              <th>المكافأة</th>
              <th>نقاط رويال</th>
              <th>السعر IQD</th>
              <th>السعر USD (سنت)</th>
              <th>مفعّلة</th>
            </tr>
          </thead>
          <tbody>
            {packs.map((pack) => (
              <tr key={pack.id}>
                <td>{pack.id}</td>
                <td>
                  <strong>{pack.name}</strong>
                  <div className="muted">{pack.badge}</div>
                </td>
                <td className="muted">{pack.kind}</td>
                <td>{pack.amount}</td>
                <td>{pack.bonus}</td>
                <td>
                  <input
                    type="number"
                    defaultValue={pack.royal_points}
                    style={{ width: 110 }}
                    data-testid={`pack-royal-points-${pack.id}`}
                    onBlur={(event) =>
                      Number(event.target.value) !== pack.royal_points &&
                      patch(pack, { royal_points: Number(event.target.value) })
                    }
                  />
                </td>
                <td>
                  <input
                    type="number"
                    defaultValue={pack.price_iqd}
                    style={{ width: 120 }}
                    onBlur={(event) => Number(event.target.value) !== pack.price_iqd && patch(pack, { price_iqd: Number(event.target.value) })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    defaultValue={pack.price_usd_cents}
                    style={{ width: 120 }}
                    onBlur={(event) =>
                      Number(event.target.value) !== pack.price_usd_cents && patch(pack, { price_usd_cents: Number(event.target.value) })
                    }
                  />
                </td>
                <td>
                  <input type="checkbox" checked={pack.active} onChange={(event) => patch(pack, { active: event.target.checked })} style={{ width: 18 }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form className="panel" onSubmit={create}>
        <h2>إضافة باقة</h2>
        <div className="grid">
          <div className="field">
            <label>النوع</label>
            <select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value })}>
              <option value="gold">ذهب (حزمة رويال)</option>
              <option value="diamonds">ماس (حزمة رويال)</option>
            </select>
          </div>
          <div className="field">
            <label>الاسم</label>
            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
          </div>
          <div className="field">
            <label>الكمية</label>
            <input type="number" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} />
          </div>
          <div className="field">
            <label>المكافأة</label>
            <input type="number" value={draft.bonus} onChange={(event) => setDraft({ ...draft, bonus: event.target.value })} />
          </div>
          <div className="field">
            <label>نقاط رويال</label>
            <input
              type="number"
              value={draft.royal_points}
              onChange={(event) => setDraft({ ...draft, royal_points: event.target.value })}
            />
          </div>
          <div className="field">
            <label>السعر بالدينار</label>
            <input type="number" value={draft.price_iqd} onChange={(event) => setDraft({ ...draft, price_iqd: event.target.value })} />
          </div>
          <div className="field">
            <label>السعر بالدولار (سنت)</label>
            <input type="number" value={draft.price_usd_cents} onChange={(event) => setDraft({ ...draft, price_usd_cents: event.target.value })} />
          </div>
        </div>
        <button type="submit" className="btn btn-primary">
          إضافة
        </button>
      </form>
    </div>
  )
}
