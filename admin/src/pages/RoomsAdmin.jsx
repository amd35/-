import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'

export default function RoomsAdmin() {
  const [rooms, setRooms] = useState([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await api.get('/api/admin/rooms')
      setRooms(data.rooms)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const patch = async (room, body) => {
    setError('')
    try {
      await api.patch(`/api/admin/rooms/${room.id}`, body)
      setMessage(`تم تحديث ${room.name}`)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const close = async (room) => {
    try {
      await api.del(`/api/admin/rooms/${room.id}`)
      setMessage(`تم إغلاق ${room.name}`)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <h1>الغرف</h1>
      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
      <div className="panel table-wrap">
        <table data-testid="admin-rooms-table">
          <thead>
            <tr>
              <th>#</th>
              <th>الغرفة</th>
              <th>المالك</th>
              <th>الأعضاء</th>
              <th>الحالة</th>
              <th>الهدايا</th>
              <th>الدردشة</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => (
              <tr key={room.id}>
                <td>{room.id}</td>
                <td>
                  <strong>{room.name}</strong>
                  <div className="muted">{room.seat_count} مقعد</div>
                </td>
                <td className="muted">{room.owner_username}</td>
                <td>{room.member_count}</td>
                <td>
                  <span className="pill">{room.status}</span>
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={room.gifts_enabled}
                    onChange={(event) => patch(room, { gifts_enabled: event.target.checked })}
                    style={{ width: 18 }}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={room.chat_enabled}
                    onChange={(event) => patch(room, { chat_enabled: event.target.checked })}
                    style={{ width: 18 }}
                  />
                </td>
                <td>
                  <div className="row">
                    <button
                      type="button"
                      className="btn"
                      onClick={() => patch(room, { status: room.status === 'open' ? 'closed' : 'open' })}
                    >
                      {room.status === 'open' ? 'إغلاق' : 'فتح'}
                    </button>
                    <button type="button" className="btn btn-danger" onClick={() => close(room)}>
                      إغلاق نهائي
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
