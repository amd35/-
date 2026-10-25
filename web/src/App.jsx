import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import SurfaceTheme from './components/SurfaceTheme.jsx'
import Auth from './pages/Auth.jsx'
import Home from './pages/Home.jsx'
import Games from './pages/Games.jsx'
import GameTable from './pages/GameTable.jsx'
import Rooms from './pages/Rooms.jsx'
import Room from './pages/Room.jsx'
import Friends from './pages/Friends.jsx'
import Profile from './pages/Profile.jsx'
import Store from './pages/Store.jsx'
import Recharge from './pages/Recharge.jsx'
import ActivityLog from './pages/ActivityLog.jsx'
import Categories from './pages/Categories.jsx'
import Contact from './pages/Contact.jsx'
import Dashboard from './pages/Dashboard.jsx'
import DataManagement from './pages/DataManagement.jsx'
import EntryForm from './pages/EntryForm.jsx'
import Help from './pages/Help.jsx'
import ItemDetails from './pages/ItemDetails.jsx'
import Notifications from './pages/Notifications.jsx'
import Search from './pages/Search.jsx'
import Settings from './pages/Settings.jsx'
import SystemStatus from './pages/SystemStatus.jsx'
import { useAuth } from './lib/store.jsx'

function Protected({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="splash">جارِ التحميل…</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <>
      {/* يضبط السطح الفوتوغرافي للقسم الحالي على <body> (تصميم فقط). */}
      <SurfaceTheme />
      <Routes>
        <Route path="/login" element={<Auth />} />
        <Route
          element={
            <Protected>
              <Layout />
            </Protected>
          }
        >
          <Route path="/" element={<Home />} />
          <Route path="/games" element={<Games />} />
          <Route path="/games/:gameId" element={<GameTable />} />
          <Route path="/rooms" element={<Rooms />} />
          <Route path="/rooms/:roomId" element={<Room />} />
          <Route path="/friends" element={<Friends />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/store" element={<Store />} />
          <Route path="/recharge" element={<Recharge />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/data-management" element={<DataManagement />} />
          <Route path="/item-details" element={<ItemDetails />} />
          <Route path="/entry-form" element={<EntryForm />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/help" element={<Help />} />
          <Route path="/activity-log" element={<ActivityLog />} />
          <Route path="/system-status" element={<SystemStatus />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/search" element={<Search />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  )
}
