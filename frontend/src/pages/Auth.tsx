import { CarTaxiFront, ShoppingBasket, Sparkles, UtensilsCrossed } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { Logo } from '../components/Layout'
import { ErrorBox } from '../components/ui'

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { user, login, register } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [redirect, setRedirect] = useState<string | null>(null)

  if (redirect) return <Navigate to={redirect} replace />
  if (user && !busy) return <Navigate to="/" replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'login') await login(email, password)
      else await register(name, email, password)
      setRedirect(mode === 'register' ? '/preferences' : '/')
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-[#06110d] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -left-20 top-20 h-96 w-96 rounded-full bg-brand-500/30 blur-3xl" />
        <div className="absolute -right-10 bottom-0 h-80 w-80 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="relative [&_*]:!text-white"><Logo /></div>
        <div className="relative">
          <h2 className="max-w-lg text-5xl font-extrabold leading-[1.05] tracking-tight">
            One search.
            <br />
            Every app.
            <br />
            <span className="bg-gradient-to-r from-brand-300 to-sky-300 bg-clip-text text-transparent">The best deal.</span>
          </h2>
          <p className="mt-5 max-w-md text-white/70">
            Compare real final prices, with fees, coupons and delivery time, across groceries, shopping, food and rides. Then finish on the app you choose.
          </p>
          <div className="mt-10 grid max-w-md grid-cols-2 gap-3">
            {[
              [ShoppingBasket, 'Groceries in 10 min or next day'],
              [UtensilsCrossed, 'Food from Swiggy & Zomato'],
              [CarTaxiFront, 'Uber, Ola & Rapido fares'],
              [Sparkles, 'AI that never invents prices'],
            ].map(([Icon, t], i) => {
              const I = Icon as typeof Sparkles
              return (
                <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur animate-fade-up" style={{ animationDelay: `${i * 80}ms` }}>
                  <I size={20} className="text-brand-300" />
                  <div className="mt-2 text-sm font-medium text-white/85">{t as string}</div>
                </div>
              )
            })}
          </div>
        </div>
        <div className="relative text-xs text-white/40">Portfolio project · sample data where live integrations aren’t available</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4 animate-fade-up">
          <div className="mb-8 lg:hidden"><Logo /></div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
            <p className="mt-1.5 text-sm text-muted">{mode === 'login' ? 'Log in to see your savings.' : 'Free, and it takes 10 seconds.'}</p>
          </div>
          {error && <ErrorBox message={error} />}
          {mode === 'register' && (
            <label className="block text-sm font-medium">
              Name
              <input className="input mt-1.5" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
            </label>
          )}
          <label className="block text-sm font-medium">
            Email
            <input className="input mt-1.5" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input className="input mt-1.5" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </label>
          <button className="btn-primary w-full min-h-12" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
          <p className="text-center text-sm text-muted">
            {mode === 'login' ? (
              <>New here? <Link className="font-semibold text-brand-700 dark:text-brand-400" to="/register">Create an account</Link></>
            ) : (
              <>Already have an account? <Link className="font-semibold text-brand-700 dark:text-brand-400" to="/login">Log in</Link></>
            )}
          </p>
        </form>
      </div>
    </div>
  )
}
