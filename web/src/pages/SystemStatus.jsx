import PageBar from '../components/PageBar.jsx'
import { api } from '../lib/api.js'
import { useRemote } from '../lib/hooks.js'
import { useAuth } from '../lib/store.jsx'
import { usePageText } from '../lib/pageText.js'

/** Live health of the services the app talks to — measured, not hard-coded. */
export default function SystemStatus() {
  const { socket } = useAuth()
  const s = usePageText()

  const { data, error, loading, reload } = useRemote(async () => {
    const started = performance.now()
    const health = await api.get('/api/health')
    const latency = Math.round(performance.now() - started)
    const [meta, payments] = await Promise.all([api.get('/api/meta/public'), api.get('/api/payments/status')])
    return { health, latency, meta, payments, checkedAt: new Date().toISOString() }
  })

  const socketOpen = socket && socket.readyState === WebSocket.OPEN

  const rows = [
    {
      key: 'api',
      label: s.apiService,
      value: data ? data.health.status : '—',
      ok: data?.health.status === 'ok',
      detail: 'GET /api/health',
    },
    {
      key: 'database',
      label: s.databaseService,
      value: data ? (data.health.database ? s.healthy : s.degraded) : '—',
      ok: Boolean(data?.health.database),
      detail: 'PostgreSQL',
    },
    {
      key: 'latency',
      label: s.latency,
      value: data ? `${data.latency} ms` : '—',
      ok: Boolean(data && data.latency < 1500),
      detail: '',
    },
    {
      key: 'realtime',
      label: s.realtime,
      value: socketOpen ? s.online : s.offline,
      ok: Boolean(socketOpen),
      detail: '/ws',
    },
    {
      key: 'payments',
      label: s.paymentsService,
      value: data ? (data.payments.configured ? s.configured : s.notConfigured) : '—',
      ok: Boolean(data?.payments?.configured),
      detail: data?.payments?.provider || '',
    },
    {
      key: 'mail',
      label: s.mailService,
      value: data ? (data.meta.mail_configured ? s.configured : s.notConfigured) : '—',
      ok: Boolean(data?.meta?.mail_configured),
      detail: '',
    },
    {
      key: 'turn',
      label: s.turnService,
      value: data ? (data.meta.turn_configured ? s.configured : s.notConfigured) : '—',
      ok: Boolean(data?.meta?.turn_configured),
      detail: data ? `${data.meta.ice_servers.length} ICE` : '',
    },
  ]

  return (
    <div data-testid="system-status-page">
      <PageBar title={s.systemStatus} back="/dashboard" testId="system-status">
        <button type="button" className="btn btn-small" onClick={reload} disabled={loading} data-testid="status-recheck">
          {s.recheck}
        </button>
      </PageBar>

      <p className="muted" style={{ margin: '0 2px 12px' }}>
        {s.systemStatusSub}
      </p>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="card glass">
        {rows.map((row) => (
          <div className="ledger-row" key={row.key} data-testid={`status-${row.key}`}>
            <span className="muted">
              {row.label}
              {row.detail ? ` · ${row.detail}` : ''}
            </span>
            <span className={`status-pill status-${row.ok ? 'paid' : 'pending'}`}>{row.value}</span>
          </div>
        ))}
      </div>

      <p className="muted" style={{ textAlign: 'center' }}>
        {s.checkedAt}: {data ? new Date(data.checkedAt).toLocaleTimeString('en') : '—'}
      </p>
    </div>
  )
}
