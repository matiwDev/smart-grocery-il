/**
 * Aisle categories (Plan v2, phase 2). Product categories come from the
 * database function categorize_product() (migration 018); households can
 * override any item's category. Order here = order on the shopping list,
 * roughly the walk through an Israeli supermarket.
 */

export type CategoryKey =
  | 'produce'
  | 'bread'
  | 'dairy_eggs'
  | 'meat_fish'
  | 'pantry'
  | 'snacks'
  | 'drinks'
  | 'frozen'
  | 'baby'
  | 'personal_care'
  | 'household'
  | 'other';

export const CATEGORIES: Array<{ key: CategoryKey; he: string; en: string; icon: string }> = [
  { key: 'produce', he: 'פירות וירקות', en: 'Fruit & veg', icon: '🥬' },
  { key: 'bread', he: 'לחם ומאפים', en: 'Bread & bakery', icon: '🍞' },
  { key: 'dairy_eggs', he: 'מוצרי חלב וביצים', en: 'Dairy & eggs', icon: '🥛' },
  { key: 'meat_fish', he: 'בשר, עוף ודגים', en: 'Meat, poultry & fish', icon: '🥩' },
  { key: 'pantry', he: 'מזווה', en: 'Pantry', icon: '🥫' },
  { key: 'snacks', he: 'חטיפים ומתוקים', en: 'Snacks & sweets', icon: '🍫' },
  { key: 'drinks', he: 'משקאות', en: 'Drinks', icon: '🥤' },
  { key: 'frozen', he: 'קפואים', en: 'Frozen', icon: '🧊' },
  { key: 'baby', he: 'תינוקות', en: 'Baby', icon: '🍼' },
  { key: 'personal_care', he: 'טיפוח והיגיינה', en: 'Personal care', icon: '🧴' },
  { key: 'household', he: 'ניקיון ובית', en: 'Cleaning & home', icon: '🧽' },
  { key: 'other', he: 'אחר', en: 'Other', icon: '📦' },
];

// Keys used before migration 018 (still possible in old saved rows).
const LEGACY: Record<string, CategoryKey> = {
  dairy: 'dairy_eggs',
  meat: 'meat_fish',
  beverage: 'drinks',
};

export function normalizeCategory(category: string | null | undefined): CategoryKey {
  if (!category) return 'other';
  if (LEGACY[category]) return LEGACY[category];
  return (CATEGORIES.some((c) => c.key === category) ? category : 'other') as CategoryKey;
}

export function categoryInfo(category: string | null | undefined) {
  const key = normalizeCategory(category);
  return CATEGORIES.find((c) => c.key === key)!;
}

export function categoryLabel(category: string | null | undefined, lang: 'he' | 'en'): string {
  return categoryInfo(category)[lang];
}

export function categoryOrder(category: string | null | undefined): number {
  return CATEGORIES.findIndex((c) => c.key === normalizeCategory(category));
}
