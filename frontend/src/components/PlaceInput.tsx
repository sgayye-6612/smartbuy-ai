import { Loader2, LocateFixed, MapPin, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { LABEL_EMOJI } from '../addresses'
import { api, type Address, type Place } from '../api'

type Props = {
  label: string
  placeholder: string
  icon: ReactNode
  value: Place | null
  text: string
  onText: (t: string) => void
  onSelect: (p: Place | null) => void
  near?: Place | null
  allowLocate?: boolean
  saved?: Address[]
}

/** Address box with live suggestions from OpenStreetMap, optionally "use my location". */
export default function PlaceInput({ label, placeholder, icon, value, text, onText, onSelect, near, allowLocate, saved = [] }: Props) {
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<Place[]>([])
  const [loading, setLoading] = useState(false)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState('')
  const reqId = useRef(0)

  useEffect(() => {
    if (value || text.trim().length < 2) {
      setResults([])
      return
    }
    const id = ++reqId.current
    setLoading(true)
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ q: text })
      if (near) {
        qs.set('lat', String(near.lat))
        qs.set('lng', String(near.lng))
      }
      api<{ results: Place[] }>(`/api/rides/places?${qs}`)
        .then((r) => id === reqId.current && setResults(r.results))
        .catch(() => id === reqId.current && setResults([]))
        .finally(() => id === reqId.current && setLoading(false))
    }, 300)
    return () => clearTimeout(t)
  }, [text, value, near])

  const choose = (p: Place) => {
    onSelect(p)
    onText(p.label)
    setOpen(false)
  }

  const locate = () => {
    setError('')
    if (!navigator.geolocation) {
      setError('Location is not supported on this device.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const p = await api<Place>(`/api/rides/reverse?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`)
          choose(p)
        } catch (e) {
          setError((e as Error).message)
        } finally {
          setLocating(false)
        }
      },
      () => {
        setLocating(false)
        setError('Location permission denied. Type your pickup instead.')
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  return (
    <div className="relative">
      <label className={`flex items-center gap-2.5 rounded-xl border bg-soft px-3.5 transition focus-within:border-brand-500 ${value ? 'border-brand-500/40' : 'border-line'}`}>
        <span className="shrink-0">{icon}</span>
        <input
          className="min-h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
          placeholder={placeholder}
          aria-label={label}
          value={text}
          onChange={(e) => {
            onText(e.target.value)
            if (value) onSelect(null)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && open && results[0] && !value) {
              e.preventDefault()
              choose(results[0])
            }
          }}
          autoComplete="off"
        />
        {loading && !value && <Loader2 size={16} className="shrink-0 animate-spin text-faint" />}
        {text && (
          <button type="button" onClick={() => { onText(''); onSelect(null) }} className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-full text-faint hover:bg-card hover:text-ink" aria-label={`Clear ${label}`}>
            <X size={14} />
          </button>
        )}
        {allowLocate && (
          <button type="button" onClick={locate} disabled={locating} className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg bg-card px-2 py-1.5 text-xs font-semibold text-brand-700 shadow-sm disabled:opacity-60 dark:text-brand-400" title="Use my current location">
            {locating ? <Loader2 size={14} className="animate-spin" /> : <LocateFixed size={14} />}
            <span className="hidden sm:inline">My location</span>
          </button>
        )}
      </label>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}

      {open && !value && text.trim().length < 2 && saved.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-[1000] mt-1.5 overflow-hidden rounded-xl border border-line bg-raised py-1 shadow-[var(--shadow-lift)] animate-fade-up">
          <li className="px-3.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-faint">Saved addresses</li>
          {saved.map((a) => (
            <li key={a.id}>
              <button type="button" onMouseDown={() => choose(a.place)} className="flex w-full cursor-pointer items-start gap-3 px-3.5 py-2.5 text-left hover:bg-soft">
                <span className="text-lg leading-none">{LABEL_EMOJI[a.label]}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{a.title}</span>
                  <span className="block truncate text-xs text-muted">{a.full}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && !value && results.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-[1000] mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-line bg-raised py-1 shadow-[var(--shadow-lift)] animate-fade-up">
          {results.map((p) => (
            <li key={`${p.lat},${p.lng},${p.label}`}>
              <button type="button" onMouseDown={() => choose(p)} className="flex w-full cursor-pointer items-start gap-3 px-3.5 py-2.5 text-left hover:bg-soft">
                <MapPin size={16} className="mt-0.5 shrink-0 text-faint" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{p.name}</span>
                  <span className="block truncate text-xs text-muted">{p.label}</span>
                </span>
              </button>
            </li>
          ))}
          <li className="px-3.5 pb-1 pt-2 text-[10px] text-faint">Search by OpenStreetMap</li>
        </ul>
      )}
    </div>
  )
}
