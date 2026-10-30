import { Check, ChevronDown, ShieldCheck, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, eta, rupees, type Integration, type Platform, type Preferences } from '../api'
import { ThemeSwitch } from '../components/Layout'
import { CATEGORY_ACCENT, CATEGORY_ICON, CATEGORY_TINT, DeliveryBadge, DeliveryToggle, ErrorBox, PageHeader, PlatformMark } from '../components/ui'
import { useSettings } from '../settings'

type Groups = { groups: { category: string; label: string; platforms: Platform[] }[]; data_note: string }

export default function PreferencesPage() {
  const { delivery, setDelivery } = useSettings()
  const [groups, setGroups] = useState<Groups | null>(null)
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [integrations, setIntegrations] = useState<(Integration & { categories: string[] })[]>([])
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [showHow, setShowHow] = useState(false)

  useEffect(() => {
    Promise.all([api<Groups>('/api/platforms'), api<Preferences>('/api/preferences'), api<(Integration & { categories: string[] })[]>('/api/integrations')])
      .then(([g, p, i]) => {
        setGroups(g)
        setPrefs(p)
        setIntegrations(i)
      })
      .catch((e) => setError(e.message))
  }, [])

  const update = (cat: string, fn: (c: { platform_ids: number[]; favorite_id: number | null }) => { platform_ids: number[]; favorite_id: number | null }) => {
    if (!prefs) return
    const current = prefs.categories[cat] ?? { platform_ids: [], favorite_id: null }
    setPrefs({ ...prefs, categories: { ...prefs.categories, [cat]: fn(current) } })
    setDirty(true)
    setSaved(false)
  }
  const toggle = (cat: string, id: number) =>
    update(cat, (c) => {
      const on = c.platform_ids.includes(id)
      return { platform_ids: on ? c.platform_ids.filter((x) => x !== id) : [...c.platform_ids, id], favorite_id: on && c.favorite_id === id ? null : c.favorite_id }
    })
  const favorite = (cat: string, id: number) =>
    update(cat, (c) => ({ platform_ids: c.platform_ids.includes(id) ? c.platform_ids : [...c.platform_ids, id], favorite_id: c.favorite_id === id ? null : id }))

  const save = async () => {
    if (!prefs) return
    try {
      const res = await api<Preferences>('/api/preferences', { method: 'PUT', body: { ...prefs, delivery_preference: delivery } })
      setPrefs(res)
      setDirty(false)
      setSaved(true)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (error) return <ErrorBox message={error} />
  if (!groups || !prefs) return <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-40 rounded-2xl" />)}</div>

  return (
    <>
      <PageHeader
        eyebrow="Personalisation"
        title="My platforms"
        subtitle="Pick apps separately for each category, e.g. Amazon for electronics but Zepto for groceries. Star your favourite and we’ll highlight it, while still showing better deals elsewhere."
      />

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="card p-5">
          <div className="font-bold">Default delivery speed</div>
          <p className="mb-3 mt-0.5 text-xs text-muted">Used for groceries and shopping. You can change it on any search.</p>
          <DeliveryToggle variant="cards" value={delivery} onChange={(d) => { setDelivery(d); setDirty(true) }} />
        </div>
        <div className="card p-5">
          <div className="font-bold">Appearance</div>
          <p className="mb-3 mt-0.5 text-xs text-muted">Light, dark, or follow your device.</p>
          <ThemeSwitch />
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {groups.groups.map((g) => {
          const Icon = CATEGORY_ICON[g.category]
          const sel = prefs.categories[g.category] ?? { platform_ids: [], favorite_id: null }
          return (
            <section key={g.category} className="card p-5">
              <div className="mb-4 flex items-center gap-3">
                <div className={`grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br ${CATEGORY_TINT[g.category]}`}>
                  <Icon size={19} className={CATEGORY_ACCENT[g.category]} />
                </div>
                <div className="flex-1">
                  <div className="font-bold">{g.label}</div>
                  <div className="text-xs text-muted">{sel.platform_ids.length ? `${sel.platform_ids.length} selected` : 'None selected, so all platforms are compared'}</div>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {g.platforms.map((p) => {
                  const on = sel.platform_ids.includes(p.id)
                  const fav = sel.favorite_id === p.id
                  return (
                    <div key={p.id} className={`flex items-center gap-3 rounded-xl border p-3 transition ${on ? 'border-brand-500/60 bg-brand-500/5' : 'border-line'}`}>
                      <button onClick={() => toggle(g.category, p.id)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left" aria-pressed={on}>
                        <PlatformMark name={p.name} slug={p.slug} size="sm" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-sm font-semibold">{p.name} <DeliveryBadge type={p.delivery_type} /></div>
                          <div className="truncate text-[11px] text-muted">
                            {p.delivery_type === 'ride' ? `~${p.avg_delivery_mins} min pickup` : `${eta(p.avg_delivery_mins)} · ${p.delivery_fee ? `${rupees(p.delivery_fee)} delivery` : 'free delivery'}`}
                            {p.coupon && ` · ${p.coupon.code}`}
                          </div>
                        </div>
                      </button>
                      <button onClick={() => favorite(g.category, p.id)} className={`grid h-8 w-8 cursor-pointer place-items-center rounded-lg transition ${fav ? 'text-amber-500' : 'text-faint hover:text-amber-500'}`} aria-label={`Favourite ${p.name}`} aria-pressed={fav}>
                        <Star size={17} fill={fav ? 'currentColor' : 'none'} />
                      </button>
                      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md ${on ? 'bg-brand-600 text-white' : 'border border-line'}`}>{on && <Check size={13} strokeWidth={3} />}</span>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      <div className="card mt-6">
        <button onClick={() => setShowHow(!showHow)} className="flex w-full cursor-pointer items-center gap-3 p-5 text-left">
          <ShieldCheck size={20} className="text-brand-600" />
          <div className="flex-1">
            <div className="font-bold">How we get prices & how buying works</div>
            <div className="text-xs text-muted">Official integrations only. No scraping. We never place orders for you.</div>
          </div>
          <ChevronDown size={18} className={`text-muted transition ${showHow ? 'rotate-180' : ''}`} />
        </button>
        {showHow && (
          <div className="divide-y divide-line border-t border-line">
            {integrations.map((i) => (
              <div key={i.slug} className="flex gap-3 px-5 py-3 text-sm">
                <PlatformMark name={i.name} slug={i.slug} size="sm" />
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 font-semibold">
                    {i.name}
                    <span className={`chip ${i.mode === 'live' ? 'bg-brand-500/12 text-brand-700' : 'bg-soft text-muted'}`}>{i.mode === 'live' ? 'Live' : 'Sample data'}</span>
                    <span className="chip bg-soft text-muted">{i.direct_checkout ? 'Direct checkout' : `Checkout on ${i.name}`}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted">{i.official_route}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sticky save bar */}
      <div className={`fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 px-4 transition md:bottom-6 md:left-64 ${dirty || saved ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'}`}>
        <div className="mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl bg-ink p-2 pl-4 text-canvas shadow-2xl">
          <span className="text-sm font-medium">{saved && !dirty ? '✓ Preferences saved' : 'You have unsaved changes'}</span>
          {dirty && <button className="btn bg-brand-500 text-white hover:bg-brand-600" onClick={save}>Save</button>}
        </div>
      </div>
    </>
  )
}
