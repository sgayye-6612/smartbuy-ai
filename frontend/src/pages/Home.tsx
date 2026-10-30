import { Sparkles, TrendingDown } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, CATEGORIES, type Product } from '../api'
import { sectionPath } from '../catalog'
import { useAuth } from '../auth'
import SmartSearch from '../components/SmartSearch'
import { CardSkeletons, CATEGORY_ACCENT, CATEGORY_ICON, CATEGORY_TINT, DeliverTo, DeliveryToggle, ProductCard, SectionTitle } from '../components/ui'
import { useSettings } from '../settings'

type Recs = { top_deals: Product[]; recent_searches: string[] }

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default function HomePage() {
  const { user } = useAuth()
  const { delivery, setDelivery } = useSettings()
  const [recs, setRecs] = useState<Recs | null>(null)
  const [toast, setToast] = useState('')

  useEffect(() => {
    setRecs(null)
    api<Recs>(`/api/recommendations?delivery=${delivery}`).then(setRecs).catch(() => {})
  }, [delivery])

  const add = async (p: Product) => {
    await api('/api/basket', { method: 'POST', body: { product_id: p.id, quantity: 1 } })
    setToast(`${p.name} added to basket`)
    setTimeout(() => setToast(''), 2200)
  }

  return (
    <div className="space-y-10">
      {/* Hero search */}
      <section className="relative">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-gradient-to-r from-brand-400/25 via-sky-400/15 to-violet-400/20 blur-3xl" />
        <div className="relative pt-2 md:pt-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DeliverTo />
              <p className="mt-3 text-sm font-medium text-muted">
                {greeting()}, {user?.name.split(' ')[0]} 👋
              </p>
            </div>
            {/* AI assistant shortcut */}
            <Link
              to="/assistant"
              className="group relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-brand-600 text-white shadow-lg shadow-violet-500/30 transition hover:scale-105"
              aria-label="Ask the AI assistant"
              title="Ask the AI assistant"
            >
              <Sparkles size={22} />
              <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-canvas bg-amber-400" />
              <span className="pointer-events-none absolute right-0 top-full mt-2 hidden whitespace-nowrap rounded-lg bg-ink px-2.5 py-1 text-xs font-semibold text-canvas group-hover:block">
                Ask AI assistant
              </span>
            </Link>
          </div>
          <h1 className="mt-1 text-3xl font-extrabold leading-tight tracking-tight md:text-5xl">
            What do you need <span className="bg-gradient-to-r from-brand-600 to-teal-500 bg-clip-text text-transparent">today?</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted md:text-base">
            One search across groceries, shopping, food and rides. We compare real final prices, fees and delivery times.
          </p>
          <div className="mt-6 max-w-3xl">
            <SmartSearch />
          </div>
          <div className="mt-5 max-w-3xl">
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">How fast do you need it?</div>
            <DeliveryToggle variant="cards" value={delivery} onChange={setDelivery} />
          </div>
          {recs && recs.recent_searches.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs text-faint">Recent:</span>
              {recs.recent_searches.slice(0, 4).map((s) => (
                <Link key={s} to={s.startsWith('Ride:') ? '/rides' : `/search?q=${encodeURIComponent(s)}`} className="chip bg-soft px-3 py-1.5 text-muted hover:text-ink">
                  {s}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Categories */}
      <section>
        <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 md:mx-0 md:grid md:grid-cols-7 md:px-0">
          {CATEGORIES.map((c, i) => {
            const Icon = CATEGORY_ICON[c.key]
            const to = sectionPath(c.key)
            return (
              <Link
                key={c.key}
                to={to}
                className="card card-hover flex w-24 shrink-0 flex-col items-center gap-2 px-2 py-4 animate-fade-up md:w-auto"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className={`grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br ${CATEGORY_TINT[c.key]}`}>
                  <Icon size={22} className={CATEGORY_ACCENT[c.key]} />
                </div>
                <span className="text-xs font-semibold">{c.short}</span>
              </Link>
            )
          })}
        </div>
      </section>

      {toast && <div className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-sm rounded-xl bg-ink px-4 py-3 text-center text-sm font-medium text-canvas shadow-xl animate-fade-up md:bottom-8">✓ {toast}</div>}

      {/* Deals */}
      <section>
        <SectionTitle
          title="Today’s best deals"
          action={<span className="flex items-center gap-1 text-xs font-semibold text-brand-700 dark:text-brand-400"><TrendingDown size={14} /> vs 30-day average</span>}
        />
        {!recs ? (
          <CardSkeletons n={8} />
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4">
            {recs.top_deals.map((p, i) => (
              <ProductCard key={p.id} p={p} index={i} onAdd={() => add(p)} footnote={`${p.deal_pct?.toFixed(0)}% below usual price`} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
