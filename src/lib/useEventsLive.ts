import { useEffect, useRef } from 'react'

export type LiveMessage = {
  type: string
  event_id?: number
  reason?: string
}

/**
 * يشترك في قناة تحديثات الفعاليات اللحظية عبر WebSocket.
 * يعيد الاتصال تلقائيًا عند انقطاع الشبكة دون إغراق الصفحة.
 */
export function useEventsLive(onMessage: (message: LiveMessage) => void): void {
  const handler = useRef(onMessage)
  handler.current = onMessage

  useEffect(() => {
    let closed = false
    let socket: WebSocket | null = null
    let retry: ReturnType<typeof setTimeout> | null = null

    const connect = () => {
      if (closed) return
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
      try {
        socket = new WebSocket(`${protocol}://${window.location.host}/api/ws/events`)
      } catch {
        retry = setTimeout(connect, 4000)
        return
      }
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data)) as LiveMessage
          if (data && typeof data.type === 'string') handler.current(data)
        } catch {
          // رسالة غير JSON — تُتجاهل.
        }
      }
      socket.onclose = () => {
        if (!closed) retry = setTimeout(connect, 4000)
      }
      socket.onerror = () => {
        socket?.close()
      }
    }

    connect()
    return () => {
      closed = true
      if (retry) clearTimeout(retry)
      socket?.close()
    }
  }, [])
}
