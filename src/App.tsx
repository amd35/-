import { BrowserRouter, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import ActivityLogPage from './pages/ActivityLogPage'
import AddItemPage from './pages/AddItemPage'
import AnalyticsPage from './pages/AnalyticsPage'
import ContactPage from './pages/ContactPage'
import DashboardPage from './pages/DashboardPage'
import DataListPage from './pages/DataListPage'
import FaqPage from './pages/FaqPage'
import HelpPage from './pages/HelpPage'
import MainApp from './pages/MainApp'
import NotificationsPage from './pages/NotificationsPage'
import ProfilePage from './pages/ProfilePage'
import SettingsPage from './pages/SettingsPage'
import SystemsPage from './pages/SystemsPage'
import TasksPage from './pages/TasksPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<MainApp />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/data-list" element={<DataListPage />} />
          <Route path="/systems" element={<SystemsPage />} />
          <Route path="/add-item" element={<AddItemPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/activity-log" element={<ActivityLogPage />} />
          <Route path="/faq" element={<FaqPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/contact" element={<ContactPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
