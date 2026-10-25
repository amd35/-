import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader.jsx'
import { CATEGORY_SUGGESTIONS, EMPTY_ITEM, STATUSES, STATUS_LABELS } from '../lib/records.js'
import { useItems } from '../store/items.jsx'

function toFormValues(item) {
  return {
    name: item.name ?? '',
    category: item.category ?? '',
    status: item.status ?? 'active',
    value: item.value === undefined || item.value === null ? '' : String(item.value),
    owner: item.owner ?? '',
    notes: item.notes ?? '',
  }
}

export default function EntryForm() {
  const { id } = useParams()
  const { items, addItem, updateItem } = useItems()
  const navigate = useNavigate()

  const existing = id ? items.find((item) => item.id === id) : null
  const isEdit = Boolean(id)
  const [values, setValues] = useState(() => (existing ? toFormValues(existing) : { ...EMPTY_ITEM }))
  const [errors, setErrors] = useState({})

  if (isEdit && !existing) {
    return (
      <div className="page">
        <PageHeader title="Entry Form" subtitle="This record could not be found." />
        <div className="card card-padded empty-state">
          <p>No record matches the id “{id}”.</p>
          <Link className="button button-primary" to="/data-management">
            Back to Data Management
          </Link>
        </div>
      </div>
    )
  }

  const setField = (field) => (event) => {
    const { value } = event.target
    setValues((previous) => ({ ...previous, [field]: value }))
  }

  const validate = () => {
    const next = {}
    if (!values.name.trim()) next.name = 'A name is required.'
    if (values.value !== '' && (!Number.isFinite(Number(values.value)) || Number(values.value) < 0)) {
      next.value = 'Enter a value of 0 or more.'
    }
    return next
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) return

    const payload = {
      name: values.name.trim(),
      category: values.category.trim(),
      status: values.status,
      value: values.value === '' ? 0 : Number(values.value),
      owner: values.owner.trim(),
      notes: values.notes.trim(),
    }

    if (isEdit) {
      updateItem(id, payload)
      navigate(`/item-details/${id}`)
    } else {
      const created = addItem(payload)
      navigate(`/item-details/${created.id}`)
    }
  }

  return (
    <div className="page">
      <PageHeader
        title={isEdit ? 'Edit entry' : 'New entry'}
        subtitle={isEdit ? 'Update the details of this record.' : 'Add a record to the workspace.'}
      />

      <form className="card card-padded form" onSubmit={handleSubmit} noValidate>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="name">Name</label>
            <input
              id="name"
              data-testid="field-name"
              type="text"
              value={values.name}
              onChange={setField('name')}
              placeholder="e.g. Northwind account renewal"
            />
            {errors.name ? <span className="field-error">{errors.name}</span> : null}
          </div>
          <div className="field">
            <label htmlFor="category">Category</label>
            <input
              id="category"
              data-testid="field-category"
              type="text"
              list="category-options"
              value={values.category}
              onChange={setField('category')}
              placeholder="e.g. Account"
            />
            <datalist id="category-options">
              {CATEGORY_SUGGESTIONS.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label htmlFor="status">Status</label>
            <select id="status" data-testid="field-status" value={values.status} onChange={setField('status')}>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="value">Value</label>
            <input
              id="value"
              data-testid="field-value"
              type="number"
              min="0"
              step="1"
              value={values.value}
              onChange={setField('value')}
              placeholder="0"
            />
            {errors.value ? <span className="field-error">{errors.value}</span> : null}
          </div>
          <div className="field">
            <label htmlFor="owner">Owner</label>
            <input
              id="owner"
              data-testid="field-owner"
              type="text"
              value={values.owner}
              onChange={setField('owner')}
              placeholder="Who is responsible for this record?"
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="notes">Notes</label>
          <textarea
            id="notes"
            data-testid="field-notes"
            rows="4"
            value={values.notes}
            onChange={setField('notes')}
            placeholder="Anything worth remembering about this record"
          />
        </div>

        <div className="form-actions">
          <button type="submit" className="button button-primary" data-testid="save-entry">
            {isEdit ? 'Save changes' : 'Create entry'}
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => navigate(isEdit ? `/item-details/${id}` : '/data-management')}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
