import { useState } from 'react'
import BottomNav from '../components/BottomNav'
import RoomOverlay from '../components/RoomOverlay'
import HomePage from './HomePage'
import type { Room } from '../lib/api'

export default function MainApp() {
  const [openRoom, setOpenRoom] = useState<Room | null>(null)

  return (
    <div>
      <HomePage onOpenRoom={setOpenRoom} />
      <BottomNav />
      {openRoom && <RoomOverlay room={openRoom} onClose={() => setOpenRoom(null)} />}
    </div>
  )
}
