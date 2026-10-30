import { ArrowUpRight, Check, ExternalLink, Minus, Package, Plus, ShoppingCart, Sparkles, Store, Trash2, UtensilsCrossed, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { api, rupees, type Optimization, type Order, type Plan, type Product } from '../api'
import { DeliverTo, DeliveryToggle, Empty, ErrorBox, PageHeader, PlatformMark, ProductArt } from '../components/ui'
import { useSettings } from '../settings'

type Item = { id: number; quantity: number; product: Product }

export default function BasketPage() {
  const { delivery, setDelivery } = useSettings()
  const [items, setItems] = useState<Item[] | null>(null)
  const [opt, setOpt] = useState<Optimization | null>(null)
  const [error, setError] = useState('')
  const [checkout, setCheckout] = useState<Group | null>(null)
  const [done, setDone] = useState<Set<number>>(new Set())

  const load = async () => {
    try {
      const basket = await api<Item[]>('/api/basket')
      setItems(basket)
      setOpt(basket.length ? await api<Optimization>(`/api/basket/optimize?delivery=${delivery}`) : null)
      setDone(new Set())
    } catch (e) {
      setError((e as Error).message)
    }
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delivery])

  const setQty = async (item: Item, q: number) => {
    if (q < 1) await api(`/api/basket/${item.id}`, { method: 'DELETE' })
    else await api(`/api/basket/${item.id}`, { method: 'PATCH', body: { quantity: q } })
    load()
  }
  const clear = async () => {
    await api('/api/basket', { method: 'DELETE' })
    load()
  }

  if (error) return <ErrorBox message={error} />
  if (!items) return <div className="skeleton h-64 rounded-2xl" />

  const food = items.filter((i) => i.product.category === 'food')
  const goods = items.filter((i) => i.product.category !== 'food')
  const plan = opt?.recommendation?.plan
  const groups = plan ? groupByApp(plan.orders) : []

  return (
    <>
      <PageHeader
        eyebrow="Smart basket"
        title="Your basket"
        subtitle="Add groceries, products and food from different apps. We find the cheapest way to order everything, including fees, then you check out on each app."
        action={items.length > 0 && <button className="btn-ghost" onClick={clear}><Trash2 size={16} /> Clear</button>}
      />

      {items.length === 0 ? (
        <Empty
          icon={<ShoppingCart />}
          title="Your basket is empty"
          text="Add groceries, gadgets or several dishes from different restaurants. We'll work out the cheapest way to order them all."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/groceries" className="btn-brand">Groceries</Link>
              <Link to="/food" className="btn-ghost"><UtensilsCrossed size={16} /> Food</Link>
            </div>
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          {/* Items */}
          <div className="space-y-4 lg:col-span-2">
            <div className="card px-4 py-3"><DeliverTo prefix="Ordering to" /></div>
            {goods.length > 0 && <ItemList title="Groceries & products" icon={<Package size={15} />} items={goods} setQty={setQty} />}
            {food.length > 0 && <ItemList title="Food" icon={<UtensilsCrossed size={15} />} items={food} setQty={setQty} showRestaurant />}
            <div className="flex gap-2">
              <Link to="/food" className="btn-ghost flex-1 text-xs"><Plus size={14} /> Add food</Link>
              <Link to="/groceries" className="btn-ghost flex-1 text-xs"><Plus size={14} /> Add groceries</Link>
            </div>
            {goods.length > 0 && (
              <div className="card p-4">
                <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Delivery speed for products</div>
                <DeliveryToggle value={delivery} onChange={setDelivery} />
              </div>
            )}
          </div>

          {/* Plan + checkout */}
          <div className="space-y-4 lg:col-span-3">
            {!opt?.recommendation || !plan ? (
              <div className="card p-6 text-sm text-muted">
                {opt?.missing_products?.length ? 'None of these items are available with your current delivery filter. Try “No preference”.' : 'Working out the best plan…'}
              </div>
            ) : (
              <>
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 via-emerald-700 to-teal-800 p-5 text-white">
                  <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
                  <div className="relative flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-100">
                    <Sparkles size={14} /> Best plan · {groups.length} {groups.length === 1 ? 'app' : 'apps'}
                  </div>
                  <div className="relative mt-2 flex items-end justify-between gap-3">
                    <div className="text-4xl font-extrabold tracking-tight">{rupees(plan.total)}</div>
                    <div className="text-right text-xs text-emerald-100">
                      items {rupees(plan.items_total)} · fees {rupees(plan.fees_total)}
                      {plan.coupons_total > 0 && <> · coupons −{rupees(plan.coupons_total)}</>}
                    </div>
                  </div>
                  <p className="relative mt-2 text-sm text-emerald-50">{opt.recommendation.message}</p>
                  <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-white/20">
                    <div className="h-full rounded-full bg-white transition-all" style={{ width: `${(done.size / groups.length) * 100}%` }} />
                  </div>
                  <div className="relative mt-1.5 text-[11px] text-emerald-100">{done.size} of {groups.length} apps opened</div>
                </div>

                {opt.missing_products && opt.missing_products.length > 0 && (
                  <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
                    Not available with your filters: {opt.missing_products.join(', ')}
                  </div>
                )}

                {groups.map((g, i) => (
                  <GroupCard key={g.platform.id} g={g} index={i} opened={done.has(g.platform.id)} onCheckout={() => setCheckout(g)} />
                ))}

                <AlternativePlans plan={plan} singles={opt.single_platform_options} />
              </>
            )}
          </div>
        </div>
      )}

      {checkout && (
        <CheckoutSheet
          group={checkout}
          onClose={() => setCheckout(null)}
          onOpened={() => setDone((d) => new Set(d).add(checkout.platform.id))}
        />
      )}
    </>
  )
}

function ItemList({ title, icon, items, setQty, showRestaurant }: { title: string; icon: React.ReactNode; items: Item[]; setQty: (i: Item, q: number) => void; showRestaurant?: boolean }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted">{icon} {title}</div>
      <div className="divide-y divide-line">
        {items.map((i) => (
          <div key={i.id} className="flex items-center gap-3 p-3">
            <ProductArt p={i.product} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{showRestaurant ? i.product.name + (i.product.variant ? ` (${i.product.variant})` : '') : `${i.product.brand} ${i.product.name}`}</div>
              <div className="truncate text-xs text-muted">{showRestaurant ? i.product.brand : i.product.size || i.product.variant}</div>
            </div>
            <div className="flex items-center rounded-xl border border-line">
              <button className="grid h-9 w-9 cursor-pointer place-items-center text-muted hover:text-ink" onClick={() => setQty(i, i.quantity - 1)} aria-label="Less"><Minus size={14} /></button>
              <span className="w-6 text-center text-sm font-bold">{i.quantity}</span>
              <button className="grid h-9 w-9 cursor-pointer place-items-center text-muted hover:text-ink" onClick={() => setQty(i, i.quantity + 1)} aria-label="More"><Plus size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

type Group = { platform: Order['platform']; verb: string; orders: Order[]; total: number; fees: number; coupons: number; itemCount: number }

/** One card per app. Food orders from several restaurants on the same app are listed together. */
function groupByApp(orders: Order[]): Group[] {
  const map = new Map<number, Group>()
  for (const o of orders) {
    const g = map.get(o.platform.id) ?? { platform: o.platform, verb: o.checkout_verb, orders: [], total: 0, fees: 0, coupons: 0, itemCount: 0 }
    g.orders.push(o)
    g.total += o.total
    g.fees += o.delivery_fee + o.platform_fee
    g.coupons += o.coupon_discount
    g.itemCount += o.items.length
    map.set(o.platform.id, g)
  }
  return [...map.values()]
}

function GroupCard({ g, index, opened, onCheckout }: { g: Group; index: number; opened: boolean; onCheckout: () => void }) {
  const restaurants = g.orders.filter((o) => o.restaurant)
  return (
    <div className={`card overflow-hidden animate-fade-up ${opened ? 'opacity-70' : ''}`} style={{ animationDelay: `${index * 60}ms` }}>
      <div className="flex items-center gap-3 p-4">
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-soft text-xs font-bold text-muted">{index + 1}</div>
        <PlatformMark name={g.platform.name} slug={g.platform.slug} />
        <div className="min-w-0 flex-1">
          <div className="font-bold">{g.platform.name}</div>
          <div className="truncate text-xs text-muted">
            {restaurants.length ? `${restaurants.length} restaurant${restaurants.length > 1 ? 's' : ''} · ${g.itemCount} item${g.itemCount > 1 ? 's' : ''}` : `${g.itemCount} item${g.itemCount > 1 ? 's' : ''}`}
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-extrabold">{rupees(g.total)}</div>
          <div className="text-[11px] text-muted">
            {g.fees > 0 ? `incl. ${rupees(g.fees)} fees` : 'no fees'}
            {g.coupons > 0 && ` · −${rupees(g.coupons)}`}
          </div>
        </div>
      </div>

      <div className="divide-y divide-line border-t border-line">
        {g.orders.map((o) => (
          <div key={o.restaurant ?? 'items'} className="px-4 py-3">
            {o.restaurant && (
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 font-bold text-ink"><Store size={12} /> {o.restaurant}</span>
                <span className="text-faint">fees {rupees(o.delivery_fee + o.platform_fee)}{o.coupon_discount > 0 && ` · −${rupees(o.coupon_discount)}`}</span>
              </div>
            )}
            <ul className="space-y-1 text-sm text-muted">
              {o.items.map((it) => (
                <li key={it.product_id} className="flex justify-between gap-3">
                  <span className="truncate">{it.title} <span className="text-faint">× {it.quantity}</span></span>
                  <span className="shrink-0 text-ink">{rupees(it.line_total)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {restaurants.length > 1 && (
        <p className="border-t border-line bg-soft px-4 py-2 text-[11px] text-muted">
          {g.platform.name} delivers each restaurant separately, so delivery and platform fees apply per restaurant.
        </p>
      )}

      <div className="border-t border-line p-3">
        <button className={opened ? 'btn-ghost w-full' : 'btn-brand w-full'} onClick={onCheckout}>
          {opened ? <><Check size={16} /> Opened · open again</> : <>{g.verb} {g.platform.name} <ArrowUpRight size={16} /></>}
        </button>
      </div>
    </div>
  )
}

function AlternativePlans({ plan, singles }: { plan: Plan; singles: Plan[] }) {
  const others = singles.filter((p) => p.total !== plan.total)
  if (!others.length) return null
  return (
    <div className="card p-5">
      <div className="mb-3 text-sm font-bold">Compared with everything from one app</div>
      <div className="space-y-2.5">
        {others.map((p) => (
          <div key={p.orders[0].platform.id} className="flex items-center gap-3 text-sm">
            <PlatformMark name={p.orders[0].platform.name} slug={p.orders[0].platform.slug} size="sm" />
            <span className="flex-1 font-medium">{p.orders[0].platform.name}</span>
            <span className="w-20 text-right font-bold">{rupees(p.total)}</span>
            <span className="w-16 text-right text-xs font-semibold text-rose-600">+{rupees(p.total - plan.total)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Honest checkout: platforms don't accept carts from outside apps, so we open each item on the platform. */
function CheckoutSheet({ group, onClose, onOpened }: { group: Group; onClose: () => void; onOpened: () => void }) {
  const [opened, setOpened] = useState<Set<number>>(new Set())
  const all = group.orders.flatMap((o) => o.items)
  const openItem = (id: number) => {
    setOpened((s) => new Set(s).add(id))
    onOpened()
  }
  const isFood = group.orders.some((o) => o.restaurant)
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm md:items-center" onClick={onClose}>
      <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-card p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl animate-fade-up md:rounded-3xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line md:hidden" />
        <div className="flex items-start gap-3">
          <PlatformMark name={group.platform.name} slug={group.platform.slug} />
          <div className="flex-1">
            <h3 className="text-lg font-extrabold">{group.verb} {group.platform.name}</h3>
            <p className="text-xs text-muted">{all.length} item(s) · {rupees(group.total)} estimated</p>
          </div>
          <button className="grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-soft text-muted" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        <div className="mt-4 rounded-xl bg-soft p-3 text-xs leading-relaxed text-muted">
          {group.platform.name} doesn’t allow other apps to fill its cart, and direct checkout isn’t available yet.
          Open each item below and add it to your cart in {group.platform.name}
          {isFood && group.orders.length > 1 ? ' (one restaurant at a time)' : ''}. <b className="text-ink">SmartBuy has not placed an order.</b>
        </div>

        {group.orders.map((o) => (
          <div key={o.restaurant ?? 'items'} className="mt-4">
            {o.restaurant && <div className="mb-2 flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted"><Store size={12} /> {o.restaurant}</div>}
            <ul className="space-y-2">
              {o.items.map((it) => {
                const done = opened.has(it.product_id)
                return (
                  <li key={it.product_id}>
                    <a
                      href={it.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => openItem(it.product_id)}
                      className={`flex items-center gap-3 rounded-xl border p-3 transition ${done ? 'border-brand-500/50 bg-brand-500/5' : 'border-line hover:bg-soft'}`}
                    >
                      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${done ? 'bg-brand-600 text-white' : 'border border-line'}`}>{done && <Check size={13} strokeWidth={3} />}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{it.title}</span>
                        <span className="text-xs text-muted">Qty {it.quantity} · {rupees(it.line_total)}</span>
                      </span>
                      <ExternalLink size={16} className="shrink-0 text-faint" />
                    </a>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}

        <button className="btn-primary mt-5 w-full" onClick={onClose}>
          {opened.size === all.length ? 'Done' : `Done (${opened.size}/${all.length} opened)`}
        </button>
      </div>
    </div>,
    document.body,
  )
}
