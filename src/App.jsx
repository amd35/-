import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import DataManagement from './pages/DataManagement.jsx'
import ItemDetails from './pages/ItemDetails.jsx'
import EntryForm from './pages/EntryForm.jsx'
import Settings from './pages/Settings.jsx'
import NotFound from './pages/NotFound.jsx'
import { useSettings } from './store/settings.jsx'

function HomeRedirect() {
  const { settings } = useSettings()
  return <Navigate to={settings.defaultPage} replace />
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/data-management" element={<DataManagement />} />
        <Route path="/item-details" element={<ItemDetails />} />
        <Route path="/item-details/:id" element={<ItemDetails />} />
        <Route path="/entry-form" element={<EntryForm />} />
        <Route path="/entry-form/:id" element={<EntryForm />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
