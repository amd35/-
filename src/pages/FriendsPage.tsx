import { useEffect, useState } from 'react'
import { Check, MessageCircle, Search, UserPlus, X } from 'lucide-react'
import Avatar from '../components/Avatar'
import { api, type Friend, type FriendRequest } from '../lib/api'

type View = 'friends' | 'requests'

export default function FriendsPage({
  onCountChange,
}: {
  onCountChange?: (count: number) => void
}) {
  const [view, setView] = useState<View>('friends')
  const [friends, setFriends] = useState<Friend[] | null>(null)
  const [requests, setRequests] = useState<FriendRequest[] | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([api.friends(), api.requests()])
      .then(([friendList, requestList]) => {
        if (!active) return
        setFriends(friendList)
        setRequests(requestList)
        onCountChange?.(requestList.length)
      })
      .catch((err: Error) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [onCountChange])

  function resolveRequest(id: number) {
    const next = (requests ?? []).filter((item) => item.id !== id)
    setRequests(next)
    onCountChange?.(next.length)
  }

  const visibleFriends = (friends ?? []).filter(
    (friend) => query.trim() === '' || friend.name.includes(query.trim()),
  )
  const online = (friends ?? []).filter((friend) => friend.online).length

  return (
    <div>
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">الأصدقاء</h1>
          <p className="mt-1 text-xs text-slate-400">
            {friends?.length ?? 0} صديق · {online} متصل الآن
          </p>
        </div>
        <button
          type="button"
          aria-label="إضافة صديق"
          className="flex size-10 items-center justify-center rounded-full bg-fuchsia-600 text-white"
        >
          <UserPlus size={18} />
        </button>
      </header>

      <div className="mt-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
        <Search size={17} className="text-slate-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ابحث عن صديق"
          className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-1 rounded-2xl bg-white/5 p-1">
        <button
          type="button"
          data-testid="friends-tab"
          onClick={() => setView('friends')}
          className={`rounded-xl py-2 text-xs font-bold transition ${
            view === 'friends' ? 'bg-white/15 text-white' : 'text-slate-400'
          }`}
        >
          الأصدقاء
        </button>
        <button
          type="button"
          data-testid="requests-tab"
          onClick={() => setView('requests')}
          className={`rounded-xl py-2 text-xs font-bold transition ${
            view === 'requests' ? 'bg-white/15 text-white' : 'text-slate-400'
          }`}
        >
          الطلبات {requests ? `(${requests.length})` : ''}
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-center text-xs text-red-200">
          {error}
        </p>
      )}

      {view === 'friends' && (
        <ul className="mt-4 space-y-2.5" data-testid="friends-list">
          {friends === null && !error && (
            <li className="py-8 text-center text-xs text-slate-400">جارٍ التحميل…</li>
          )}
          {friends !== null && visibleFriends.length === 0 && (
            <li className="rounded-2xl border border-white/10 bg-white/5 py-8 text-center text-xs text-slate-400">
              لا يوجد صديق بهذا الاسم.
            </li>
          )}
          {visibleFriends.map((friend) => (
            <li
              key={friend.id}
              data-testid="friend-row"
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3"
            >
              <Avatar name={friend.name} size={44} online={friend.online} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white">
                  {friend.name}
                  <span className="ms-2 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">
                    Lv {friend.level}
                  </span>
                </p>
                <p className="mt-0.5 truncate text-[11px] text-slate-400">
                  {friend.online ? (friend.room ? `في غرفة: ${friend.room}` : 'متصل الآن') : 'غير متصل'}
                </p>
              </div>
              <button
                type="button"
                aria-label={`مراسلة ${friend.name}`}
                className={`flex size-9 items-center justify-center rounded-full ${
                  friend.online
                    ? 'bg-fuchsia-600 text-white'
                    : 'bg-white/5 text-slate-500'
                }`}
                disabled={!friend.online}
              >
                <MessageCircle size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {view === 'requests' && (
        <ul className="mt-4 space-y-2.5" data-testid="requests-list">
          {requests === null && !error && (
            <li className="py-8 text-center text-xs text-slate-400">جارٍ التحميل…</li>
          )}
          {requests !== null && requests.length === 0 && (
            <li className="rounded-2xl border border-white/10 bg-white/5 py-8 text-center text-xs text-slate-400">
              لا توجد طلبات صداقة جديدة.
            </li>
          )}
          {requests?.map((request) => (
            <li
              key={request.id}
              data-testid="request-row"
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3"
            >
              <Avatar name={request.name} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white">{request.name}</p>
                <p className="mt-0.5 truncate text-[11px] text-slate-400">
                  {request.handle} · {request.mutual} أصدقاء مشتركون
                </p>
              </div>
              <button
                type="button"
                data-testid="accept-request"
                onClick={() => resolveRequest(request.id)}
                aria-label={`قبول ${request.name}`}
                className="flex size-9 items-center justify-center rounded-full bg-emerald-500 text-white"
              >
                <Check size={16} />
              </button>
              <button
                type="button"
                data-testid="decline-request"
                onClick={() => resolveRequest(request.id)}
                aria-label={`رفض ${request.name}`}
                className="flex size-9 items-center justify-center rounded-full bg-white/10 text-slate-300"
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
