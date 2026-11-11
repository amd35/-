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
  created_at?: string
}

export type Friend = {
  id: number
  name: string
  handle: string
  level: number
  online: boolean
  room: string | null
  last_seen: string | null
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
  bio: string
  language: string
  push_enabled: boolean
  sound_enabled: boolean
}

export type Task = {
  id: number
  title: string
  project: string
  done: boolean
  created_at: string
}

export type ActivityEntry = {
  id: number
  action: string
  detail: string
  created_at: string
}

export type Notification = {
  id: number
  title: string
  body: string
  kind: string
  read: boolean
  created_at: string
}

export type Metrics = {
  rooms_total: number
  battle_rooms: number
  listeners_total: number
  friends_online: number
  friends_total: number
  tasks_open: number
  tasks_done: number
  unread_notifications: number
  categories: { name: string; count: number }[]
  activity_by_day: { day: string; count: number }[]
  top_rooms: { title: string; listeners: number }[]
}

export type NewRoom = {
  title: string
  category: string
  seats_total: number
  is_battle: boolean
  game: string | null
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  })
  if (!res.ok) {
    const detail = await res
      .json()
      .then((data: { detail?: string }) => data?.detail)
      .catch(() => undefined)
    throw new Error(detail ?? 'تعذّر إكمال العملية، جرّب مرة أخرى')
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) })

export const api = {
  me: () => request<Me>('/api/me'),
  updateMe: (body: Partial<Me>) =>
    request<Me>('/api/me', { method: 'PATCH', body: JSON.stringify(body) }),

  metrics: () => request<Metrics>('/api/metrics'),
  games: () => request<Game[]>('/api/games'),

  rooms: (battle?: boolean) =>
    request<Room[]>(`/api/rooms${battle === undefined ? '' : `?battle=${battle}`}`),
  createRoom: (body: NewRoom) => request<Room>('/api/rooms', json(body)),
  deleteRoom: (id: number) => request<void>(`/api/rooms/${id}`, { method: 'DELETE' }),
  joinRoom: (id: number) => request<Room>(`/api/rooms/${id}/join`, { method: 'POST' }),
  leaveRoom: (id: number) => request<Room>(`/api/rooms/${id}/leave`, { method: 'POST' }),

  friends: () => request<Friend[]>('/api/friends'),
  requests: () => request<FriendRequest[]>('/api/friend-requests'),

  tasks: () => request<Task[]>('/api/tasks'),
  createTask: (body: { title: string; project: string }) =>
    request<Task>('/api/tasks', json(body)),
  updateTask: (id: number, done: boolean) =>
    request<Task>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ done }) }),
  deleteTask: (id: number) => request<void>(`/api/tasks/${id}`, { method: 'DELETE' }),

  activity: () => request<ActivityEntry[]>('/api/activity'),
  notifications: () => request<Notification[]>('/api/notifications'),
  readNotification: (id: number) =>
    request<Notification>(`/api/notifications/${id}`, { method: 'PATCH' }),
  readAllNotifications: () =>
    request<{ updated: number }>('/api/notifications/read-all', { method: 'POST' }),

  contact: (body: { name: string; email: string; message: string }) =>
    request<{ status: string }>('/api/contact', json(body)),
}
