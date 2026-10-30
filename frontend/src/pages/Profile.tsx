import { Briefcase, Check, Home, LogOut, MapPin, Pencil, Plus, Star, Trash2, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { notifyAddressesChanged, useAddresses } from '../addresses'
import { api, type Address, type Place } from '../api'
import { useAuth } from '../auth'
import { ThemeSwitch } from '../components/Layout'
import PlaceInput from '../components/PlaceInput'
import { ErrorBox, PageHeader } from '../components/ui'

const PinMap = lazy(() => import('../components/PinMap'))

const LABEL_ICON = { home: Home, work: Briefcase, other: MapPin }

export default function ProfilePage() {
  const { user, logout, refresh } = useAuth()
  const { addresses } = useAddresses()
  const [editing, setEditing] = useState<Address | 'new' | null>(null)
  const [name, setName] = useState(user?.name ?? '')
  const [savedName, setSavedName] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (location.hash === '#addresses') document.getElementById('addresses')?.scrollIntoView()
  }, [addresses])

  const saveName = async (e: FormEvent) => {
    e.preventDefault()
    await api('/api/auth/me', { method: 'PUT', body: { name } })
    await refresh()
    setSavedName(true)
    setTimeout(() => setSavedName(false), 2000)
  }
  const makeDefault = async (a: Address) => {
    await api(`/api/addresses/${a.id}/default`, { method: 'POST' })
    notifyAddressesChanged()
  }
  const remove = async (a: Address) => {
    if (!confirmDelete(a)) return
    try {
      await api(`/api/addresses/${a.id}`, { method: 'DELETE' })
      notifyAddressesChanged()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <>
      <PageHeader eyebrow="Account" title="Profile & addresses" subtitle="Your details and saved addresses for deliveries and ride pickups." />
      {error && <div className="mb-4"><ErrorBox message={error} /></div>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        {/* Account */}
        <section className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-emerald-700 text-xl font-extrabold text-white">{user?.name[0]?.toUpperCase()}</div>
              <div className="min-w-0">
                <div className="truncate text-lg font-extrabold">{user?.name}</div>
                <div className="truncate text-sm text-muted">{user?.email}</div>
              </div>
            </div>
            <form onSubmit={saveName} className="mt-5 space-y-2">
              <label className="block text-sm font-medium">
                Name
                <input className="input mt-1.5" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
              </label>
              <button className="btn-ghost w-full" disabled={!name.trim() || name === user?.name}>
                {savedName ? <><Check size={16} /> Saved</> : 'Save name'}
              </button>
            </form>
          </div>
          <div className="card space-y-3 p-5">
            <div className="text-sm font-bold">Appearance</div>
            <ThemeSwitch />
          </div>
          <button onClick={logout} className="btn-ghost w-full text-rose-600"><LogOut size={16} /> Log out</button>
        </section>

        {/* Addresses */}
        <section id="addresses" className="scroll-mt-24">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">Saved addresses</h2>
            <button className="btn-brand" onClick={() => setEditing('new')} disabled={(addresses?.length ?? 0) >= 10}><Plus size={16} /> Add address</button>
          </div>

          {!addresses && <div className="skeleton h-32 rounded-2xl" />}
          {addresses?.length === 0 && (
            <button onClick={() => setEditing('new')} className="card flex w-full cursor-pointer flex-col items-center gap-2 border-dashed px-6 py-10 text-center hover:bg-soft">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-500/12 text-brand-700 dark:text-brand-300"><MapPin size={22} /></span>
              <span className="font-bold">Add your first address</span>
              <span className="max-w-xs text-sm text-muted">Save Home and Work to see delivery times for your area and book rides in one tap.</span>
            </button>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {addresses?.map((a, i) => {
              const Icon = LABEL_ICON[a.label]
              return (
                <div key={a.id} className={`card flex flex-col p-4 animate-fade-up ${a.is_default ? 'ring-2 ring-brand-500/50' : ''}`} style={{ animationDelay: `${i * 40}ms` }}>
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-soft text-ink"><Icon size={18} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold">{a.title}</span>
                        {a.is_default && <span className="chip bg-brand-600 text-white">Default</span>}
                      </div>
                      <p className="mt-1 text-sm leading-snug text-muted">{a.full}</p>
                      {(a.receiver_name || a.phone) && (
                        <p className="mt-1 text-xs text-faint">{[a.receiver_name, a.phone && `+91 ${a.phone}`].filter(Boolean).join(' · ')}</p>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
                    <button className="btn-ghost min-h-9 px-3 text-xs" onClick={() => setEditing(a)}><Pencil size={13} /> Edit</button>
                    {!a.is_default && <button className="btn-ghost min-h-9 px-3 text-xs" onClick={() => makeDefault(a)}><Star size={13} /> Set default</button>}
                    <button className="btn-ghost ml-auto min-h-9 px-3 text-xs text-rose-600" onClick={() => remove(a)} aria-label={`Delete ${a.title}`}><Trash2 size={13} /></button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>

      {editing && <AddressSheet address={editing === 'new' ? null : editing} isFirst={(addresses?.length ?? 0) === 0} onClose={() => setEditing(null)} />}
    </>
  )
}

function confirmDelete(a: Address) {
  return window.confirm(`Delete your ${a.title} address?`)
}

type Form = {
  label: 'home' | 'work' | 'other'
  nickname: string
  house: string
  area: string
  landmark: string
  city: string
  state: string
  pincode: string
  receiver_name: string
  phone: string
  lat: number | null
  lng: number | null
  is_default: boolean
}

function AddressSheet({ address, isFirst, onClose }: { address: Address | null; isFirst: boolean; onClose: () => void }) {
  const { user } = useAuth()
  const [f, setF] = useState<Form>(() => ({
    label: address?.label ?? 'home',
    nickname: address?.nickname ?? '',
    house: address?.house ?? '',
    area: address?.area ?? '',
    landmark: address?.landmark ?? '',
    city: address?.city ?? '',
    state: address?.state ?? '',
    pincode: address?.pincode ?? '',
    receiver_name: address?.receiver_name ?? user?.name ?? '',
    phone: address?.phone ?? '',
    lat: address?.lat ?? null,
    lng: address?.lng ?? null,
    is_default: address?.is_default ?? isFirst,
  }))
  const [searchText, setSearchText] = useState(address?.area ?? '')
  const [picked, setPicked] = useState<Place | null>(address ? address.place : null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const reverseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }))

  const applyPlace = (p: Place | null) => {
    setPicked(p)
    if (!p) return
    setF((s) => ({
      ...s,
      lat: p.lat,
      lng: p.lng,
      area: p.label,
      city: p.city ?? s.city,
      state: p.state ?? s.state,
      pincode: p.postcode ?? s.pincode,
    }))
  }

  // Moving the pin updates coordinates, then (after a pause) refreshes the area text
  const onPinMove = (lat: number, lng: number) => {
    if (f.lat != null && Math.abs(lat - f.lat) < 1e-5 && Math.abs(lng - (f.lng ?? 0)) < 1e-5) return
    setF((s) => ({ ...s, lat, lng }))
    if (reverseTimer.current) clearTimeout(reverseTimer.current)
    reverseTimer.current = setTimeout(() => {
      api<Place>(`/api/rides/reverse?lat=${lat}&lng=${lng}`)
        .then((p) => {
          if (p.source === 'osm') {
            setSearchText(p.label)
            setF((s) => ({ ...s, area: p.label, city: p.city ?? s.city, state: p.state ?? s.state, pincode: p.postcode ?? s.pincode }))
          }
        })
        .catch(() => {})
    }, 700)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (f.lat == null || f.lng == null) {
      setError('Search for your area or use your current location first.')
      return
    }
    setSaving(true)
    const body = {
      ...f,
      nickname: f.label === 'other' ? f.nickname.trim() || null : null,
      landmark: f.landmark.trim() || null,
      city: f.city.trim() || null,
      state: f.state.trim() || null,
      pincode: f.pincode.trim() || null,
      receiver_name: f.receiver_name.trim() || null,
      phone: f.phone.trim() || null,
    }
    try {
      await api(address ? `/api/addresses/${address.id}` : '/api/addresses', { method: address ? 'PUT' : 'POST', body })
      notifyAddressesChanged()
      onClose()
    } catch (err) {
      setError((err as Error).message)
      setSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm md:items-center" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl animate-fade-up md:rounded-3xl md:p-6"
        role="dialog"
        aria-modal="true"
        aria-label={address ? 'Edit address' : 'Add address'}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line md:hidden" />
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-extrabold">{address ? 'Edit address' : 'Add new address'}</h3>
          <button type="button" className="grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-soft text-muted" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        <div className="mt-4 space-y-4">
          <PlaceInput
            label="Search area"
            placeholder="Search area, street or landmark"
            icon={<MapPin size={18} className="text-rose-500" />}
            value={picked}
            text={searchText}
            onText={setSearchText}
            onSelect={applyPlace}
            allowLocate
          />

          {f.lat != null && f.lng != null && (
            <Suspense fallback={<div className="skeleton h-52 rounded-2xl" />}>
              <PinMap lat={f.lat} lng={f.lng} onMove={onPinMove} />
            </Suspense>
          )}

          <Field label="Flat / House no. / Building *">
            <input className="input" value={f.house} onChange={(e) => set('house', e.target.value)} placeholder="e.g. Flat 302, Sai Residency" required maxLength={160} />
          </Field>
          <Field label="Area / Street">
            <input className="input" value={f.area} onChange={(e) => set('area', e.target.value)} placeholder="Filled from the map search" required maxLength={240} />
          </Field>
          <Field label="Landmark (optional)">
            <input className="input" value={f.landmark} onChange={(e) => set('landmark', e.target.value)} placeholder="e.g. Near metro station" maxLength={160} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="City"><input className="input" value={f.city} onChange={(e) => set('city', e.target.value)} maxLength={80} /></Field>
            <Field label="State"><input className="input" value={f.state} onChange={(e) => set('state', e.target.value)} maxLength={80} /></Field>
            <Field label="Pincode">
              <input className="input" value={f.pincode} onChange={(e) => set('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="500018" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Receiver’s name"><input className="input" value={f.receiver_name} onChange={(e) => set('receiver_name', e.target.value)} maxLength={120} /></Field>
            <Field label="Phone">
              <div className="flex items-center rounded-xl border border-line bg-card focus-within:border-brand-500">
                <span className="pl-3 text-sm text-muted">+91</span>
                <input className="min-h-11 w-full bg-transparent px-2 text-sm outline-none" value={f.phone} onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))} inputMode="tel" placeholder="98765 43210" />
              </div>
            </Field>
          </div>

          <div>
            <div className="mb-1.5 text-sm font-medium">Save as</div>
            <div className="flex flex-wrap gap-2">
              {(['home', 'work', 'other'] as const).map((l) => {
                const Icon = LABEL_ICON[l]
                return (
                  <button
                    type="button"
                    key={l}
                    onClick={() => set('label', l)}
                    className={`flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl border px-4 text-sm font-semibold capitalize ${f.label === l ? 'border-ink bg-ink text-canvas' : 'border-line text-muted hover:text-ink'}`}
                  >
                    <Icon size={15} /> {l}
                  </button>
                )
              })}
            </div>
            {f.label === 'other' && (
              <input className="input mt-2" value={f.nickname} onChange={(e) => set('nickname', e.target.value)} placeholder="Name this address, e.g. Mom’s place" maxLength={40} />
            )}
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-[var(--color-brand-600)]" checked={f.is_default} onChange={(e) => set('is_default', e.target.checked)} />
            Use as my default address
          </label>

          {error && <ErrorBox message={error} />}
          <button className="btn-brand w-full min-h-12" disabled={saving}>{saving ? 'Saving…' : 'Save address'}</button>
        </div>
      </form>
    </div>,
    document.body,
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium">
      <span className="mb-1.5 block">{label}</span>
      {children}
    </label>
  )
}
