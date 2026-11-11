import { useState } from 'react'
import BottomNav, { type Tab } from '../components/BottomNav'
import RoomOverlay from '../components/RoomOverlay'
import BattlePage from './BattlePage'
import FriendsPage from './FriendsPage'
import HomePage from './HomePage'
import type { Room } from '../lib/api'

export default function MainApp() {
  const [tab, setTab] = useState<Tab>('home')
  const [openRoom, setOpenRoom] = useState<Room | null>(null)
  const [requestCount, setRequestCount] = useState(0)

  return (
    <div>
      {tab === 'home' && <HomePage onOpenRoom={setOpenRoom} />}
      {tab === 'battle' && <BattlePage onOpenRoom={setOpenRoom} />}
      {tab === 'friends' && <FriendsPage onCountChange={setRequestCount} />}

      <BottomNav tab={tab} onChange={setTab} friendsBadge={requestCount} />
      {openRoom && <RoomOverlay room={openRoom} onClose={() => setOpenRoom(null)} />}
    </div>
  )
}
