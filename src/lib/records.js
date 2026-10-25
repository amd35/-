export const STATUSES = ['active', 'paused', 'archived']

export const STATUS_LABELS = {
  active: 'Active',
  paused: 'Paused',
  archived: 'Archived',
}

export const CATEGORY_SUGGESTIONS = ['Account', 'Campaign', 'Contract', 'Invoice', 'Task']

export const EMPTY_ITEM = {
  name: '',
  category: '',
  status: 'active',
  value: '',
  owner: '',
  notes: '',
}

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

export function formatValue(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? currency.format(numeric) : '—'
}

export function formatDate(iso) {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function daysAgo(iso, now = new Date()) {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86400000)
}

export function matchesQuery(item, query) {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return [item.name, item.category, item.owner, item.status]
    .filter(Boolean)
    .some((field) => String(field).toLowerCase().includes(needle))
}

export function sortByUpdated(items) {
  return [...items].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
}
