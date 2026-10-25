import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api, getToken, setToken, wsUrl } from './api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [wallet, setWallet] = useState({ gold: 0, diamonds: 0 })
  const [meta, setMeta] = useState(null)
  const [loading, setLoading] = useState(Boolean(getToken()))
  const [socket, setSocket] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [unread, setUnread] = useState(0)
  const listeners = useRef(new Set())

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null)
      setLoading(false)
      return
    }
    try {
      const data = await api.get('/api/auth/me')
      setUser(data.user)
      setWallet(data.wallet)
    } catch {
      setToken('')
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    api
      .get('/api/meta/public')
      .then(setMeta)
      .catch(() => setMeta(null))
  }, [])

  // Live socket: presence, room events, notifications and WebRTC signalling.
  useEffect(() => {
    if (!user) return undefined
    let stopped = false
    let timer = null
    let connection = null

    const connect = () => {
      connection = new WebSocket(wsUrl())
      connection.onopen = () => setSocket(connection)
      connection.onmessage = (event) => {
        let payload = null
        try {
          payload = JSON.parse(event.data)
        } catch {
          return
        }
        if (payload.type === 'notification') {
          setNotifications((previous) => [payload.notification, ...previous])
          setUnread((count) => count + 1)
        }
        listeners.current.forEach((handler) => handler(payload))
      }
      connection.onclose = () => {
        setSocket(null)
        if (!stopped) timer = setTimeout(connect, 2500)
      }
    }

    connect()
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      connection?.close()
      setSocket(null)
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    api
      .get('/api/notifications?unread_only=true&limit=30')
      .then((data) => {
        setNotifications(data.notifications)
        setUnread(data.unread)
      })
      .catch(() => {})
  }, [user])

  const subscribe = useCallback((handler) => {
    listeners.current.add(handler)
    return () => listeners.current.delete(handler)
  }, [])

  const send = useCallback(
    (payload) => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(payload))
        return true
      }
      return false
    },
    [socket],
  )

  const login = useCallback(async (identifier, password) => {
    const data = await api.post('/api/auth/login', { identifier, password })
    setToken(data.token)
    setUser(data.user)
    setWallet(data.wallet)
    return data
  }, [])

  const register = useCallback(async (payload) => {
    const data = await api.post('/api/auth/register', payload)
    setToken(data.token)
    setUser(data.user)
    setWallet(data.wallet)
    return data
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout')
    } catch {
      /* token may already be invalid */
    }
    setToken('')
    setUser(null)
    setNotifications([])
    setUnread(0)
  }, [])

  const value = useMemo(
    () => ({
      user,
      wallet,
      meta,
      loading,
      socket,
      notifications,
      unread,
      setUnread,
      setNotifications,
      setWallet,
      refresh,
      subscribe,
      send,
      login,
      register,
      logout,
    }),
    [user, wallet, meta, loading, socket, notifications, unread, refresh, subscribe, send, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}

/** Subscribe to one socket event type, e.g. useSocketEvent('room_state', handler). */
export function useSocketEvent(type, handler) {
  const { subscribe } = useAuth()
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    return subscribe((payload) => {
      if (payload.type === type) ref.current(payload)
    })
  }, [subscribe, type])
}
