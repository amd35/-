import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'records:settings'

export const DEFAULT_SETTINGS = {
  displayName: '',
  email: '',
  theme: 'light',
  defaultPage: '/dashboard',
  rowsPerPage: 10,
  emailUpdates: true,
}

function readStoredSettings() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? { ...DEFAULT_SETTINGS, ...parsed } : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

const SettingsContext = createContext(null)

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(readStoredSettings)

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    document.documentElement.dataset.theme = settings.theme
  }, [settings])

  const saveSettings = useCallback((values) => {
    setSettings((previous) => ({ ...previous, ...values }))
  }, [])

  const resetSettings = useCallback(() => setSettings(DEFAULT_SETTINGS), [])

  const value = useMemo(
    () => ({ settings, saveSettings, resetSettings }),
    [settings, saveSettings, resetSettings],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (!context) throw new Error('useSettings must be used inside a SettingsProvider')
  return context
}
