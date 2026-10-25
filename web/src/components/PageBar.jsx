import { useNavigate } from 'react-router-dom'

/**
 * Title bar shared by the management pages — the same surface as the store bar,
 * with a close button that goes back to `back` (default: the home page).
 */
export default function PageBar({ title, back = '/', testId = '', children }) {
  const navigate = useNavigate()
  return (
    <div className="store-bar">
      <button
        type="button"
        className="icon-button"
        aria-label="close"
        data-testid={testId ? `${testId}-back` : undefined}
        onClick={() => navigate(back)}
      >
        ✕
      </button>
      <span className="store-title" data-testid={testId || undefined}>
        {title}
      </span>
      <div className="topbar-spacer" />
      {children}
    </div>
  )
}
