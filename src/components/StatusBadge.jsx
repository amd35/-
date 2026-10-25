import { STATUS_LABELS } from '../lib/records.js'

export default function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABELS[status] ?? status}</span>
}
