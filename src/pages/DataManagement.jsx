import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import { STATUSES, STATUS_LABELS, formatDate, formatValue, matchesQuery, sortByUpdated } from '../lib/records.js'
import { useItems } from '../store/items.jsx'
import { useSettings } from '../store/settings.jsx'

export default function DataManagement() {
  const { items } = useItems()
  const { settings } = useSettings()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')

  const filtered = useMemo(
    () =>
      sortByUpdated(items).filter(
        (item) => (status === 'all' || item.status === status) && matchesQuery(item, query),
      ),
    [items, query, status],
  )
  const visible = filtered.slice(0, settings.rowsPerPage)
  const filtersActive = Boolean(query.trim()) || status !== 'all'

  return (
    <div className="page">
      <PageHeader title="Data Management" subtitle="Browse and search every record in the workspace.">
        <Link className="button button-primary" to="/entry-form" data-testid="data-new-entry">
          New entry
        </Link>
      </PageHeader>

      <div className="card card-padded">
        <div className="filters">
          <div className="field">
            <label htmlFor="record-search">Search</label>
            <input
              id="record-search"
              data-testid="search-input"
              type="search"
              placeholder="Search by name, category or owner"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="field field-narrow">
            <label htmlFor="record-status">Status</label>
            <select
              id="record-status"
              data-testid="status-filter"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="all">All statuses</option>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="table-meta" data-testid="result-count">
          Showing {visible.length} of {filtered.length} matching records ({items.length} in total)
        </p>
      </div>

      {visible.length === 0 ? (
        <div className="card card-padded empty-state">
          <p>No records match the current filters.</p>
          {filtersActive ? (
            <button
              type="button"
              className="button button-secondary"
              data-testid="clear-filters"
              onClick={() => {
                setQuery('')
                setStatus('all')
              }}
            >
              Clear filters
            </button>
          ) : (
            <Link className="button button-primary" to="/entry-form">
              New entry
            </Link>
          )}
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Record</th>
                <th scope="col">Category</th>
                <th scope="col">Status</th>
                <th scope="col">Value</th>
                <th scope="col">Owner</th>
                <th scope="col">Updated</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr key={item.id} data-testid="record-row">
                  <td>
                    <Link className="link" data-testid={`record-link-${item.id}`} to={`/item-details/${item.id}`}>
                      {item.name}
                    </Link>
                  </td>
                  <td>{item.category || '—'}</td>
                  <td>
                    <StatusBadge status={item.status} />
                  </td>
                  <td>{formatValue(item.value)}</td>
                  <td>{item.owner || '—'}</td>
                  <td>{formatDate(item.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
