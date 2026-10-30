import { ArrowLeft, ArrowUp, ArrowUpRight, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, eta, rupees, type ComparisonResult, type Optimization, type Product, type RideResult } from '../api'
import { DealBadge, PlatformMark, ProductArt } from '../components/ui'

type AssistantResponse = {
  reply: string
  parsed: { intent: string; query: string; max_price: number | null; family_size: number | null; parser: string }
  products: Product[]
  comparison: ComparisonResult | null
  basket: { items: (Product & { quantity: number })[]; optimization: Optimization } | null
  deal: { verdict: 'great' | 'good' | 'fair' | 'wait' | 'unknown'; message: string } | null
  rides: RideResult | null
}
type Message = { role: 'user' | 'assistant'; text: string; data?: AssistantResponse }

const SUGGESTIONS = [
  'Find a face wash under ₹300',
  'Groceries for a family of four under ₹1,500',
  'Cab from Gachibowli to Charminar',
  'Cheapest chicken biryani',
  'Is Amul butter 500g a good deal right now?',
  'Compare JBL Flip 6 across my apps',
]

export default function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState('')
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api<{ mode: string }>('/api/assistant/status').then((s) => setMode(s.mode)).catch(() => {})
  }, [])
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, busy])

  const send = async (text: string) => {
    if (!text.trim() || busy) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', text }])
    setBusy(true)
    try {
      const data = await api<AssistantResponse>('/api/assistant', { method: 'POST', body: { message: text } })
      setMessages((m) => [...m, { role: 'assistant', text: data.reply, data }])
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', text: `⚠️ ${(e as Error).message}` }])
    } finally {
      setBusy(false)
    }
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    send(input)
  }

  return (
    <div className="flex min-h-[calc(100dvh-12rem)] flex-col md:min-h-[calc(100dvh-5rem)]">
      <Link to="/" className="mb-2 flex w-fit items-center gap-1 text-sm font-medium text-muted hover:text-ink"><ArrowLeft size={16} /> Home</Link>
      {messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center animate-fade-up">
          <div className="grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-violet-500 to-brand-600 text-white shadow-xl shadow-violet-500/25 animate-float">
            <Sparkles size={28} />
          </div>
          <h1 className="mt-5 text-2xl font-extrabold tracking-tight md:text-3xl">How can I help you shop?</h1>
          <p className="mt-2 max-w-md text-sm text-muted">Ask in plain language. I turn it into a precise search and use the comparison engine for every price. I never make prices up.</p>
          <div className="mt-6 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => send(s)} className="card card-hover cursor-pointer px-4 py-3 text-left text-sm font-medium">
                {s}
              </button>
            ))}
          </div>
          {mode && <p className="mt-6 text-xs text-faint">Mode: {mode}</p>}
        </div>
      ) : (
        <div className="flex-1 space-y-5 pb-4">
          {messages.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className="flex justify-end animate-fade-up">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-sm text-canvas">{m.text}</div>
              </div>
            ) : (
              <div key={i} className="flex gap-3 animate-fade-up">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-brand-600 text-white"><Sparkles size={15} /></div>
                <div className="min-w-0 max-w-[92%] flex-1 space-y-3">
                  <div className="card whitespace-pre-line px-4 py-3 text-sm leading-relaxed">
                    {m.text.split('**').map((part, j) => (j % 2 ? <b key={j}>{part}</b> : part))}
                  </div>
                  {m.data && <Extras data={m.data} />}
                </div>
              </div>
            ),
          )}
          {busy && (
            <div className="flex gap-3">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-brand-600 text-white"><Sparkles size={15} /></div>
              <div className="card flex items-center gap-1.5 px-4 py-3">
                {[0, 1, 2].map((d) => <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-faint" style={{ animationDelay: `${d * 120}ms` }} />)}
              </div>
            </div>
          )}
          <div ref={bottom} />
        </div>
      )}

      <form onSubmit={submit} className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] mt-2 md:bottom-4">
        <div className="card flex items-center gap-2 p-2 shadow-[var(--shadow-lift)]">
          <input className="min-h-11 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-faint" placeholder="Ask anything: a product, a dish, a ride…" value={input} onChange={(e) => setInput(e.target.value)} />
          <button className="btn-brand h-11 w-11 px-0" disabled={busy || !input.trim()} aria-label="Send"><ArrowUp size={18} /></button>
        </div>
      </form>
    </div>
  )
}

function Extras({ data }: { data: AssistantResponse }) {
  const [added, setAdded] = useState(false)
  const addAll = async () => {
    if (!data.basket) return
    for (const item of data.basket.items) await api('/api/basket', { method: 'POST', body: { product_id: item.id, quantity: item.quantity } })
    setAdded(true)
  }

  return (
    <>
      <div className="flex flex-wrap gap-1 text-[11px]">
        <span className="chip bg-soft text-muted">intent: {data.parsed.intent}</span>
        {data.parsed.query && <span className="chip bg-soft text-muted">query: {data.parsed.query}</span>}
        {data.parsed.max_price && <span className="chip bg-soft text-muted">budget ₹{data.parsed.max_price}</span>}
        <span className="chip bg-soft text-muted">{data.parsed.parser === 'llm' ? 'LLM parser' : 'rule parser'}</span>
      </div>

      {data.deal && <DealBadge deal={data.deal} />}

      {data.comparison?.best && (
        <div className="card overflow-hidden text-sm">
          {data.comparison.offers.filter((o) => o.in_stock).slice(0, 4).map((o) => (
            <div key={o.listing_id} className={`flex items-center gap-3 px-4 py-2.5 ${o.listing_id === data.comparison!.best!.listing_id ? 'bg-brand-500/8' : ''}`}>
              <PlatformMark name={o.platform.name} slug={o.platform.slug} size="sm" />
              <span className="flex-1 font-medium">{o.platform.name}</span>
              <span className="text-xs text-muted">{eta(o.delivery_mins)}</span>
              <span className="w-16 text-right font-bold">{rupees(o.final_price)}</span>
            </div>
          ))}
          <Link to={`/compare/${data.comparison.product.id}`} className="flex items-center justify-center gap-1 border-t border-line px-4 py-2.5 font-semibold text-brand-700 hover:bg-soft dark:text-brand-400">
            Full comparison <ArrowUpRight size={14} />
          </Link>
        </div>
      )}

      {data.rides?.groups && (
        <div className="card overflow-hidden text-sm">
          {data.rides.groups.flatMap((g) => g.options.filter((o) => o.available).slice(0, 1)).slice(0, 4).map((o) => (
            <div key={o.product} className="flex items-center gap-3 px-4 py-2.5">
              <span className="text-lg">{o.icon}</span>
              <span className="flex-1 font-medium">{o.product}</span>
              <span className="text-xs text-muted">{o.pickup_eta_mins} min away</span>
              <span className="w-16 text-right font-bold">~{rupees(o.fare_estimate)}</span>
            </div>
          ))}
          <Link to={`/rides?pickup=${encodeURIComponent(data.rides.pickup.name)}&drop=${encodeURIComponent(data.rides.drop.name)}`} className="flex items-center justify-center gap-1 border-t border-line px-4 py-2.5 font-semibold text-brand-700 hover:bg-soft dark:text-brand-400">
            All ride options <ArrowUpRight size={14} />
          </Link>
        </div>
      )}

      {data.products.length > 1 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          {data.products.slice(1).map((p) => (
            <Link key={p.id} to={`/compare/${p.id}`} className="card w-40 shrink-0 p-2.5 text-xs hover:shadow-md">
              <ProductArt p={p} size="sm" />
              <div className="mt-2 line-clamp-2 font-semibold">{p.display_name}</div>
              <div className="mt-1 font-bold text-brand-700 dark:text-brand-400">{rupees(p.lowest_price)}</div>
            </Link>
          ))}
        </div>
      )}

      {data.basket && (
        <div className="card p-4 text-sm">
          <ul className="space-y-2">
            {data.basket.items.map((i) => (
              <li key={i.id} className="flex items-center gap-2.5">
                <ProductArt p={i} size="sm" className="!h-8 !w-8 !text-lg" />
                <span className="flex-1 truncate">{i.display_name}</span>
                <span className="text-muted">×{i.quantity}</span>
              </li>
            ))}
          </ul>
          <button className="btn-brand mt-4 w-full" onClick={addAll} disabled={added}>{added ? '✓ Added to basket' : 'Add all to my basket'}</button>
          {added && <Link to="/basket" className="mt-2 block text-center font-semibold text-brand-700 dark:text-brand-400">Open basket →</Link>}
        </div>
      )}
    </>
  )
}
