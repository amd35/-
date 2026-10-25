import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader.jsx'

export default function NotFound() {
  return (
    <div className="page">
      <PageHeader title="Page not found" subtitle="That address does not match any page in this app." />
      <div className="card card-padded empty-state">
        <Link className="button button-primary" to="/dashboard">
          Go to the Dashboard
        </Link>
      </div>
    </div>
  )
}
