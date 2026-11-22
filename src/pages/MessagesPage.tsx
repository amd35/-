import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Check, MessageCircle, Search, SquarePen, UserPlus, X } from 'lucide-react'
import Avatar from '../components/Avatar'
import BottomNav from '../components/BottomNav'
import { Screen, ScreenHeader, SectionHead } from '../components/Screen'
import { api, type Friend, type FriendRequest, type Notification } from '../lib/api'

const FLAGS = ['🇮🇶', '🇸🇦', '🇦🇪', '🇰🇼', '🇪🇬', '🇯🇴', '🇶🇦', '🇴🇲']

function snippetOf(friend: Friend) {
  if (friend.room) return `في غرفة · ${friend.room}`
  if (friend.online) return 'متصل الآن — ابدأ المحادثة'
  return friend.last_seen ? `آخر ظهور ${friend.last_seen}` : 'غير متصل'
}

export default function MessagesPage() {
  const [friends, setFriends] = useState<Friend[] | null>(null)
  const [requests, setRequests] = useState<FriendRequest[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([api.friends(), api.requests(), api.notifications()])
      .then(([friendList, requestList, notes]) => {
        if (!active) return
        setFriends(friendList)
        setRequests(requestList)
        setNotifications(notes)
      })
      .catch((err: Error) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [])

  const unread = notifications.filter((item) => !item.read).length
  const term = query.trim()
  const visible = (friends ?? []).filter(
    (friend) => term === '' || friend.name.includes(term) || friend.handle.includes(term),
  )

  function resolveRequest(id: number) {
    setRequests((current) => current.filter((item) => item.id !== id))
  }

  return (
    <Screen>
      <ScreenHeader
        title="الرسائل"
        subtitle={`${friends?.length ?? 0} محادثة · ${unread} غير مقروء`}
        back={false}
        action={
          <Link
            to="/friends"
            aria-label="محادثة جديدة"
            className="flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white"
          >
            <SquarePen size={17} />
          </Link>
        }
      />

      <div className="mb-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2">
        <Search size={15} className="text-blush-200/60" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ابحث في الرسائل"
          className="flex-1 bg-transparent text-xs text-white placeholder:text-slate-500 focus:outline-none"
        />
      </div>

      {requests.length > 0 && (
        <section className="mb-4">
          <SectionHead
            title="طلبات الصداقة"
            icon={<UserPlus size={14} className="text-gold" />}
            hint={`${requests.length} طلب`}
          />
          <ul className="space-y-2">
            {requests.map((request) => (
              <li
                key={request.id}
                data-testid="request-row"
                className="glass flex items-center gap-3 rounded-2xl p-2.5"
              >
                <Avatar name={request.name} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-white">{request.name}</p>
                  <p className="truncate text-[10px] text-blush-200/60" dir="ltr">
                    {request.handle} · {request.mutual} مشترك
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="accept-request"
                  onClick={() => resolveRequest(request.id)}
                  aria-label={`قبول ${request.name}`}
                  className="flex size-8 items-center justify-center rounded-full bg-emerald-500 text-white"
                >
                  <Check size={15} />
                </button>
                <button
                  type="button"
                  data-testid="decline-request"
                  onClick={() => resolveRequest(request.id)}
                  aria-label={`رفض ${request.name}`}
                  className="flex size-8 items-center justify-center rounded-full border border-white/10 bg-white/10 text-slate-300"
                >
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <SectionHead
        title="المحادثات"
        icon={<MessageCircle size={14} className="text-fuchsia-300" />}
        hint={`${visible.length}`}
      />

      {error && (
        <p className="rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-center text-xs text-red-200">
          {error}
        </p>
      )}

      {friends === null && !error && (
        <p className="py-8 text-center text-xs text-blush-200/50">جارٍ تحميل المحادثات…</p>
      )}

      {friends !== null && visible.length === 0 && (
        <p className="rounded-3xl border border-white/10 bg-white/[0.04] py-8 text-center text-xs text-blush-200/50">
          لا توجد محادثات مطابقة.
        </p>
      )}

      <ul className="space-y-2">
        {visible.map((friend) => (
          <li key={friend.id}>
            <Link
              to="/friends"
              data-testid="conversation-row"
              className="glass flex items-center gap-3 rounded-2xl p-2.5 transition active:scale-[0.99]"
            >
              <span className="relative shrink-0">
                <Avatar name={friend.name} size={46} online={friend.online} />
                <span className="absolute -top-1 -left-1 text-[11px] leading-none">
                  {FLAGS[friend.id % FLAGS.length]}
                </span>
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-bold text-white">{friend.name}</p>
                  <span className="shrink-0 text-[9px] font-semibold text-blush-200/50">
                    {friend.online ? 'الآن' : (friend.last_seen ?? '—')}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-blush-200/60">{snippetOf(friend)}</p>
              </div>

              {friend.online && !friend.room && (
                <span className="shrink-0 rounded-full bg-neon/15 px-1.5 py-0.5 text-[9px] font-black text-neon">
                  متصل
                </span>
              )}
              {friend.room && <Bell size={14} className="shrink-0 text-gold" />}
            </Link>
          </li>
        ))}
      </ul>

      <BottomNav messageBadge={unread} />
    </Screen>
  )
}
