import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'

export default function Moderation() {
  const [reports, setReports] = useState([])
  const [logs, setLogs] = useState([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [reportData, logData] = await Promise.all([api.get('/api/admin/reports'), api.get('/api/admin/audit-logs?limit=100')])
      setReports(reportData.reports)
      setLogs(logData.logs)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handle = async (report, body) => {
    setError('')
    try {
      await api.patch(`/api/admin/reports/${report.id}`, body)
      setMessage(`تم تحديث البلاغ #${report.id}`)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <h1>البلاغات وسجل التدقيق</h1>
      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <h2>البلاغات</h2>
      <div className="panel table-wrap">
        <table data-testid="admin-reports-table">
          <thead>
            <tr>
              <th>#</th>
              <th>المُبلّغ</th>
              <th>الهدف</th>
              <th>السبب</th>
              <th>الحالة</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr key={report.id}>
                <td>{report.id}</td>
                <td className="muted">{report.reporter_username}</td>
                <td className="muted">
                  {report.target_type} #{report.target_id}
                </td>
                <td>
                  {report.reason}
                  <div className="muted">{report.details}</div>
                </td>
                <td>
                  <span className="pill">{report.status}</span>
                </td>
                <td>
                  <div className="row">
                    <button type="button" className="btn" onClick={() => handle(report, { status: 'reviewing' })}>
                      قيد المراجعة
                    </button>
                    <button type="button" className="btn" onClick={() => handle(report, { status: 'resolved' })}>
                      حلّ البلاغ
                    </button>
                    {report.target_type === 'user' ? (
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => handle(report, { status: 'resolved', action: 'ban_user' })}
                      >
                        حظر المستخدم
                      </button>
                    ) : null}
                    {report.target_type === 'room' ? (
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => handle(report, { status: 'resolved', action: 'close_room' })}
                      >
                        إغلاق الغرفة
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>سجل التدقيق (من نفّذ ماذا ومتى)</h2>
      <div className="panel table-wrap">
        <table data-testid="admin-audit-table">
          <thead>
            <tr>
              <th>#</th>
              <th>الوقت</th>
              <th>المنفّذ</th>
              <th>الإجراء</th>
              <th>الهدف</th>
              <th>التفاصيل</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{log.id}</td>
                <td className="muted">{new Date(log.created_at).toLocaleString('ar')}</td>
                <td>{log.actor_username}</td>
                <td>{log.action}</td>
                <td className="muted">
                  {log.target_type} {log.target_id}
                </td>
                <td className="muted" style={{ direction: 'ltr', maxWidth: 320, overflowWrap: 'anywhere' }}>
                  {JSON.stringify(log.details)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
