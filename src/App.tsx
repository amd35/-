import { useState } from 'react'
import BottomNav, { type Tab } from './components/BottomNav'
import RoomOverlay from './components/RoomOverlay'
import BattlePage from './pages/BattlePage'
import FriendsPage from './pages/FriendsPage'
import HomePage from './pages/HomePage'
import type { Room } from './lib/api'

export default function App() {
  const [tab, setTab] = useState<Tab>('home')
  const [openRoom, setOpenRoom] = useState<Room | null>(null)
  const [requestCount, setRequestCount] = useState(0)

  return (
    <div className="mx-auto min-h-dvh w-full max-w-xl px-5 pt-6 pb-28">
      {tab === 'home' && <HomePage onOpenRoom={setOpenRoom} />}
      {tab === 'battle' && <BattlePage onOpenRoom={setOpenRoom} />}
      {tab === 'friends' && <FriendsPage onCountChange={setRequestCount} />}

      <BottomNav tab={tab} onChange={setTab} friendsBadge={requestCount} />
      {openRoom && <RoomOverlay room={openRoom} onClose={() => setOpenRoom(null)} />}
    </div>
  )
}
