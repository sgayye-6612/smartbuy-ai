import {
  Bell, CarTaxiFront, ChevronRight, Heart, House, LogOut, Monitor, Moon, Search, Settings2, ShoppingBag, ShoppingBasket,
  ShoppingCart, Sparkles, Sun, UserRound, UtensilsCrossed, X, type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { useSettings } from '../settings'

type NavItem = { to: string; label: string; short?: string; icon: LucideIcon }

const SIDEBAR_TOP: NavItem[] = [
  { to: '/', label: 'Home', icon: House },
  { to: '/search', label: 'Search & compare', icon: Search },
  { to: '/groceries', label: 'Groceries', icon: ShoppingBasket },
  { to: '/rides', label: 'Rides', icon: CarTaxiFront },
  { to: '/food', label: 'Food', icon: UtensilsCrossed },
  { to: '/shop', label: 'Shopping & Lifestyle', short: 'Tech · Fashion · Beauty · Home', icon: ShoppingBag },
]
const SIDEBAR_BOTTOM: NavItem[] = [
  { to: '/wishlist', label: 'Wishlist & alerts', icon: Heart },
  { to: '/preferences', label: 'My platforms', icon: Settings2 },
  { to: '/profile', label: 'Profile & addresses', icon: UserRound },
]

const BOTTOM: NavItem[] = [
  { to: '/', label: 'Home', icon: House },
  { to: '/groceries', label: 'Groceries', icon: ShoppingBasket },
  { to: '/food', label: 'Food', icon: UtensilsCrossed },
  { to: '/rides', label: 'Rides', icon: CarTaxiFront },
  { to: '/shop', label: 'Shop', icon: ShoppingBag },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const [unread, setUnread] = useState(0)
  const [basketCount, setBasketCount] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    api<{ is_read: boolean }[]>('/api/alerts')
      .then((a) => setUnread(a.filter((x) => !x.is_read).length))
      .catch(() => {})
  }, [location.pathname])

  // Basket item count (updates whenever anything is added or removed)
  useEffect(() => {
    const load = () =>
      api<{ quantity: number }[]>('/api/basket')
        .then((b) => setBasketCount(b.reduce((n, i) => n + i.quantity, 0)))
        .catch(() => {})
    load()
    window.addEventListener('basket:changed', load)
    return () => window.removeEventListener('basket:changed', load)
  }, [])

  useEffect(() => {
    window.scrollTo({ top: 0 })
    setMenuOpen(false)
  }, [location.pathname])

  const isActive = (item: NavItem) => (item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to))
  const navLink = (n: NavItem) => {
    const on = isActive(n)
    return (
      <Link
        key={n.to}
        to={n.to}
        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${on ? 'bg-soft text-ink' : 'text-muted hover:bg-soft hover:text-ink'}`}
      >
        <n.icon size={18} className={on ? 'text-brand-600 dark:text-brand-400' : ''} />
        <span className="min-w-0 flex-1">
          <span className="block">{n.label}</span>
          {n.short && <span className="block truncate text-[11px] font-normal text-faint">{n.short}</span>}
        </span>
        {n.to === '/wishlist' && unread > 0 && <span className="chip bg-rose-500 text-white">{unread}</span>}
      </Link>
    )
  }
  const basketOn = location.pathname.startsWith('/basket')

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-card md:flex">
        <div className="px-5 py-6">
          <Logo />
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {SIDEBAR_TOP.map(navLink)}

          {/* Smart basket: highlighted */}
          <Link
            to="/basket"
            className={`group relative my-3 flex items-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 via-emerald-600 to-teal-700 px-3.5 py-3.5 text-white shadow-lg shadow-brand-600/25 transition hover:-translate-y-0.5 hover:shadow-xl ${basketOn ? 'ring-2 ring-offset-2 ring-brand-500 ring-offset-card' : ''}`}
          >
            <span className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/15" />
            <span className="relative grid h-10 w-10 place-items-center rounded-xl bg-white/20">
              <ShoppingCart size={21} strokeWidth={2.4} />
            </span>
            <span className="relative min-w-0 flex-1">
              <span className="block text-[15px] font-extrabold">Smart basket</span>
              <span className="block text-[11px] text-emerald-50">{basketCount ? 'Compare & checkout' : 'Mix apps, save on fees'}</span>
            </span>
            {basketCount > 0 && (
              <span className="relative grid h-7 min-w-7 place-items-center rounded-full bg-amber-300 px-1.5 text-xs font-extrabold text-amber-950">{basketCount}</span>
            )}
          </Link>

          {SIDEBAR_BOTTOM.map(navLink)}
        </nav>
        <div className="space-y-3 border-t border-line p-4">
          <ThemeSwitch />
          <div className="flex items-center gap-3">
            <Link to="/profile" className="flex min-w-0 flex-1 items-center gap-3 rounded-xl hover:opacity-80" title="Profile & addresses">
              <Avatar name={user?.name} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{user?.name}</div>
                <div className="truncate text-xs text-muted">{user?.email}</div>
              </div>
            </Link>
            <button onClick={logout} className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-muted hover:bg-soft hover:text-rose-600" title="Log out" aria-label="Log out">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-canvas/85 px-4 py-3 backdrop-blur-xl md:hidden">
        <Logo compact />
        <div className="flex items-center gap-1">
          <Link to="/search" className="grid h-10 w-10 place-items-center rounded-xl text-muted" aria-label="Search">
            <Search size={20} />
          </Link>
          <Link to="/wishlist" className="relative grid h-10 w-10 place-items-center rounded-xl text-muted" aria-label="Alerts">
            <Bell size={20} />
            {unread > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500" />}
          </Link>
          <button onClick={() => setMenuOpen(true)} className="cursor-pointer rounded-full" aria-label="Account menu">
            <Avatar name={user?.name} />
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 pb-28 pt-5 md:px-10 md:pb-12 md:pt-8">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden" aria-label="Main">
        <div className="grid grid-cols-5">
          {BOTTOM.map((n) => {
            const on = isActive(n)
            return (
              <Link key={n.to} to={n.to} className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition ${on ? 'text-brand-600 dark:text-brand-400' : 'text-faint'}`}>
                <span className={`grid h-8 w-12 place-items-center rounded-full transition ${on ? 'bg-brand-500/12' : ''}`}>
                  <n.icon size={20} strokeWidth={on ? 2.4 : 2} />
                </span>
                {n.label}
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Mobile: floating smart basket button */}
      {!basketOn && (
        <Link
          to="/basket"
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-14 items-center gap-2 rounded-full bg-gradient-to-br from-brand-500 to-teal-700 pl-4 pr-5 font-bold text-white shadow-xl shadow-brand-700/40 transition active:scale-95 md:hidden"
          aria-label={`Smart basket, ${basketCount} items`}
        >
          <span className="relative">
            <ShoppingCart size={22} strokeWidth={2.4} />
            {basketCount > 0 && <span className="absolute -right-2.5 -top-2.5 grid h-5 min-w-5 place-items-center rounded-full bg-amber-300 px-1 text-[10px] font-extrabold text-amber-950">{basketCount}</span>}
          </span>
          <span className="text-sm">Basket</span>
        </Link>
      )}

      {menuOpen && <AccountMenu onClose={() => setMenuOpen(false)} unread={unread} />}
    </div>
  )
}

function Avatar({ name }: { name?: string }) {
  return <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white">{name?.[0]?.toUpperCase()}</div>
}

/** Mobile account sheet: platforms, alerts, theme, log out. */
function AccountMenu({ onClose, unread }: { onClose: () => void; unread: number }) {
  const { user, logout } = useAuth()
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 backdrop-blur-sm md:hidden" onClick={onClose}>
      <div className="w-full rounded-t-3xl bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-fade-up" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
        <div className="flex items-center gap-3">
          <Avatar name={user?.name} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-bold">{user?.name}</div>
            <div className="truncate text-xs text-muted">{user?.email}</div>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-soft text-muted" aria-label="Close"><X size={16} /></button>
        </div>
        <div className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line">
          <MenuRow to="/profile" icon={<UserRound size={18} />} label="Profile & addresses" />
          <MenuRow to="/preferences" icon={<Settings2 size={18} />} label="My platforms & delivery" />
          <MenuRow to="/wishlist" icon={<Heart size={18} />} label="Wishlist & alerts" badge={unread ? `${unread} new` : undefined} />
          <MenuRow to="/assistant" icon={<Sparkles size={18} />} label="AI assistant" />
        </div>
        <div className="mt-4"><ThemeSwitch /></div>
        <button onClick={logout} className="btn-ghost mt-4 w-full text-rose-600"><LogOut size={16} /> Log out</button>
      </div>
    </div>,
    document.body,
  )
}

function MenuRow({ to, icon, label, badge }: { to: string; icon: React.ReactNode; label: string; badge?: string }) {
  return (
    <Link to={to} className="flex min-h-14 items-center gap-3 px-4 hover:bg-soft">
      <span className="text-muted">{icon}</span>
      <span className="flex-1 text-sm font-medium">{label}</span>
      {badge && <span className="chip bg-rose-500/12 text-rose-700 dark:text-rose-300">{badge}</span>}
      <ChevronRight size={16} className="text-faint" />
    </Link>
  )
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <div className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-emerald-700 text-white shadow-lg shadow-brand-600/25">
        <ShoppingCart size={18} strokeWidth={2.4} />
        <Sparkles size={10} className="absolute -right-0.5 -top-0.5 text-amber-300" fill="currentColor" />
      </div>
      <div className="leading-tight">
        <div className="text-[15px] font-extrabold tracking-tight">SmartBuy<span className="text-brand-600 dark:text-brand-400"> AI</span></div>
        {!compact && <div className="text-[11px] text-muted">Your shopping & lifestyle assistant</div>}
      </div>
    </Link>
  )
}

export function ThemeSwitch() {
  const { theme, setTheme } = useSettings()
  const opts = [
    { key: 'light', icon: Sun, label: 'Light' },
    { key: 'dark', icon: Moon, label: 'Dark' },
    { key: 'system', icon: Monitor, label: 'Auto' },
  ] as const
  return (
    <div className="grid grid-cols-3 rounded-xl bg-soft p-1" role="radiogroup" aria-label="Theme">
      {opts.map((o) => (
        <button
          key={o.key}
          role="radio"
          aria-checked={theme === o.key}
          onClick={() => setTheme(o.key)}
          className={`flex min-h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition ${theme === o.key ? 'bg-card text-ink shadow-sm' : 'text-muted'}`}
        >
          <o.icon size={13} /> {o.label}
        </button>
      ))}
    </div>
  )
}
