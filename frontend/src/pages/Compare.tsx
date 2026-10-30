import { ArrowLeft, ArrowUpRight, BellRing, Clock, Heart, Info, Minus, Plus, ShoppingCart, Star, Trophy, Truck, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, categoryLabel, eta, rupees, type ComparisonResult, type Offer } from '../api'
import { DealBadge, DeliveryBadge, DeliveryToggle, ErrorBox, PlatformMark, PriceChart, ProductArt, SampleBadge, useCheckout } from '../components/ui'
import { useSettings } from '../settings'

export default function ComparePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { delivery, setDelivery } = useSettings()
  const [qty, setQty] = useState(1)
  const [data, setData] = useState<ComparisonResult | null>(null)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [target, setTarget] = useState('')
  const checkout = useCheckout()

  useEffect(() => {
    setError('')
    api<ComparisonResult>(`/api/compare/${id}?quantity=${qty}&delivery=${delivery}`)
      .then(setData)
      .catch((e) => setError(e.message))
  }, [id, qty, delivery])

  const flash = (m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(''), 2200)
  }
  const isFoodRef = () => data?.product.category === 'food'
  const addToBasket = async () => {
    await api('/api/basket', { method: 'POST', body: { product_id: Number(id), quantity: qty } })
    flash(isFoodRef() ? 'Added. Add more dishes, then check out from the basket' : 'Added to basket')
  }
  const saveWishlist = async (withTarget: boolean) => {
    await api('/api/wishlist', { method: 'POST', body: { product_id: Number(id), target_price: withTarget && target ? Number(target) : null } })
    flash(withTarget && target ? `We'll alert you below ₹${target}` : 'Saved to wishlist')
  }

  if (error) return <ErrorBox message={error} />
  if (!data) return <CompareSkeleton />
  const { product, best } = data
  const isFood = product.category === 'food'
  const showDelivery = !isFood && (delivery !== 'any' || data.hidden_by_filters > 0 || data.offers.some((o) => o.delivery_type === 'instant'))

  return (
    <div className="animate-fade-up">
      <button onClick={() => navigate(-1)} className="mb-4 flex cursor-pointer items-center gap-1 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft size={16} /> Back
      </button>

      {/* Product header */}
      <div className="card flex flex-col gap-5 p-5 md:flex-row md:items-center">
        <ProductArt p={product} size="xl" className="mx-auto md:mx-0" />
        <div className="min-w-0 flex-1 text-center md:text-left">
          <div className="text-xs font-bold uppercase tracking-wider text-faint">
            {isFood ? `${product.brand} · Restaurant` : `${product.brand} · ${categoryLabel(product.category)}`}
          </div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight md:text-3xl">{product.name}</h1>
          {product.description && <p className="mt-1 text-sm text-muted">{product.description}</p>}
          <div className="mt-2 flex flex-wrap justify-center gap-1.5 md:justify-start">
            {product.size && <span className="chip bg-soft text-muted">{product.size}</span>}
            {product.variant && <span className="chip bg-violet-500/10 text-violet-700 dark:text-violet-300">{product.variant}</span>}
            <span className="chip bg-soft text-muted">{data.compared_platforms} platforms compared</span>
            <SampleBadge />
          </div>
        </div>
        <div className="flex flex-col items-center gap-3 md:items-end">
          <div className="flex items-center gap-1 rounded-xl border border-line p-1">
            <button className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg hover:bg-soft disabled:opacity-40" onClick={() => setQty(Math.max(1, qty - 1))} disabled={qty <= 1} aria-label="Less">
              <Minus size={16} />
            </button>
            <span className="w-10 text-center text-sm font-bold">{qty}</span>
            <button className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg hover:bg-soft" onClick={() => setQty(Math.min(10, qty + 1))} aria-label="More">
              <Plus size={16} />
            </button>
          </div>
          {showDelivery && <DeliveryToggle value={delivery} onChange={setDelivery} />}
        </div>
      </div>

      {msg && <div className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-sm rounded-xl bg-ink px-4 py-3 text-center text-sm font-medium text-canvas shadow-xl animate-fade-up md:bottom-8">✓ {msg}</div>}

      {delivery !== 'any' && !isFood && (
        <div className={`mt-4 flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold ${delivery === 'instant' ? 'bg-amber-400/15 text-amber-800 dark:text-amber-200' : 'bg-sky-500/12 text-sky-800 dark:text-sky-200'}`}>
          {delivery === 'instant' ? <Zap size={16} /> : <Truck size={16} />}
          Showing {delivery === 'instant' ? 'instant delivery (10–30 min)' : 'standard delivery'} options only
          <button className="ml-auto cursor-pointer text-xs underline underline-offset-2" onClick={() => setDelivery('any')}>Show all</button>
        </div>
      )}
      {data.favorite_note && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          <Star size={16} className="mt-0.5 shrink-0" fill="currentColor" /> {data.favorite_note}
        </div>
      )}
      {data.hidden_by_filters > 0 && delivery === 'any' && (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted">
          <Info size={14} /> {data.hidden_by_filters} more option(s) hidden by your delivery or platform preferences.
          {delivery !== 'any' && <button className="cursor-pointer font-semibold text-brand-700 dark:text-brand-400" onClick={() => setDelivery('any')}>Show all</button>}
        </div>
      )}

      {data.compared_platforms === 0 ? (
        <div className="card mt-6 p-6 text-sm text-muted">
          Not available with your current filters. <button className="cursor-pointer font-semibold text-brand-700" onClick={() => setDelivery('any')}>Switch delivery to Any</button> or{' '}
          <Link to="/preferences" className="font-semibold text-brand-700">add platforms</Link>.
        </div>
      ) : !best ? (
        <div className="card mt-6 p-6 text-sm text-muted">Out of stock on every platform right now. Save it to your wishlist to get an alert.</div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
          {/* Recommendation */}
          <div className="space-y-4">
            <div className="card overflow-hidden">
              <div className="relative bg-gradient-to-br from-brand-600 via-emerald-700 to-teal-800 p-5 text-white">
                <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
                <div className="relative flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-100"><Trophy size={14} /> Best overall</div>
                <div className="relative mt-3 flex items-center gap-3">
                  <PlatformMark name={best.platform.name} slug={best.platform.slug} />
                  <div>
                    <div className="text-lg font-extrabold">{best.platform.name}</div>
                    <div className="flex items-center gap-1 text-xs text-emerald-100"><Clock size={12} /> {eta(best.delivery_mins)} {isFood ? 'delivery' : best.delivery_type === 'instant' ? 'instant delivery' : 'delivery'}</div>
                  </div>
                </div>
                <div className="relative mt-4 text-4xl font-extrabold tracking-tight">{rupees(best.final_price)}</div>
                <div className="relative text-xs text-emerald-100">final amount incl. fees{best.coupon_discount ? ' and coupon' : ''}</div>
              </div>
              <div className="space-y-4 p-5">
                <ul className="space-y-2 text-sm">
                  {data.reasons.map((r) => (
                    <li key={r} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />{r}</li>
                  ))}
                </ul>
                {data.savings > 0 && (
                  <div className="rounded-xl bg-brand-500/10 px-3 py-2.5 text-sm text-brand-800 dark:text-brand-200">
                    Saves <b>{rupees(data.savings)}</b> vs the most expensive option
                  </div>
                )}
                <button className="btn-brand w-full" onClick={() => checkout.start(best.listing_id)} disabled={checkout.busy}>
                  {best.checkout.verb} {best.platform.name} <ArrowUpRight size={16} />
                </button>
                <p className="text-center text-[11px] text-muted">You’ll finish checkout on {best.platform.name}. SmartBuy never places orders for you.</p>
                <div className="grid grid-cols-2 gap-2">
                  <button className="btn-ghost" onClick={addToBasket}><ShoppingCart size={16} /> {isFood ? 'Add to order' : 'Basket'}</button>
                  <button className="btn-ghost" onClick={() => saveWishlist(false)}><Heart size={16} /> Save</button>
                </div>
                <div className="flex gap-2">
                  <input className="input" inputMode="numeric" type="number" placeholder="Alert me below ₹" value={target} onChange={(e) => setTarget(e.target.value)} />
                  <button className="btn-ghost px-3" onClick={() => saveWishlist(true)} disabled={!target} aria-label="Set price alert"><BellRing size={16} /></button>
                </div>
              </div>
            </div>
            {data.deal && <DealBadge deal={data.deal} />}
          </div>

          {/* Offers */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">All options</h2>
              <span className="text-xs text-muted">Ranked by price, speed and reliability</span>
            </div>
            {data.offers.map((o, i) => (
              <OfferCard key={o.listing_id} o={o} index={i} isBest={o.listing_id === best.listing_id} isCheapest={o.listing_id === data.cheapest?.listing_id} onBuy={() => checkout.start(o.listing_id)} />
            ))}
            {data.history && (
              <div className="card p-5">
                <div className="mb-3 font-bold">Lowest price, last 30 days</div>
                <PriceChart stats={data.history} />
              </div>
            )}
          </div>
        </div>
      )}
      {checkout.sheet}
    </div>
  )
}

function OfferCard({ o, isBest, isCheapest, onBuy, index }: { o: Offer; isBest: boolean; isCheapest: boolean; onBuy: () => void; index: number }) {
  const fees = o.delivery_fee + o.platform_fee
  return (
    <div
      className={`card p-4 animate-fade-up ${isBest ? 'ring-2 ring-brand-500/60' : ''} ${!o.in_stock ? 'opacity-55' : ''}`}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex items-start gap-3">
        <PlatformMark name={o.platform.name} slug={o.platform.slug} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-bold">{o.platform.name}</span>
            {isBest && <span className="chip bg-brand-600 text-white">Best</span>}
            {isCheapest && !isBest && <span className="chip bg-sky-500/15 text-sky-700 dark:text-sky-300">Cheapest</span>}
            {o.is_favorite && <span className="chip bg-amber-500/15 text-amber-700 dark:text-amber-300"><Star size={10} fill="currentColor" /> Your pick</span>}
            <DeliveryBadge type={o.delivery_type} />
            {!o.in_stock && <span className="chip bg-soft text-muted">Out of stock</span>}
          </div>
          <div className="mt-0.5 truncate text-xs text-faint" title={o.title}>“{o.title}”</div>
        </div>
        <div className="text-right">
          <div className="text-xl font-extrabold">{rupees(o.final_price)}</div>
          <div className="text-[11px] text-muted">final</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span>
          Item <b className="text-ink">{rupees(o.subtotal)}</b>
          {o.discount_percent > 0 && <s className="ml-1 text-faint">{rupees(o.mrp * o.quantity)}</s>}
        </span>
        <span>{fees > 0 ? <>Fees <b className="text-ink">+{rupees(fees)}</b></> : <b className="text-brand-700 dark:text-brand-400">No fees</b>}</span>
        {o.coupon_discount > 0 && <span className="text-brand-700 dark:text-brand-400">{o.coupon_code} −{rupees(o.coupon_discount)}</span>}
        <span className="flex items-center gap-1"><Clock size={12} /> {eta(o.delivery_mins)}</span>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-soft" title={`Score ${o.score}`}>
          <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600" style={{ width: `${o.score}%` }} />
        </div>
        <span className="w-8 text-right text-xs font-bold">{o.score}</span>
        <button className="btn-ghost min-h-9 px-3 text-xs" onClick={onBuy} disabled={!o.in_stock}>
          {o.checkout.verb} {o.platform.name.split(' ')[0]} <ArrowUpRight size={14} />
        </button>
      </div>
    </div>
  )
}

function CompareSkeleton() {
  return (
    <div className="space-y-6">
      <div className="card flex gap-5 p-5">
        <div className="skeleton h-28 w-28 rounded-3xl" />
        <div className="flex-1 space-y-3 pt-2">
          <div className="skeleton h-3 w-24" />
          <div className="skeleton h-7 w-2/3" />
          <div className="skeleton h-4 w-40" />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="skeleton h-80 rounded-2xl" />
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}
        </div>
      </div>
    </div>
  )
}
