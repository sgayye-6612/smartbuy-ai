import { ArrowRight, CarTaxiFront, Search, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, rupees, type Product } from '../api'
import { ProductArt } from './ui'

const EXAMPLES = [
  'Minimalist face wash 100 ml under ₹300',
  'Chicken biryani',
  'Ride from HITEC City to the airport',
  'boAt earbuds instant',
  'Aashirvaad atta 5 kg',
  'JBL Flip 6 speaker',
  'Margherita pizza large',
]

/** Typewriter placeholder that cycles through example searches. */
function useTypewriter(paused: boolean) {
  const [text, setText] = useState('')
  const state = useRef({ i: 0, chars: 0, deleting: false })
  useEffect(() => {
    if (paused) return
    const t = setTimeout(() => {
      const s = state.current
      const word = EXAMPLES[s.i]
      if (!s.deleting && s.chars < word.length) s.chars++
      else if (!s.deleting) s.deleting = true
      else if (s.chars > 0) s.chars--
      else {
        s.deleting = false
        s.i = (s.i + 1) % EXAMPLES.length
      }
      setText(word.slice(0, s.chars))
    }, state.current.deleting ? 25 : state.current.chars === EXAMPLES[state.current.i].length ? 1400 : 55)
    return () => clearTimeout(t)
  }, [text, paused])
  return text
}

const RIDE_RE = /from\s+(.+?)\s+to\s+(.+)/i

export default function SmartSearch({ initial = '', size = 'lg', category }: { initial?: string; size?: 'lg' | 'md'; category?: string }) {
  const navigate = useNavigate()
  const [q, setQ] = useState(initial)
  const [focused, setFocused] = useState(false)
  const [suggestions, setSuggestions] = useState<Product[]>([])
  const typed = useTypewriter(focused || q.length > 0)
  const ride = q.match(RIDE_RE)

  useEffect(() => {
    setQ(initial)
  }, [initial])

  useEffect(() => {
    if (q.trim().length < 2 || ride) {
      setSuggestions([])
      return
    }
    const t = setTimeout(() => {
      api<{ exact_matches: Product[]; alternatives: Product[] }>(`/api/products/search?q=${encodeURIComponent(q)}`)
        .then((r) => setSuggestions([...r.exact_matches, ...r.alternatives].slice(0, 5)))
        .catch(() => setSuggestions([]))
    }, 220)
    return () => clearTimeout(t)
  }, [q, ride])

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (!q.trim()) return
    if (ride) {
      navigate(`/rides?pickup=${encodeURIComponent(ride[1])}&drop=${encodeURIComponent(ride[2])}`)
      return
    }
    navigate(`/search?q=${encodeURIComponent(q)}${category ? `&category=${category}` : ''}`)
    setFocused(false)
  }

  const big = size === 'lg'
  const open = focused && (suggestions.length > 0 || !!ride)

  return (
    <form onSubmit={submit} className="relative">
      <div
        className={`group relative flex items-center gap-3 rounded-2xl border bg-card transition ${big ? 'min-h-16 px-5' : 'min-h-12 px-4'} ${
          focused ? 'border-brand-500 shadow-[0_0_0_6px_rgb(16_185_129/0.12)]' : 'border-line shadow-[var(--shadow-card)]'
        }`}
      >
        <Search size={big ? 22 : 18} className={focused ? 'text-brand-600' : 'text-faint'} />
        <div className="relative flex-1">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            className={`w-full bg-transparent text-ink outline-none ${big ? 'text-base md:text-lg' : 'text-sm'}`}
            aria-label="Search products, groceries, food or rides"
            placeholder={focused ? 'Products, groceries, dishes or "from A to B"' : ''}
            enterKeyHint="search"
          />
          {!q && !focused && (
            <div className={`pointer-events-none absolute inset-0 flex items-center truncate text-faint ${big ? 'text-base md:text-lg' : 'text-sm'}`}>
              Try “{typed}<span className="caret ml-px inline-block h-5 w-px bg-faint" />”
            </div>
          )}
        </div>
        <button className={`btn-brand shrink-0 ${big ? 'px-5' : 'min-h-9 px-3'}`} aria-label="Search">
          {big ? (
            <>
              Search <ArrowRight size={16} />
            </>
          ) : (
            <ArrowRight size={16} />
          )}
        </button>
      </div>

      {open && (
        <div className="absolute inset-x-0 top-full z-40 mt-2 overflow-hidden rounded-2xl border border-line bg-raised shadow-[var(--shadow-lift)] animate-fade-up">
          {ride && (
            <button type="button" onMouseDown={() => submit()} className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-soft">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-sky-500/12 text-sky-600"><CarTaxiFront size={20} /></div>
              <div className="flex-1">
                <div className="text-sm font-semibold">Compare rides</div>
                <div className="text-xs text-muted">{ride[1]} → {ride[2]} · Uber, Ola, Rapido</div>
              </div>
              <ArrowRight size={16} className="text-faint" />
            </button>
          )}
          {suggestions.map((p) => (
            <button
              type="button"
              key={p.id}
              onMouseDown={() => navigate(`/compare/${p.id}`)}
              className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left hover:bg-soft"
            >
              <ProductArt p={p} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{p.display_name}</div>
                <div className="text-xs text-muted">{p.platform_count} platforms · from {rupees(p.lowest_price)}</div>
              </div>
            </button>
          ))}
          <button type="button" onMouseDown={() => submit()} className="flex w-full cursor-pointer items-center gap-2 border-t border-line px-4 py-3 text-sm font-semibold text-brand-700 hover:bg-soft dark:text-brand-400">
            <Sparkles size={15} /> See all results for “{q}”
          </button>
        </div>
      )}
    </form>
  )
}
