// All calls to the FastAPI backend go through here.
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export function getToken() {
  return localStorage.getItem('smartbuy_token')
}
export function setToken(token: string | null) {
  if (token) localStorage.setItem('smartbuy_token', token)
  else localStorage.removeItem('smartbuy_token')
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Is the backend running on port 8000?')
  }
  if (res.ok && path.startsWith('/api/basket') && (options.method ?? 'GET') !== 'GET') {
    window.dispatchEvent(new Event('basket:changed'))
  }
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = Array.isArray(data.detail) ? data.detail.map((d: { msg: string }) => d.msg).join(', ') : data.detail
    throw new ApiError(res.status, detail || `Request failed (${res.status})`)
  }
  return data as T
}

// ---------- Types (match the backend responses) ----------
export type Delivery = 'instant' | 'standard' | 'any'
export type User = { id: number; email: string; name: string; city: string | null; pincode: string | null; delivery_preference: Delivery }

export type Product = {
  id: number
  brand: string
  name: string
  variant: string | null
  size: string
  category: string
  subcategory: string | null
  veg: boolean | null
  barcode: string | null
  emoji: string
  description: string | null
  display_name: string
  lowest_price?: number | null
  lowest_platform?: string | null
  mrp?: number | null
  platform_count?: number
  fastest_mins?: number | null
  match_score?: number
  match_reason?: string
  exact?: boolean
  deal_pct?: number
  reason?: string
}

export type Integration = { slug: string; name: string; mode: 'live' | 'sample'; direct_checkout: boolean; checkout_verb: string; official_route: string }

export type Platform = {
  id: number
  name: string
  slug: string
  categories: string[]
  delivery_type: 'instant' | 'standard' | 'food' | 'ride'
  delivery_fee: number
  free_delivery_above: number | null
  platform_fee: number
  avg_delivery_mins: number
  reliability: number
  coupon: { code: string; percent: number; max: number | null; min_order: number } | null
  integration: Integration
}

export type Offer = {
  listing_id: number
  platform: { id: number; name: string; slug: string; reliability: number }
  title: string
  mrp: number
  price: number
  discount_percent: number
  quantity: number
  subtotal: number
  delivery_fee: number
  platform_fee: number
  coupon_discount: number
  coupon_code: string | null
  final_price: number
  delivery_mins: number
  delivery_type: string
  in_stock: boolean
  seller_rating: number
  url: string
  data_source: string
  score: number
  is_favorite: boolean
  checkout: { verb: string; direct: boolean; mode: string }
}

export type PriceStats = { series: { date: string; lowest_price: number }[]; average: number | null; lowest: number | null; highest: number | null }
export type Deal = { verdict: 'great' | 'good' | 'fair' | 'wait' | 'unknown'; message: string }

export type ComparisonResult = {
  product: Product
  offers: Offer[]
  best: Offer | null
  cheapest: Offer | null
  savings: number
  reasons: string[]
  compared_platforms: number
  hidden_by_filters: number
  delivery_preference: Delivery
  favorite_note: string | null
  history?: PriceStats
  deal?: Deal
}

export type Order = {
  platform: { id: number; name: string; slug: string }
  restaurant: string | null
  checkout_verb: string
  items: { product_id: number; title: string; price: number; quantity: number; line_total: number; url: string }[]
  subtotal: number
  delivery_fee: number
  platform_fee: number
  coupon_discount: number
  total: number
}
export type Plan = { orders: Order[]; items_total: number; fees_total: number; coupons_total: number; total: number; platform_count: number }
export type Optimization = {
  single_platform_options: Plan[]
  best_single: Plan | null
  best_split: Plan | null
  recommendation: { type: 'single' | 'split'; plan: Plan; message: string } | null
  savings_vs_single: number
  missing_products?: string[]
}

export type Place = { name: string; label: string; lat: number; lng: number; city: string | null; state: string | null; postcode?: string | null; source?: string }

export type Address = {
  id: number
  label: 'home' | 'work' | 'other'
  nickname: string | null
  title: string
  receiver_name: string | null
  phone: string | null
  house: string
  area: string
  landmark: string | null
  city: string | null
  state: string | null
  pincode: string | null
  lat: number
  lng: number
  is_default: boolean
  short: string
  full: string
  place: Place
}

export type RideOption = {
  platform: { id: number; name: string; slug: string }
  vehicle_class: string
  vehicle_label: string
  icon: string
  product: string
  seats: number
  fare_low: number
  fare_high: number
  fare_estimate: number
  surge: number
  pickup_eta_mins: number
  trip_mins: number
  available: boolean
  unavailable_reason: string | null
  is_favorite: boolean
  score: number
  booking: { url: string; precision: 'exact' | 'search' | 'home'; verb: string; note: string }
}
export type RideResult = {
  pickup: Place
  drop: Place
  city: string | null
  distance_km: number
  duration_mins: number
  peak_hours: boolean
  metro: boolean
  route: [number, number][]
  route_source: 'osrm' | 'estimate' 
  groups: { vehicle_class: string; label: string; icon: string; options: RideOption[]; cheapest: string | null; fastest_pickup: string | null }[]
  cheapest: RideOption | null
  best: RideOption | null
  note: string
}

export type Preferences = { delivery_preference: Delivery; categories: Record<string, { platform_ids: number[]; favorite_id: number | null }> }

// ---------- Categories ----------
export const CATEGORIES = [
  { key: 'groceries', label: 'Groceries', short: 'Groceries' },
  { key: 'food', label: 'Food', short: 'Food' },
  { key: 'rides', label: 'Rides', short: 'Rides' },
  { key: 'electronics', label: 'Tech', short: 'Tech' },
  { key: 'fashion', label: 'Fashion', short: 'Fashion' },
  { key: 'beauty', label: 'Beauty', short: 'Beauty' },
  { key: 'shopping', label: 'Home', short: 'Home' },
] as const

export const categoryLabel = (key: string) => CATEGORIES.find((c) => c.key === key)?.label ?? key

// ---------- Helpers ----------
export const rupees = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

export function eta(mins: number | null | undefined) {
  if (mins == null) return '—'
  if (mins < 60) return `${mins} min`
  if (mins < 1440) return `${Math.round(mins / 60)} hr`
  const d = Math.round(mins / 1440)
  return `${d} day${d > 1 ? 's' : ''}`
}
