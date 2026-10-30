// Sections of the app and their sub-categories (like the filters inside Blinkit, Swiggy or Myntra).

export type Sub = { key: string; label: string; emoji: string }
export type Tab = { key: string; label: string; emoji: string; subs: Sub[] }

export const GROCERY_SUBS: Sub[] = [
  { key: 'fruits-veg', label: 'Fruits & Vegetables', emoji: '🥬' },
  { key: 'dairy', label: 'Dairy, Bread & Eggs', emoji: '🥛' },
  { key: 'staples', label: 'Atta, Rice & Dal', emoji: '🌾' },
  { key: 'oil-masala', label: 'Oil, Ghee & Masala', emoji: '🫙' },
  { key: 'snacks', label: 'Snacks & Instant Food', emoji: '🍿' },
  { key: 'beverages', label: 'Tea, Coffee & Drinks', emoji: '☕' },
  { key: 'household', label: 'Cleaning & Household', emoji: '🧽' },
  { key: 'personal-care', label: 'Personal Care', emoji: '🧴' },
]

export const FOOD_SUBS: Sub[] = [
  { key: 'biryani', label: 'Biryani', emoji: '🍛' },
  { key: 'north-indian', label: 'North Indian', emoji: '🍲' },
  { key: 'south-indian', label: 'South Indian', emoji: '🥞' },
  { key: 'pizza', label: 'Pizza', emoji: '🍕' },
  { key: 'burgers', label: 'Burgers', emoji: '🍔' },
  { key: 'chinese', label: 'Chinese & Momos', emoji: '🥟' },
  { key: 'healthy', label: 'Healthy', emoji: '🥗' },
  { key: 'desserts-drinks', label: 'Desserts & Drinks', emoji: '🍫' },
]

export const SHOP_TABS: Tab[] = [
  {
    key: 'electronics', label: 'Tech', emoji: '🎧', subs: [
      { key: 'audio', label: 'Audio', emoji: '🎧' },
      { key: 'wearables', label: 'Smartwatches', emoji: '⌚' },
      { key: 'mobile-accessories', label: 'Chargers & Power banks', emoji: '🔋' },
      { key: 'computer-accessories', label: 'Computer accessories', emoji: '🖱️' },
    ],
  },
  {
    key: 'fashion', label: 'Fashion', emoji: '👕', subs: [
      { key: 'men', label: 'Men', emoji: '👔' },
      { key: 'women', label: 'Women', emoji: '👗' },
      { key: 'footwear', label: 'Footwear', emoji: '👟' },
      { key: 'accessories', label: 'Watches & Bags', emoji: '🎒' },
    ],
  },
  {
    key: 'beauty', label: 'Beauty', emoji: '💄', subs: [
      { key: 'skincare', label: 'Skincare', emoji: '🧴' },
      { key: 'suncare', label: 'Sunscreen', emoji: '☀️' },
      { key: 'haircare', label: 'Haircare', emoji: '🫧' },
      { key: 'makeup', label: 'Makeup', emoji: '💄' },
    ],
  },
  {
    key: 'shopping', label: 'Home', emoji: '🏠', subs: [
      { key: 'kitchen', label: 'Kitchen & Dining', emoji: '🍳' },
      { key: 'home-essentials', label: 'Home essentials', emoji: '💡' },
    ],
  },
]

export const SORTS = [
  { key: 'relevance', label: 'Relevance' },
  { key: 'price-asc', label: 'Price: low to high' },
  { key: 'price-desc', label: 'Price: high to low' },
  { key: 'discount', label: 'Biggest discount' },
  { key: 'fastest', label: 'Fastest delivery' },
] as const
export type SortKey = (typeof SORTS)[number]['key']

/** Where each product category lives in the app. */
export function sectionPath(category: string) {
  if (category === 'groceries') return '/groceries'
  if (category === 'food') return '/food'
  if (category === 'rides') return '/rides'
  return `/shop?tab=${category}`
}
