import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader.jsx'
import StatCard from '../components/StatCard.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import { STATUSES, STATUS_LABELS, daysAgo, formatDate, formatValue, sortByUpdated } from '../lib/records.js'
import { useItems } from '../store/items.jsx'
import { useSettings } from '../store/settings.jsx'

export default function Dashboard() {
  const { items } = useItems()
  const { settings } = useSettings()

  const activeCount = items.filter((item) => item.status === 'active').length
  const totalValue = items.reduce((sum, item) => sum + (Number(item.value) || 0), 0)
  const updatedThisWeek = items.filter((item) => daysAgo(item.updatedAt) <= 7).length
  const recent = sortByUpdated(items).slice(0, 5)

  return (
    <div className="page">
      <PageHeader
        title={settings.displayName ? `Welcome back, ${settings.displayName}` : 'Dashboard'}
        subtitle="A summary of the records in this workspace."
      >
        <Link className="button button-primary" to="/entry-form" data-testid="dashboard-new-entry">
          New entry
        </Link>
      </PageHeader>

      <div className="stats-grid">
        <StatCard label="Total records" value={items.length} hint="All entries in the workspace" />
        <StatCard label="Active records" value={activeCount} hint="Currently in progress" />
        <StatCard label="Combined value" value={formatValue(totalValue)} hint="Sum of all record values" />
        <StatCard label="Updated this week" value={updatedThisWeek} hint="Changed in the last 7 days" />
      </div>

      <section className="section">
        <h2 className="section-title">By status</h2>
        <div className="card card-padded">
          {STATUSES.map((status) => {
            const count = items.filter((item) => item.status === status).length
            const share = items.length ? Math.round((count / items.length) * 100) : 0
            return (
              <div className="bar-row" key={status}>
                <span className="bar-label">{STATUS_LABELS[status]}</span>
                <span className="bar">
                  <span className="bar-fill" style={{ width: `${share}%` }} />
                </span>
                <span className="bar-value" data-testid={`status-count-${status}`}>
                  {count}
                </span>
              </div>
            )
          })}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Recent activity</h2>
          <Link className="link" to="/data-management">
            View all records
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="card card-padded empty-state">
            <p>No records yet. Add your first one from the Entry Form.</p>
            <Link className="button button-primary" to="/entry-form">
              New entry
            </Link>
          </div>
        ) : (
          <div className="card table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Record</th>
                  <th scope="col">Status</th>
                  <th scope="col">Value</th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((item) => (
                  <tr key={item.id} data-testid="recent-row">
                    <td>
                      <Link className="link" to={`/item-details/${item.id}`}>
                        {item.name}
                      </Link>
                      <span className="cell-sub">{item.category || 'Uncategorised'}</span>
                    </td>
                    <td>
                      <StatusBadge status={item.status} />
                    </td>
                    <td>{formatValue(item.value)}</td>
                    <td>{formatDate(item.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
