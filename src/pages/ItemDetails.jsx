import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import { formatDate, formatValue, sortByUpdated } from '../lib/records.js'
import { useItems } from '../store/items.jsx'

function DetailRow({ label, children }) {
  return (
    <div className="detail">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{children}</span>
    </div>
  )
}

export default function ItemDetails() {
  const { id } = useParams()
  const { items, updateItem, deleteItem } = useItems()
  const navigate = useNavigate()
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const item = id ? items.find((entry) => entry.id === id) : null

  if (!id) {
    return (
      <div className="page">
        <PageHeader title="Item Details" subtitle="Open a record to see its full information." />
        <div className="card card-padded">
          <h2 className="section-title">Choose a record</h2>
          {items.length === 0 ? (
            <p>There are no records yet.</p>
          ) : (
            <ul className="plain-list">
              {sortByUpdated(items).map((entry) => (
                <li key={entry.id}>
                  <Link className="link" to={`/item-details/${entry.id}`}>
                    {entry.name}
                  </Link>
                  <span className="cell-sub">{entry.category || 'Uncategorised'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    )
  }

  if (!item) {
    return (
      <div className="page">
        <PageHeader title="Item Details" subtitle="This record could not be found." />
        <div className="card card-padded empty-state">
          <p>No record matches the id “{id}”.</p>
          <Link className="button button-primary" to="/data-management">
            Back to Data Management
          </Link>
        </div>
      </div>
    )
  }

  const archived = item.status === 'archived'

  const toggleStatus = () => {
    updateItem(item.id, { status: archived ? 'active' : 'archived' })
    setConfirmingDelete(false)
  }

  const removeItem = () => {
    deleteItem(item.id)
    navigate('/data-management')
  }

  return (
    <div className="page">
      <PageHeader title={item.name} subtitle={item.category || 'Uncategorised'}>
        <Link className="button button-secondary" data-testid="edit-item" to={`/entry-form/${item.id}`}>
          Edit
        </Link>
        <button type="button" className="button button-secondary" data-testid="toggle-status" onClick={toggleStatus}>
          {archived ? 'Reactivate' : 'Archive'}
        </button>
        {confirmingDelete ? (
          <>
            <button type="button" className="button button-danger" data-testid="confirm-delete" onClick={removeItem}>
              Confirm delete
            </button>
            <button
              type="button"
              className="button button-secondary"
              data-testid="cancel-delete"
              onClick={() => setConfirmingDelete(false)}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className="button button-danger"
            data-testid="delete-item"
            onClick={() => setConfirmingDelete(true)}
          >
            Delete
          </button>
        )}
      </PageHeader>

      <div className="card card-padded">
        <div className="detail-grid">
          <DetailRow label="Status">
            <StatusBadge status={item.status} />
          </DetailRow>
          <DetailRow label="Value">{formatValue(item.value)}</DetailRow>
          <DetailRow label="Owner">{item.owner || '—'}</DetailRow>
          <DetailRow label="Category">{item.category || '—'}</DetailRow>
          <DetailRow label="Created">{formatDate(item.createdAt)}</DetailRow>
          <DetailRow label="Last updated">{formatDate(item.updatedAt)}</DetailRow>
          <DetailRow label="Record id">
            <code className="code">{item.id}</code>
          </DetailRow>
        </div>
      </div>

      <section className="section">
        <h2 className="section-title">Notes</h2>
        <div className="card card-padded">
          <p className="notes" data-testid="item-notes">
            {item.notes || 'No notes recorded for this item.'}
          </p>
        </div>
      </section>

      <p className="back-link">
        <Link className="link" to="/data-management">
          Back to Data Management
        </Link>
      </p>
    </div>
  )
}
