import { ArrowUpDown, ArrowUpRight, Building2, Clock, Info, MapPin, Navigation, Route, Star, Timer, Trophy, Users, Wallet } from 'lucide-react'
import { lazy, Suspense, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, rupees, type Place, type RideOption, type RideResult } from '../api'
import { LABEL_EMOJI, useAddresses } from '../addresses'
import PlaceInput from '../components/PlaceInput'
import { ErrorBox, HandoffSheet, PageHeader, PlatformMark } from '../components/ui'

// The map library is only loaded on this page
const RouteMap = lazy(() => import('../components/RouteMap'))

const QUICK_PICKS: [string, string, string][] = [
  ['Hyderabad', 'HITEC City', 'Rajiv Gandhi International Airport'],
  ['Mumbai', 'Andheri West', 'Chhatrapati Shivaji Maharaj International Airport'],
  ['Bengaluru', 'Koramangala', 'Kempegowda International Airport'],
  ['Delhi NCR', 'Connaught Place', 'Indira Gandhi International Airport'],
]

export default function RidesPage() {
  const [params, setParams] = useSearchParams()
  const [pickupText, setPickupText] = useState(params.get('pickup') ?? '')
  const [dropText, setDropText] = useState(params.get('drop') ?? '')
  const [pickup, setPickup] = useState<Place | null>(null)
  const [drop, setDrop] = useState<Place | null>(null)
  const [result, setResult] = useState<RideResult | null>(null)
  const [vclass, setVclass] = useState('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [booking, setBooking] = useState<RideOption | null>(null)
  const { addresses, defaultAddress } = useAddresses()

  // Start with the default saved address as pickup (like the real ride apps)
  useEffect(() => {
    if (defaultAddress && !params.get('pickup') && !pickup && !pickupText) {
      setPickup(defaultAddress.place)
      setPickupText(defaultAddress.place.label)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultAddress])

  const pickSaved = (a: NonNullable<typeof defaultAddress>, as: 'pickup' | 'drop') => {
    if (as === 'pickup') {
      setPickup(a.place)
      setPickupText(a.place.label)
    } else {
      setDrop(a.place)
      setDropText(a.place.label)
    }
  }

  const run = async (p: Place | string, d: Place | string) => {
    setError('')
    setLoading(true)
    try {
      const r = await api<RideResult>('/api/rides/estimate', { method: 'POST', body: { pickup: p, drop: d } })
      setResult(r)
      setVclass('all')
      // Show exactly which places were used
      setPickup(r.pickup)
      setDrop(r.drop)
      setPickupText(r.pickup.label)
      setDropText(r.drop.label)
    } catch (e) {
      setError((e as Error).message)
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  // Links from the home search / assistant arrive as ?pickup=...&drop=...
  useEffect(() => {
    const p = params.get('pickup'), d = params.get('drop')
    if (p && d) {
      setPickupText(p)
      setDropText(d)
      run(p, d)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!pickupText.trim() || !dropText.trim()) return
    run(pickup ?? pickupText, drop ?? dropText)
  }
  const swap = () => {
    setPickup(drop)
    setDrop(pickup)
    setPickupText(dropText)
    setDropText(pickupText)
  }

  const groups = result?.groups.filter((g) => vclass === 'all' || g.vehicle_class === vclass) ?? []

  return (
    <>
      <PageHeader eyebrow="Travel & transport" title="Compare rides" subtitle="Any address in India. Uber, Ola and Rapido side by side: fare, pickup time, trip duration and availability." />

      <form onSubmit={submit} className="card relative p-4 md:p-5">
        <div className="relative grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] md:items-start">
          <PlaceInput
            label="Pickup"
            placeholder="Pickup: area, street, landmark…"
            icon={<MapPin size={18} className="text-brand-600" />}
            value={pickup}
            text={pickupText}
            onText={setPickupText}
            onSelect={setPickup}
            near={drop}
            allowLocate
            saved={addresses ?? []}
          />
          <button type="button" onClick={swap} className="mx-auto mt-1 grid h-10 w-10 cursor-pointer place-items-center rounded-full border border-line bg-card text-muted transition hover:rotate-180 hover:text-ink md:mx-0" aria-label="Swap pickup and drop">
            <ArrowUpDown size={16} />
          </button>
          <PlaceInput
            label="Drop"
            placeholder="Where to?"
            icon={<Navigation size={18} className="text-rose-500" />}
            value={drop}
            text={dropText}
            onText={setDropText}
            onSelect={setDrop}
            near={pickup}
            saved={addresses ?? []}
          />
          <button className="btn-brand min-h-12 px-6" disabled={!pickupText.trim() || !dropText.trim() || loading}>{loading ? 'Comparing…' : 'Compare fares'}</button>
        </div>
        {addresses && addresses.length > 0 && (
          <div className="relative mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-muted">Saved:</span>
            {addresses.slice(0, 4).map((a) => (
              <span key={a.id} className="inline-flex overflow-hidden rounded-full border border-line bg-card">
                <button type="button" onClick={() => pickSaved(a, 'pickup')} className="cursor-pointer px-2.5 py-1 font-semibold hover:bg-soft" title={`Pickup from ${a.title}`}>
                  {LABEL_EMOJI[a.label]} {a.title}
                </button>
                <button type="button" onClick={() => pickSaved(a, 'drop')} className="cursor-pointer border-l border-line px-2.5 py-1 text-muted hover:bg-soft hover:text-ink" title={`Drop at ${a.title}`}>
                  as drop
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="relative mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>Try:</span>
          {QUICK_PICKS.map(([city, a, b]) => (
            <button type="button" key={city} onClick={() => setParams({ pickup: `${a}, ${city}`, drop: `${b}` })} className="chip cursor-pointer bg-soft px-2.5 py-1 hover:text-ink">
              {city}: {a} → Airport
            </button>
          ))}
        </div>
      </form>

      {error && <div className="mt-4"><ErrorBox message={error} /></div>}

      {loading && (
        <div className="mt-6 space-y-3">
          <div className="skeleton h-64 rounded-2xl" />
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
        </div>
      )}

      {!loading && result && (
        <div className="mt-6 animate-fade-up">
          <Suspense fallback={<div className="skeleton h-64 rounded-2xl md:h-80" />}>
            <RouteMap pickup={result.pickup} drop={result.drop} route={result.route} estimated={result.route_source !== 'osrm'} />
          </Suspense>

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat icon={<Route size={16} />} label={result.route_source === 'osrm' ? 'Road distance' : 'Distance (approx.)'} value={`${result.distance_km} km`} />
            <Stat icon={<Timer size={16} />} label="Trip time" value={`~${result.duration_mins} min`} />
            <Stat icon={<Clock size={16} />} label="Traffic" value={result.peak_hours ? 'Peak hours' : 'Normal'} />
            <Stat icon={<Building2 size={16} />} label="City" value={result.city ?? '—'} />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {result.best && <Highlight title="Best overall" icon={<Trophy size={14} />} o={result.best} tone="brand" onBook={() => setBooking(result.best)} />}
            {result.cheapest && result.cheapest.product !== result.best?.product && (
              <Highlight title="Cheapest" icon={<Wallet size={14} />} o={result.cheapest} tone="sky" onBook={() => setBooking(result.cheapest)} />
            )}
          </div>

          <div className="no-scrollbar -mx-4 mt-6 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
            {[{ vehicle_class: 'all', label: 'All', icon: '✨' }, ...result.groups].map((g) => (
              <button
                key={g.vehicle_class}
                onClick={() => setVclass(g.vehicle_class)}
                className={`chip min-h-9 shrink-0 cursor-pointer gap-1.5 px-3.5 text-xs ${vclass === g.vehicle_class ? 'bg-ink text-canvas' : 'border border-line bg-card text-muted'}`}
              >
                <span>{g.icon}</span> {g.label}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-6">
            {groups.map((g) => (
              <section key={g.vehicle_class}>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><span className="text-lg">{g.icon}</span> {g.label}</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  {g.options.map((o, i) => (
                    <RideCard key={o.product} o={o} index={i} cheapest={o.product === g.cheapest} fastest={o.product === g.fastest_pickup} onBook={() => setBooking(o)} />
                  ))}
                </div>
              </section>
            ))}
          </div>

          <p className="mt-6 flex items-start gap-2 text-xs text-muted"><Info size={14} className="mt-0.5 shrink-0" /> {result.note}</p>
        </div>
      )}

      {booking && (
        <HandoffSheet
          title={`Book ${booking.product}`}
          url={booking.booking.url}
          cta={`Open ${booking.platform.name}`}
          lines={[booking.booking.note, `Estimated fare ₹${booking.fare_low}–₹${booking.fare_high}. ${booking.platform.name} shows the confirmed fare before you book.`, 'SmartBuy has not booked a ride. You confirm it in the app.']}
          onClose={() => setBooking(null)}
        />
      )}
    </>
  )
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="card px-3 py-3">
      <div className="flex items-center gap-1.5 text-xs text-muted">{icon} {label}</div>
      <div className="mt-1 text-sm font-bold md:text-base">{value}</div>
    </div>
  )
}

function Highlight({ title, icon, o, tone, onBook }: { title: string; icon: ReactNode; o: RideOption; tone: 'brand' | 'sky'; onBook: () => void }) {
  const bg = tone === 'brand' ? 'from-brand-600 to-emerald-800' : 'from-sky-600 to-indigo-700'
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${bg} p-5 text-white`}>
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10" />
      <div className="relative flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white/80">{icon} {title}</div>
      <div className="relative mt-2 flex items-end justify-between gap-3">
        <div>
          <div className="text-lg font-extrabold">{o.icon} {o.product}</div>
          <div className="text-xs text-white/80">Pickup in {o.pickup_eta_mins} min · {o.trip_mins} min trip</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-extrabold">~{rupees(o.fare_estimate)}</div>
          <div className="text-[11px] text-white/80">{rupees(o.fare_low)}–{rupees(o.fare_high)}</div>
        </div>
      </div>
      <button onClick={onBook} className="btn relative mt-4 w-full bg-white/15 text-white hover:bg-white/25">
        {o.booking.verb} {o.platform.name} <ArrowUpRight size={16} />
      </button>
    </div>
  )
}

function RideCard({ o, cheapest, fastest, onBook, index }: { o: RideOption; cheapest: boolean; fastest: boolean; onBook: () => void; index: number }) {
  return (
    <div className={`card flex items-center gap-3 p-4 animate-fade-up ${!o.available ? 'opacity-50' : ''}`} style={{ animationDelay: `${index * 50}ms` }}>
      <PlatformMark name={o.platform.name} slug={o.platform.slug} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-bold">{o.product}</span>
          {o.is_favorite && <span className="chip bg-amber-500/15 text-amber-700 dark:text-amber-300"><Star size={10} fill="currentColor" /> Your pick</span>}
          {cheapest && o.available && <span className="chip bg-brand-500/12 text-brand-700 dark:text-brand-300">Cheapest</span>}
          {fastest && o.available && <span className="chip bg-sky-500/12 text-sky-700 dark:text-sky-300">Fastest pickup</span>}
          {o.surge > 1.1 && <span className="chip bg-rose-500/12 text-rose-700 dark:text-rose-300">{o.surge}× surge</span>}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
          {o.available ? <span>Pickup {o.pickup_eta_mins} min</span> : <span className="font-semibold text-rose-600">{o.unavailable_reason ?? 'Unavailable now'}</span>}
          <span>{o.trip_mins} min trip</span>
          <span className="flex items-center gap-0.5"><Users size={11} /> {o.seats}</span>
        </div>
      </div>
      <div className="text-right">
        <div className="text-lg font-extrabold">~{rupees(o.fare_estimate)}</div>
        <button className="mt-1 cursor-pointer text-xs font-semibold text-brand-700 disabled:cursor-not-allowed disabled:text-faint dark:text-brand-400" onClick={onBook} disabled={!o.available}>
          {o.booking.verb} {o.platform.name} ↗
        </button>
      </div>
    </div>
  )
}
