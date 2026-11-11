import { vi } from 'vitest'

type Handler = (body: unknown, url: string) => { status?: number; json?: unknown }

export type MockHandlers = Record<string, Handler>

export function installApiMock(handlers: MockHandlers) {
  const calls: { key: string; body: unknown }[] = []

  const mock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method ?? 'GET').toUpperCase()
    const key = `${method} ${url.split('?')[0]}`
    let body: unknown = undefined
    if (typeof init?.body === 'string') {
      try {
        body = JSON.parse(init.body)
      } catch {
        body = init.body
      }
    }
    calls.push({ key, body })

    const handler = handlers[key] ?? handlers[`${method} ${url.split('?')[0]}`]
    if (!handler) {
      return Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ detail: `no mock for ${key}` }),
      } as Response)
    }
    const result = handler(body, url)
    const status = result.status ?? 200
    return Promise.resolve({
      ok: status < 400,
      status,
      json: () => Promise.resolve(result.json ?? {}),
    } as Response)
  })

  vi.stubGlobal('fetch', mock)
  return { calls, mock }
}
