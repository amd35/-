import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'

const EMPTY = { name: '', name_en: '', category: 'normal', emoji: '🎁', price_diamonds: 100, price_gold: 0, target: 'both', sort: 99 }

export default function GiftsAdmin() {
  const [gifts, setGifts] = useState([])
  const [draft, setDraft] = useState(EMPTY)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await api.get('/api/admin/gifts')
      setGifts(data.gifts)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const patch = async (gift, body) => {
    setError('')
    try {
      await api.patch(`/api/admin/gifts/${gift.id}`, body)
      setMessage(`تم تحديث ${gift.name}`)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const create = async (event) => {
    event.preventDefault()
    setError('')
    try {
      await api.post('/api/admin/gifts', { ...draft, price_diamonds: Number(draft.price_diamonds), price_gold: Number(draft.price_gold) })
      setDraft(EMPTY)
      setMessage('تمت إضافة هدية جديدة')
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <h1>الهدايا والأسعار</h1>
      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <div className="panel table-wrap">
        <table data-testid="admin-gifts-table">
          <thead>
            <tr>
              <th>#</th>
              <th>الهدية</th>
              <th>الفئة</th>
              <th>سعر الماس</th>
              <th>سعر الذهب</th>
              <th>الهدف</th>
              <th>مفعّلة</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {gifts.map((gift) => (
              <tr key={gift.id}>
                <td>{gift.id}</td>
                <td>
                  {gift.emoji} <strong>{gift.name}</strong>
                  <div className="muted">{gift.name_en}</div>
                </td>
                <td className="muted">{gift.category}</td>
                <td>
                  <input
                    type="number"
                    defaultValue={gift.price_diamonds}
                    style={{ width: 110 }}
                    onBlur={(event) => Number(event.target.value) !== gift.price_diamonds && patch(gift, { price_diamonds: Number(event.target.value) })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    defaultValue={gift.price_gold}
                    style={{ width: 110 }}
                    onBlur={(event) => Number(event.target.value) !== gift.price_gold && patch(gift, { price_gold: Number(event.target.value) })}
                  />
                </td>
                <td className="muted">{gift.target}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={gift.active}
                    onChange={(event) => patch(gift, { active: event.target.checked })}
                    style={{ width: 18 }}
                  />
                </td>
                <td>
                  <button type="button" className="btn btn-danger" onClick={() => patch(gift, { active: false })}>
                    تعطيل
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form className="panel" onSubmit={create}>
        <h2>إضافة هدية</h2>
        <div className="grid">
          <div className="field">
            <label>الاسم</label>
            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
          </div>
          <div className="field">
            <label>الاسم بالإنجليزية</label>
            <input value={draft.name_en} onChange={(event) => setDraft({ ...draft, name_en: event.target.value })} />
          </div>
          <div className="field">
            <label>الرمز</label>
            <input value={draft.emoji} onChange={(event) => setDraft({ ...draft, emoji: event.target.value })} />
          </div>
          <div className="field">
            <label>الفئة</label>
            <select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>
              <option value="normal">عادية</option>
              <option value="premium">مميزة</option>
              <option value="luxury">فاخرة</option>
            </select>
          </div>
          <div className="field">
            <label>سعر الماس</label>
            <input type="number" value={draft.price_diamonds} onChange={(event) => setDraft({ ...draft, price_diamonds: event.target.value })} />
          </div>
          <div className="field">
            <label>سعر الذهب</label>
            <input type="number" value={draft.price_gold} onChange={(event) => setDraft({ ...draft, price_gold: event.target.value })} />
          </div>
          <div className="field">
            <label>الهدف</label>
            <select value={draft.target} onChange={(event) => setDraft({ ...draft, target: event.target.value })}>
              <option value="both">مستخدم وغرفة</option>
              <option value="user">مستخدم</option>
              <option value="room">غرفة</option>
            </select>
          </div>
        </div>
        <button type="submit" className="btn btn-primary">
          إضافة
        </button>
      </form>
    </div>
  )
}
