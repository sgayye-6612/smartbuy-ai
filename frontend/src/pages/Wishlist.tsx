import { Bell, Heart, RefreshCw, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, rupees, type Product } from '../api'
import { Empty, ErrorBox, PageHeader, ProductArt, SectionTitle } from '../components/ui'

type WishItem = { id: number; target_price: number | null; product: Product; target_reached: boolean }
type Alert = { id: number; product_id: number; message: string; is_read: boolean; created_at: string }

export default function WishlistPage() {
  const [items, setItems] = useState<WishItem[] | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const load = async () => {
    try {
      const [w, a] = await Promise.all([api<WishItem[]>('/api/wishlist'), api<Alert[]>('/api/alerts')])
      setItems(w)
      setAlerts(a)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  useEffect(() => {
    load()
  }, [])

  const remove = async (id: number) => {
    await api(`/api/wishlist/${id}`, { method: 'DELETE' })
    load()
  }
  const markRead = async (id: number) => {
    await api(`/api/alerts/${id}/read`, { method: 'POST' })
    load()
  }
  const refresh = async () => {
    setBusy(true)
    const r = await api<{ listings_updated: number; alerts_created: number }>('/api/prices/refresh', { method: 'POST' })
    setNote(`Updated ${r.listings_updated} sample prices · ${r.alerts_created} new alert(s)`)
    setBusy(false)
    load()
  }

  if (error) return <ErrorBox message={error} />
  if (!items) return <div className="skeleton h-64 rounded-2xl" />

  return (
    <>
      <PageHeader
        eyebrow="Wishlist"
        title="Saved & price alerts"
        subtitle="Set a target price and we’ll alert you when any platform drops to it."
        action={
          <button className="btn-ghost" onClick={refresh} disabled={busy} title="Simulates a price update on the sample data">
            <RefreshCw size={16} className={busy ? 'animate-spin' : ''} /> Simulate price update
          </button>
        }
      />
      {note && <div className="mb-4 rounded-xl bg-brand-500/10 px-4 py-2.5 text-sm text-brand-800 dark:text-brand-200">{note}</div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {items.length === 0 ? (
            <Empty icon={<Heart />} title="Nothing saved yet" text="Open any product and tap Save, or set a target price to get alerts." action={<Link to="/search" className="btn-brand">Find products</Link>} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((w, i) => (
                <div key={w.id} className="card flex items-center gap-3 p-3 animate-fade-up" style={{ animationDelay: `${i * 40}ms` }}>
                  <ProductArt p={w.product} size="md" />
                  <Link to={`/compare/${w.product.id}`} className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{w.product.display_name}</div>
                    <div className="mt-0.5 text-xs text-muted">
                      Now <b className="text-ink">{rupees(w.product.lowest_price)}</b>
                      {w.target_price && <> · target {rupees(w.target_price)}</>}
                    </div>
                    {w.target_reached && <span className="chip mt-1 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300">Target reached</span>}
                  </Link>
                  <button className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-faint hover:bg-soft hover:text-rose-600" onClick={() => remove(w.id)} aria-label="Remove">
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <SectionTitle title="Alerts" />
          <div className="card divide-y divide-line">
            {alerts.length === 0 && (
              <div className="flex items-center gap-3 p-5 text-sm text-muted"><Bell size={18} /> No alerts yet.</div>
            )}
            {alerts.map((a) => (
              <div key={a.id} className={`p-4 text-sm ${a.is_read ? 'text-faint' : ''}`}>
                <div className="flex gap-2.5">
                  {!a.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-rose-500" />}
                  <span>{a.message}</span>
                </div>
                <div className="mt-1.5 flex justify-between text-xs text-faint">
                  <span>{new Date(a.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  {!a.is_read && <button className="cursor-pointer font-semibold text-brand-700 dark:text-brand-400" onClick={() => markRead(a.id)}>Mark read</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
