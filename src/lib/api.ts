export type Room = {
  id: number
  title: string
  category: string
  host: string
  listeners: number
  seats_taken: number
  seats_total: number
  language: string
  is_battle: boolean
  game: string | null
  featured: boolean
}

export type Friend = {
  id: number
  name: string
  handle: string
  level: number
  online: boolean
  room: string | null
}

export type FriendRequest = {
  id: number
  name: string
  handle: string
  mutual: number
}

export type Game = {
  key: string
  name: string
  players: string
  accent: string
}

export type Me = {
  name: string
  handle: string
  level: number
  coins: number
  diamonds: number
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) {
    throw new Error('تعذّر تحميل البيانات، جرّب مرة أخرى')
  }
  return (await res.json()) as T
}

export const api = {
  me: () => getJson<Me>('/api/me'),
  rooms: (battle?: boolean) =>
    getJson<Room[]>(`/api/rooms${battle === undefined ? '' : `?battle=${battle}`}`),
  games: () => getJson<Game[]>('/api/games'),
  friends: () => getJson<Friend[]>('/api/friends'),
  requests: () => getJson<FriendRequest[]>('/api/friend-requests'),
}
