import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.jsx'
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
import { useAuth } from './lib/store.jsx'

function Protected({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="splash">جارِ التحميل…</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
