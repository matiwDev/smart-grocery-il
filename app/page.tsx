'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ShoppingCart, ExternalLink, TrendingDown,
  LogIn, LogOut, Globe, User, X, Menu, Home, List, Users, Search,
  MapPin, Trash2, Navigation, ChevronDown,
  LifeBuoy, MessageCircle, MessageSquare, CheckCircle, AlertCircle,
  ArrowDown, Loader2, Bell, Copy, UserPlus, Sun, Moon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { BranchMapContainer } from '@/components/BranchMapContainer';
import { AuthModal, AuthMode } from '@/components/AuthModal';
import { supabase } from '@/utils/supabase';

type Lang = 'he' | 'en';
type View = 'HOME' | 'PROFILE' | 'SAVED_LISTS' | 'PRICE_UPDATES' | 'COMMUNITY' | 'LOCATION' | 'CHAT';
type Theme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'sg_theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChainPrice {
  chain_id: string;
  price: number;
  is_sale?: boolean;
}

interface ProductResult {
  id: string;
  barcode: string | null;
  name_he: string;
  name_en: string | null;
  category: string | null;
  min_price: number | null;
  max_price: number | null;
  best_chain: string | null;
  prices: Record<string, ChainPrice>;
}

interface ChainMeta {
  id: string;
  name_he: string;
  name_en: string;
  color_hex: string;
}

interface BasketItem {
  id: string;          // product_id (UUID from products table)
  dbId?: string;       // basket_items row id in Supabase
  name_he: string;
  name_en: string | null;
  category: string | null;
  prices: Record<string, ChainPrice>;
  min_price: number | null;
  quantity: number;
}

interface ComparisonResult {
  chain_id: string;
  name_he: string;
  name_en: string;
  color_hex: string;
  total: number;
  available_items: number;
  missing_items: string[];
}

interface UserProfile {
  id?: string;
  nickname: string;
  email: string;
  phone: string;
  avatar: string;
}

interface BranchRow {
  id: string;
  name_he: string;
  name_en: string | null;
  city_he: string;
  city_en: string | null;
  chain_id: string;
  lat: number | null;
  lng: number | null;
}

interface LiveBranch {
  id: string;
  name: string;
  desc: string;
  cityHe: string;
  cityEn: string | null;
  dist: string;
  mapsLink: string;
  chain_id: string;
  lat: number | null;
  lng: number | null;
  color_hex: string;
}

interface SavedBasketItem {
  id: string;
  product_id: string | null;
  product_name: string;
  quantity_value: number;
}

interface SavedBasket {
  id: string;
  name: string;
  updated_at: string;
  basket_items?: SavedBasketItem[];
}

interface ChatMessage {
  id: string;
  user_id: string;
  nickname: string;
  content: string;
  created_at: string;
}

// ─── Dictionary ───────────────────────────────────────────────────────────────

const DICTIONARY = {
  he: {
    appTitle: 'Smart Grocery IL',
    envLabel: 'מחירים בזמן אמת',
    signIn: 'התחברות', signOut: 'התנתק', signUp: 'הרשמה',
    guest: 'אורח', roleGuest: 'לא מחובר', roleBuyer: 'קניין ראשי',
    searchPlaceholder: 'חפש מוצר (לדוגמה: חלב תנובה)...',
    emptyList: 'הרשימה ריקה. הוסף מוצרים כדי להתחיל.',
    listTotal: 'סה״כ סל:',
    quantity: 'כמות',
    basePrice: 'מחיר מינימלי',
    total: 'סה״כ',
    navHome: 'ראשי', navProfile: 'הגדרות פרופיל',
    navSavedLists: 'רשימות שמורות', navPriceUpdates: 'עדכוני מחירים',
    navCommunity: 'קהילת צרכנים', navChat: 'צ׳אט משפחתי',
    location: 'מיקום',
    currentGpsLocation: 'מיקום נוכחי (GPS)',
    nearbySupermarkets: 'סופרמרקטים בסביבה',
    quickNavigate: 'ניווט מהיר',
    viewDetails: 'צפה בפרטים',
    backToHome: 'חזרה לראשי',
    placeholderDesc: 'העמוד הזה נמצא כעת בפיתוח.',
    devOptionsLocked: 'בקרת מפתחים (Locked)',
    profileDataTitle: 'פרטים אישיים',
    avatarPickerTitle: 'בחר דמות',
    editCredentials: 'ערוך פרטים', saveAndVerify: 'שמירה ואימות',
    verificationSent: 'נשמר בהצלחה',
    nicknameLabel: 'כינוי', emailLabel: 'אימייל',
    phoneLabel: 'טלפון', phonePlaceholder: '05X-XXXXXXX',
    submit: 'שלח', cancel: 'ביטול',
    switchToSignUp: 'אין לך חשבון? הירשם',
    switchToSignIn: 'כבר יש לך חשבון? התחבר',
    savedBasketsTitle: 'סלים שמורים',
    supportChannel: 'תמיכה ושירות',
    whatsappExpress: 'WhatsApp אקספרס',
    emailSupport: 'טופס פנייה במייל',
    verificationNotice: 'אנא אמת את כתובת האימייל',
    enterVerificationCode: 'הזן קוד בן 6 ספרות',
    verify: 'אימות',
    authModalTitleIn: 'התחברות למערכת',
    authModalTitleUp: 'הרשמה למערכת',
    usernameLabel: 'שם משתמש', passwordLabel: 'סיסמה',
    // Price comparison
    priceComparison: 'השוואת מחירים',
    cheapestAt: 'הכי זול ב',
    youSave: 'חוסכים',
    vsExpensive: 'לעומת היקר ביותר',
    allChains: 'כל הרשתות',
    itemsAvailable: 'פריטים זמינים',
    searching: 'מחפש...',
    noResults: 'לא נמצאו תוצאות',
    addToList: 'הוסף לרשימה',
    sale: 'מבצע',
    telAviv: 'תל אביב', haifa: 'חיפה', jerusalem: 'ירושלים',
    branchSelector: 'בחר סניף',
    dataIngestionWindow: 'חלון עדכון נתונים',
    dataIngestionDesc: 'עדכוני מחירים מתבצעים אוטומטית בשעות השפל.',
    uploadPicture: 'העלה תמונה',
    basketAtBranch: 'עלות הסל כאן',
    priceAlerts: 'התראות מחיר',
    priceAlertSet: 'התראה הופעלה',
    priceAlertRemoved: 'התראה בוטלה',
    targetPrice: 'מחיר יעד',
    inviteToHousehold: 'הזמן למשק בית',
    yourInviteCode: 'קוד ההזמנה שלך',
    copyCode: 'העתק קוד',
    codeCopied: 'הועתק!',
    joinHousehold: 'הצטרף למשק בית',
    enterInviteCode: 'הזן קוד הזמנה',
    joinButton: 'הצטרף',
    joinSuccess: 'הצטרפת בהצלחה!',
    joinError: 'קוד לא תקין או שגיאה',
    generateCode: 'צור קוד הזמנה',
    saveList: 'שמור רשימה',
    clearList: 'רוקן רשימה',
    saveListPrompt: 'שם לרשימה השמורה:',
    clearListConfirm: 'לרוקן את הסל? הפעולה בלתי הפיכה.',
    myLocation: 'המיקום שלי',
    locationDenied: 'הגישה למיקום נדחתה',
    distanceFilter: 'טווח מרחק',
    searchByCity: 'חפש לפי עיר',
  },
  en: {
    appTitle: 'Smart Grocery IL',
    envLabel: 'Real-Time Prices',
    signIn: 'Sign In', signOut: 'Sign Out', signUp: 'Sign Up',
    guest: 'Guest', roleGuest: 'Not Logged In', roleBuyer: 'Lead Buyer',
    searchPlaceholder: 'Search product (e.g. Milk, Tnuva)...',
    emptyList: 'List is empty. Add products to start.',
    listTotal: 'Basket Total:',
    quantity: 'Qty',
    basePrice: 'Min Price',
    total: 'Total',
    navHome: 'Home', navProfile: 'Profile Settings',
    navSavedLists: 'Saved Lists', navPriceUpdates: 'Price Updates',
    navCommunity: 'Community', navChat: 'Household Chat',
    location: 'Location',
    currentGpsLocation: 'Current GPS Location',
    nearbySupermarkets: 'Nearby Supermarkets',
    quickNavigate: 'Quick Navigate',
    viewDetails: 'View Details',
    backToHome: 'Back to Home',
    placeholderDesc: 'This page is currently in development.',
    devOptionsLocked: 'Developer Options (Locked)',
    profileDataTitle: 'Personal Information',
    avatarPickerTitle: 'Choose Avatar',
    editCredentials: 'Edit Credentials', saveAndVerify: 'Save & Verify',
    verificationSent: 'Saved successfully',
    nicknameLabel: 'Nickname', emailLabel: 'Email',
    phoneLabel: 'Phone', phonePlaceholder: '05X-XXXXXXX',
    submit: 'Submit', cancel: 'Cancel',
    switchToSignUp: "Don't have an account? Sign Up",
    switchToSignIn: 'Already have an account? Sign In',
    savedBasketsTitle: 'Saved Baskets',
    supportChannel: 'Customer Support',
    whatsappExpress: 'WhatsApp Express Support',
    emailSupport: 'Email Support Form',
    verificationNotice: 'Please verify your email',
    enterVerificationCode: 'Enter 6-digit code',
    verify: 'Verify',
    authModalTitleIn: 'Sign In to System',
    authModalTitleUp: 'Sign Up for System',
    usernameLabel: 'Username', passwordLabel: 'Password',
    priceComparison: 'Price Comparison',
    cheapestAt: 'Cheapest at',
    youSave: 'You save',
    vsExpensive: 'vs. most expensive',
    allChains: 'All chains',
    itemsAvailable: 'items available',
    searching: 'Searching...',
    noResults: 'No results found',
    addToList: 'Add to list',
    sale: 'Sale',
    telAviv: 'Tel Aviv', haifa: 'Haifa', jerusalem: 'Jerusalem',
    branchSelector: 'Select Branch',
    dataIngestionWindow: 'Data Ingestion Window',
    dataIngestionDesc: 'Price updates are automatically scheduled during off-peak hours.',
    uploadPicture: 'Upload Picture',
    basketAtBranch: 'Basket cost here',
    priceAlerts: 'Price Alerts',
    priceAlertSet: 'Alert enabled',
    priceAlertRemoved: 'Alert removed',
    targetPrice: 'Target price',
    inviteToHousehold: 'Invite to Household',
    yourInviteCode: 'Your invite code',
    copyCode: 'Copy code',
    codeCopied: 'Copied!',
    joinHousehold: 'Join Household',
    enterInviteCode: 'Enter invite code',
    joinButton: 'Join',
    joinSuccess: 'Joined successfully!',
    joinError: 'Invalid code or error',
    generateCode: 'Generate invite code',
    saveList: 'Save List',
    clearList: 'Clear List',
    saveListPrompt: 'Name for the saved list:',
    clearListConfirm: 'Clear the basket? This cannot be undone.',
    myLocation: 'My Location',
    locationDenied: 'Location access denied',
    distanceFilter: 'Distance',
    searchByCity: 'Search by city',
  },
};

export type Dictionary = typeof DICTIONARY['he'];

// ─── Sub-components ───────────────────────────────────────────────────────────

interface DrawerItemProps {
  view: View; currentView: View; setCurrentView: (v: View) => void;
  icon: React.ComponentType<{ className?: string }>; label: string; close: () => void;
}

function DrawerItem({ view, currentView, setCurrentView, icon: Icon, label, close }: DrawerItemProps) {
  return (
    <button
      onClick={() => { setCurrentView(view); close(); }}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-medium ${
        currentView === view
          ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]'
      }`}
    >
      <Icon className="w-5 h-5" />
      {label}
    </button>
  );
}

// Formats a chat message timestamp: today shows time only (e.g. 14:32),
// older messages show date + time (e.g. 03/07 14:32).
function formatMessageTimestamp(iso: string, lang: Lang): string {
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const locale = lang === 'he' ? 'he-IL' : 'en-US';
  const timeStr = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
  if (isToday) return timeStr;
  const dateStr = date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
  return `${dateStr} ${timeStr}`;
}

// Great-circle distance between two lat/lng points, in kilometers.
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const LOCATION_PREF_KEY = 'sg_location_pref';
const DISTANCE_OPTIONS = [1, 3, 5, 10] as const;

// Price comparison bar for a single chain
function ChainBar({ chain, total, maxTotal, isMin, lang }: {
  chain: ComparisonResult; total: number; maxTotal: number; isMin: boolean; lang: Lang;
}) {
  const pct = maxTotal > 0 ? (total / maxTotal) * 100 : 100;
  const name = lang === 'he' ? chain.name_he : chain.name_en;
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 text-xs text-[var(--color-text-muted)] text-end shrink-0">{name}</span>
      <div className="flex-1 h-7 bg-[var(--color-bg-subtle)] rounded-lg overflow-hidden relative">
        <div
          className="h-full rounded-lg transition-all duration-500 flex items-center px-3"
          style={{
            width: `${pct}%`,
            backgroundColor: chain.color_hex + 'cc',
          }}
        />
        <span className="absolute inset-0 flex items-center px-3">
          {/* Own semi-opaque backing (independent of the bar/track color underneath)
              guarantees the label stays readable regardless of fill width or theme. */}
          <span className="bg-black/40 text-[var(--color-accent-text)] text-xs font-mono font-medium px-1.5 py-0.5 rounded">
            ₪{total.toFixed(2)}
          </span>
        </span>
      </div>
      {isMin && (
        <span className="text-[10px] font-bold text-[var(--color-success)] bg-[var(--color-success)]/10 border border-[var(--color-success)]/20 px-2 py-0.5 rounded-full shrink-0">
          {lang === 'he' ? 'זול' : 'Best'}
        </span>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SmartGroceryDashboard() {
  const [lang, setLang] = useState<Lang>('he');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>('NONE');
  const [currentView, setCurrentView] = useState<View>('HOME');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>('light');
  const [isEditingCredentials, setIsEditingCredentials] = useState(false);
  const [verificationFlash, setVerificationFlash] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);

  // Household invite state
  const [household, setHousehold] = useState<{ id: string; name: string; invite_code: string | null } | null>(null);
  const [isLoadingHousehold, setIsLoadingHousehold] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinStatus, setJoinStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  // Product search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ProductResult[]>([]);
  const [chains, setChains] = useState<ChainMeta[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showPredictions, setShowPredictions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Basket state
  const [basket, setBasket] = useState<BasketItem[]>([]);
  const [activeBasketId, setActiveBasketId] = useState<string | null>(null);

  // Price comparison state
  const [comparison, setComparison] = useState<ComparisonResult[]>([]);
  const [maxSavings, setMaxSavings] = useState(0);
  const [isComparing, setIsComparing] = useState(false);

  // Price alerts: product_id -> price_alerts row id (present only while active)
  const [priceAlerts, setPriceAlerts] = useState<Record<string, string>>({});

  // Per-item price breakdown: which basket item is expanded in the comparison panel
  const [expandedPriceItemId, setExpandedPriceItemId] = useState<string | null>(null);

  // Saved lists + map
  const [savedBaskets, setSavedBaskets] = useState<SavedBasket[]>([]);
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);
  const [liveBranches, setLiveBranches] = useState<LiveBranch[]>([]);
  const [activeMapPin, setActiveMapPin] = useState('gps');
  const [preferredChainId, setPreferredChainId] = useState<string | null>(null);

  // GPS location + distance filter
  const [userPosition, setUserPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'requesting' | 'granted' | 'denied'>('idle');
  const [distanceKm, setDistanceKm] = useState<number>(5);
  const [cityQuery, setCityQuery] = useState('');
  const hasLoadedLocationPrefRef = useRef(false);

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { id: '1', user_id: 'dad', nickname: 'Dad', content: 'Don\'t forget the 3% milk!', created_at: new Date().toISOString() },
    { id: '2', user_id: 'mom', nickname: 'Mom', content: 'Added to the list ✓', created_at: new Date().toISOString() },
  ]);
  const [chatInput, setChatInput] = useState('');

  const t = DICTIONARY[lang];

  // ── Theme: load preference on mount, persist + apply on change ──────────────

  useEffect(() => {
    let saved: Theme = 'light';
    try {
      const raw = localStorage.getItem(THEME_STORAGE_KEY);
      if (raw === 'dark' || raw === 'light') saved = raw;
    } catch {}
    setTheme(saved);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch {}
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));

  // ── Chain metadata (needed for display names before any search happens) ──────

  useEffect(() => {
    if (!supabase) return;
    supabase.from('chains').select('id, name_he, name_en, color_hex').then(({ data }) => {
      if (data) setChains(data);
    });
  }, []);

  // ── Auth & profile load ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('profiles').select('*').eq('id', user.id).single().then(({ data: profile }) => {
        setCurrentUser({
          id: user.id,
          nickname: profile?.nickname || 'User',
          email: user.email || '',
          phone: profile?.phone_number || '',
          avatar: profile?.avatar_url || '',
        });
      });
    });
  }, []);

  // ── Basket load on login ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!currentUser?.id || currentUser.id === '00000000-0000-0000-0000-000000000000') {
      return;
    }
    if (!supabase) return;

    supabase.from('baskets')
      .select('*, basket_items(*)')
      .eq('user_id', currentUser.id)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
      .then(async ({ data: bData }) => {
        if (bData) {
          setActiveBasketId(bData.id);

          const items = (bData.basket_items ?? []) as Array<{
            id: string; product_id: string | null; product_name: string; quantity_value: number;
          }>;
          const productIds = items.map((i) => i.product_id).filter((id): id is string => !!id);

          if (productIds.length > 0) {
            const [{ data: products }, { data: prices }] = await Promise.all([
              supabase.from('products').select('id, name_he, name_en, category').in('id', productIds),
              supabase.from('latest_prices').select('product_id, chain_id, price, unit_qty, unit_type, is_sale, captured_at').in('product_id', productIds),
            ]);

            const pricesByProduct: Record<string, Record<string, ChainPrice>> = {};
            for (const p of prices ?? []) {
              if (!pricesByProduct[p.product_id]) pricesByProduct[p.product_id] = {};
              pricesByProduct[p.product_id][p.chain_id] = p as ChainPrice;
            }

            const rehydrated: BasketItem[] = items
              .filter((i) => i.product_id)
              .map((i) => {
                const product = products?.find((p) => p.id === i.product_id);
                const productPrices = pricesByProduct[i.product_id!] ?? {};
                const priceValues = Object.values(productPrices).map((p) => p.price);
                return {
                  id: i.product_id!,
                  dbId: i.id,
                  name_he: product?.name_he ?? i.product_name,
                  name_en: product?.name_en ?? null,
                  category: product?.category ?? null,
                  prices: productPrices,
                  min_price: priceValues.length > 0 ? Math.min(...priceValues) : null,
                  quantity: i.quantity_value ?? 1,
                };
              });
            setBasket(rehydrated);
          }
        } else {
          const { data: newB } = await supabase.from('baskets').insert({
            user_id: currentUser.id,
            name: lang === 'he' ? 'רשימת קניות' : 'My Grocery List',
          }).select().single();
          if (newB) setActiveBasketId(newB.id);
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  // ── Price alerts load ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!currentUser?.id || !supabase) { setPriceAlerts({}); return; }
    supabase.from('price_alerts')
      .select('id, product_id')
      .eq('user_id', currentUser.id)
      .eq('is_active', true)
      .then(({ data }) => {
        const map: Record<string, string> = {};
        for (const row of data ?? []) map[row.product_id] = row.id;
        setPriceAlerts(map);
      });
  }, [currentUser]);

  const togglePriceAlert = async (item: BasketItem) => {
    if (!currentUser?.id || !supabase) return;
    const existingId = priceAlerts[item.id];

    if (existingId) {
      await supabase.from('price_alerts').delete().eq('id', existingId);
      setPriceAlerts((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      return;
    }

    const cheapestEntry = Object.values(item.prices).sort((a, b) => a.price - b.price)[0];
    const { data } = await supabase.from('price_alerts').insert({
      product_id: item.id,
      user_id: currentUser.id,
      target_price: item.min_price ?? cheapestEntry?.price ?? 0,
      chain_id: cheapestEntry?.chain_id ?? null,
    }).select().single();
    if (data) setPriceAlerts((prev) => ({ ...prev, [item.id]: data.id }));
  };

  // ── Product search (debounced) ───────────────────────────────────────────────

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 1) { setSearchResults([]); return; }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}&limit=8`);
      const data = await res.json();
      setSearchResults(data.products ?? []);
      if (data.chains?.length > 0) setChains(data.chains);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!searchQuery) { setSearchResults([]); setShowPredictions(false); return; }
    setShowPredictions(true);
    searchTimerRef.current = setTimeout(() => doSearch(searchQuery), 250);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery, doSearch]);

  // Close predictions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowPredictions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Price comparison (triggered whenever basket changes) ─────────────────────

  useEffect(() => {
    if (basket.length === 0) { setComparison([]); setMaxSavings(0); return; }
    const items = basket.map((i) => ({ product_id: i.id, quantity: i.quantity }));
    setIsComparing(true);
    fetch('/api/prices/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    })
      .then((r) => r.json())
      .then((data) => {
        setComparison(data.comparison ?? []);
        setMaxSavings(data.max_savings ?? 0);
      })
      .catch(() => {})
      .finally(() => setIsComparing(false));
  }, [basket]);

  // ── Basket CRUD ──────────────────────────────────────────────────────────────

  const handleAddProduct = async (product: ProductResult) => {
    setSearchQuery('');
    setShowPredictions(false);

    const existing = basket.find((i) => i.id === product.id);
    if (existing) {
      // Just increment locally
      const newQ = existing.quantity + 1;
      setBasket((prev) => prev.map((i) => i.id === product.id ? { ...i, quantity: newQ } : i));
      if (supabase && existing.dbId) {
        await supabase.from('basket_items').update({ quantity_value: newQ }).eq('id', existing.dbId);
      }
      return;
    }

    // New item
    let dbId: string | undefined;
    if (supabase && activeBasketId) {
      const { data } = await supabase.from('basket_items').insert({
        basket_id: activeBasketId,
        product_id: product.id,
        product_name: product.name_he,
        quantity_value: 1,
      }).select().single();
      dbId = data?.id;
    }

    setBasket((prev) => [
      ...prev,
      {
        id: product.id,
        dbId,
        name_he: product.name_he,
        name_en: product.name_en,
        category: product.category,
        prices: product.prices,
        min_price: product.min_price,
        quantity: 1,
      },
    ]);
  };

  const updateQuantity = async (id: string, delta: number) => {
    const item = basket.find((i) => i.id === id);
    if (!item) return;
    const newQ = Math.max(1, item.quantity + delta);
    if (newQ === item.quantity) return;
    setBasket((prev) => prev.map((i) => i.id === id ? { ...i, quantity: newQ } : i));
    if (supabase && item.dbId) {
      await supabase.from('basket_items').update({ quantity_value: newQ }).eq('id', item.dbId);
    }
  };

  const removeProduct = async (id: string) => {
    const item = basket.find((i) => i.id === id);
    setBasket((prev) => prev.filter((i) => i.id !== id));
    if (supabase && item?.dbId) {
      await supabase.from('basket_items').delete().eq('id', item.dbId);
    }
  };

  const handleSaveList = async () => {
    if (!supabase || !currentUser?.id || basket.length === 0) return;
    const defaultName = new Date().toLocaleDateString('he-IL');
    const name = window.prompt(t.saveListPrompt, defaultName);
    if (!name || !name.trim()) return;

    const { data: newBasket } = await supabase.from('baskets').insert({
      user_id: currentUser.id,
      name: name.trim(),
    }).select().single();

    if (newBasket) {
      await supabase.from('basket_items').insert(
        basket.map((item) => ({
          basket_id: newBasket.id,
          product_id: item.id,
          product_name: item.name_he,
          quantity_value: item.quantity,
        }))
      );
    }

    if (activeBasketId) {
      await supabase.from('basket_items').delete().eq('basket_id', activeBasketId);
    }
    setBasket([]);
  };

  const handleClearList = async () => {
    if (basket.length === 0) return;
    if (!window.confirm(t.clearListConfirm)) return;
    if (supabase && activeBasketId) {
      await supabase.from('basket_items').delete().eq('basket_id', activeBasketId);
    }
    setBasket([]);
  };

  const basketTotal = (chainId?: string) => {
    if (!chainId) {
      // Use min price across all chains
      return basket.reduce((acc, item) => acc + ((item.min_price ?? 0) * item.quantity), 0);
    }
    return basket.reduce((acc, item) => {
      const p = item.prices[chainId]?.price ?? item.min_price ?? 0;
      return acc + (p * item.quantity);
    }, 0);
  };

  // ── Map branches load ────────────────────────────────────────────────────────

  useEffect(() => {
    if (currentView !== 'LOCATION' || !supabase) return;
    supabase.from('branches').select('*').eq('is_active', true).then(({ data }) => {
      if (data) {
        setLiveBranches((data as BranchRow[]).map((b) => ({
          id: b.id,
          name: lang === 'he' ? b.name_he : (b.name_en || b.name_he),
          desc: lang === 'he' ? b.city_he : (b.city_en || b.city_he),
          cityHe: b.city_he,
          cityEn: b.city_en,
          dist: b.lat && b.lng ? '~' : '?',
          mapsLink: b.lat && b.lng
            ? `https://waze.com/ul?ll=${b.lat},${b.lng}&navigate=yes`
            : 'https://waze.com/ul',
          chain_id: b.chain_id,
          lat: b.lat,
          lng: b.lng,
          color_hex: chains.find((c) => c.id === b.chain_id)?.color_hex ?? '#6366f1',
        })));
      }
    });
  }, [currentView, lang, chains]);

  // ── GPS geolocation request ──────────────────────────────────────────────────

  useEffect(() => {
    if (currentView !== 'LOCATION') return;

    if (!hasLoadedLocationPrefRef.current) {
      hasLoadedLocationPrefRef.current = true;
      try {
        const raw = localStorage.getItem(LOCATION_PREF_KEY);
        if (raw) {
          const pref = JSON.parse(raw) as { status: string; city?: string };
          if (pref.city) setCityQuery(pref.city);
        }
      } catch {}
    }

    if (!navigator.geolocation) {
      setLocationStatus('denied');
      return;
    }

    setLocationStatus('requesting');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationStatus('granted');
        try { localStorage.setItem(LOCATION_PREF_KEY, JSON.stringify({ status: 'granted' })); } catch {}
      },
      () => {
        setUserPosition(null);
        setLocationStatus('denied');
        try { localStorage.setItem(LOCATION_PREF_KEY, JSON.stringify({ status: 'denied' })); } catch {}
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  }, [currentView]);

  // Persist the manually-chosen city once the user types one after being denied
  useEffect(() => {
    if (locationStatus !== 'denied') return;
    const trimmed = cityQuery.trim();
    try {
      localStorage.setItem(LOCATION_PREF_KEY, JSON.stringify({
        status: trimmed ? 'manual' : 'denied',
        city: trimmed || undefined,
      }));
    } catch {}
  }, [cityQuery, locationStatus]);

  // Branches within the selected radius of the user's GPS position, or matching
  // the manually-entered city when location access was denied.
  const filteredBranches = React.useMemo(() => {
    if (userPosition) {
      return liveBranches
        .filter((b): b is LiveBranch & { lat: number; lng: number } => !!(b.lat && b.lng))
        .map((b) => {
          const distKm = haversineKm(userPosition.lat, userPosition.lng, b.lat, b.lng);
          return { ...b, dist: `${distKm.toFixed(1)} ${lang === 'he' ? 'ק"מ' : 'km'}`, _distKm: distKm };
        })
        .filter((b) => b._distKm <= distanceKm)
        .sort((a, b) => a._distKm - b._distKm);
    }
    if (locationStatus === 'denied' && cityQuery.trim()) {
      const q = cityQuery.trim().toLowerCase();
      return liveBranches.filter((b) =>
        (b.cityHe ?? '').includes(cityQuery.trim()) || (b.cityEn ?? '').toLowerCase().includes(q)
      );
    }
    return liveBranches;
  }, [liveBranches, userPosition, distanceKm, locationStatus, cityQuery, lang]);

  // Pre-select the cheapest chain's first branch when arriving via "Navigate to cheapest"
  useEffect(() => {
    if (!preferredChainId || filteredBranches.length === 0) return;
    const match = filteredBranches.find((b) => b.chain_id === preferredChainId);
    if (match) setActiveMapPin(match.id);
  }, [preferredChainId, filteredBranches]);

  // ── Saved lists load ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (currentView !== 'SAVED_LISTS' || !currentUser || !supabase) return;
    setIsLoadingSaved(true);
    supabase.from('baskets')
      .select('*, basket_items(*)')
      .eq('user_id', currentUser.id)
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        setSavedBaskets(data ?? []);
        setIsLoadingSaved(false);
      });
  }, [currentView, currentUser]);

  // ── Profile save ─────────────────────────────────────────────────────────────

  const handleSaveCredentials = async () => {
    if (supabase && currentUser?.id) {
      await supabase.from('profiles').upsert({
        id: currentUser.id,
        nickname: currentUser.nickname,
        phone_number: currentUser.phone,
        avatar_url: currentUser.avatar,
      });
    }
    setVerificationFlash(true);
    setTimeout(() => { setVerificationFlash(false); setIsEditingCredentials(false); }, 1500);
  };

  // ── Household invite ─────────────────────────────────────────────────────────

  const handleGenerateInviteCode = async () => {
    if (!supabase || !currentUser?.id) return;
    setIsLoadingHousehold(true);
    const { data } = await supabase.rpc('get_or_create_own_household').single();
    if (data) setHousehold(data as { id: string; name: string; invite_code: string | null });
    setIsLoadingHousehold(false);
  };

  const handleCopyInviteCode = () => {
    if (!household?.invite_code) return;
    navigator.clipboard.writeText(household.invite_code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const handleJoinHousehold = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !joinCodeInput.trim()) return;
    setJoinStatus('loading');
    const { error } = await supabase.rpc('join_household_by_code', { code: joinCodeInput.trim() }).single();
    if (error) {
      setJoinStatus('error');
    } else {
      setJoinStatus('success');
      setJoinCodeInput('');
    }
    setTimeout(() => setJoinStatus('idle'), 3000);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    setChatMessages((prev) => [...prev, {
      id: Date.now().toString(),
      user_id: currentUser?.id || 'guest',
      nickname: currentUser?.nickname || t.guest,
      content: chatInput.trim(),
      created_at: new Date().toISOString(),
    }]);
    setChatInput('');
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div
      className="w-full min-h-screen flex flex-col font-sans p-4 md:p-6 lg:p-8 overflow-x-hidden relative transition-colors duration-300 bg-[var(--color-bg-base)] text-[var(--color-text-primary)]"
      dir={lang === 'he' ? 'rtl' : 'ltr'}
    >
      {/* ── Header ── */}
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-[var(--color-accent)] rounded-xl flex items-center justify-center text-[var(--color-accent-text)] font-bold shadow-lg shadow-[var(--color-accent)]/20 shrink-0">
            <ShoppingCart className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[var(--color-text-primary)]">{t.appTitle}</h1>
            <p className="text-xs text-[var(--color-text-muted)] font-medium">{t.envLabel}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={() => setLang((l) => l === 'he' ? 'en' : 'he')}
            className="flex items-center gap-2 bg-[var(--color-bg-subtle)] hover:bg-[var(--color-bg-hover)] transition-colors px-3 rounded-full border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-primary)] min-h-[44px]"
          >
            <Globe className="w-4 h-4 text-[var(--color-accent)]" />
            {lang === 'he' ? 'EN' : 'עברית'}
          </button>

          <button
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? (lang === 'he' ? 'עבור למצב בהיר' : 'Switch to light mode') : (lang === 'he' ? 'עבור למצב כהה' : 'Switch to dark mode')}
            className="flex items-center justify-center w-11 h-11 bg-[var(--color-bg-subtle)] hover:bg-[var(--color-bg-hover)] transition-colors rounded-full border border-[var(--color-border)] text-[var(--color-accent)]"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          <div className="flex items-center gap-3 border-s border-[var(--color-border)] ps-4">
            <div className="text-start hidden sm:block">
              <p className="text-sm font-bold text-[var(--color-text-primary)]">{currentUser ? currentUser.nickname : t.guest}</p>
              <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">{currentUser ? t.roleBuyer : t.roleGuest}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-[var(--color-bg-subtle)] border-2 border-[var(--color-border)] overflow-hidden flex items-center justify-center">
              {currentUser?.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={currentUser.avatar} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <User className="w-5 h-5 text-[var(--color-text-muted)]" />
              )}
            </div>
          </div>

          <button
            onClick={() => setIsDrawerOpen(true)}
            className="w-11 h-11 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-xl flex items-center justify-center text-[var(--color-accent-text)] shadow-lg shadow-[var(--color-accent)]/20 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* ── Views ── */}
      <AnimatePresence mode="wait">

        {/* ═══ HOME ═══ */}
        {currentView === 'HOME' && (
          <motion.div key="HOME" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="flex-1 flex flex-col gap-6">

            {/* Search bar + location button */}
            <div className="flex flex-col md:flex-row gap-4">
              <div className="md:w-3/4 relative z-20" ref={searchRef}>
                <div className="relative">
                  <div className="absolute inset-y-0 start-0 flex items-center ps-4 pointer-events-none">
                    {isSearching
                      ? <Loader2 className="w-5 h-5 text-[var(--color-accent)] animate-spin" />
                      : <Search className="w-5 h-5 text-[var(--color-text-muted)]" />
                    }
                  </div>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => searchQuery && setShowPredictions(true)}
                    placeholder={t.searchPlaceholder}
                    className="w-full bg-[var(--color-bg-panel)]/80 border border-[var(--color-border)]/50 text-[var(--color-text-primary)] rounded-2xl h-14 ps-12 pe-4 focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent outline-none transition-all"
                    dir="auto"
                  />
                </div>

                {/* Autocomplete predictions */}
                <AnimatePresence>
                  {showPredictions && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }}
                      className="absolute top-full start-0 end-0 mt-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-2xl shadow-2xl overflow-hidden z-30"
                    >
                      {isSearching && (
                        <div className="animate-pulse">
                          {[0, 1, 2].map((i) => (
                            <div key={i} className="flex items-center justify-between p-4 border-b border-[var(--color-border)]/50 last:border-0">
                              <div className="space-y-2">
                                <div className="h-3.5 w-32 bg-[var(--color-bg-hover)]/60 rounded-full" />
                                <div className="h-2.5 w-20 bg-[var(--color-bg-hover)]/40 rounded-full" />
                              </div>
                              <div className="h-3.5 w-14 bg-[var(--color-bg-hover)]/60 rounded-full" />
                            </div>
                          ))}
                        </div>
                      )}
                      {!isSearching && searchResults.length === 0 && searchQuery && (
                        <div className="p-4 text-[var(--color-text-muted)] text-sm">{t.noResults}</div>
                      )}
                      {!isSearching && searchResults.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => handleAddProduct(p)}
                          className="w-full flex items-center justify-between p-4 hover:bg-[var(--color-bg-hover)]/50 transition-colors border-b border-[var(--color-border)]/50 last:border-0 text-start"
                        >
                          <div>
                            <span className="font-medium text-[var(--color-text-primary)] block">{p.name_he}</span>
                            {p.name_en && <span className="text-xs text-[var(--color-text-muted)]">{p.name_en}</span>}
                          </div>
                          <div className="text-end shrink-0 ms-4">
                            {p.min_price !== null && (
                              <span className="font-mono text-[var(--color-success)] text-sm">
                                {lang === 'he' ? 'מ-' : 'from '}₪{p.min_price.toFixed(2)}
                              </span>
                            )}
                            {p.best_chain && chains.length > 0 && (
                              <span className="block text-[10px] text-[var(--color-text-muted)]">
                                {chains.find((c) => c.id === p.best_chain)?.[lang === 'he' ? 'name_he' : 'name_en']}
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <button
                onClick={() => setCurrentView('LOCATION')}
                className="md:w-1/4 bg-[var(--color-bg-panel)]/80 border border-[var(--color-border)]/50 text-[var(--color-text-primary)] rounded-2xl h-14 px-5 flex items-center justify-between hover:bg-[var(--color-bg-hover)] hover:border-[var(--color-accent)]/50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-[var(--color-accent)] group-hover:scale-110 transition-transform" />
                  <span className="font-semibold">{t.location}</span>
                </div>
                <ChevronDown className="w-5 h-5 text-[var(--color-text-muted)] -rotate-90 rtl:rotate-90" />
              </button>
            </div>

            {/* Basket + Price Comparison side by side on wide screens */}
            <div className="flex-1 flex flex-col lg:flex-row gap-6">

              {/* Basket list */}
              <div className="flex-1 bg-[var(--color-bg-panel)]/40 backdrop-blur-sm border border-[var(--color-border)]/80 rounded-3xl p-6 overflow-y-auto min-h-[300px]">
                {basket.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-[var(--color-text-muted)] min-h-[200px]">
                    <ShoppingCart className="w-12 h-12 mb-4 opacity-40" />
                    <p className="text-sm">{t.emptyList}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {basket.map((item) => (
                      <div key={item.id} className="flex flex-col sm:flex-row items-center justify-between bg-[var(--color-bg-subtle)]/50 p-4 rounded-2xl border border-[var(--color-border)]/50 gap-4 group hover:bg-[var(--color-bg-hover)] transition-colors">
                        <div className="flex-1 text-start w-full">
                          <h3 className="font-semibold text-[var(--color-text-primary)]">{item.name_he}</h3>
                          {item.name_en && <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{item.name_en}</p>}
                          {item.min_price !== null && (
                            <p className="text-sm text-[var(--color-text-muted)] mt-1">
                              {t.basePrice}: <span className="font-mono text-[var(--color-success)]">₪{item.min_price.toFixed(2)}</span>
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                          <div className="flex items-center bg-[var(--color-bg-panel)] rounded-xl border border-[var(--color-border)] p-1">
                            <button onClick={() => updateQuantity(item.id, -1)} className="w-11 h-11 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] rounded-lg transition-colors text-lg">−</button>
                            <span className="w-10 text-center font-mono font-medium text-[var(--color-text-primary)]">{item.quantity}</span>
                            <button onClick={() => updateQuantity(item.id, 1)} className="w-11 h-11 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] rounded-lg transition-colors text-lg">+</button>
                          </div>
                          <div className="w-24 text-end">
                            <span className="font-mono font-bold text-[var(--color-success)] text-lg">
                              ₪{((item.min_price ?? 0) * item.quantity).toFixed(2)}
                            </span>
                          </div>
                          <button
                            onClick={() => togglePriceAlert(item)}
                            title={t.priceAlerts}
                            className={`w-11 h-11 flex items-center justify-center rounded-xl transition-colors ${
                              priceAlerts[item.id]
                                ? 'text-[var(--color-warning)] bg-[var(--color-warning)]/10 hover:bg-[var(--color-warning)]/20'
                                : 'text-[var(--color-text-muted)] hover:text-[var(--color-warning)] hover:bg-[var(--color-warning)]/10'
                            }`}
                          >
                            <Bell className="w-5 h-5" fill={priceAlerts[item.id] ? 'currentColor' : 'none'} />
                          </button>
                          <button onClick={() => removeProduct(item.id)} className="w-11 h-11 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 rounded-xl transition-colors">
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* Total */}
                    <div className="mt-6 pt-5 border-t border-[var(--color-border)] flex justify-between items-end">
                      <span className="text-[var(--color-text-muted)]">{t.listTotal}</span>
                      <span className="text-3xl font-bold font-mono text-[var(--color-text-primary)]">₪{basketTotal().toFixed(2)}</span>
                    </div>

                    {/* Save List / Clear List */}
                    <div className="flex gap-3">
                      <button
                        onClick={handleSaveList}
                        className="flex-1 min-h-[44px] bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-[var(--color-accent-text)] rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-[var(--color-accent)]/20"
                      >
                        {t.saveList}
                      </button>
                      <button
                        onClick={handleClearList}
                        className="flex-1 min-h-[44px] bg-[var(--color-bg-subtle)] hover:bg-[var(--color-danger)]/10 text-[var(--color-text-secondary)] hover:text-[var(--color-danger)] border border-[var(--color-border)] hover:border-[var(--color-danger)]/30 rounded-xl text-sm font-semibold transition-colors"
                      >
                        {t.clearList}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Price comparison panel */}
              {basket.length > 0 && (
                <div className="lg:w-80 bg-[var(--color-bg-panel)]/40 backdrop-blur-sm border border-[var(--color-border)]/80 rounded-3xl p-6 flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-bold text-[var(--color-text-primary)] text-sm">{t.priceComparison}</h2>
                    {isComparing && <Loader2 className="w-4 h-4 text-[var(--color-accent)] animate-spin" />}
                  </div>

                  {comparison.length === 0 && !isComparing && (
                    <p className="text-[var(--color-text-muted)] text-xs">{t.searching}</p>
                  )}

                  {comparison.length > 0 && (
                    <>
                      {/* Savings callout */}
                      {maxSavings > 0 && (
                        <div className="bg-[var(--color-success)]/10 border border-[var(--color-success)]/20 rounded-2xl p-3 flex items-start gap-2">
                          <ArrowDown className="w-4 h-4 text-[var(--color-success)] mt-0.5 shrink-0" />
                          <div>
                            <p className="text-[var(--color-success)] font-bold text-sm">
                              {t.youSave} ₪{maxSavings.toFixed(2)}
                            </p>
                            <p className="text-[var(--color-success)]/70 text-xs">{t.vsExpensive}</p>
                          </div>
                        </div>
                      )}

                      {/* Chain bars */}
                      <div className="flex flex-col gap-3">
                        {(() => {
                          const maxT = Math.max(...comparison.map((c) => c.total));
                          const minTotal = Math.min(...comparison.map((c) => c.total));
                          return comparison
                            .slice()
                            .sort((a, b) => a.total - b.total)
                            .map((chain) => (
                              <ChainBar
                                key={chain.chain_id}
                                chain={chain}
                                total={chain.total}
                                maxTotal={maxT}
                                isMin={chain.total === minTotal}
                                lang={lang}
                              />
                            ));
                        })()}
                      </div>

                      {/* Per-item cheapest chain (tap to expand full breakdown) */}
                      <div className="mt-2 pt-4 border-t border-[var(--color-border)] flex flex-col gap-2">
                        <p className="text-xs text-[var(--color-text-muted)] font-medium">{lang === 'he' ? 'מחיר לפריט' : 'Price per item'}</p>
                        {basket.map((item) => {
                          const priceEntries = Object.entries(item.prices);
                          const cheapestEntry = priceEntries.reduce<[string, ChainPrice] | null>(
                            (best, [cid, cp]) => (!best || cp.price < best[1].price) ? [cid, cp] : best,
                            null
                          );
                          const chainName = cheapestEntry
                            ? (chains.find((c) => c.id === cheapestEntry[0])?.[lang === 'he' ? 'name_he' : 'name_en'] ?? cheapestEntry[0])
                            : '—';
                          const isExpanded = expandedPriceItemId === item.id;
                          const minPrice = priceEntries.length > 0 ? Math.min(...priceEntries.map(([, cp]) => cp.price)) : null;
                          const maxPrice = priceEntries.length > 0 ? Math.max(...priceEntries.map(([, cp]) => cp.price)) : null;
                          return (
                            <div key={item.id}>
                              <button
                                onClick={() => setExpandedPriceItemId(isExpanded ? null : item.id)}
                                className="w-full flex items-center justify-between text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors py-1"
                              >
                                <span className="truncate me-2" style={{ maxWidth: '55%' }}>{item.name_he}</span>
                                <span className="flex items-center gap-1 shrink-0">
                                  <span className="text-[var(--color-success)] font-mono">
                                    ₪{(cheapestEntry?.[1].price ?? 0).toFixed(2)}
                                    <span className="text-[var(--color-text-muted)] ms-1">{chainName}</span>
                                  </span>
                                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                </span>
                              </button>
                              <AnimatePresence>
                                {isExpanded && (
                                  <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.15 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="flex flex-col gap-1.5 py-2 ps-2 border-s-2 border-[var(--color-border)] mt-1 mb-1">
                                      {priceEntries
                                        .slice()
                                        .sort((a, b) => a[1].price - b[1].price)
                                        .map(([cid, cp]) => {
                                          const cName = chains.find((c) => c.id === cid)?.[lang === 'he' ? 'name_he' : 'name_en'] ?? cid;
                                          const isCheapest = cp.price === minPrice;
                                          const isExpensive = cp.price === maxPrice && minPrice !== maxPrice;
                                          return (
                                            <div
                                              key={cid}
                                              className={`flex items-center justify-between text-xs px-2 py-1.5 rounded-lg ${
                                                isCheapest ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]' :
                                                isExpensive ? 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]' :
                                                'text-[var(--color-text-muted)]'
                                              }`}
                                            >
                                              <span>{cName}</span>
                                              <span className="font-mono font-medium">₪{cp.price.toFixed(2)}</span>
                                            </div>
                                          );
                                        })}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {/* Navigate to cheapest button */}
                  {comparison.length > 0 && (
                    <button
                      onClick={() => {
                        const cheapest = comparison.slice().sort((a, b) => a.total - b.total)[0];
                        setPreferredChainId(cheapest?.chain_id ?? null);
                        setCurrentView('LOCATION');
                      }}
                      className="mt-auto w-full bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-[var(--color-accent-text)] rounded-2xl py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-[var(--color-accent)]/20"
                    >
                      <Navigation className="w-4 h-4" />
                      {lang === 'he' ? 'נווט לסניף הזול ביותר' : 'Navigate to cheapest branch'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ═══ LOCATION ═══ */}
        {currentView === 'LOCATION' && (
          <motion.div key="LOCATION" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="flex-1">

            {/* Location filter bar */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              {userPosition ? (
                <div className="flex items-center gap-3 bg-[var(--color-bg-panel)]/60 border border-[var(--color-border)] rounded-2xl px-4 py-3">
                  <span className="text-xs font-semibold text-[var(--color-text-secondary)] whitespace-nowrap">{t.distanceFilter}</span>
                  <input
                    type="range"
                    min={0}
                    max={DISTANCE_OPTIONS.length - 1}
                    step={1}
                    value={DISTANCE_OPTIONS.indexOf(distanceKm as typeof DISTANCE_OPTIONS[number])}
                    onChange={(e) => setDistanceKm(DISTANCE_OPTIONS[Number(e.target.value)])}
                    className="w-40 accent-[var(--color-accent)]"
                  />
                  <span className="font-mono text-sm text-[var(--color-accent)] shrink-0 w-14 text-end">
                    {distanceKm} {lang === 'he' ? 'ק"מ' : 'km'}
                  </span>
                </div>
              ) : locationStatus === 'denied' ? (
                <div className="flex items-center gap-2 bg-[var(--color-bg-panel)]/60 border border-[var(--color-border)] rounded-2xl px-4 h-12 flex-1 sm:flex-none sm:w-72">
                  <Search className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" />
                  <input
                    type="text"
                    value={cityQuery}
                    onChange={(e) => setCityQuery(e.target.value)}
                    placeholder={t.searchByCity}
                    className="bg-transparent outline-none text-sm text-[var(--color-text-primary)] w-full"
                    dir="auto"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] h-12">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t.currentGpsLocation}...
                </div>
              )}
            </div>

            <BranchMapContainer
              city={t.telAviv}
              lang={lang}
              theme={theme}
              liveBranches={filteredBranches}
              activeMapPin={activeMapPin}
              setActiveMapPin={setActiveMapPin}
              preferredChainId={preferredChainId}
              comparison={comparison}
              userPosition={userPosition}
              youAreHereLabel={t.myLocation}
              t={t}
            />
          </motion.div>
        )}

        {/* ═══ SAVED LISTS ═══ */}
        {currentView === 'SAVED_LISTS' && (
          <motion.div key="SAVED_LISTS" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="flex-1 max-w-4xl mx-auto w-full flex flex-col gap-6 text-start mt-6">
            <h2 className="text-3xl font-bold text-[var(--color-text-primary)]">{t.savedBasketsTitle}</h2>
            {isLoadingSaved ? (
              <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 text-[var(--color-accent)] animate-spin" /></div>
            ) : savedBaskets.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {savedBaskets.map((sb) => (
                  <div key={sb.id} className="bg-[var(--color-bg-panel)]/60 backdrop-blur-xl border border-[var(--color-border)] rounded-3xl p-6 shadow-xl hover:bg-[var(--color-bg-panel)] transition-colors cursor-pointer group">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 bg-[var(--color-bg-subtle)] rounded-2xl flex items-center justify-center text-[var(--color-accent)]"><List className="w-6 h-6" /></div>
                      <div>
                        <h3 className="font-bold text-[var(--color-text-primary)]">{sb.name}</h3>
                        <p className="text-xs text-[var(--color-text-muted)]">{new Date(sb.updated_at).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}</p>
                      </div>
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)]">{sb.basket_items?.length ?? 0} {lang === 'he' ? 'פריטים' : 'items'}</p>
                    <button onClick={() => { setActiveBasketId(sb.id); setCurrentView('HOME'); }}
                      className="w-full mt-4 bg-[var(--color-accent)]/10 hover:bg-[var(--color-accent)]/20 text-[var(--color-accent)] py-2 rounded-xl text-sm font-semibold transition-colors border border-[var(--color-accent)]/20">
                      {t.viewDetails}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-[var(--color-bg-panel)]/60 rounded-3xl p-8 border border-[var(--color-border)] text-center">
                <p className="text-[var(--color-text-muted)]">{t.emptyList}</p>
              </div>
            )}
          </motion.div>
        )}

        {/* ═══ PROFILE ═══ */}
        {currentView === 'PROFILE' && (
          <motion.div key="PROFILE" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="flex-1 max-w-4xl mx-auto w-full flex flex-col gap-8 text-start mt-6">
            <h2 className="text-3xl font-bold text-[var(--color-text-primary)]">{t.navProfile}</h2>

            {/* Profile form (only when logged in) */}
            {currentUser && (
              <div className="bg-[var(--color-bg-panel)]/60 backdrop-blur-xl rounded-3xl p-8 border border-[var(--color-border)]">
                <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-6">{t.profileDataTitle}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {([
                    { label: t.nicknameLabel, key: 'nickname', type: 'text' },
                    { label: t.emailLabel,    key: 'email',    type: 'email' },
                    { label: t.phoneLabel,    key: 'phone',    type: 'tel' },
                  ] as const).map(({ label, key, type }) => (
                    <div key={key}>
                      <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-2">{label}</label>
                      <input type={type} value={currentUser[key]}
                        onChange={(e) => setCurrentUser({ ...currentUser, [key]: e.target.value })}
                        disabled={!isEditingCredentials}
                        className={`w-full bg-[var(--color-bg-subtle)]/50 border rounded-xl px-4 py-3 text-[var(--color-text-primary)] focus:outline-none transition-colors ${isEditingCredentials ? 'border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]' : 'border-[var(--color-border)] opacity-75 cursor-not-allowed'}`}
                        dir="ltr"
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex justify-end items-center gap-4">
                  <AnimatePresence>
                    {verificationFlash && (
                      <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="text-sm font-bold text-[var(--color-success)] flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" /> {t.verificationSent}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {isEditingCredentials ? (
                    <button onClick={handleSaveCredentials} className="px-6 py-2.5 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-[var(--color-accent-text)] rounded-xl font-semibold shadow-lg shadow-[var(--color-accent)]/20 transition-colors">
                      {t.saveAndVerify}
                    </button>
                  ) : (
                    <button onClick={() => setIsEditingCredentials(true)} className="px-6 py-2.5 bg-[var(--color-bg-subtle)] hover:bg-[var(--color-bg-hover)] text-[var(--color-text-primary)] border border-[var(--color-border)] rounded-xl font-semibold transition-colors">
                      {t.editCredentials}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Household invite */}
            {currentUser && (
              <div className="bg-[var(--color-bg-panel)]/60 backdrop-blur-xl rounded-3xl p-8 border border-[var(--color-border)]">
                <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-6 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-[var(--color-accent)]" /> {t.inviteToHousehold}
                </h3>

                {household?.invite_code ? (
                  <div>
                    <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-2">{t.yourInviteCode}</label>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-2xl tracking-[0.3em] font-bold text-[var(--color-accent-hover)] bg-[var(--color-bg-subtle)]/50 border border-[var(--color-border)] rounded-xl px-5 py-3">
                        {household.invite_code}
                      </span>
                      <button
                        onClick={handleCopyInviteCode}
                        className="min-h-[44px] px-4 flex items-center gap-2 bg-[var(--color-bg-subtle)] hover:bg-[var(--color-bg-hover)] text-[var(--color-text-primary)] border border-[var(--color-border)] rounded-xl font-semibold transition-colors"
                      >
                        {codeCopied ? <CheckCircle className="w-4 h-4 text-[var(--color-success)]" /> : <Copy className="w-4 h-4" />}
                        {codeCopied ? t.codeCopied : t.copyCode}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleGenerateInviteCode}
                    disabled={isLoadingHousehold}
                    className="min-h-[44px] px-6 py-2.5 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-[var(--color-accent-text)] rounded-xl font-semibold shadow-lg shadow-[var(--color-accent)]/20 transition-colors disabled:opacity-50"
                  >
                    {isLoadingHousehold ? <Loader2 className="w-4 h-4 animate-spin" /> : t.generateCode}
                  </button>
                )}

                <div className="mt-8 pt-6 border-t border-[var(--color-border)]">
                  <h4 className="text-sm font-medium text-[var(--color-text-muted)] mb-3">{t.joinHousehold}</h4>
                  <form onSubmit={handleJoinHousehold} className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      value={joinCodeInput}
                      onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                      placeholder={t.enterInviteCode}
                      maxLength={6}
                      className="flex-1 bg-[var(--color-bg-subtle)]/50 border border-[var(--color-border)] rounded-xl px-4 py-3 text-[var(--color-text-primary)] font-mono tracking-widest focus:outline-none focus:border-[var(--color-accent)] transition-colors min-h-[44px]"
                      dir="ltr"
                    />
                    <button
                      type="submit"
                      disabled={joinStatus === 'loading' || !joinCodeInput.trim()}
                      className="min-h-[44px] px-6 bg-[var(--color-bg-subtle)] hover:bg-[var(--color-bg-hover)] text-[var(--color-text-primary)] border border-[var(--color-border)] rounded-xl font-semibold transition-colors disabled:opacity-50"
                    >
                      {t.joinButton}
                    </button>
                  </form>
                  {joinStatus === 'success' && (
                    <p className="mt-3 text-sm font-bold text-[var(--color-success)] flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" /> {t.joinSuccess}
                    </p>
                  )}
                  {joinStatus === 'error' && (
                    <p className="mt-3 text-sm font-bold text-[var(--color-danger)] flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" /> {t.joinError}
                    </p>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ═══ CHAT ═══ */}
        {currentView === 'CHAT' && (
          <motion.div key="CHAT" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="flex-1 max-w-4xl mx-auto w-full flex flex-col gap-6 text-start mt-6">
            <h2 className="text-3xl font-bold text-[var(--color-text-primary)]">{t.navChat}</h2>
            <div className="bg-[var(--color-bg-panel)]/60 backdrop-blur-xl border border-[var(--color-border)] rounded-3xl p-6 shadow-xl flex flex-col" style={{ height: '60vh' }}>
              <div className="flex-1 overflow-y-auto space-y-3 mb-4 pe-2">
                {chatMessages.map((msg) => (
                  <div key={msg.id} className={`flex flex-col ${msg.user_id === currentUser?.id ? 'items-end' : 'items-start'}`}>
                    <div className={`px-4 py-2 rounded-2xl max-w-[80%] text-sm ${msg.user_id === currentUser?.id ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)]' : 'bg-[var(--color-bg-subtle)] text-[var(--color-text-primary)]'}`}>
                      {msg.content}
                    </div>
                    <span className="text-[10px] text-[var(--color-text-muted)] mt-1">
                      {msg.nickname} · {formatMessageTimestamp(msg.created_at, lang)}
                    </span>
                  </div>
                ))}
              </div>
              <form onSubmit={handleSendMessage} className="flex gap-3">
                <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                  placeholder={lang === 'he' ? 'הקלד הודעה...' : 'Type a message...'}
                  className="flex-1 bg-[var(--color-bg-subtle)]/50 border border-[var(--color-border)] rounded-xl px-4 py-3 text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] transition-colors min-h-[44px]"
                  dir="auto"
                />
                <button type="submit" disabled={!chatInput.trim()} className="bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-[var(--color-accent-text)] p-3 rounded-xl transition-colors disabled:opacity-50 min-h-[44px] min-w-[44px] flex items-center justify-center">
                  <MessageCircle className="w-5 h-5" />
                </button>
              </form>
            </div>
          </motion.div>
        )}

        {/* ═══ PLACEHOLDER VIEWS ═══ */}
        {(currentView === 'PRICE_UPDATES' || currentView === 'COMMUNITY') && (
          <motion.div key={currentView} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}
            className="flex-1 flex flex-col items-center justify-center min-h-[50vh] bg-[var(--color-bg-panel)]/60 backdrop-blur-xl rounded-3xl border border-[var(--color-border)] shadow-xl p-8 text-center">
            <div className="w-20 h-20 bg-[var(--color-bg-subtle)]/50 rounded-2xl flex items-center justify-center mb-6 border border-[var(--color-border)]/50 text-[var(--color-accent)]">
              {currentView === 'PRICE_UPDATES' ? <TrendingDown className="w-10 h-10" /> : <Users className="w-10 h-10" />}
            </div>
            <h2 className="text-2xl font-bold text-[var(--color-text-primary)] mb-2">{currentView === 'PRICE_UPDATES' ? t.navPriceUpdates : t.navCommunity}</h2>
            <p className="text-[var(--color-text-muted)]">{t.placeholderDesc}</p>
            <button onClick={() => setCurrentView('HOME')} className="mt-8 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-[var(--color-accent-text)] px-6 py-2 rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-[var(--color-accent)]/20">
              {t.backToHome}
            </button>
          </motion.div>
        )}

      </AnimatePresence>

      {/* ── Footer ── */}
      <footer className="mt-8 pt-6 border-t border-[var(--color-border)]/50 flex justify-center md:justify-end">
        <div className="flex items-center gap-2 bg-[var(--color-bg-panel)]/50 px-4 py-2 rounded-full border border-[var(--color-border)]/50 opacity-60">
          <div className="w-2 h-2 rounded-full bg-[var(--color-success)] animate-pulse" />
          <span className="text-xs font-mono text-[var(--color-text-muted)]">{t.devOptionsLocked}</span>
        </div>
      </footer>

      {/* ── Drawer ── */}
      <AnimatePresence>
        {isDrawerOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsDrawerOpen(false)} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" />
            <motion.div
              initial={{ x: lang === 'he' ? '-100%' : '100%' }} animate={{ x: 0 }} exit={{ x: lang === 'he' ? '-100%' : '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={`fixed top-0 bottom-0 ${lang === 'he' ? 'left-0 border-r' : 'right-0 border-l'} w-72 bg-[var(--color-bg-panel)] border-[var(--color-border)] shadow-2xl z-50 flex flex-col`}
            >
              <div className="p-6 flex items-center justify-between border-b border-[var(--color-border)]">
                <h2 className="text-lg font-bold text-[var(--color-text-primary)]">{t.appTitle}</h2>
                <button onClick={() => setIsDrawerOpen(false)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] p-3 -m-3"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-1 px-3">
                <DrawerItem view="HOME"          currentView={currentView} setCurrentView={setCurrentView} icon={Home}         label={t.navHome}         close={() => setIsDrawerOpen(false)} />
                <DrawerItem view="PROFILE"       currentView={currentView} setCurrentView={setCurrentView} icon={User}         label={t.navProfile}      close={() => setIsDrawerOpen(false)} />
                <DrawerItem view="SAVED_LISTS"   currentView={currentView} setCurrentView={setCurrentView} icon={List}         label={t.navSavedLists}   close={() => setIsDrawerOpen(false)} />
                <DrawerItem view="CHAT"          currentView={currentView} setCurrentView={setCurrentView} icon={MessageSquare} label={t.navChat}         close={() => setIsDrawerOpen(false)} />
                <DrawerItem view="PRICE_UPDATES" currentView={currentView} setCurrentView={setCurrentView} icon={TrendingDown} label={t.navPriceUpdates} close={() => setIsDrawerOpen(false)} />
                <DrawerItem view="COMMUNITY"     currentView={currentView} setCurrentView={setCurrentView} icon={Users}        label={t.navCommunity}    close={() => setIsDrawerOpen(false)} />
                <button onClick={() => { setIsDrawerOpen(false); setIsSupportOpen(true); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] transition-colors">
                  <LifeBuoy className="w-5 h-5" /> {t.supportChannel}
                </button>
              </div>
              <div className="p-4 border-t border-[var(--color-border)]">
                {currentUser ? (
                  <button onClick={async () => {
                    if (supabase) await supabase.auth.signOut();
                    setCurrentUser(null); setIsDrawerOpen(false); setCurrentView('HOME');
                  }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 rounded-xl transition-colors">
                    <LogOut className="w-5 h-5" /> {t.signOut}
                  </button>
                ) : (
                  <button onClick={() => { setAuthMode('SIGN_IN'); setIsDrawerOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent-hover)]/10 rounded-xl transition-colors">
                    <LogIn className="w-5 h-5" /> {t.signIn} / {t.signUp}
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Support modal ── */}
      <AnimatePresence>
        {isSupportOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsSupportOpen(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative bg-[var(--color-bg-panel)] border border-[var(--color-border)] shadow-2xl rounded-3xl w-full max-w-md overflow-hidden">
              <div className="p-6 border-b border-[var(--color-border)] flex justify-between items-center">
                <div className="flex items-center gap-3"><LifeBuoy className="w-6 h-6 text-[var(--color-accent)]" /><h2 className="text-xl font-bold text-[var(--color-text-primary)]">{t.supportChannel}</h2></div>
                <button onClick={() => setIsSupportOpen(false)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] p-3 -m-3"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                <a href={`https://wa.me/972502887700?text=${encodeURIComponent(lang === 'he' ? 'שלום, אני זקוק לעזרה.' : 'Hello, I need help.')}`}
                  target="_blank" rel="noopener noreferrer"
                  className="w-full flex items-center justify-between p-4 bg-[#25D366]/10 border border-[#25D366]/30 hover:bg-[#25D366]/20 transition-colors rounded-2xl group">
                  <div className="flex items-center gap-3">
                    <MessageCircle className="w-6 h-6 text-[#25D366]" />
                    <span className="font-semibold text-[var(--color-text-primary)]">{t.whatsappExpress}</span>
                  </div>
                  <ExternalLink className="w-4 h-4 text-[var(--color-text-muted)] group-hover:text-[var(--color-text-primary)]" />
                </a>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Auth modal ── */}
      <AuthModal
        authMode={authMode}
        setAuthMode={setAuthMode}
        onAuthSuccess={async (nickname) => {
          if (!supabase) return;
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
            setCurrentUser({
              id: user.id,
              nickname: nickname || profile?.nickname || 'User',
              email: user.email || '',
              phone: profile?.phone_number || '',
              avatar: profile?.avatar_url || '',
            });
          }
        }}
        t={t}
      />
    </div>
  );
}
