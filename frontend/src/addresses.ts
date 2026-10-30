// Saved addresses: shared hook so Home, Rides, Basket and Profile stay in sync.
import { useEffect, useState } from 'react'
import { api, type Address } from './api'

export function useAddresses() {
  const [addresses, setAddresses] = useState<Address[] | null>(null)

  useEffect(() => {
    let alive = true
    const load = () =>
      api<Address[]>('/api/addresses')
        .then((a) => alive && setAddresses(a))
        .catch(() => alive && setAddresses([]))
    load()
    window.addEventListener('addresses:changed', load)
    return () => {
      alive = false
      window.removeEventListener('addresses:changed', load)
    }
  }, [])

  const defaultAddress = addresses?.find((a) => a.is_default) ?? addresses?.[0] ?? null
  return { addresses, defaultAddress }
}

export const notifyAddressesChanged = () => window.dispatchEvent(new Event('addresses:changed'))

export const LABEL_EMOJI: Record<string, string> = { home: '🏠', work: '💼', other: '📍' }
