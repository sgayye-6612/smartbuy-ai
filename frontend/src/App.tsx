import { useEffect, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import Layout from './components/Layout'
import AssistantPage from './pages/Assistant'
import AuthPage from './pages/Auth'
import BasketPage from './pages/Basket'
import ComparePage from './pages/Compare'
import HomePage from './pages/Home'
import PreferencesPage from './pages/Preferences'
import ProfilePage from './pages/Profile'
import RidesPage from './pages/Rides'
import SearchPage from './pages/Search'
import SectionPage from './pages/Section'
import WishlistPage from './pages/Wishlist'
import { useSettings } from './settings'

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const { delivery, setDelivery } = useSettings()

  // Use the delivery preference saved on the account when logging in on a new device
  useEffect(() => {
    if (user && user.delivery_preference !== delivery && !localStorage.getItem('smartbuy_delivery')) setDelivery(user.delivery_preference)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  if (loading)
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-brand-600" />
      </div>
    )
  return user ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route path="/" element={<HomePage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/compare/:id" element={<ComparePage />} />
        <Route path="/groceries" element={<SectionPage kind="groceries" />} />
        <Route path="/food" element={<SectionPage kind="food" />} />
        <Route path="/shop" element={<SectionPage kind="shop" />} />
        <Route path="/rides" element={<RidesPage />} />
        <Route path="/assistant" element={<AssistantPage />} />
        <Route path="/basket" element={<BasketPage />} />
        <Route path="/wishlist" element={<WishlistPage />} />
        <Route path="/preferences" element={<PreferencesPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
