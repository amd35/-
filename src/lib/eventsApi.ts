export type EventKind =
  | 'daily'
  | 'weekly'
  | 'competition'
  | 'challenge'
  | 'occasion'
  | 'exclusive'
  | 'game'

export type PrizeKind = 'gold' | 'coins' | 'diamonds' | 'gift' | 'frame'

export type EventPhase = 'draft' | 'paused' | 'upcoming' | 'active' | 'ending' | 'ended'

export type EventPrize = {
  id: number
  rank: number
  kind: PrizeKind
  kind_label: string
  amount: number
  label: string
}

export type EventWinner = {
  id: number
  event_id: number
  user_id: number
  user_name: string
  rank: number
  prize_kind: PrizeKind
  prize_kind_label: string
  prize_amount: number
  prize_label: string
  status: 'pending' | 'approved' | 'sent' | 'cancelled'
  created_at: string
  approved_at: string | null
  sent_at: string | null
  event_title?: string
}

export type Participation = {
  id: number
  event_id: number
  user_id: number
  score: number
  status: string
  team: string | null
  detail: Record<string, unknown>
  created_at: string
  finished_at: string | null
}

export type LeaderboardRow = {
  rank: number
  user_id: number
  name: string
  score: number
  team?: string | null
  finished_at?: string | null
  plays?: number
}

export type EventQuestion = { prompt: string; options: string[] }

export type GameEvent = {
  id: number
  title: string
  kind: EventKind
  kind_label: string
  game_key: string
  game_name: string
  game_rules: string
  game_duration: number
  game_enabled: boolean
  description: string
  media_url: string
  media_type: 'image' | 'video'
  rules: string
  conditions: string
  starts_at: string
  ends_at: string
  entry_fee_gold: number
  winners_count: number
  status: string
  phase: EventPhase
  published: boolean
  finalized: boolean
  participants: number
  prizes: EventPrize[]
  joined: boolean
  my_participation: Participation | null
  questions: EventQuestion[] | null
  leaderboard: LeaderboardRow[]
  team_scores: Record<string, number>
  winners: EventWinner[]
  created_at: string
  updated_at: string
  winner_count?: number
  pending_winners?: number
  sent_winners?: number
  start_notified?: boolean
  ending_notified?: boolean
}

export type Banner = {
  id: number
  title: string
  subtitle: string
  media_url: string
  media_type: 'image' | 'video'
  link_type: string
  link_ref: string | null
  path: string
  external: boolean
  starts_at: string
  ends_at: string | null
  active: boolean
  sort_order: number
  views: number
  clicks: number
  created_at: string
}

export type GameCatalogItem = {
  key: string
  name: string
  description: string
  rules: string
  duration_seconds: number
  enabled: boolean
  sort_order: number
}

export type LedgerRow = {
  id: number
  event_id: number | null
  kind: string
  currency: string
  amount: number
  balance_after: number
  ref: string
  detail: string
  created_at: string
}

export type MyEvents = {
  participations: (Participation & {
    event_title: string
    event_kind: string
    event_media: string
    event_phase: string
  })[]
  winners: EventWinner[]
  ledger: LedgerRow[]
  gold: number
  coins: number
  diamonds: number
}

export type ParticipantRow = {
  rank: number
  id: number
  user_id: number
  name: string
  score: number
  status: string
  team: string | null
  detail: Record<string, unknown>
  created_at: string
  finished_at: string | null
}

export type PrizeInput = {
  rank: number
  kind: PrizeKind
  amount: number
  label: string
}

export type EventInput = {
  title: string
  kind: EventKind
  game_key: string
  description: string
  media_url: string
  media_type: 'image' | 'video'
  rules: string
  conditions: string
  starts_at: string
  ends_at: string
  entry_fee_gold: number
  winners_count: number
  status: string
  published: boolean
  prizes: PrizeInput[]
}

export type BannerInput = {
  title: string
  subtitle: string
  media_url: string
  media_type: 'image' | 'video'
  link_type: string
  link_ref: string | null
  starts_at: string
  ends_at: string | null
  active: boolean
  sort_order: number
}

export type JoinResponse = {
  participation: Participation
  questions?: EventQuestion[]
  result?: Record<string, unknown>
  event: GameEvent
}

export class EventsApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'EventsApiError'
    this.status = status
  }
}

const ADMIN_KEY_STORAGE = 'yalla.eventsAdminKey'

export function getAdminKey(): string {
  try {
    return window.localStorage.getItem(ADMIN_KEY_STORAGE) ?? ''
  } catch {
    return ''
  }
}

export function setAdminKey(value: string): void {
  try {
    if (value) window.localStorage.setItem(ADMIN_KEY_STORAGE, value)
    else window.localStorage.removeItem(ADMIN_KEY_STORAGE)
  } catch {
    // المتصفح قد يمنع التخزين؛ يبقى المفتاح في حالة الصفحة.
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  admin = false,
): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (admin) {
    const key = getAdminKey()
    if (key) headers.set('X-Admin-Key', key)
  }
  const response = await fetch(path, { ...init, headers })
  if (!response.ok) {
    const detail = await response
      .json()
      .then((data: { detail?: string }) => data?.detail)
      .catch(() => undefined)
    throw new EventsApiError(
      response.status,
      detail ?? 'تعذّر إكمال العملية، جرّب مرة أخرى',
    )
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  body: JSON.stringify(body),
})

export const eventsApi = {
  games: () => request<GameCatalogItem[]>('/api/events/games'),
  list: (kind?: string) =>
    request<GameEvent[]>(`/api/events${kind ? `?kind=${encodeURIComponent(kind)}` : ''}`),
  get: (id: number | string) => request<GameEvent>(`/api/events/${id}`),
  join: (id: number | string, body: { team?: string } = {}) =>
    request<JoinResponse>(`/api/events/${id}/join`, json(body)),
  submit: (id: number | string, answers: number[]) =>
    request<JoinResponse>(`/api/events/${id}/submit`, json({ answers })),
  leaderboard: (period: 'daily' | 'weekly' | 'all' = 'all') =>
    request<{ period: string; rows: LeaderboardRow[] }>(
      `/api/leaderboard?period=${period}`,
    ),
  mine: () => request<MyEvents>('/api/events/mine'),
}

export const bannersApi = {
  list: () => request<Banner[]>('/api/banners'),
  click: (id: number) =>
    request<{ path: string; external: boolean; clicks: number }>(
      `/api/banners/${id}/click`,
      { method: 'POST' },
    ),
}

export const adminApi = {
  events: () => request<GameEvent[]>('/api/admin/events', {}, true),
  createEvent: (body: EventInput) =>
    request<GameEvent>('/api/admin/events', json(body), true),
  updateEvent: (id: number, body: EventInput) =>
    request<GameEvent>(`/api/admin/events/${id}`, { method: 'PUT', body: JSON.stringify(body) }, true),
  setStatus: (id: number, status: string, published?: boolean) =>
    request<GameEvent>(
      `/api/admin/events/${id}/status`,
      json({ status, published }),
      true,
    ),
  deleteEvent: (id: number) =>
    request<void>(`/api/admin/events/${id}`, { method: 'DELETE' }, true),
  finalize: (id: number) =>
    request<{ event: GameEvent; winners: EventWinner[]; created: number }>(
      `/api/admin/events/${id}/finalize`,
      { method: 'POST' },
      true,
    ),
  participants: (id: number) =>
    request<{
      event: GameEvent
      participants: ParticipantRow[]
      teams: Record<string, number>
    }>(`/api/admin/events/${id}/participants`, {}, true),
  approveWinner: (eventId: number, winnerId: number) =>
    request<{ id: number; status: string; approved_at: string | null }>(
      `/api/admin/events/${eventId}/winners/${winnerId}/approve`,
      { method: 'POST' },
      true,
    ),
  sendWinner: (eventId: number, winnerId: number) =>
    request<{ id: number; status: string; sent_at: string | null; gold: number }>(
      `/api/admin/events/${eventId}/winners/${winnerId}/send`,
      { method: 'POST' },
      true,
    ),
  cancelWinner: (eventId: number, winnerId: number) =>
    request<{ id: number; status: string }>(
      `/api/admin/events/${eventId}/winners/${winnerId}/cancel`,
      { method: 'POST' },
      true,
    ),
  games: () => request<GameCatalogItem[]>('/api/admin/games', {}, true),
  updateGame: (
    key: string,
    body: { enabled?: boolean; rules?: string; duration_seconds?: number; name?: string; description?: string },
  ) =>
    request<GameCatalogItem>(
      `/api/admin/games/${key}`,
      { method: 'PATCH', body: JSON.stringify(body) },
      true,
    ),
  banners: () => request<Banner[]>('/api/admin/banners', {}, true),
  createBanner: (body: BannerInput) =>
    request<Banner>('/api/admin/banners', json(body), true),
  updateBanner: (id: number, body: BannerInput) =>
    request<Banner>(
      `/api/admin/banners/${id}`,
      { method: 'PATCH', body: JSON.stringify(body) },
      true,
    ),
  deleteBanner: (id: number) =>
    request<void>(`/api/admin/banners/${id}`, { method: 'DELETE' }, true),
  publishEventBanner: (id: number) =>
    request<Banner>(`/api/admin/events/${id}/banner`, { method: 'POST' }, true),
  upload: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<{ url: string; media_type: 'image' | 'video'; size: number }>(
      '/api/admin/uploads',
      { method: 'POST', body: form },
      true,
    )
  },
}
