import {
  ArrowUpRight, CarTaxiFront, Check, Clock, Headphones, Info, Shirt, ShoppingBasket, Sofa, Sparkles,
  Truck, UtensilsCrossed, X, Zap, type LucideIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { LABEL_EMOJI, useAddresses } from '../addresses'
import { api, eta, rupees, type Deal, type Delivery, type PriceStats, type Product } from '../api'

// ---------- Categories ----------
export const CATEGORY_ICON: Record<string, LucideIcon> = {
  groceries: ShoppingBasket, food: UtensilsCrossed, rides: CarTaxiFront, electronics: Headphones,
  fashion: Shirt, beauty: Sparkles, shopping: Sofa,
}
export const CATEGORY_TINT: Record<string, string> = {
  groceries: 'from-lime-300/40 via-emerald-200/30 to-emerald-400/20 dark:from-lime-400/15 dark:via-emerald-500/10 dark:to-emerald-500/20',
  food: 'from-amber-200/50 via-orange-200/30 to-rose-300/30 dark:from-amber-400/15 dark:via-orange-500/10 dark:to-rose-500/20',
  rides: 'from-sky-200/50 via-cyan-100/30 to-indigo-300/30 dark:from-sky-400/15 dark:via-cyan-500/10 dark:to-indigo-500/20',
  electronics: 'from-violet-200/50 via-indigo-100/30 to-sky-300/30 dark:from-violet-400/15 dark:via-indigo-500/10 dark:to-sky-500/20',
  fashion: 'from-pink-200/50 via-fuchsia-100/30 to-violet-300/30 dark:from-pink-400/15 dark:via-fuchsia-500/10 dark:to-violet-500/20',
  beauty: 'from-rose-200/50 via-pink-100/30 to-amber-200/40 dark:from-rose-400/15 dark:via-pink-500/10 dark:to-amber-500/15',
  shopping: 'from-amber-100/60 via-orange-100/30 to-stone-300/30 dark:from-amber-400/10 dark:via-orange-500/10 dark:to-stone-500/20',
}
export const CATEGORY_ACCENT: Record<string, string> = {
  groceries: 'text-emerald-600 dark:text-emerald-400', food: 'text-orange-600 dark:text-orange-400',
  rides: 'text-sky-600 dark:text-sky-400', electronics: 'text-violet-600 dark:text-violet-400',
  fashion: 'text-pink-600 dark:text-pink-400', beauty: 'text-rose-600 dark:text-rose-400', shopping: 'text-amber-600 dark:text-amber-400',
}

/** Illustrated product tile (no third-party product photos are used). */
export function ProductArt({ p, size = 'md', className = '' }: { p: Pick<Product, 'emoji' | 'category'>; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  const dims = { sm: 'h-11 w-11 text-2xl rounded-xl', md: 'h-14 w-14 text-3xl rounded-2xl', lg: 'aspect-[4/3] w-full text-6xl rounded-2xl', xl: 'h-28 w-28 text-6xl rounded-3xl' }[size]
  return (
    <div className={`relative grid shrink-0 place-items-center overflow-hidden bg-gradient-to-br ${CATEGORY_TINT[p.category] ?? CATEGORY_TINT.shopping} ${dims} ${className}`}>
      <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-white/40 blur-xl dark:bg-white/5" />
      <span className="relative drop-shadow-[0_6px_10px_rgba(0,0,0,0.15)]">{p.emoji}</span>
    </div>
  )
}

// ---------- Platforms ----------
const MARK_COLORS = ['bg-emerald-600', 'bg-sky-600', 'bg-violet-600', 'bg-amber-600', 'bg-rose-600', 'bg-indigo-600', 'bg-teal-600', 'bg-orange-600', 'bg-fuchsia-600', 'bg-cyan-700', 'bg-slate-700', 'bg-lime-700']
// Fixed order so platforms shown side by side never share a colour
const SLUG_ORDER = ['blinkit', 'zepto', 'instamart', 'bigbasket', 'amazon-fresh', 'amazon', 'flipkart', 'croma', 'meesho', 'myntra', 'ajio', 'nykaa', 'purplle', 'tira', 'swiggy', 'zomato', 'uber', 'ola', 'rapido']
const RIDE_COLORS: Record<string, string> = { uber: 'bg-slate-800 dark:bg-slate-600', ola: 'bg-lime-700', rapido: 'bg-amber-600', swiggy: 'bg-orange-600', zomato: 'bg-rose-600' }
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
const markColor = (slug: string) => {
  const i = SLUG_ORDER.indexOf(slug)
  return RIDE_COLORS[slug] ?? MARK_COLORS[(i >= 0 ? i : hash(slug)) % MARK_COLORS.length]
}

/** Neutral monogram for a platform (we don't reproduce platform logos). */
export function PlatformMark({ name, slug, size = 'md' }: { name: string; slug: string; size?: 'sm' | 'md' }) {
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  const dims = size === 'sm' ? 'h-7 w-7 text-[10px] rounded-lg' : 'h-10 w-10 text-xs rounded-xl'
  return <div className={`grid shrink-0 place-items-center font-extrabold text-white ${dims} ${markColor(slug)}`}>{initials}</div>
}

export function DeliveryBadge({ type }: { type: string }) {
  if (type === 'instant') return <span className="chip bg-amber-400 text-amber-950"><Zap size={11} strokeWidth={2.6} /> Instant</span>
  if (type === 'standard') return <span className="chip bg-sky-500 text-white"><Truck size={11} strokeWidth={2.6} /> Standard</span>
  return null
}

export function SampleBadge({ label = 'Sample data' }: { label?: string }) {
  return (
    <span className="chip bg-soft text-muted" title="Not live data. Prices and times are realistic samples for demonstration.">
      <Info size={11} /> {label}
    </span>
  )
}

// ---------- Delivery preference ----------
const DELIVERY_OPTS: { key: Delivery; label: string; time: string; apps: string; icon: LucideIcon; on: string; iconOn: string }[] = [
  {
    key: 'instant', label: 'Instant', time: '10–30 min', apps: 'Blinkit · Zepto · Instamart', icon: Zap,
    on: 'border-amber-400 bg-amber-400/12 ring-4 ring-amber-400/15 dark:border-amber-400/70',
    iconOn: 'bg-amber-400 text-amber-950',
  },
  {
    key: 'standard', label: 'Standard', time: 'Same day – 3 days', apps: 'Amazon · Flipkart · BigBasket', icon: Truck,
    on: 'border-sky-500 bg-sky-500/10 ring-4 ring-sky-500/15 dark:border-sky-400/70',
    iconOn: 'bg-sky-500 text-white',
  },
  {
    key: 'any', label: 'No preference', time: 'Show everything', apps: 'Best price wins', icon: Sparkles,
    on: 'border-brand-500 bg-brand-500/10 ring-4 ring-brand-500/15 dark:border-brand-400/70',
    iconOn: 'bg-brand-600 text-white',
  },
]

/**
 * Delivery speed picker.
 *  - "cards": large, descriptive option cards (Home, Search)
 *  - "pills": compact coloured toggle (Compare, Basket)
 */
export function DeliveryToggle({ value, onChange, variant = 'pills' }: { value: Delivery; onChange: (d: Delivery) => void; variant?: 'cards' | 'pills'; compact?: boolean }) {
  if (variant === 'cards') {
    return (
      <div role="radiogroup" aria-label="Delivery speed" className="grid grid-cols-3 gap-2 md:gap-3">
        {DELIVERY_OPTS.map((o) => {
          const active = value === o.key
          return (
            <button
              key={o.key}
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.key)}
              className={`group relative flex cursor-pointer flex-col items-start gap-2 rounded-2xl border-2 p-3 text-left transition md:flex-row md:items-center md:gap-3 md:p-4 ${
                active ? o.on : 'border-line bg-card hover:border-faint'
              }`}
            >
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition md:h-11 md:w-11 ${active ? o.iconOn : 'bg-soft text-muted'}`}>
                <o.icon size={20} strokeWidth={2.4} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-extrabold leading-tight md:text-base">{o.key === 'any' ? <><span className="md:hidden">Any</span><span className="hidden md:inline">{o.label}</span></> : o.label}</span>
                <span className="block text-[11px] font-semibold text-muted md:text-xs">{o.time}</span>
                <span className="hidden truncate text-[11px] text-faint md:block">{o.apps}</span>
              </span>
              {active && (
                <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-ink text-canvas md:static md:ml-auto">
                  <Check size={12} strokeWidth={3} />
                </span>
              )}
            </button>
          )
        })}
      </div>
    )
  }
  return (
    <div role="radiogroup" aria-label="Delivery speed" className="inline-flex gap-1 rounded-2xl border border-line bg-card p-1 shadow-[var(--shadow-card)]">
      {[DELIVERY_OPTS[2], DELIVERY_OPTS[0], DELIVERY_OPTS[1]].map((o) => {
        const active = value === o.key
        return (
          <button
            key={o.key}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.key)}
            className={`flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl px-3.5 text-sm font-bold transition ${active ? o.iconOn + ' shadow-sm' : 'text-muted hover:bg-soft hover:text-ink'}`}
          >
            <o.icon size={15} strokeWidth={2.4} />
            {o.key === 'any' ? 'Any' : o.label}
          </button>
        )
      })}
    </div>
  )
}

// ---------- Saved address ----------
/** "Deliver to Home · Moosapet, Hyderabad", like the header of quick-commerce apps. */
export function DeliverTo({ prefix = 'Deliver to', compact = false }: { prefix?: string; compact?: boolean }) {
  const { defaultAddress, addresses } = useAddresses()
  if (!addresses) return <div className="skeleton h-9 w-48 rounded-xl" />
  if (!defaultAddress)
    return (
      <Link to="/profile#addresses" className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-dashed border-brand-500/60 px-3 text-sm font-semibold text-brand-700 hover:bg-brand-500/5 dark:text-brand-300">
        📍 Add delivery address
      </Link>
    )
  return (
    <Link to="/profile#addresses" className="group inline-flex min-w-0 max-w-full items-center gap-2 rounded-xl py-1 pr-2" title={defaultAddress.full}>
      <span className="text-lg">{LABEL_EMOJI[defaultAddress.label]}</span>
      <span className="min-w-0">
        {!compact && <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted">{prefix}</span>}
        <span className="flex items-center gap-1 text-sm">
          <b className="shrink-0">{defaultAddress.title}</b>
          <span className="truncate text-muted">· {defaultAddress.short}</span>
          <span className="shrink-0 text-faint transition group-hover:translate-y-0.5">▾</span>
        </span>
      </span>
    </Link>
  )
}

// ---------- Layout bits ----------
export function PageHeader({ title, subtitle, action, eyebrow }: { title: string; subtitle?: string; action?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="mb-1 text-xs font-bold uppercase tracking-widest text-brand-600 dark:text-brand-400">{eyebrow}</div>}
        <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-base font-bold">{title}</h2>
      {action}
    </div>
  )
}

export function ErrorBox({ message }: { message: string }) {
  return <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">{message}</div>
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="card px-6 py-12 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-soft text-2xl text-muted">{icon}</div>
      <div className="mt-4 font-bold">{title}</div>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function CardSkeletons({ n = 6 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="card p-3">
          <div className="skeleton aspect-[4/3] w-full rounded-xl" />
          <div className="skeleton mt-3 h-3 w-1/3" />
          <div className="skeleton mt-2 h-4 w-4/5" />
          <div className="skeleton mt-4 h-5 w-1/2" />
        </div>
      ))}
    </div>
  )
}

// ---------- Product card ----------
/** Standard Indian veg / non-veg symbol. */
export function VegMark({ veg }: { veg: boolean }) {
  return (
    <span
      className={`inline-grid h-4 w-4 shrink-0 place-items-center rounded-[3px] border-2 bg-white ${veg ? 'border-green-600' : 'border-red-700'}`}
      title={veg ? 'Veg' : 'Non-veg'}
      aria-label={veg ? 'Veg' : 'Non-veg'}
    >
      {veg ? <span className="h-2 w-2 rounded-full bg-green-600" /> : <span className="h-0 w-0 border-x-[4px] border-b-[7px] border-x-transparent border-b-red-700" />}
    </span>
  )
}

export function ProductCard({ p, index = 0, onAdd, footnote }: { p: Product; index?: number; onAdd?: () => void; footnote?: ReactNode }) {
  const off = p.mrp && p.lowest_price ? Math.round((1 - p.lowest_price / p.mrp) * 100) : 0
  return (
    <div className="card card-hover group relative flex flex-col overflow-hidden p-3 animate-fade-up" style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}>
      <Link to={`/compare/${p.id}`} className="absolute inset-0 z-10" aria-label={`Compare ${p.display_name}`} />
      <div className="relative">
        <ProductArt p={p} size="lg" />
        <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
          {off >= 5 && <span className="chip bg-ink text-canvas">{off}% off</span>}
          {p.category !== 'food' && p.fastest_mins != null && p.fastest_mins <= 60 && (
            <span className="chip bg-amber-400 text-amber-950 shadow-sm"><Zap size={11} strokeWidth={2.6} /> {p.fastest_mins} min</span>
          )}
        </div>
        {onAdd && (
          <button
            onClick={onAdd}
            className="absolute bottom-2 right-2 z-20 grid h-9 w-9 cursor-pointer place-items-center rounded-xl bg-card text-lg font-bold text-ink shadow-md transition hover:scale-105"
            title="Add to basket"
            aria-label="Add to basket"
          >
            +
          </button>
        )}
      </div>
      <div className="mt-3 flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5">
          {p.veg != null && <VegMark veg={p.veg} />}
          <span className="truncate text-[11px] font-bold uppercase tracking-wide text-faint">{p.brand}</span>
        </div>
        <div className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug">{p.name}</div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {p.size && <span className="chip bg-soft text-muted">{p.size}</span>}
          {p.variant && <span className="chip bg-violet-500/10 text-violet-700 dark:text-violet-300">{p.variant}</span>}
        </div>
        <div className="mt-auto pt-3">
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-extrabold">{rupees(p.lowest_price)}</span>
            {off >= 5 && <s className="text-xs text-faint">{rupees(p.mrp)}</s>}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
            {p.lowest_platform && <span className="truncate">on {p.lowest_platform}</span>}
            {p.fastest_mins != null && (
              <span className={`flex shrink-0 items-center gap-0.5 font-semibold ${p.category !== 'food' && p.fastest_mins <= 60 ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                {p.category !== 'food' && p.fastest_mins <= 60 ? <Zap size={11} /> : <Clock size={11} />} {eta(p.fastest_mins)}
              </span>
            )}
          </div>
          {footnote && <div className="mt-2 text-[11px] font-medium text-brand-700 dark:text-brand-400">{footnote}</div>}
        </div>
      </div>
    </div>
  )
}

// ---------- Deal & price chart ----------
const DEAL: Record<string, [string, string]> = {
  great: ['Great deal', 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'],
  good: ['Good deal', 'bg-brand-500/12 text-brand-700 dark:text-brand-300'],
  fair: ['Fair price', 'bg-amber-500/12 text-amber-700 dark:text-amber-300'],
  wait: ['Better to wait', 'bg-rose-500/12 text-rose-700 dark:text-rose-300'],
  unknown: ['No history', 'bg-soft text-muted'],
}
export function DealBadge({ deal }: { deal: Deal }) {
  const [label, cls] = DEAL[deal.verdict]
  return (
    <div className={`rounded-xl px-3 py-2.5 ${cls}`}>
      <div className="text-sm font-bold">{label}</div>
      <div className="text-xs opacity-80">{deal.message}</div>
    </div>
  )
}

export function PriceChart({ stats }: { stats: PriceStats }) {
  const pts = stats.series
  if (pts.length < 2) return <div className="text-sm text-muted">Not enough history yet.</div>
  const W = 600, H = 150, pad = 16
  const prices = pts.map((p) => p.lowest_price)
  const min = Math.min(...prices), max = Math.max(...prices)
  const range = max - min || 1
  const x = (i: number) => pad + (i / (pts.length - 1)) * (W - pad * 2)
  const y = (v: number) => H - pad - ((v - min) / range) * (H - pad * 2)
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.lowest_price).toFixed(1)}`).join(' ')
  const area = `${line} L${x(pts.length - 1)},${H - pad} L${x(0)},${H - pad} Z`
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-36 w-full" role="img" aria-label="Lowest price over the last 30 days">
        <defs>
          <linearGradient id="pc" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>
        {stats.average != null && <line x1={pad} x2={W - pad} y1={y(stats.average)} y2={y(stats.average)} stroke="currentColor" className="text-faint" strokeDasharray="4 5" />}
        <path d={area} fill="url(#pc)" />
        <path d={line} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1].lowest_price)} r="5" fill="#10b981" stroke="white" strokeWidth="2" />
      </svg>
      <div className="mt-1 grid grid-cols-3 gap-2 text-xs">
        {[['30-day low', stats.lowest], ['Average', stats.average], ['High', stats.highest]].map(([k, v]) => (
          <div key={k as string} className="rounded-lg bg-soft px-2.5 py-2">
            <div className="text-faint">{k}</div>
            <div className="font-bold">{rupees(v as number)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- Checkout handoff (transparent redirect) ----------
type Handoff = { mode: string; url: string; platform: string; link_precision: string; message: string; order_placed: boolean }

export function useCheckout() {
  const [handoff, setHandoff] = useState<Handoff | null>(null)
  const [busy, setBusy] = useState(false)
  const start = async (listingId: number) => {
    setBusy(true)
    try {
      setHandoff(await api<Handoff>('/api/checkout', { method: 'POST', body: { listing_id: listingId } }))
    } finally {
      setBusy(false)
    }
  }
  const sheet = handoff ? (
    <HandoffSheet
      title={`Continue to ${handoff.platform}`}
      url={handoff.url}
      cta={`Open ${handoff.platform}`}
      lines={[
        handoff.link_precision === 'exact' ? 'Opens the exact product page.' : handoff.link_precision === 'search' ? 'Opens search results for this exact item on the platform.' : `Opens ${handoff.platform}. Search for the item there (no public deep link available).`,
        `You'll review the price and pay on ${handoff.platform}.`,
        'SmartBuy has not placed an order. Direct checkout isn’t available for this platform yet.',
      ]}
      onClose={() => setHandoff(null)}
    />
  ) : null
  return { start, busy, sheet }
}

export function HandoffSheet({ title, url, cta, lines, onClose }: { title: string; url: string; cta: string; lines: string[]; onClose: () => void }) {
  // Rendered at the end of <body> so it always covers the full screen
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm md:items-center" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-3xl bg-card p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl animate-fade-up md:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line md:hidden" />
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-lg font-extrabold">{title}</h3>
          <button className="grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-soft text-muted" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <ul className="mt-4 space-y-2.5 text-sm text-muted">
          {lines.map((l) => (
            <li key={l} className="flex gap-2.5">
              <Check size={16} className="mt-0.5 shrink-0 text-brand-600" />
              {l}
            </li>
          ))}
        </ul>
        <a href={url} target="_blank" rel="noreferrer" className="btn-brand mt-6 w-full" onClick={onClose}>
          {cta} <ArrowUpRight size={16} />
        </a>
      </div>
    </div>,
    document.body,
  )
}
