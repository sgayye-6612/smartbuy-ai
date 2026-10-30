// App-wide settings: theme (light/dark/system) and delivery preference.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, getToken, type Delivery } from './api'

type Theme = 'light' | 'dark' | 'system'
type Settings = {
  theme: Theme
  isDark: boolean
  setTheme: (t: Theme) => void
  delivery: Delivery
  setDelivery: (d: Delivery) => void
}

const SettingsContext = createContext<Settings | null>(null)

function read<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T) || fallback
  } catch {
    return fallback
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => read('smartbuy_theme', 'system'))
  const [delivery, setDeliveryState] = useState<Delivery>(() => read('smartbuy_delivery', 'any'))
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const isDark = theme === 'dark' || (theme === 'system' && systemDark)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  const setTheme = (t: Theme) => {
    setThemeState(t)
    try {
      localStorage.setItem('smartbuy_theme', t)
    } catch {
      /* storage unavailable */
    }
  }

  const setDelivery = (d: Delivery) => {
    setDeliveryState(d)
    try {
      localStorage.setItem('smartbuy_delivery', d)
    } catch {
      /* storage unavailable */
    }
    if (getToken()) api('/api/auth/me', { method: 'PUT', body: { delivery_preference: d } }).catch(() => {})
  }

  return (
    <SettingsContext.Provider value={{ theme, isDark, setTheme, delivery, setDelivery }}>{children}</SettingsContext.Provider>
  )
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider')
  return ctx
}
