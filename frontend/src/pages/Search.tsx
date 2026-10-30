import { SearchX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, CATEGORIES, categoryLabel, type Product } from '../api'
import SmartSearch from '../components/SmartSearch'
import { CardSkeletons, CATEGORY_ICON, DeliveryToggle, Empty, ErrorBox, ProductCard, SampleBadge } from '../components/ui'
import { useSettings } from '../settings'

type SearchResult = {
  exact_matches: Product[]
  alternatives: Product[]
  parsed: { size: [number, string] | null; max_price: number | null }
  filtered_to_your_platforms: boolean
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const category = params.get('category') ?? ''
  const { delivery, setDelivery } = useSettings()
  const [result, setResult] = useState<SearchResult | null>(null)
  const [browse, setBrowse] = useState<Product[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  useEffect(() => {
    let cancelled = false
    setError('')
    setLoading(true)
    const run = async () => {
      try {
        if (q.trim()) {
          const qs = new URLSearchParams({ q, delivery, ...(category ? { category } : {}) })
          const r = await api<SearchResult>(`/api/products/search?${qs}`)
          if (!cancelled) {
            setResult(r)
            setBrowse(null)
          }
        } else {
          const r = await api<Product[]>(`/api/products?delivery=${delivery}${category ? `&category=${category}` : ''}`)
          if (!cancelled) {
            setBrowse(r)
            setResult(null)
          }
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [q, category, delivery])

  const setCategory = (c: string) => {
    if (c === 'rides') return
    const next = new URLSearchParams(params)
    if (c) next.set('category', c)
    else next.delete('category')
    setParams(next)
  }

  const add = async (p: Product) => {
    try {
      await api('/api/basket', { method: 'POST', body: { product_id: p.id, quantity: 1 } })
      setToast(`${p.name} added to basket`)
      setTimeout(() => setToast(''), 2200)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const isFood = category === 'food'
  const title = q ? `Results for “${q}”` : category ? categoryLabel(category) : 'Browse everything'

  return (
    <>
      <div className="sticky top-[61px] z-20 -mx-4 bg-canvas/90 px-4 pb-3 pt-1 backdrop-blur-xl md:static md:mx-0 md:bg-transparent md:px-0 md:pt-0 md:backdrop-blur-none">
        <SmartSearch initial={q} size="md" category={category || undefined} />
        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
          {[{ key: '', label: 'All' }, ...CATEGORIES].map((c) => {
            const Icon = c.key ? CATEGORY_ICON[c.key] : null
            const on = category === c.key
            const cls = `chip min-h-9 shrink-0 cursor-pointer gap-1.5 px-3.5 text-xs transition ${on ? 'bg-ink text-canvas' : 'border border-line bg-card text-muted hover:text-ink'}`
            return c.key === 'rides' ? (
              <Link key={c.key} to="/rides" className={cls}>
                {Icon && <Icon size={14} />} {c.label}
              </Link>
            ) : (
              <button key={c.key} onClick={() => setCategory(c.key)} className={cls}>
                {Icon && <Icon size={14} />} {c.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight md:text-2xl">{title}</h1>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {result?.parsed.size && <span className="chip bg-soft text-muted">Size: {result.parsed.size.join(' ')}</span>}
            {result?.parsed.max_price && <span className="chip bg-soft text-muted">Budget ₹{result.parsed.max_price}</span>}
            {result?.filtered_to_your_platforms && <span className="chip bg-brand-500/12 text-brand-700 dark:text-brand-300">Your platforms</span>}
            <SampleBadge />
          </div>
        </div>
      </div>
      {!isFood && (
        <div className="mt-4">
          <DeliveryToggle variant="cards" value={delivery} onChange={setDelivery} />
        </div>
      )}

      {toast && <div className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-sm rounded-xl bg-ink px-4 py-3 text-center text-sm font-medium text-canvas shadow-xl animate-fade-up md:bottom-8">✓ {toast}</div>}

      <div className="mt-5">
        {error && <ErrorBox message={error} />}
        {loading && <CardSkeletons n={8} />}

        {!loading && result && (
          result.exact_matches.length === 0 && result.alternatives.length === 0 ? (
            <Empty icon={<SearchX />} title="No matches" text="Try fewer words or a brand name. If you picked Instant or Standard, switch delivery to Any." />
          ) : (
            <>
              {result.exact_matches.length > 0 ? (
                <Grid products={result.exact_matches} onAdd={add} />
              ) : (
                <p className="mb-4 text-sm text-muted">No exact match for that size or variant. Similar products are below.</p>
              )}
              {result.alternatives.length > 0 && (
                <div className="mt-10">
                  <h2 className="font-bold">Alternatives</h2>
                  <p className="mb-4 text-sm text-muted">Different size, variant or a similar product, so they’re not treated as the same item.</p>
                  <Grid products={result.alternatives} onAdd={add} showReason />
                </div>
              )}
            </>
          )
        )}

        {!loading && browse && (browse.length ? <Grid products={browse} onAdd={add} /> : (
          <Empty icon={<SearchX />} title={`No ${delivery} delivery options here`} text="Switch delivery speed to No preference to see everything in this category." />
        ))}
      </div>
    </>
  )
}

function Grid({ products, onAdd, showReason }: { products: Product[]; onAdd?: (p: Product) => void; showReason?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4">
      {products.map((p, i) => (
        <ProductCard key={p.id} p={p} index={i} onAdd={onAdd ? () => onAdd(p) : undefined} footnote={showReason ? p.match_reason : undefined} />
      ))}
    </div>
  )
}
