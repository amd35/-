import PageBar from '../components/PageBar.jsx'
import { api } from '../lib/api.js'
import { useRemote } from '../lib/hooks.js'
import { useAuth } from '../lib/store.jsx'
import { usePageText } from '../lib/pageText.js'

/** Administrator-only trail of recorded system actions. */
export default function ActivityLog() {
  const { user } = useAuth()
  const s = usePageText()
  const isAdmin = Boolean(user.is_admin)

  const { data, error, loading, reload } = useRemote(
    async () => (isAdmin ? api.get('/api/admin/audit-logs?limit=100') : null),
    [isAdmin],
  )

  return (
    <div data-testid="activity-log-page">
      <PageBar title={s.activityLog} back="/dashboard" testId="activity-log">
        {isAdmin ? (
          <button type="button" className="btn btn-small" onClick={reload} disabled={loading}>
            {s.recheck}
          </button>
        ) : null}
      </PageBar>

      <p className="muted" style={{ margin: '0 2px 12px' }}>
        {s.activityLogSub}
      </p>

      {!isAdmin ? (
        <p className="notice" data-testid="activity-admin-only">
          {s.adminOnly}
        </p>
      ) : null}

      {error ? <p className="error-text">{error}</p> : null}
      {loading && isAdmin ? <p className="muted">{s.loading}</p> : null}

      {isAdmin && data ? (
        <div className="card glass">
          {data.logs.length === 0 ? <p className="muted">{s.noLogs}</p> : null}
          {data.logs.map((log) => (
            <div className="list-item" key={log.id} data-testid="activity-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{log.action}</strong>
                <div className="muted">
                  {s.actor}: {log.actor_username} · {s.target}: {log.target_type || '—'}
                  {log.target_id ? `#${log.target_id}` : ''}
                </div>
              </div>
              <span className="muted">{new Date(log.created_at).toLocaleString('en')}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
