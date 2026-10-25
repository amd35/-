import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'

/**
 * إدارة مستويات رويال: عتبة النقاط المطلوبة لكل مستوى (قواعد الترقية مستقلة عن
 * النقاط المكتسبة من الشحن)، وحزم الجواهر ونقاط رويال التي تمنحها.
 */
export default function RoyalAdmin() {
  const [tiers, setTiers] = useState([])
  const [packages, setPackages] = useState([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await api.get('/api/admin/royal')
      setTiers(data.tiers)
      setPackages(data.packages)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const patchTier = async (tier, body) => {
    setError('')
    try {
      await api.patch(`/api/admin/royal/tiers/${tier.level}`, body)
      setMessage(`تم تحديث ${tier.name_ar}`)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const patchPack = async (pack, body) => {
    setError('')
    try {
      await api.patch(`/api/admin/packs/${pack.id}`, body)
      setMessage(`تم تحديث ${pack.name}`)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <h1>مستويات رويال</h1>
      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <p className="muted">
        نقاط رويال تُكتسب من شحن حزم الجواهر فقط، والمستوى يُحسب بأعلى عتبة تجاوزتها نقاط العضو. غيّر العتبات
        هنا فتظهر للمستخدمين فوراً.
      </p>

      <div className="panel table-wrap">
        <table data-testid="admin-royal-tiers">
          <thead>
            <tr>
              <th>المستوى</th>
              <th>الاسم</th>
              <th>النقاط المطلوبة</th>
              <th>عدد الامتيازات</th>
              <th>لون التاج</th>
              <th>مفعّل</th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((tier) => (
              <tr key={tier.level}>
                <td>{tier.level}</td>
                <td>
                  <strong>{tier.name_ar}</strong>
                  <div className="muted">{tier.name_en}</div>
                </td>
                <td>
                  <input
                    type="number"
                    defaultValue={tier.required_points}
                    style={{ width: 120 }}
                    data-testid={`tier-points-${tier.level}`}
                    onBlur={(event) =>
                      Number(event.target.value) !== tier.required_points &&
                      patchTier(tier, { required_points: Number(event.target.value) })
                    }
                  />
                </td>
                <td>{(tier.privileges || []).length}</td>
                <td>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 18,
                      height: 18,
                      borderRadius: 6,
                      background: tier.accent,
                      border: '1px solid rgba(255,255,255,0.35)',
                      verticalAlign: 'middle',
                    }}
                  />{' '}
                  <span className="muted">{tier.accent}</span>
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={tier.active}
                    style={{ width: 18 }}
                    data-testid={`tier-active-${tier.level}`}
                    onChange={(event) => patchTier(tier, { active: event.target.checked })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel table-wrap">
        <h2>حزم الجواهر ونقاط رويال</h2>
        <table data-testid="admin-royal-packages">
          <thead>
            <tr>
              <th>#</th>
              <th>الحزمة</th>
              <th>الجواهر</th>
              <th>نقاط رويال</th>
              <th>السعر IQD</th>
              <th>السعر USD (سنت)</th>
              <th>مفعّلة</th>
            </tr>
          </thead>
          <tbody>
            {packages.map((pack) => (
              <tr key={pack.id}>
                <td>{pack.id}</td>
                <td>{pack.name}</td>
                <td>{pack.amount.toLocaleString('en')}</td>
                <td>
                  <input
                    type="number"
                    defaultValue={pack.royal_points}
                    style={{ width: 110 }}
                    data-testid={`pack-points-${pack.id}`}
                    onBlur={(event) =>
                      Number(event.target.value) !== pack.royal_points &&
                      patchPack(pack, { royal_points: Number(event.target.value) })
                    }
                  />
                </td>
                <td>{pack.price_iqd.toLocaleString('en')}</td>
                <td>{pack.price_usd_cents}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={pack.active}
                    style={{ width: 18 }}
                    onChange={(event) => patchPack(pack, { active: event.target.checked })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
