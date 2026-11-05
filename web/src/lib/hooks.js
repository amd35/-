import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Runs an async loader on mount (and whenever `deps` change) while tracking
 * loading/error state. `reload()` runs it again — pages use it for a refresh
 * button without repeating the same useEffect/useState boilerplate.
 */
export function useRemote(loader, deps = []) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const latest = useRef(loader)
  latest.current = loader

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await latest.current())
    } catch (err) {
      setError(err.message)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
    // The caller owns `deps`; they are spread so the loader re-runs on change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, ...deps])

  return { data, error, loading, reload }
}
