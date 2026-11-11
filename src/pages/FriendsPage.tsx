import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  Clock,
  Headphones,
  Heart,
  MessageCircle,
  Search,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import Avatar from '../components/Avatar'
import PageBackdrop from '../components/PageBackdrop'
import { EmptyState, PageHeader } from '../components/ui'
import { api, type Friend, type FriendRequest } from '../lib/api'

type View = 'friends' | 'requests'

function statusOf(friend: Friend): 'room' | 'online' | 'offline' {
  if (!friend.online) return 'offline'
  return friend.room ? 'room' : 'online'
}

function StatusPill({ friend }: { friend: Friend }) {
  const status = statusOf(friend)

  if (status === 'room') {
    return (
      <span className="flex min-w-0 items-center gap-1 rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-[10px] font-bold text-fuchsia-300">
        <Headphones size={11} className="shrink-0" />
        <span className="truncate">في غرفة · {friend.room}</span>
      </span>
    )
  }

  if (status === 'online') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
        <span className="size-1.5 rounded-full bg-emerald-400" />
        متصل الآن
      </span>
    )
  }

  return (
    <span className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
      <Clock size={11} />
      {friend.last_seen ? `آخر ظهور ${friend.last_seen}` : 'غير متصل'}
    </span>
  )
}

function FriendRow({ friend }: { friend: Friend }) {
  const online = friend.online

  return (
    <li
      data-testid="friend-row"
      data-status={statusOf(friend)}
      className={`flex items-center gap-3 rounded-3xl border p-3 backdrop-blur-md transition ${
        online
          ? 'border-emerald-300/25 bg-emerald-400/[0.08]'
          : 'border-white/10 bg-white/[0.05]'
      }`}
    >
      <Avatar name={friend.name} size={46} online={online} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5">
          <span className={`truncate text-sm font-bold ${online ? 'text-white' : 'text-slate-300'}`}>
            {friend.name}
          </span>
          <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">
            Lv {friend.level}
          </span>
        </p>
        <p className="mt-0.5 truncate text-[10px] text-slate-500" dir="ltr">
          {friend.handle}
        </p>
        <div className="mt-1.5 flex">
          <StatusPill friend={friend} />
        </div>
      </div>
      <button
        type="button"
        aria-label={`مراسلة ${friend.name}`}
        disabled={!online}
        className={`flex size-9 shrink-0 items-center justify-center rounded-full transition ${
          online ? 'bg-fuchsia-600 text-white' : 'bg-white/5 text-slate-600'
        }`}
      >
        <MessageCircle size={16} />
      </button>
    </li>
  )
}

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

  const onlineFriends = useMemo(
    () => (friends ?? []).filter((friend) => friend.online),
    [friends],
  )
  const offlineFriends = useMemo(
    () => (friends ?? []).filter((friend) => !friend.online),
    [friends],
  )
  const inRoom = onlineFriends.filter((friend) => friend.room).length

  const term = query.trim()
  const visibleOnline = onlineFriends.filter((friend) => term === '' || friend.name.includes(term))
  const visibleOffline = offlineFriends.filter((friend) => term === '' || friend.name.includes(term))

  return (
    <PageBackdrop photo="couple">
      <PageHeader
        eyebrow="أحبّاؤك"
        title="الأصدقاء"
        subtitle={`${friends?.length ?? 0} صديق · ${onlineFriends.length} متصل الآن`}
        action={
          <button
            type="button"
            aria-label="إضافة صديق"
            className="blush-glow flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-fuchsia-600 text-white transition active:scale-95"
          >
            <UserPlus size={18} />
          </button>
        }
      />
      <p className="sr-only" data-testid="friends-summary">
        {friends?.length ?? 0} صديق · {onlineFriends.length} متصل الآن
      </p>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-2 py-2.5 text-center backdrop-blur-md">
          <p className="font-display text-lg leading-none font-bold text-emerald-200" data-testid="online-count">
            {onlineFriends.length}
          </p>
          <p className="mt-1 text-[10px] font-semibold text-emerald-200/70">متصل</p>
        </div>
        <div className="rounded-2xl border border-fuchsia-300/25 bg-fuchsia-400/12 px-2 py-2.5 text-center backdrop-blur-md">
          <p className="font-display text-lg leading-none font-bold text-blush-200" data-testid="in-room-count">
            {inRoom}
          </p>
          <p className="mt-1 text-[10px] font-semibold text-blush-200/70">في غرفة</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-2 py-2.5 text-center backdrop-blur-md">
          <p className="font-display text-lg leading-none font-bold text-slate-200" data-testid="offline-count">
            {offlineFriends.length}
          </p>
          <p className="mt-1 text-[10px] font-semibold text-slate-400">غير متصل</p>
        </div>
      </div>

      <div className="glass mt-4 flex items-center gap-2 rounded-2xl px-3 py-2.5">
        <Search size={17} className="text-blush-200/60" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ابحث عن صديق"
          className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
        />
        <Heart size={14} className="text-rose-300/70" />
      </div>

      <div className="glass mt-3 grid grid-cols-2 gap-1 rounded-2xl p-1">
        <button
          type="button"
          data-testid="friends-tab"
          onClick={() => setView('friends')}
          className={`rounded-xl py-2 text-xs font-bold transition ${
            view === 'friends'
              ? 'bg-gradient-to-l from-rose-500 to-fuchsia-600 text-white shadow-[0_6px_18px_-8px_rgba(236,72,153,0.9)]'
              : 'text-blush-200/60'
          }`}
        >
          الأصدقاء
        </button>
        <button
          type="button"
          data-testid="requests-tab"
          onClick={() => setView('requests')}
          className={`rounded-xl py-2 text-xs font-bold transition ${
            view === 'requests'
              ? 'bg-gradient-to-l from-rose-500 to-fuchsia-600 text-white shadow-[0_6px_18px_-8px_rgba(236,72,153,0.9)]'
              : 'text-blush-200/60'
          }`}
        >
          الطلبات {requests ? `(${requests.length})` : ''}
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-center text-xs text-red-200 backdrop-blur">
          {error}
        </p>
      )}

      {view === 'friends' && (
        <div className="mt-4" data-testid="friends-list">
          {friends === null && !error && (
            <p className="py-8 text-center text-xs text-slate-400">جارٍ تحميل الأصدقاء…</p>
          )}

          {friends !== null && visibleOnline.length === 0 && visibleOffline.length === 0 && (
            <EmptyState>لا يوجد صديق بهذا الاسم.</EmptyState>
          )}

          {visibleOnline.length > 0 && (
            <section>
              <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-emerald-200">
                <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.5)]" />{' '}
                متصلون الآن
                <span className="text-emerald-200/50">({visibleOnline.length})</span>
              </h2>
              <ul className="space-y-2.5">
                {visibleOnline.map((friend) => (
                  <FriendRow key={friend.id} friend={friend} />
                ))}
              </ul>
            </section>
          )}

          {visibleOffline.length > 0 && (
            <section className="mt-5">
              <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-blush-200/50">
                <span className="size-1.5 rounded-full bg-slate-500" /> غير متصلين
                <span className="text-blush-200/30">({visibleOffline.length})</span>
              </h2>
              <ul className="space-y-2.5">
                {visibleOffline.map((friend) => (
                  <FriendRow key={friend.id} friend={friend} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {view === 'requests' && (
        <ul className="mt-4 space-y-2.5" data-testid="requests-list">
          {requests === null && !error && (
            <li className="py-8 text-center text-xs text-slate-400">جارٍ التحميل…</li>
          )}
          {requests !== null && requests.length === 0 && (
            <li>
              <EmptyState>لا توجد طلبات صداقة جديدة.</EmptyState>
            </li>
          )}
          {requests?.map((request) => (
            <li
              key={request.id}
              data-testid="request-row"
              className="flex items-center gap-3 rounded-3xl border border-white/10 bg-white/[0.06] p-3 backdrop-blur-md"
            >
              <Avatar name={request.name} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white">{request.name}</p>
                <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-slate-400">
                  <Users size={11} /> {request.mutual} أصدقاء مشتركون
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
    </PageBackdrop>
  )
}
