import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import ActivityLogPage from './pages/ActivityLogPage'
import AddItemPage from './pages/AddItemPage'
import AnalyticsPage from './pages/AnalyticsPage'
import ContactPage from './pages/ContactPage'
import DashboardPage from './pages/DashboardPage'
import DataListPage from './pages/DataListPage'
import DiamondPage from './pages/DiamondPage'
import EventDetailPage from './pages/EventDetailPage'
import EventsPage from './pages/EventsPage'
import FaqPage from './pages/FaqPage'
import FriendsPage from './pages/FriendsPage'
import GamesPage from './pages/GamesPage'
import HelpPage from './pages/HelpPage'
import LeaderboardPage from './pages/LeaderboardPage'
import MainApp from './pages/MainApp'
import MessagesPage from './pages/MessagesPage'
import MyEventsPage from './pages/MyEventsPage'
import NotificationsPage from './pages/NotificationsPage'
import ProfilePage from './pages/ProfilePage'
import SettingsPage from './pages/SettingsPage'
import StorePage from './pages/StorePage'
import TasksPage from './pages/TasksPage'
import VCoinPage from './pages/VCoinPage'
import EventsAdminPage from './pages/admin/EventsAdminPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<MainApp />} />
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/games" element={<GamesPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/events/:id" element={<EventDetailPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/my-events" element={<MyEventsPage />} />
          <Route path="/admin/events" element={<EventsAdminPage />} />
          <Route path="/store" element={<StorePage />} />
          <Route path="/diamond" element={<DiamondPage />} />
          <Route path="/vcoin" element={<VCoinPage />} />
          <Route path="/friends" element={<FriendsPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/data-list" element={<DataListPage />} />
          <Route path="/systems" element={<Navigate to="/" replace />} />
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
