import { ArrowDownUp, Check, Leaf, SearchX, SlidersHorizontal, X, Zap } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, type Product } from '../api'
import { FOOD_SUBS, GROCERY_SUBS, SHOP_TABS, SORTS, type SortKey, type Sub } from '../catalog'
import SmartSearch from '../components/SmartSearch'
import { CardSkeletons, DeliverTo, DeliveryToggle, Empty, ErrorBox, ProductCard, SampleBadge, VegMark } from '../components/ui'
import { useSettings } from '../settings'

type Kind = 'groceries' | 'food' | 'shop'

const PRICE_CAPS: Record<Kind, number[]> = { groceries: [100, 300, 500], food: [150, 250, 400], shop: [1000, 2500, 5000] }

const HEADERS: Record<Kind, { title: string; subtitle: string; tint: string }> = {
  groceries: { title: 'Groceries', subtitle: 'Blinkit, Zepto, Instamart, BigBasket and Amazon Fresh in one place', tint: 'from-lime-300/30 via-emerald-200/20 to-transparent dark:from-lime-500/10 dark:via-emerald-500/5' },
  food: { title: 'Food', subtitle: 'Swiggy vs Zomato: menu price, fees, coupons and delivery time', tint: 'from-amber-200/40 via-orange-200/20 to-transparent dark:from-amber-500/10 dark:via-orange-500/5' },
  shop: { title: 'Shopping & Lifestyle', subtitle: 'Tech, fashion, beauty and home across Amazon, Flipkart, Myntra, Nykaa and more', tint: 'from-violet-200/40 via-pink-200/20 to-transparent dark:from-violet-500/10 dark:via-pink-500/5' },
}

export default function SectionPage({ kind }: { kind: Kind }) {
  const [params, setParams] = useSearchParams()
  const { delivery, setDelivery } = useSettings()
  const tabKey = kind === 'shop' ? (params.get('tab') ?? 'electronics') : null
  const tab = SHOP_TABS.find((t) => t.key === tabKey) ?? SHOP_TABS[0]
  const category = kind === 'shop' ? tab.key : kind
  const subs: Sub[] = kind === 'groceries' ? GROCERY_SUBS : kind === 'food' ? FOOD_SUBS : tab.subs
  const sub = params.get('sub') ?? ''

  const [products, setProducts] = useState<Product[] | null>(null)
  const [error, setError] = useState('')
  const [sort, setSort] = useState<SortKey>('relevance')
  const [maxPrice, setMaxPrice] = useState<number | null>(null)
  const [veg, setVeg] = useState<'all' | 'veg' | 'nonveg'>('all')
  const [brands, setBrands] = useState<Set<string>>(new Set())
  const [onlyDeals, setOnlyDeals] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => {
    setProducts(null)
    setError('')
    const qs = new URLSearchParams({ category })
    if (kind !== 'food') qs.set('delivery', delivery)
    api<Product[]>(`/api/products?${qs}`).then(setProducts).catch((e) => setError(e.message))
  }, [category, delivery, kind])

  // Reset filters when switching tabs
  useEffect(() => {
    setBrands(new Set())
    setMaxPrice(null)
  }, [category])

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key === 'tab') next.delete('sub')
    setParams(next, { replace: true })
  }

  const inSub = useMemo(() => (products ?? []).filter((p) => !sub || p.subcategory === sub), [products, sub])
  const allBrands = useMemo(() => [...new Set(inSub.map((p) => p.brand))].sort(), [inSub])

  const shown = useMemo(() => {
    let list = inSub.filter((p) => p.lowest_price != null)
    if (maxPrice) list = list.filter((p) => (p.lowest_price ?? 0) <= maxPrice)
    if (veg !== 'all') list = list.filter((p) => (veg === 'veg' ? p.veg : p.veg === false))
    if (brands.size) list = list.filter((p) => brands.has(p.brand))
    const off = (p: Product) => (p.mrp && p.lowest_price ? 1 - p.lowest_price / p.mrp : 0)
    if (onlyDeals) list = list.filter((p) => off(p) >= 0.1)
    const sorted = [...list]
    if (sort === 'price-asc') sorted.sort((a, b) => (a.lowest_price ?? 0) - (b.lowest_price ?? 0))
    if (sort === 'price-desc') sorted.sort((a, b) => (b.lowest_price ?? 0) - (a.lowest_price ?? 0))
    if (sort === 'discount') sorted.sort((a, b) => off(b) - off(a))
    if (sort === 'fastest') sorted.sort((a, b) => (a.fastest_mins ?? 1e9) - (b.fastest_mins ?? 1e9))
    return sorted
  }, [inSub, maxPrice, veg, brands, onlyDeals, sort])

  const activeFilters = (maxPrice ? 1 : 0) + (veg !== 'all' ? 1 : 0) + brands.size + (onlyDeals ? 1 : 0) + (sort !== 'relevance' ? 1 : 0)
  const clearFilters = () => {
    setMaxPrice(null)
    setVeg('all')
    setBrands(new Set())
    setOnlyDeals(false)
    setSort('relevance')
  }

  const add = async (p: Product) => {
    try {
      await api('/api/basket', { method: 'POST', body: { product_id: p.id, quantity: 1 } })
      setToast(kind === 'food' ? `${p.name} added. Add more dishes, then check out from the basket` : `${p.name} added to basket`)
      setTimeout(() => setToast(''), 2400)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const head = HEADERS[kind]
  const subLabel = subs.find((s) => s.key === sub)?.label

  return (
    <>
      {/* Header */}
      <div className={`relative -mx-4 -mt-5 mb-5 bg-gradient-to-b px-4 pb-4 pt-5 md:-mx-10 md:-mt-8 md:px-10 md:pt-8 ${head.tint}`}>
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">{head.title}</h1>
              <p className="mt-1 text-sm text-muted">{head.subtitle}</p>
            </div>
            <div className="flex flex-col items-start gap-1 md:items-end">
              <DeliverTo />
              <SampleBadge />
            </div>
          </div>
          <div className="mt-4 max-w-3xl">
            <SmartSearch size="md" category={category} />
          </div>

          {/* Shop tabs */}
          {kind === 'shop' && (
            <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
              {SHOP_TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => set('tab', t.key)}
                  className={`flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-2xl px-4 text-sm font-bold transition ${
                    t.key === tab.key ? 'bg-ink text-canvas shadow-md' : 'border border-line bg-card text-muted hover:text-ink'
                  }`}
                >
                  <span className="text-lg">{t.emoji}</span> {t.label}
                </button>
              ))}
            </div>
          )}

          {/* Food: "What's on your mind?" cuisine circles */}
          {kind === 'food' && (
            <div className="mt-5">
              <div className="mb-2 text-sm font-bold">What’s on your mind?</div>
              <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
                {subs.map((s) => <CircleChip key={s.key} s={s} on={sub === s.key} onClick={() => set('sub', sub === s.key ? null : s.key)} />)}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={kind === 'groceries' ? 'grid grid-cols-[84px_minmax(0,1fr)] gap-3 md:grid-cols-[210px_minmax(0,1fr)] md:gap-6' : ''}>
        {/* Groceries: Blinkit-style side rail */}
        {kind === 'groceries' && (
          <aside className="sticky top-[76px] h-fit self-start md:top-6">
            <nav className="card overflow-hidden" aria-label="Grocery categories">
              <RailItem label="All" emoji="🛒" on={!sub} onClick={() => set('sub', null)} />
              {subs.map((s) => <RailItem key={s.key} label={s.label} emoji={s.emoji} on={sub === s.key} onClick={() => set('sub', s.key)} />)}
            </nav>
          </aside>
        )}

        <div className="min-w-0">
          {/* Sub-category chips (shop) */}
          {kind === 'shop' && (
            <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
              <SubChip label="All" on={!sub} onClick={() => set('sub', null)} />
              {subs.map((s) => <SubChip key={s.key} label={s.label} emoji={s.emoji} on={sub === s.key} onClick={() => set('sub', s.key)} />)}
            </div>
          )}

          {/* Filter bar */}
          <div className="no-scrollbar -mx-4 mb-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
            <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-muted"><SlidersHorizontal size={14} /> Filters</span>
            <SortSelect value={sort} onChange={setSort} />
            {kind !== 'food' && <DeliveryToggle value={delivery} onChange={setDelivery} />}
            {kind === 'food' && (
              <>
                <FilterPill on={veg === 'veg'} onClick={() => setVeg(veg === 'veg' ? 'all' : 'veg')}><VegMark veg /> Pure veg</FilterPill>
                <FilterPill on={veg === 'nonveg'} onClick={() => setVeg(veg === 'nonveg' ? 'all' : 'nonveg')}><VegMark veg={false} /> Non-veg</FilterPill>
              </>
            )}
            {PRICE_CAPS[kind].map((cap) => (
              <FilterPill key={cap} on={maxPrice === cap} onClick={() => setMaxPrice(maxPrice === cap ? null : cap)}>Under ₹{cap.toLocaleString('en-IN')}</FilterPill>
            ))}
            <FilterPill on={onlyDeals} onClick={() => setOnlyDeals(!onlyDeals)}><Leaf size={13} /> 10%+ off</FilterPill>
            {activeFilters > 0 && (
              <button onClick={clearFilters} className="flex shrink-0 cursor-pointer items-center gap-1 text-xs font-semibold text-rose-600"><X size={13} /> Clear ({activeFilters})</button>
            )}
          </div>

          {/* Brand / restaurant filter */}
          {allBrands.length > 1 && (
            <div className="no-scrollbar -mx-4 mb-4 flex items-center gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
              <span className="shrink-0 text-xs font-semibold text-muted">{kind === 'food' ? 'Restaurants' : 'Brands'}</span>
              {allBrands.map((b) => (
                <FilterPill
                  key={b}
                  small
                  on={brands.has(b)}
                  onClick={() =>
                    setBrands((s) => {
                      const n = new Set(s)
                      if (n.has(b)) n.delete(b)
                      else n.add(b)
                      return n
                    })
                  }
                >
                  {brands.has(b) && <Check size={12} />} {b}
                </FilterPill>
              ))}
            </div>
          )}

          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-bold">{subLabel ?? (kind === 'shop' ? tab.label : 'All items')}</h2>
            {products && <span className="text-xs text-muted">{shown.length} item{shown.length === 1 ? '' : 's'}</span>}
          </div>

          {toast && <div className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-sm rounded-xl bg-ink px-4 py-3 text-center text-sm font-medium text-canvas shadow-xl animate-fade-up md:bottom-8">✓ {toast}</div>}
          {error && <ErrorBox message={error} />}
          {!products && !error && <CardSkeletons n={6} />}
          {products && shown.length === 0 && (
            <Empty
              icon={<SearchX />}
              title="Nothing matches these filters"
              text={delivery === 'instant' && kind !== 'food' ? 'Few items here come with instant delivery. Try “Any” delivery or clear filters.' : 'Try clearing a filter or picking another category.'}
              action={<button className="btn-ghost" onClick={() => { clearFilters(); if (kind !== 'food') setDelivery('any') }}>Reset filters</button>}
            />
          )}
          {products && shown.length > 0 && (
            <div className={`grid gap-3 md:gap-4 ${kind === 'groceries' ? 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4'}`}>
              {shown.map((p, i) => (
                <ProductCard key={p.id} p={p} index={i} onAdd={() => add(p)} footnote={kind === 'food' ? p.description?.split('·').slice(-1)[0]?.trim() : undefined} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function RailItem({ label, emoji, on, onClick }: { label: string; emoji: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex w-full cursor-pointer flex-col items-center gap-1 border-b border-line px-1.5 py-2.5 text-center transition last:border-b-0 md:flex-row md:gap-3 md:px-3 md:text-left ${
        on ? 'bg-brand-500/10' : 'hover:bg-soft'
      }`}
      aria-pressed={on}
    >
      {on && <span className="absolute inset-y-2 right-0 w-1 rounded-l-full bg-brand-600 md:left-0 md:right-auto md:rounded-l-none md:rounded-r-full" />}
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-xl transition ${on ? 'bg-brand-500/20 scale-105' : 'bg-soft'}`}>{emoji}</span>
      <span className={`text-[10.5px] leading-tight md:text-sm ${on ? 'font-bold text-ink' : 'font-medium text-muted'}`}>{label}</span>
    </button>
  )
}

function CircleChip({ s, on, onClick }: { s: Sub; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-20 shrink-0 cursor-pointer flex-col items-center gap-1.5" aria-pressed={on}>
      <span className={`grid h-16 w-16 place-items-center rounded-full text-3xl transition ${on ? 'bg-orange-500/20 ring-2 ring-orange-500' : 'bg-card shadow-sm ring-1 ring-line hover:scale-105'}`}>{s.emoji}</span>
      <span className={`text-center text-xs leading-tight ${on ? 'font-bold' : 'font-medium text-muted'}`}>{s.label}</span>
    </button>
  )
}

function SubChip({ label, emoji, on, onClick }: { label: string; emoji?: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex min-h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition ${
        on ? 'bg-brand-600 text-white' : 'border border-line bg-card text-muted hover:text-ink'
      }`}
    >
      {emoji && <span>{emoji}</span>} {label}
    </button>
  )
}

function FilterPill({ on, onClick, children, small }: { on: boolean; onClick: () => void; children: ReactNode; small?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border px-3 font-semibold transition ${small ? 'min-h-8 text-xs' : 'min-h-10 text-sm'} ${
        on ? 'border-ink bg-ink text-canvas' : 'border-line bg-card text-muted hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

function SortSelect({ value, onChange }: { value: SortKey; onChange: (s: SortKey) => void }) {
  const label = value === 'relevance' ? 'Sort' : SORTS.find((s) => s.key === value)?.label
  return (
    <label className={`relative flex min-h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold ${value !== 'relevance' ? 'border-ink bg-ink text-canvas' : 'border-line bg-card text-muted hover:text-ink'}`}>
      {value === 'fastest' ? <Zap size={14} /> : <ArrowDownUp size={14} />}
      <span>{label}</span>
      {/* Invisible native select on top: keyboard + mobile friendly, sized to the visible label */}
      <select value={value} onChange={(e) => onChange(e.target.value as SortKey)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Sort by">
        {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
    </label>
  )
}
