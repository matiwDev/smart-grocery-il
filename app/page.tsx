'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ShoppingCart, ExternalLink, TrendingDown,
  LogOut, Globe, User, X, Home, List, Users, Search,
  MapPin, Navigation, ChevronDown,
  LifeBuoy, MessageCircle, MessageSquare, CheckCircle, AlertCircle,
  ArrowDown, Loader2, Bell, Copy, UserPlus, Sun, Moon,
  ScanBarcode, Camera, Ticket, Check, Mail, Barcode, VideoOff, Truck, Trash2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line,
} from 'recharts';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { BranchMapContainer } from '@/components/BranchMapContainer';
import { AuthModal, AuthMode } from '@/components/AuthModal';
import { supabase } from '@/utils/supabase';

type Lang = 'he' | 'en';
type View = 'HOME' | 'PROFILE' | 'SAVED_LISTS' | 'ANALYTICS' | 'COMMUNITY' | 'LOCATION' | 'CHAT' | 'SCAN' | 'COUPONS';
type Theme = 'light' | 'dark';

const BOTTOM_NAV_TABS: { view: View; icon: React.ComponentType<{ className?: string }> }[] = [
  { view: 'HOME', icon: Home },
  { view: 'SCAN', icon: ScanBarcode },
  { view: 'COUPONS', icon: Ticket },
  { view: 'LOCATION', icon: MapPin },
];

const THEME_STORAGE_KEY = 'sg_theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChainPrice {
  chain_id: string;
  price: number;
  is_sale?: boolean;
  unit_qty?: number | null;
  unit_type?: string | null;
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
  barcode: string | null;
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
  // Phase 11: absent until supabase/migrations/006_online_branches.sql is
  // applied (select('*') just omits the key rather than erroring) — treat
  // as false until then.
  is_online?: boolean;
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
  isOnline: boolean;
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
    navSavedLists: 'רשימות שמורות', navAnalytics: 'אנליטיקס',
    navCommunity: 'קהילת צרכנים', navChat: 'צ׳אט משפחתי',
    chatSearchPlaceholder: 'חפש בהודעות...',
    chatNoResults: 'לא נמצאו הודעות תואמות',
    location: 'מיקום',
    currentGpsLocation: 'מיקום נוכחי (GPS)',
    branchesWithoutLocation: 'סניפים ללא מיקום מדויק',
    nearbySupermarkets: 'סופרמרקטים בסביבה',
    quickNavigate: 'ניווט מהיר',
    viewDetails: 'צפה בפרטים',
    backToHome: 'חזרה לראשי',
    placeholderDesc: 'העמוד הזה נמצא כעת בפיתוח.',
    analyticsSavingsTitle: 'חסכתם עד כה',
    analyticsSavingsSubtitle: 'בהשוואה לרשת היקרה ביותר',
    analyticsChainRankingTitle: 'הרשת הזולה השבוע',
    analyticsPriceDropsTitle: 'הירידות הגדולות השבוע',
    analyticsTopProductsTitle: 'המוצרים שהכי השווית',
    analyticsTrendTitle: 'מגמת מחיר למוצר',
    analyticsTrendSearchPlaceholder: 'הקלד שם מוצר...',
    analyticsNotEnoughHistory: 'אין מספיק היסטוריה עדיין — בדקו שוב מחר',
    analyticsEmptyDrops: 'אין ירידות מחיר משמעותיות כרגע',
    analyticsEmptyRanking: 'אין עדיין נתוני מחירים',
    analyticsEmptyTopProducts: 'עדיין לא הוספתם מספיק מוצרים',
    analyticsTimesAdded: 'פעמים',
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
    listSavedToast: 'הרשימה נשמרה',
    listLoadedToast: 'הרשימה נטענה',
    listDeletedToast: 'הרשימה נמחקה',
    deleteListConfirm: 'למחוק רשימה זו?',
    deleteAction: 'מחק',
    cancelAction: 'ביטול',
    myLocation: 'המיקום שלי',
    locationDenied: 'הגישה למיקום נדחתה',
    distanceFilter: 'טווח מרחק',
    searchByCity: 'חפש לפי עיר',
    // Phase 8 UX overhaul
    aboutTitle: 'Smart Grocery IL',
    aboutTagline: 'חסכו יותר בכל קנייה',
    aboutVersion: 'גרסה',
    close: 'סגירה',
    notifications: 'התראות',
    navScan: 'סריקה', navCoupons: 'קופונים',
    chainsLabel: 'רשתות להשוואה',
    maxChainsToast: 'ניתן לבחור עד 4 רשתות',
    selectChainsLabel: 'בחר רשתות',
    pricePerUnit: 'ליח׳',
    scanTitle: 'סריקת ברקוד',
    scanSubtitle: 'סרקו מוצר להשוואת מחירים מיידית',
    scanStartCamera: 'הפעל מצלמה',
    scanManualLabel: 'הזינו ברקוד ידנית',
    scanManualPlaceholder: 'מספר ברקוד...',
    scanAddToBasket: 'הוסף לסל',
    scanAgain: 'סרוק שוב',
    scanManually: 'חפש ידנית',
    scanFindingProduct: 'מחפש מוצר...',
    scanNotFound: 'המוצר לא נמצא',
    scanCameraDeniedMsg: 'הגישה למצלמה נחסמה. אנא אפשרו גישה למצלמה בהגדרות הדפדפן.',
    scanEnableCamera: 'נסה שוב',
    scanNoCameraMsg: 'לא זוהתה מצלמה. ניתן להזין ברקוד ידנית למטה.',
    search: 'חיפוש',
    couponsTitle: 'קופונים והנחות',
    couponsSubtitle: 'בקרוב...',
    couponsNotifyMe: 'קבלו התראה כשקופונים יושקו',
    couponsEmailPlaceholder: 'כתובת אימייל',
    couponsJoinButton: 'הצטרפו לרשימת ההמתנה',
    couponsJoined: 'תודה! נעדכן אתכם.',
    couponsError: 'שגיאה, נסו שוב',
    profileSheetTitle: 'פרופיל',
    theme: 'ערכת נושא', language: 'שפה',
    lightMode: 'בהיר', darkMode: 'כהה',
    more: 'עוד',
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
    navSavedLists: 'Saved Lists', navAnalytics: 'Analytics',
    navCommunity: 'Community', navChat: 'Household Chat',
    chatSearchPlaceholder: 'Search messages...',
    chatNoResults: 'No matching messages found',
    location: 'Location',
    currentGpsLocation: 'Current GPS Location',
    branchesWithoutLocation: 'Branches without exact location',
    nearbySupermarkets: 'Nearby Supermarkets',
    quickNavigate: 'Quick Navigate',
    viewDetails: 'View Details',
    backToHome: 'Back to Home',
    placeholderDesc: 'This page is currently in development.',
    analyticsSavingsTitle: 'Total saved so far',
    analyticsSavingsSubtitle: 'vs. most expensive chain',
    analyticsChainRankingTitle: 'Cheapest chain this week',
    analyticsPriceDropsTitle: 'Biggest price drops this week',
    analyticsTopProductsTitle: 'Your most compared products',
    analyticsTrendTitle: 'Price trend for a product',
    analyticsTrendSearchPlaceholder: 'Type a product name...',
    analyticsNotEnoughHistory: 'Not enough history yet — check back tomorrow',
    analyticsEmptyDrops: 'No significant price drops right now',
    analyticsEmptyRanking: 'No price data yet',
    analyticsEmptyTopProducts: "You haven't added enough products yet",
    analyticsTimesAdded: 'times',
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
    listSavedToast: 'List saved',
    listLoadedToast: 'List loaded',
    listDeletedToast: 'List deleted',
    deleteListConfirm: 'Delete this list?',
    deleteAction: 'Delete',
    cancelAction: 'Cancel',
    myLocation: 'My Location',
    locationDenied: 'Location access denied',
    distanceFilter: 'Distance',
    searchByCity: 'Search by city',
    // Phase 8 UX overhaul
    aboutTitle: 'Smart Grocery IL',
    aboutTagline: 'Save more on every shop',
    aboutVersion: 'Version',
    close: 'Close',
    notifications: 'Notifications',
    navScan: 'Scan', navCoupons: 'Coupons',
    chainsLabel: 'Chains to compare',
    maxChainsToast: 'Maximum 4 chains selected',
    selectChainsLabel: 'Select chains',
    pricePerUnit: '/ unit',
    scanTitle: 'Barcode Scanner',
    scanSubtitle: 'Scan a product for instant price comparison',
    scanStartCamera: 'Start Camera',
    scanManualLabel: 'Enter barcode manually',
    scanManualPlaceholder: 'Barcode number...',
    scanAddToBasket: 'Add to basket',
    scanAgain: 'Scan again',
    scanManually: 'Search manually',
    scanFindingProduct: 'Finding product...',
    scanNotFound: 'Product not found',
    scanCameraDeniedMsg: 'Camera access was blocked. Please enable it in your browser settings.',
    scanEnableCamera: 'Try again',
    scanNoCameraMsg: 'No camera detected. Enter a barcode manually below.',
    search: 'Search',
    couponsTitle: 'Coupons & Discounts',
    couponsSubtitle: 'Coming soon...',
    couponsNotifyMe: 'Get notified when coupons launch',
    couponsEmailPlaceholder: 'Email address',
    couponsJoinButton: 'Join the waitlist',
    couponsJoined: 'Thanks! We\'ll keep you posted.',
    couponsError: 'Something went wrong, try again',
    profileSheetTitle: 'Profile',
    theme: 'Theme', language: 'Language',
    lightMode: 'Light', darkMode: 'Dark',
    more: 'More',
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

interface BottomNavProps {
  currentView: View;
  setCurrentView: (v: View) => void;
  t: Dictionary;
}

function BottomNav({ currentView, setCurrentView, t }: BottomNavProps) {
  const labelFor = (view: View) => ({
    HOME: t.navHome, SCAN: t.navScan, COUPONS: t.navCoupons, LOCATION: t.location,
  } as Record<string, string>)[view];

  return (
    <nav
      className="fixed bottom-0 start-0 end-0 z-40 bg-[var(--color-bg-panel)] border-t border-[var(--color-border)] flex items-stretch"
      style={{ height: 'calc(64px + env(safe-area-inset-bottom, 16px))', paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}
    >
      {BOTTOM_NAV_TABS.map(({ view, icon: Icon }) => {
        const isActive = currentView === view;
        return (
          <button
            key={view}
            onClick={() => setCurrentView(view)}
            className="flex-1 flex flex-col items-center justify-center gap-1 relative min-h-[44px]"
          >
            {isActive && (
              <span className="absolute top-1.5 w-1.5 h-1.5 rounded-full bg-[var(--color-accent)]" />
            )}
            <Icon className={`w-6 h-6 ${isActive ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'}`} />
            <span className={`text-[10px] font-medium ${isActive ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'}`}>
              {labelFor(view)}
            </span>
          </button>
        );
      })}
    </nav>
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

// "היום"/"Today", "אתמול"/"Yesterday", or a DD/MM/YYYY date — used for the
// centered date-separator pill between chat message groups.
function formatDateSeparator(iso: string, lang: Lang): string {
  const date = new Date(iso);
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  if (diffDays === 0) return lang === 'he' ? 'היום' : 'Today';
  if (diffDays === 1) return lang === 'he' ? 'אתמול' : 'Yesterday';
  const locale = lang === 'he' ? 'he-IL' : 'en-US';
  return date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

type ChatTimelineEntry =
  | { type: 'separator'; key: string; label: string }
  | { type: 'message'; key: string; msg: ChatMessage };

// Groups chat messages into a flat render list with a date-separator entry
// inserted whenever the calendar date changes between consecutive messages.
function buildChatTimeline(messages: ChatMessage[], lang: Lang): ChatTimelineEntry[] {
  const entries: ChatTimelineEntry[] = [];
  let lastDateKey: string | null = null;
  for (const msg of messages) {
    const dateKey = new Date(msg.created_at).toDateString();
    if (dateKey !== lastDateKey) {
      entries.push({ type: 'separator', key: `sep-${dateKey}`, label: formatDateSeparator(msg.created_at, lang) });
      lastDateKey = dateKey;
    }
    entries.push({ type: 'message', key: msg.id, msg });
  }
  return entries;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Wraps every case-insensitive match of `query` inside `text` in a <mark>.
// Renders `text` untouched when query is blank.
function HighlightMatch({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase()
          ? <mark key={i} className="bg-[var(--color-accent)]/40 text-inherit rounded-sm">{part}</mark>
          : <React.Fragment key={i}>{part}</React.Fragment>
      )}
    </>
  );
}

// Great-circle distance between two lat/lng points, in kilometers.
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Cheapest (chain_id, price) entry for a product's per-chain price map.
function computeCheapestEntry(prices: Record<string, ChainPrice>): [string, ChainPrice] | null {
  return Object.entries(prices).reduce<[string, ChainPrice] | null>(
    (best, [cid, cp]) => (!best || cp.price < best[1].price) ? [cid, cp] : best,
    null
  );
}

// Price per 100g/100ml (or per unit for unit-priced items), derived from the
// feed's unit_qty/unit_type. The government feed's UnitOfMeasure values are
// free-text Hebrew (e.g. "100 גרם", "1קילוגרם", "1ליטר", "יחידות") rather than
// a clean enum, so this matches on the actual strings seen in production
// rather than guessing — anything unrecognized (e.g. "מטרים") returns null
// rather than showing a misleading number.
function formatUnitPrice(cp: ChainPrice | undefined | null, lang: Lang): string | null {
  if (!cp || cp.unit_qty == null || !cp.unit_type || cp.unit_qty <= 0) return null;
  const { price, unit_qty: qty, unit_type: type } = cp;

  const isUnit = type === 'unit' || /יחיד/.test(type);
  if (isUnit) {
    return lang === 'he' ? `₪${price.toFixed(2)} / יח׳` : `₪${price.toFixed(2)} / unit`;
  }

  const isKg = /קילוגרם/.test(type);
  const isGram = !isKg && /גרם/.test(type);
  const isMl = /מיליליטר/.test(type);
  const isLiter = !isMl && /ליטר/.test(type);

  let per100: number | null = null;
  let unitLabel: string | null = null;
  if (isGram) { per100 = (price / qty) * 100; unitLabel = lang === 'he' ? '100 גרם' : '100g'; }
  else if (isKg) { per100 = (price / qty) / 10; unitLabel = lang === 'he' ? '100 גרם' : '100g'; }
  else if (isMl) { per100 = (price / qty) * 100; unitLabel = lang === 'he' ? '100 מ״ל' : '100ml'; }
  else if (isLiter) { per100 = (price / qty) / 10; unitLabel = lang === 'he' ? '100 מ״ל' : '100ml'; }

  if (per100 == null || unitLabel == null || !isFinite(per100)) return null;
  return lang === 'he' ? `₪${per100.toFixed(2)} ל-${unitLabel}` : `₪${per100.toFixed(2)} per ${unitLabel}`;
}

const LOCATION_PREF_KEY = 'sg_location_pref';

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

const CHAIN_SELECTION_KEY = 'sg_selected_chains';
const MAX_SELECTED_CHAINS = 4;
const INCLUDE_DELIVERY_KEY = 'sg_include_delivery';

// Brand colors, hardcoded as a fallback for the brief window before the
// `chains` table fetch resolves (selectedChains can already be populated from
// localStorage by then) — kept in sync with the `chains.color_hex` values.
const CHAIN_COLOR_FALLBACKS: Record<string, string> = {
  shufersal: '#E11D48',
  rami_levy: '#2563EB',
  victory: '#16A34A',
  yohananof: '#D97706',
};

// Compact dropdown row — collapsed shows up to MAX_SELECTED_CHAINS colored dots
// (dashed placeholders for unfilled slots) + a "Select chains" label; tapping it
// expands a panel listing every chain with a checkmark for selected ones. Up to
// MAX_SELECTED_CHAINS selected at once, persisted to localStorage. Drives which
// chains the comparison panel, the /api/prices/compare call, and the Location
// map's pins show.
function ChainSelectorStrip({ chains, selectedChains, onToggle, lang, t }: {
  chains: ChainMeta[]; selectedChains: string[]; onToggle: (id: string) => void; lang: Lang; t: Dictionary;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  if (chains.length === 0 && selectedChains.length === 0) return null;

  const dotSlots = Array.from({ length: MAX_SELECTED_CHAINS }, (_, i) => selectedChains[i] ?? null);

  return (
    <div ref={ref} className="relative -mx-4 md:-mx-6 lg:-mx-8">
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="w-full h-12 px-4 md:px-6 lg:px-8 flex items-center justify-between bg-[var(--color-bg-base)] border-b border-[var(--color-border)]"
      >
        <div className="flex items-center gap-1.5">
          {dotSlots.map((chainId, i) => {
            const color = chainId
              ? (chains.find((c) => c.id === chainId)?.color_hex ?? CHAIN_COLOR_FALLBACKS[chainId])
              : null;
            return color ? (
              <span key={i} className="w-5 h-5 rounded-full shrink-0" style={{ backgroundColor: color }} />
            ) : (
              <span key={i} className="w-5 h-5 rounded-full shrink-0 border border-dashed border-[var(--color-border)]" />
            );
          })}
        </div>
        <div className="flex items-center gap-1.5 text-[var(--color-text-secondary)]">
          <span className="text-xs font-semibold">{t.selectChainsLabel}</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden absolute top-full start-0 end-0 z-30 bg-[var(--color-bg-panel)] border-b border-[var(--color-border)] shadow-2xl"
          >
            {chains.map((chain) => {
              const isSelected = selectedChains.includes(chain.id);
              const name = lang === 'he' ? chain.name_he : chain.name_en;
              return (
                <button
                  key={chain.id}
                  onClick={() => onToggle(chain.id)}
                  className="w-full flex items-center gap-3 px-4 md:px-6 lg:px-8 min-h-[48px] hover:bg-[var(--color-bg-hover)] transition-colors text-start"
                >
                  <span className="w-5 h-5 rounded-full shrink-0" style={{ backgroundColor: chain.color_hex || CHAIN_COLOR_FALLBACKS[chain.id] }} />
                  <span className="flex-1 text-sm font-medium text-[var(--color-text-primary)]">{name}</span>
                  {isSelected && <Check className="w-4 h-4 text-[var(--color-accent)] shrink-0" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Small auto-dismissing toast, used for the "max 4 chains" notice.
function Toast({ message }: { message: string | null }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-[var(--color-text-primary)] text-[var(--color-bg-panel)] text-sm font-medium px-4 py-2.5 rounded-full shadow-2xl whitespace-nowrap"
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Per-chain price list for one product — cheapest/most-expensive highlighted,
// with a price-per-100g/ml/unit line when the feed has unit data for that chain.
// Takes just the price map (not a full BasketItem) so it can be reused for a
// scanned ProductResult too.
function ChainPriceBreakdown({ prices, chains, lang }: { prices: Record<string, ChainPrice>; chains: ChainMeta[]; lang: Lang }) {
  const priceEntries = Object.entries(prices);
  const minPrice = priceEntries.length > 0 ? Math.min(...priceEntries.map(([, cp]) => cp.price)) : null;
  const maxPrice = priceEntries.length > 0 ? Math.max(...priceEntries.map(([, cp]) => cp.price)) : null;

  return (
    <div className="flex flex-col gap-1.5 py-2 ps-2 border-s-2 border-[var(--color-border)] mt-1 mb-1">
      {priceEntries
        .slice()
        .sort((a, b) => a[1].price - b[1].price)
        .map(([cid, cp]) => {
          const cName = chains.find((c) => c.id === cid)?.[lang === 'he' ? 'name_he' : 'name_en'] ?? cid;
          const isCheapest = cp.price === minPrice;
          const isExpensive = cp.price === maxPrice && minPrice !== maxPrice;
          const unitLine = formatUnitPrice(cp, lang);
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
              <span className="text-end">
                <span className="font-mono font-medium block">₪{cp.price.toFixed(2)}</span>
                {unitLine && <span className="block text-[10px] opacity-70 font-mono">{unitLine}</span>}
              </span>
            </div>
          );
        })}
    </div>
  );
}

interface BasketRowProps {
  item: BasketItem;
  chains: ChainMeta[];
  lang: Lang;
  t: Dictionary;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdateQuantity: (delta: number) => void;
  onRemove: () => void;
  isAlertActive: boolean;
  onToggleAlert: () => void;
}

// Compact (<=56px) basket row: name + unit price on the left, quantity
// controls centered, cheapest-chain line total + delete on the right.
// Tapping the row expands the per-chain breakdown (with the price-alert
// toggle, which doesn't fit in the compact row itself).
function BasketRow({ item, chains, lang, t, isExpanded, onToggleExpand, onUpdateQuantity, onRemove, isAlertActive, onToggleAlert }: BasketRowProps) {
  const cheapestEntry = computeCheapestEntry(item.prices);
  const unitLine = formatUnitPrice(cheapestEntry?.[1], lang);
  const lineTotal = (cheapestEntry?.[1].price ?? item.min_price ?? 0) * item.quantity;

  return (
    <div className="bg-[var(--color-bg-subtle)]/50 rounded-2xl border border-[var(--color-border)]/50 overflow-hidden">
      <div
        onClick={onToggleExpand}
        className="flex items-center gap-2 px-3 min-h-[56px] cursor-pointer hover:bg-[var(--color-bg-hover)] transition-colors"
      >
        {/* Left: name + unit price */}
        <div className="flex-1 min-w-0 text-start">
          <h3 className="font-semibold text-sm text-[var(--color-text-primary)] truncate">{item.name_he}</h3>
          {unitLine && <p className="text-[11px] text-[var(--color-text-muted)] font-mono truncate">{unitLine}</p>}
        </div>

        {/* Center: quantity controls */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="flex items-center bg-[var(--color-bg-panel)] rounded-lg border border-[var(--color-border)] shrink-0"
        >
          <button onClick={() => onUpdateQuantity(-1)} className="w-7 h-8 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] rounded-lg transition-colors">−</button>
          <span className="w-6 text-center font-mono text-sm font-medium text-[var(--color-text-primary)]">{item.quantity}</span>
          <button onClick={() => onUpdateQuantity(1)} className="w-7 h-8 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] rounded-lg transition-colors">+</button>
        </div>

        {/* Right: cheapest-chain line total + delete */}
        <span className="font-mono font-semibold text-[var(--color-accent)] text-sm shrink-0 whitespace-nowrap">
          ₪{lineTotal.toFixed(2)}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          aria-label={t.clearList}
          className="w-8 h-8 shrink-0 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }} className="overflow-hidden"
          >
            <div className="px-4 pb-3">
              <ChainPriceBreakdown prices={item.prices} chains={chains} lang={lang} />
              <div className="mt-1 flex items-center justify-between gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleAlert(); }}
                  className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1.5 rounded-lg transition-colors ${
                    isAlertActive
                      ? 'text-[var(--color-warning)] bg-[var(--color-warning)]/10'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-warning)] hover:bg-[var(--color-warning)]/10'
                  }`}
                >
                  <Bell className="w-3.5 h-3.5" fill={isAlertActive ? 'currentColor' : 'none'} />
                  {t.priceAlerts}
                </button>
                {item.barcode && (
                  <span className="flex items-center gap-1 text-[11px] text-[var(--color-text-muted)] font-mono shrink-0">
                    <Barcode className="w-3.5 h-3.5" />
                    {item.barcode}
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Analytics ────────────────────────────────────────────────────────────────

interface ChainRankingEntry {
  chain_id: string;
  name_he: string;
  name_en: string;
  color_hex: string;
  avg_price: number;
  product_count: number;
}

interface PriceDropEntry {
  product_id: string;
  chain_id: string;
  old_price: number;
  new_price: number;
  pct_drop: number;
  product_name_he: string;
  product_name_en: string | null;
  chain_name_he: string;
  chain_name_en: string;
}

interface TopProductEntry {
  product_id: string;
  name_he: string;
  name_en: string | null;
  times_added: number;
  min_price: number | null;
}

interface TrendSearchResult {
  id: string;
  name_he: string;
  name_en: string | null;
}

interface TrendHistoryRow {
  chain_id: string;
  price: number;
  captured_at: string;
}

// Groups raw price_history rows into one row per day (recharts wants a flat
// array with one key per line), keeping the last price seen that day per
// chain since `history` is already ordered oldest-first.
function buildTrendChartData(history: TrendHistoryRow[]): Array<Record<string, string | number>> {
  const byDate = new Map<string, Record<string, string | number>>();
  for (const h of history) {
    const day = h.captured_at.slice(0, 10);
    if (!byDate.has(day)) byDate.set(day, { date: day });
    byDate.get(day)![h.chain_id] = h.price;
  }
  return [...byDate.values()].sort((a, b) => (a.date as string).localeCompare(b.date as string));
}

function SkeletonBlock({ height = 120 }: { height?: number }) {
  return <div className="w-full bg-[var(--color-bg-subtle)] rounded-xl animate-pulse" style={{ height }} />;
}

function AnalyticsEmptyState({ text }: { text: string }) {
  return <p className="text-sm text-[var(--color-text-muted)] text-center py-6">{text}</p>;
}

function AnalyticsView({ t, lang, currentUserId }: { t: Dictionary; lang: Lang; currentUserId: string | null }) {
  const [savings, setSavings] = useState<number | null>(null);
  const [savingsLoading, setSavingsLoading] = useState(true);

  const [ranking, setRanking] = useState<ChainRankingEntry[]>([]);
  const [rankingLoading, setRankingLoading] = useState(true);

  const [drops, setDrops] = useState<PriceDropEntry[]>([]);
  const [dropsLoading, setDropsLoading] = useState(true);

  const [topProducts, setTopProducts] = useState<TopProductEntry[]>([]);
  const [topProductsLoading, setTopProductsLoading] = useState(true);

  const [trendQuery, setTrendQuery] = useState('');
  const [trendResults, setTrendResults] = useState<TrendSearchResult[]>([]);
  const [trendSelected, setTrendSelected] = useState<TrendSearchResult | null>(null);
  const [trendData, setTrendData] = useState<Array<Record<string, string | number>>>([]);
  const [trendChainsPresent, setTrendChainsPresent] = useState<ChainMeta[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendHasEnough, setTrendHasEnough] = useState(true);

  useEffect(() => {
    if (!currentUserId) { setSavingsLoading(false); setTopProductsLoading(false); return; }
    setSavingsLoading(true);
    fetch(`/api/analytics?type=savings&user_id=${currentUserId}`)
      .then((r) => r.json()).then((d) => setSavings(d.total_saved ?? 0))
      .finally(() => setSavingsLoading(false));
    setTopProductsLoading(true);
    fetch(`/api/analytics?type=top_products&user_id=${currentUserId}`)
      .then((r) => r.json()).then((d) => setTopProducts(d.products ?? []))
      .finally(() => setTopProductsLoading(false));
  }, [currentUserId]);

  useEffect(() => {
    setRankingLoading(true);
    fetch('/api/analytics?type=chain_ranking')
      .then((r) => r.json()).then((d) => setRanking(d.ranking ?? []))
      .finally(() => setRankingLoading(false));
    setDropsLoading(true);
    fetch('/api/analytics?type=price_drops&days=7')
      .then((r) => r.json()).then((d) => setDrops(d.drops ?? []))
      .finally(() => setDropsLoading(false));
  }, []);

  useEffect(() => {
    if (!trendQuery.trim()) { setTrendResults([]); return; }
    const handle = setTimeout(() => {
      fetch(`/api/products/search?q=${encodeURIComponent(trendQuery.trim())}&limit=6`)
        .then((r) => r.json())
        .then((d) => setTrendResults((d.products ?? []).map((p: TrendSearchResult) => ({ id: p.id, name_he: p.name_he, name_en: p.name_en }))));
    }, 300);
    return () => clearTimeout(handle);
  }, [trendQuery]);

  const handleSelectTrendProduct = async (p: TrendSearchResult) => {
    setTrendSelected(p);
    setTrendResults([]);
    setTrendQuery('');
    setTrendLoading(true);
    try {
      const res = await fetch(`/api/analytics?type=price_trend&product_id=${p.id}&days=30`);
      const data = await res.json();
      const history: TrendHistoryRow[] = data.history ?? [];
      setTrendHasEnough(!!data.has_enough_history);
      setTrendData(buildTrendChartData(history));
      const presentIds = new Set(history.map((h) => h.chain_id));
      setTrendChainsPresent((data.chains ?? []).filter((c: ChainMeta) => presentIds.has(c.id)));
    } finally {
      setTrendLoading(false);
    }
  };

  const cardClass = 'bg-[var(--color-bg-panel)]/60 backdrop-blur-xl border border-[var(--color-border)] rounded-3xl p-6 shadow-xl';

  return (
    <motion.div key="ANALYTICS" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}
      className="flex-1 max-w-4xl mx-auto w-full flex flex-col gap-6 text-start mt-6">
      <h2 className="text-3xl font-bold text-[var(--color-text-primary)]">{t.navAnalytics}</h2>

      {/* A: savings summary */}
      <div className={cardClass}>
        <p className="text-sm text-[var(--color-text-muted)] mb-1">{t.analyticsSavingsTitle}</p>
        {savingsLoading ? (
          <SkeletonBlock height={44} />
        ) : (
          <p className="text-4xl font-bold text-[var(--color-success)]">₪{(savings ?? 0).toFixed(2)}</p>
        )}
        <p className="text-xs text-[var(--color-text-muted)] mt-1">{t.analyticsSavingsSubtitle}</p>
      </div>

      {/* B: cheapest chain ranking */}
      <div className={cardClass}>
        <h3 className="font-semibold text-[var(--color-text-primary)] mb-4">{t.analyticsChainRankingTitle}</h3>
        {rankingLoading ? (
          <SkeletonBlock height={180} />
        ) : ranking.length === 0 ? (
          <AnalyticsEmptyState text={t.analyticsEmptyRanking} />
        ) : (
          <div style={{ width: '100%', height: Math.max(120, ranking.length * 48) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ranking} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 4 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey={lang === 'he' ? 'name_he' : 'name_en'} width={90} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value) => [`₪${value}`, '']} />
                <Bar dataKey="avg_price" radius={[0, 8, 8, 0]} barSize={22}>
                  {ranking.map((r) => <Cell key={r.chain_id} fill={r.color_hex} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* C: biggest price drops */}
      <div className={cardClass}>
        <h3 className="font-semibold text-[var(--color-text-primary)] mb-2">{t.analyticsPriceDropsTitle}</h3>
        {dropsLoading ? (
          <SkeletonBlock height={160} />
        ) : drops.length === 0 ? (
          <AnalyticsEmptyState text={t.analyticsEmptyDrops} />
        ) : (
          <div className="flex flex-col">
            {drops.map((d) => (
              <div key={`${d.product_id}-${d.chain_id}`} className="flex items-center justify-between gap-3 py-2.5 border-b border-[var(--color-border)] last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{lang === 'he' ? d.product_name_he : (d.product_name_en ?? d.product_name_he)}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{lang === 'he' ? d.chain_name_he : d.chain_name_en}</p>
                </div>
                <div className="flex items-center gap-1.5 text-[var(--color-success)] text-sm font-semibold shrink-0">
                  <ArrowDown className="w-4 h-4" />
                  <span className="text-[var(--color-text-muted)] font-normal line-through">₪{d.old_price.toFixed(2)}</span>
                  ₪{d.new_price.toFixed(2)}
                  <span>(-{d.pct_drop}%)</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* D: most compared products */}
      <div className={cardClass}>
        <h3 className="font-semibold text-[var(--color-text-primary)] mb-2">{t.analyticsTopProductsTitle}</h3>
        {topProductsLoading ? (
          <SkeletonBlock height={160} />
        ) : topProducts.length === 0 ? (
          <AnalyticsEmptyState text={t.analyticsEmptyTopProducts} />
        ) : (
          <div className="flex flex-col">
            {topProducts.map((p) => (
              <div key={p.product_id} className="flex items-center justify-between gap-3 py-2.5 border-b border-[var(--color-border)] last:border-0">
                <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{lang === 'he' ? p.name_he : (p.name_en ?? p.name_he)}</p>
                <p className="text-xs text-[var(--color-text-muted)] shrink-0">{p.times_added} {t.analyticsTimesAdded} · {p.min_price != null ? `₪${p.min_price.toFixed(2)}` : '—'}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* E: price trend for a searched product */}
      <div className={cardClass}>
        <h3 className="font-semibold text-[var(--color-text-primary)] mb-4">{t.analyticsTrendTitle}</h3>
        <div className="relative">
          <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-[var(--color-text-muted)]" />
          <input
            type="text" value={trendQuery} onChange={(e) => { setTrendQuery(e.target.value); setTrendSelected(null); }}
            placeholder={t.analyticsTrendSearchPlaceholder} dir="auto"
            className="w-full bg-[var(--color-bg-subtle)]/50 border border-[var(--color-border)] rounded-xl ps-9 pe-4 py-2.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
          />
          {trendResults.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-[var(--color-bg-panel)] border border-[var(--color-border)] rounded-xl shadow-xl overflow-hidden">
              {trendResults.map((p) => (
                <button
                  key={p.id} onClick={() => handleSelectTrendProduct(p)}
                  className="w-full text-start px-4 py-2.5 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors"
                >
                  {lang === 'he' ? p.name_he : (p.name_en ?? p.name_he)}
                </button>
              ))}
            </div>
          )}
        </div>

        {trendSelected && (
          <div className="mt-4">
            <p className="text-sm font-medium text-[var(--color-text-primary)] mb-3">{lang === 'he' ? trendSelected.name_he : (trendSelected.name_en ?? trendSelected.name_he)}</p>
            {trendLoading ? (
              <SkeletonBlock height={220} />
            ) : !trendHasEnough ? (
              <AnalyticsEmptyState text={t.analyticsNotEnoughHistory} />
            ) : (
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={40} />
                    <Tooltip />
                    <Legend />
                    {trendChainsPresent.map((c) => (
                      <Line key={c.id} type="monotone" dataKey={c.id} name={lang === 'he' ? c.name_he : c.name_en} stroke={c.color_hex} strokeWidth={2} dot={false} connectNulls />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SmartGroceryDashboard() {
  const [lang, setLang] = useState<Lang>('he');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isAuthChecked, setIsAuthChecked] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('NONE');
  const [currentView, setCurrentView] = useState<View>('HOME');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>('light');
  const [isEditingCredentials, setIsEditingCredentials] = useState(false);
  const [verificationFlash, setVerificationFlash] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

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

  // Chain selector (up to MAX_SELECTED_CHAINS, persisted to localStorage)
  const [selectedChains, setSelectedChains] = useState<string[]>([]);
  const hasInitedChainSelectionRef = useRef(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scan view: manual barcode entry
  const [scanBarcodeInput, setScanBarcodeInput] = useState('');
  const [scanResults, setScanResults] = useState<ProductResult[]>([]);
  const [isScanSearching, setIsScanSearching] = useState(false);
  const [scanSearched, setScanSearched] = useState(false);

  // Scan view: live camera barcode scanner
  const [cameraStatus, setCameraStatus] = useState<'idle' | 'granted' | 'denied' | 'unavailable'>('idle');
  // 'idle' = not started yet (Start Camera button shown) — the camera is only
  // ever requested from a direct tap on that button, never on mount.
  const [scanStage, setScanStage] = useState<'idle' | 'scanning' | 'looking-up' | 'found' | 'not-found'>('idle');
  const [scannedProduct, setScannedProduct] = useState<ProductResult | null>(null);
  const [lastScannedBarcode, setLastScannedBarcode] = useState<string | null>(null);
  const [hasCameraSupport, setHasCameraSupport] = useState(true);
  const scanVideoRef = useRef<HTMLVideoElement>(null);
  const scanControlsRef = useRef<IScannerControls | null>(null);
  const hasHandledScanRef = useRef(false);

  // Coupons view: waitlist email signup
  const [couponEmail, setCouponEmail] = useState('');
  const [couponStatus, setCouponStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

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
  // Phase 11: "כולל משלוח"/"Include delivery" toggle — shows online (no
  // lat/lng) branches as a fixed chip row above the map instead of as map
  // pins. Persisted like the other location prefs.
  const [includeDelivery, setIncludeDelivery] = useState(false);
  const hasLoadedLocationPrefRef = useRef(false);

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { id: '1', user_id: 'dad', nickname: 'Dad', content: 'Don\'t forget the 3% milk!', created_at: new Date().toISOString() },
    { id: '2', user_id: 'mom', nickname: 'Mom', content: 'Added to the list ✓', created_at: new Date().toISOString() },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatSearchOpen, setIsChatSearchOpen] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');

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

  // ── Chain selection: load saved preference once chains arrive, then persist ──

  useEffect(() => {
    if (chains.length === 0 || hasInitedChainSelectionRef.current) return;
    hasInitedChainSelectionRef.current = true;
    try {
      const raw = localStorage.getItem(CHAIN_SELECTION_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as string[];
        const valid = saved.filter((id) => chains.some((c) => c.id === id));
        if (valid.length > 0) { setSelectedChains(valid); return; }
      }
    } catch {}
    setSelectedChains(chains.map((c) => c.id));
  }, [chains]);

  useEffect(() => {
    if (selectedChains.length === 0) return;
    try { localStorage.setItem(CHAIN_SELECTION_KEY, JSON.stringify(selectedChains)); } catch {}
  }, [selectedChains]);

  // ── Include-delivery toggle: load once, then persist ────────────────────────

  useEffect(() => {
    try {
      const raw = localStorage.getItem(INCLUDE_DELIVERY_KEY);
      if (raw) setIncludeDelivery(raw === 'true');
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem(INCLUDE_DELIVERY_KEY, String(includeDelivery)); } catch {}
  }, [includeDelivery]);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 2500);
  }, []);

  const toggleChainSelection = (id: string) => {
    setSelectedChains((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev; // keep at least one chain selected
        return prev.filter((c) => c !== id);
      }
      if (prev.length >= MAX_SELECTED_CHAINS) {
        showToast(t.maxChainsToast);
        return prev;
      }
      return [...prev, id];
    });
  };

  // ── Auth & profile load ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!supabase) { setIsAuthChecked(true); return; }
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setIsAuthChecked(true); return; }
      supabase.from('profiles').select('*').eq('id', user.id).single().then(({ data: profile }) => {
        setCurrentUser({
          id: user.id,
          nickname: profile?.nickname || 'User',
          email: user.email || '',
          phone: profile?.phone_number || '',
          avatar: profile?.avatar_url || '',
        });
        setIsAuthChecked(true);
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
              supabase.from('products').select('id, name_he, name_en, category, barcode').in('id', productIds),
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
                  barcode: product?.barcode ?? null,
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
      body: JSON.stringify({ items, chain_ids: selectedChains.length > 0 ? selectedChains : undefined }),
    })
      .then((r) => r.json())
      .then((data) => {
        setComparison(data.comparison ?? []);
        setMaxSavings(data.max_savings ?? 0);
      })
      .catch(() => {})
      .finally(() => setIsComparing(false));
  }, [basket, selectedChains]);

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
        barcode: product.barcode,
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
      is_archived: true,
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

    showToast(t.listSavedToast);
  };

  // Loads a saved (is_archived=true) basket into the working view: rebuilds
  // full BasketItem rows (current prices, not the prices at save time) from
  // its basket_items, same reconstruction the login-time rehydration effect
  // does for the active basket. Items missing product_id (legacy rows) are
  // matched by product_name instead.
  const handleLoadSavedList = async (sb: SavedBasket) => {
    if (!supabase) return;
    const items = sb.basket_items ?? [];
    if (items.length === 0) {
      setActiveBasketId(sb.id);
      setBasket([]);
      setCurrentView('HOME');
      showToast(t.listLoadedToast);
      return;
    }

    const withProductId = items.filter((i) => i.product_id);
    const withoutProductId = items.filter((i) => !i.product_id);

    const [{ data: products }, { data: prices }] = await Promise.all([
      withProductId.length > 0
        ? supabase.from('products').select('id, name_he, name_en, category, barcode').in('id', withProductId.map((i) => i.product_id as string))
        : Promise.resolve({ data: [] as Array<{ id: string; name_he: string; name_en: string | null; category: string | null; barcode: string | null }> }),
      withProductId.length > 0
        ? supabase.from('latest_prices').select('product_id, chain_id, price, unit_qty, unit_type, is_sale, captured_at').in('product_id', withProductId.map((i) => i.product_id as string))
        : Promise.resolve({ data: [] as Array<{ product_id: string } & ChainPrice> }),
    ]);

    const pricesByProduct: Record<string, Record<string, ChainPrice>> = {};
    for (const p of prices ?? []) {
      if (!pricesByProduct[p.product_id]) pricesByProduct[p.product_id] = {};
      pricesByProduct[p.product_id][p.chain_id] = p as ChainPrice;
    }

    const rehydrated: BasketItem[] = withProductId.map((i) => {
      const product = products?.find((p) => p.id === i.product_id);
      const productPrices = pricesByProduct[i.product_id as string] ?? {};
      const priceValues = Object.values(productPrices).map((p) => p.price);
      return {
        id: i.product_id as string,
        dbId: i.id,
        name_he: product?.name_he ?? i.product_name,
        name_en: product?.name_en ?? null,
        category: product?.category ?? null,
        barcode: product?.barcode ?? null,
        prices: productPrices,
        min_price: priceValues.length > 0 ? Math.min(...priceValues) : null,
        quantity: i.quantity_value ?? 1,
      };
    });

    // Legacy rows with no product_id: look each one up by name so it still
    // shows real current prices instead of nothing.
    for (const i of withoutProductId) {
      const { data: match } = await supabase
        .from('products')
        .select('id, name_he, name_en, category, barcode')
        .ilike('name_he', i.product_name)
        .limit(1)
        .maybeSingle();
      if (!match) continue;
      const { data: matchPrices } = await supabase
        .from('latest_prices')
        .select('product_id, chain_id, price, unit_qty, unit_type, is_sale, captured_at')
        .eq('product_id', match.id);
      const productPrices: Record<string, ChainPrice> = {};
      for (const p of matchPrices ?? []) productPrices[p.chain_id] = p as ChainPrice;
      const priceValues = Object.values(productPrices).map((p) => p.price);
      rehydrated.push({
        id: match.id,
        dbId: i.id,
        name_he: match.name_he,
        name_en: match.name_en,
        category: match.category,
        barcode: match.barcode,
        prices: productPrices,
        min_price: priceValues.length > 0 ? Math.min(...priceValues) : null,
        quantity: i.quantity_value ?? 1,
      });
    }

    setActiveBasketId(sb.id);
    setBasket(rehydrated);
    setCurrentView('HOME');
    showToast(t.listLoadedToast);
  };

  const handleDeleteSavedList = async (basketId: string) => {
    setDeleteConfirmId(null);
    setSavedBaskets((prev) => prev.filter((b) => b.id !== basketId));
    if (supabase && currentUser?.id) {
      await supabase.from('baskets').delete().eq('id', basketId).eq('user_id', currentUser.id);
    }
    showToast(t.listDeletedToast);
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

  // ── Scan: manual barcode search ──────────────────────────────────────────────

  const handleScanSearch = async () => {
    const q = scanBarcodeInput.trim();
    if (!q) return;
    setIsScanSearching(true);
    setScanSearched(true);
    try {
      const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}&limit=8`);
      const data = await res.json();
      setScanResults(data.products ?? []);
    } catch {
      setScanResults([]);
    } finally {
      setIsScanSearching(false);
    }
  };

  // ── Scan: live camera barcode scanner ────────────────────────────────────────

  // A barcode was decoded from the live camera feed: vibrate, pause the
  // scanner, and look up the single matching product.
  const handleLiveScanResult = useCallback(async (barcode: string) => {
    if (hasHandledScanRef.current) return;
    hasHandledScanRef.current = true;
    scanControlsRef.current?.stop();
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(100);
    setLastScannedBarcode(barcode);
    setScanStage('looking-up');
    try {
      const res = await fetch(`/api/products/search?q=${encodeURIComponent(barcode)}&limit=1`);
      const data = await res.json();
      const product = (data.products ?? [])[0] as ProductResult | undefined;
      if (product) {
        setScannedProduct(product);
        setScanStage('found');
      } else {
        setScannedProduct(null);
        setScanStage('not-found');
      }
    } catch {
      setScannedProduct(null);
      setScanStage('not-found');
    }
  }, []);

  // Resets scan state back to the pre-camera 'idle' stage (Start Camera
  // button) rather than immediately restarting the stream — mirrors the
  // "explicit tap only" rule below, so a re-scan never auto-starts either.
  const handleScanAgain = () => {
    setScannedProduct(null);
    setLastScannedBarcode(null);
    setScanStage('idle');
  };

  // Detects camera-API support once on mount, so the idle-stage UI can show
  // a plain "camera not available" note instead of a Start Camera button
  // that would just fail (e.g. desktop with no getUserMedia/no device).
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setHasCameraSupport(false);
    }
  }, []);

  // The ONLY way scanStage becomes 'scanning' — always a direct result of the
  // user tapping "Start Camera" (or "Try again" from the denied state). Never
  // triggered by mounting the Scan tab or by any effect on its own.
  const handleStartScan = () => {
    hasHandledScanRef.current = false;
    setCameraStatus('idle');
    setScanStage('scanning');
  };

  // Starts the live decode loop once the Scan tab is active AND we're in the
  // 'scanning' stage (only reachable via handleStartScan, a real tap — see
  // above); tears the camera down otherwise (tab change, scan-again, or a
  // result was found and the viewfinder is hidden).
  useEffect(() => {
    if (currentView !== 'SCAN') {
      scanControlsRef.current?.stop();
      scanControlsRef.current = null;
      setScanStage('idle');
      setScannedProduct(null);
      setLastScannedBarcode(null);
      hasHandledScanRef.current = false;
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      if (scanStage === 'scanning') setCameraStatus('unavailable');
      return;
    }

    if (scanStage !== 'scanning' || !scanVideoRef.current) return;

    let cancelled = false;
    hasHandledScanRef.current = false;

    // getUserMedia can hang indefinitely (rather than reject) on devices/browsers
    // with no camera at all, so a permission-query fast path + hard timeout keep
    // the UI from getting stuck on 'idle' forever.
    const timeoutId = setTimeout(() => {
      if (!cancelled) setCameraStatus((prev) => (prev === 'idle' ? 'unavailable' : prev));
    }, 8000);

    (async () => {
      try {
        if (navigator.permissions?.query) {
          try {
            const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
            if (status.state === 'denied') {
              if (!cancelled) setCameraStatus('denied');
              return;
            }
          } catch {
            // 'camera' isn't a queryable permission name in every browser — fall through to getUserMedia.
          }
        }

        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoDevice(undefined, scanVideoRef.current!, (result) => {
          if (!cancelled && result) handleLiveScanResult(result.getText());
        });
        if (cancelled) { controls.stop(); return; }
        scanControlsRef.current = controls;
        setCameraStatus('granted');
      } catch (err: unknown) {
        if (cancelled) return;
        const name = (err as { name?: string } | undefined)?.name;
        setCameraStatus(name === 'NotAllowedError' || name === 'PermissionDeniedError' ? 'denied' : 'unavailable');
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      scanControlsRef.current?.stop();
      scanControlsRef.current = null;
    };
  }, [currentView, scanStage, handleLiveScanResult]);

  // ── Coupons: waitlist signup ─────────────────────────────────────────────────

  const handleJoinWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !couponEmail.trim()) return;
    setCouponStatus('loading');
    const { error } = await supabase.from('waitlist').insert({
      email: couponEmail.trim(),
      feature: 'coupons',
      user_id: currentUser?.id ?? null,
    });
    if (error) {
      setCouponStatus('error');
    } else {
      setCouponStatus('success');
      setCouponEmail('');
    }
    setTimeout(() => setCouponStatus('idle'), 4000);
  };

  // ── Map branches load ────────────────────────────────────────────────────────

  useEffect(() => {
    if (currentView !== 'LOCATION' || !supabase) return;
    let cancelled = false;
    (async () => {
      // PostgREST caps an unranged select at this project's max-rows setting
      // (1000, see the Phase 15 analytics fix in CLAUDE.md) — branches alone
      // is now past that, so page through with .range() instead of a single
      // unranged select, or anything past row 1000 silently vanishes.
      const PAGE_SIZE = 1000;
      const rows: BranchRow[] = [];
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data, error } = await supabase!
          .from('branches')
          .select('*')
          .eq('is_active', true)
          .range(offset, offset + PAGE_SIZE - 1);
        if (error || !data) break;
        rows.push(...(data as BranchRow[]));
        if (data.length < PAGE_SIZE) break;
      }
      if (cancelled) return;
      setLiveBranches(rows.map((b) => ({
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
        isOnline: b.is_online ?? false,
      })));
    })();
    return () => { cancelled = true; };
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
    // Online branches have no lat/lng and are surfaced separately (see
    // onlineBranches below) — excluded here up front rather than relying on
    // the lat/lng guard below alone, so they never enter the map-pin
    // pipeline (e.g. the "pre-select cheapest chain's branch" effect) even
    // in the brief window before GPS/city filtering applies.
    const physicalBranches = liveBranches.filter((b) => !b.isOnline);
    if (userPosition) {
      return physicalBranches
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
      return physicalBranches.filter((b) =>
        (b.cityHe ?? '').includes(cityQuery.trim()) || (b.cityEn ?? '').toLowerCase().includes(q)
      );
    }
    return physicalBranches;
  }, [liveBranches, userPosition, distanceKm, locationStatus, cityQuery, lang]);

  // Further narrowed to the chain selector strip's current selection
  const visibleBranches = React.useMemo(() => {
    if (selectedChains.length === 0) return filteredBranches;
    return filteredBranches.filter((b) => selectedChains.includes(b.chain_id));
  }, [filteredBranches, selectedChains]);

  // Physical branches with no lat/lng at all — never map pins, regardless of
  // GPS/distance/city filtering (those filters already drop them). Surfaced
  // as a plain count instead, so the user knows they exist rather than just
  // silently vanishing.
  const branchesWithoutLocationCount = React.useMemo(() => {
    return liveBranches.filter((b) =>
      !b.isOnline &&
      !(b.lat && b.lng) &&
      (selectedChains.length === 0 || selectedChains.includes(b.chain_id))
    ).length;
  }, [liveBranches, selectedChains]);

  // Online (delivery) branches — shown as a fixed chip row above the map
  // instead of as map pins, gated behind the "כולל משלוח"/"Include delivery"
  // toggle. Computed from liveBranches directly (not filteredBranches), since
  // GPS distance / city filtering don't apply to a branch with no location.
  const onlineBranches = React.useMemo(() => {
    if (!includeDelivery) return [];
    return liveBranches.filter(
      (b) => b.isOnline && (selectedChains.length === 0 || selectedChains.includes(b.chain_id))
    );
  }, [liveBranches, includeDelivery, selectedChains]);

  // Pre-select the cheapest chain's first branch when arriving via "Navigate to cheapest"
  useEffect(() => {
    if (!preferredChainId || visibleBranches.length === 0) return;
    const match = visibleBranches.find((b) => b.chain_id === preferredChainId);
    if (match) setActiveMapPin(match.id);
  }, [preferredChainId, visibleBranches]);

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

  const handleAuthSuccess = async (nickname: string) => {
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
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  // Auth gate: nothing renders (not even a flash of the app) until the session
  // check completes, and only the AuthModal (+ language toggle) renders if
  // there's no session — guest browsing is not supported.
  if (!isAuthChecked) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center bg-[var(--color-bg-base)]">
        <Loader2 className="w-8 h-8 text-[var(--color-accent)] animate-spin" />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div
        className="w-full min-h-screen flex flex-col font-sans p-4 md:p-6 lg:p-8 bg-[var(--color-bg-base)] text-[var(--color-text-primary)]"
        dir={lang === 'he' ? 'rtl' : 'ltr'}
      >
        <header className="relative z-[60] flex items-center justify-between mb-6 gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-[var(--color-accent)] rounded-xl flex items-center justify-center text-[var(--color-accent-text)] font-bold shadow-lg shadow-[var(--color-accent)]/20 shrink-0">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-[var(--color-text-primary)]">{t.appTitle}</h1>
              <p className="text-xs text-[var(--color-text-muted)] font-medium">{t.envLabel}</p>
            </div>
          </div>
          <button
            onClick={() => setLang((l) => l === 'he' ? 'en' : 'he')}
            className="flex items-center gap-2 bg-[var(--color-bg-subtle)] hover:bg-[var(--color-bg-hover)] transition-colors px-3 rounded-full border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-primary)] min-h-[44px]"
          >
            <Globe className="w-4 h-4 text-[var(--color-accent)]" />
            {lang === 'he' ? 'EN' : 'עברית'}
          </button>
        </header>

        <AuthModal
          authMode={authMode === 'NONE' ? 'SIGN_IN' : authMode}
          setAuthMode={setAuthMode}
          dismissible={false}
          onAuthSuccess={handleAuthSuccess}
          t={t}
          lang={lang}
        />
      </div>
    );
  }

  return (
    <div
      className="w-full min-h-screen flex flex-col font-sans p-4 md:p-6 lg:p-8 pb-[80px] overflow-x-clip relative transition-colors duration-300 bg-[var(--color-bg-base)] text-[var(--color-text-primary)]"
      dir={lang === 'he' ? 'rtl' : 'ltr'}
    >
      {/* ── Header: compact icon row ── */}
      <header className="sticky top-0 z-40 flex items-center justify-between gap-2 py-3 -mx-4 px-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 bg-[var(--color-bg-base)] border-b border-[var(--color-border)]">
        <button
          onClick={() => setIsAboutOpen(true)}
          aria-label={t.aboutTitle}
          className="w-11 h-11 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-xl flex items-center justify-center text-[var(--color-accent-text)] shadow-lg shadow-[var(--color-accent)]/20 transition-colors shrink-0"
        >
          <ShoppingCart className="w-7 h-7" />
        </button>

        <div className="flex-1" />

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setLang((l) => l === 'he' ? 'en' : 'he')}
            aria-label="EN/HE"
            className="w-11 h-11 flex items-center justify-center bg-[var(--color-bg-subtle)] hover:bg-[var(--color-bg-hover)] transition-colors rounded-full border border-[var(--color-border)] text-[var(--color-accent)]"
          >
            <Globe className="w-5 h-5" />
          </button>

          <button
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? (lang === 'he' ? 'עבור למצב בהיר' : 'Switch to light mode') : (lang === 'he' ? 'עבור למצב כהה' : 'Switch to dark mode')}
            className="w-11 h-11 flex items-center justify-center bg-[var(--color-bg-subtle)] hover:bg-[var(--color-bg-hover)] transition-colors rounded-full border border-[var(--color-border)] text-[var(--color-accent)]"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          <button
            aria-label={t.notifications}
            className="relative w-11 h-11 flex items-center justify-center bg-[var(--color-bg-subtle)] hover:bg-[var(--color-bg-hover)] transition-colors rounded-full border border-[var(--color-border)] text-[var(--color-accent)]"
          >
            <Bell className="w-5 h-5" />
            {Object.keys(priceAlerts).length > 0 && (
              <span className="absolute top-2 end-2 w-2 h-2 rounded-full bg-[var(--color-danger)]" />
            )}
          </button>

          <button
            onClick={() => setIsDrawerOpen(true)}
            aria-label={t.navProfile}
            className="w-11 h-11 rounded-full bg-[var(--color-bg-subtle)] border-2 border-[var(--color-border)] overflow-hidden flex items-center justify-center shrink-0"
          >
            {currentUser?.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentUser.avatar} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <User className="w-5 h-5 text-[var(--color-text-muted)]" />
            )}
          </button>
        </div>
      </header>

      {/* ── Views ── */}
      <AnimatePresence mode="wait">

        {/* ═══ HOME ═══ */}
        {currentView === 'HOME' && (
          <motion.div key="HOME" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="flex-1 flex flex-col gap-6">

            {/* Chain selector strip */}
            <ChainSelectorStrip chains={chains} selectedChains={selectedChains} onToggle={toggleChainSelection} lang={lang} t={t} />

            {/* Search bar */}
            <div className="w-full relative z-20" ref={searchRef}>
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

            {/* Basket + Price Comparison side by side on wide screens */}
            <div className="flex-1 flex flex-col lg:flex-row gap-6">

              {/* Basket list */}
              <div className="flex-1 bg-[var(--color-bg-panel)]/40 backdrop-blur-sm border border-[var(--color-border)]/80 rounded-3xl p-4 sm:p-6 overflow-y-auto min-h-[300px]">
                {basket.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-[var(--color-text-muted)] min-h-[200px]">
                    <ShoppingCart className="w-12 h-12 mb-4 opacity-40" />
                    <p className="text-sm">{t.emptyList}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {basket.map((item) => (
                      <BasketRow
                        key={item.id}
                        item={item}
                        chains={chains}
                        lang={lang}
                        t={t}
                        isExpanded={expandedPriceItemId === item.id}
                        onToggleExpand={() => setExpandedPriceItemId(expandedPriceItemId === item.id ? null : item.id)}
                        onUpdateQuantity={(delta) => updateQuantity(item.id, delta)}
                        onRemove={() => removeProduct(item.id)}
                        isAlertActive={!!priceAlerts[item.id]}
                        onToggleAlert={() => togglePriceAlert(item)}
                      />
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
          <motion.div key="LOCATION" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="flex-1 flex flex-col min-h-0">

            {/* Distance slider bar — full width, 56px, pinned directly below the header */}
            <div className="shrink-0 h-14 -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8 flex items-center gap-3 bg-[var(--color-bg-base)] border-b border-[var(--color-border)]">
              <span className="text-xs font-semibold text-[var(--color-text-secondary)] whitespace-nowrap">
                {lang === 'he' ? 'טווח' : 'Range'}: {distanceKm.toFixed(1)} {lang === 'he' ? 'ק״מ' : 'km'}
              </span>
              <input
                type="range"
                min={0.5}
                max={50}
                step={0.5}
                value={distanceKm}
                onChange={(e) => setDistanceKm(Number(e.target.value))}
                className="flex-1 accent-[var(--color-accent)]"
              />
              <button
                type="button"
                onClick={() => setIncludeDelivery((v) => !v)}
                className={`shrink-0 flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-medium border transition-colors ${
                  includeDelivery
                    ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)] border-[var(--color-accent)]'
                    : 'bg-transparent text-[var(--color-text-secondary)] border-[var(--color-border)]'
                }`}
              >
                <Truck className="w-3.5 h-3.5" />
                {lang === 'he' ? 'כולל משלוח' : 'Include delivery'}
              </button>
            </div>

            {/* Branches with no lat/lng (mostly chains whose feed publishes no
                store-metadata at all — see CLAUDE.md "Phase 15/16") never get a
                map pin; surfaced here as a plain count instead of silently
                vanishing. */}
            {branchesWithoutLocationCount > 0 && (
              <div className="shrink-0 -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8 py-1.5 text-xs text-[var(--color-text-muted)] bg-[var(--color-bg-subtle)] border-b border-[var(--color-border)]">
                {t.branchesWithoutLocation}: {branchesWithoutLocationCount}
              </div>
            )}

            {/* Online (delivery) branches — fixed row above the map, not map pins */}
            {includeDelivery && onlineBranches.length > 0 && (
              <div className="shrink-0 -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8 py-2 flex items-center gap-2 overflow-x-auto bg-[var(--color-bg-subtle)] border-b border-[var(--color-border)]">
                {onlineBranches.map((b) => (
                  <div
                    key={b.id}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
                    style={{ backgroundColor: `${b.color_hex}1a`, color: b.color_hex }}
                  >
                    <Truck className="w-3.5 h-3.5" />
                    {b.name}
                  </div>
                ))}
              </div>
            )}

            {/* Map fills all remaining space down to the bottom nav. `flex` (not a
                percentage height) is deliberate: BranchMapContainer's child chain
                relies on flex stretch to get a definite height — a `h-full` child of
                a `display:block` flex-grown parent never resolves (Leaflet's panes are
                all `position:absolute`, so the box has no in-flow content to give it an
                auto height, and the percentage falls back to 0). See BranchMapContainer.tsx. */}
            <div className="flex-1 min-h-0 relative -mx-4 md:-mx-6 lg:-mx-8 flex">
              <BranchMapContainer
                city={t.telAviv}
                lang={lang}
                theme={theme}
                liveBranches={visibleBranches}
                activeMapPin={activeMapPin}
                setActiveMapPin={setActiveMapPin}
                preferredChainId={preferredChainId}
                comparison={comparison}
                userPosition={userPosition}
                youAreHereLabel={t.myLocation}
                t={t}
              />

              {/* City search fallback overlay (GPS denied) */}
              {locationStatus === 'denied' && (
                <div className="absolute top-3 end-3 z-[500] flex items-center gap-2 bg-[var(--color-bg-panel)]/95 backdrop-blur-md border border-[var(--color-border)] rounded-xl px-3 h-10 shadow-xl w-48">
                  <Search className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" />
                  <input
                    type="text"
                    value={cityQuery}
                    onChange={(e) => setCityQuery(e.target.value)}
                    placeholder={t.searchByCity}
                    className="bg-transparent outline-none text-xs text-[var(--color-text-primary)] w-full"
                    dir="auto"
                  />
                </div>
              )}

              {locationStatus === 'requesting' && (
                <div className="absolute top-3 end-3 z-[500] flex items-center gap-2 bg-[var(--color-bg-panel)]/95 backdrop-blur-md border border-[var(--color-border)] rounded-xl px-3 h-10 shadow-xl text-xs text-[var(--color-text-muted)]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t.currentGpsLocation}...
                </div>
              )}
            </div>
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
                  <div key={sb.id} className="relative bg-[var(--color-bg-panel)]/60 backdrop-blur-xl border border-[var(--color-border)] rounded-3xl p-6 shadow-xl hover:bg-[var(--color-bg-panel)] transition-colors cursor-pointer group">
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(sb.id); }}
                      aria-label={t.deleteAction}
                      className="absolute top-4 end-4 w-11 h-11 flex items-center justify-center rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-4 mb-4 pe-10">
                      <div className="w-12 h-12 bg-[var(--color-bg-subtle)] rounded-2xl flex items-center justify-center text-[var(--color-accent)]"><List className="w-6 h-6" /></div>
                      <div>
                        <h3 className="font-bold text-[var(--color-text-primary)]">{sb.name}</h3>
                        <p className="text-xs text-[var(--color-text-muted)]">{new Date(sb.updated_at).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}</p>
                      </div>
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)]">{sb.basket_items?.length ?? 0} {lang === 'he' ? 'פריטים' : 'items'}</p>
                    <button onClick={() => handleLoadSavedList(sb)}
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
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-bold text-[var(--color-text-primary)]">{t.navChat}</h2>
              <button
                onClick={() => { setIsChatSearchOpen((v) => !v); if (isChatSearchOpen) setChatSearchQuery(''); }}
                aria-label={t.chatSearchPlaceholder}
                className="w-11 h-11 flex items-center justify-center rounded-xl text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors"
              >
                {isChatSearchOpen ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
              </button>
            </div>
            <div className="bg-[var(--color-bg-panel)]/60 backdrop-blur-xl border border-[var(--color-border)] rounded-3xl p-6 shadow-xl flex flex-col" style={{ height: '60vh' }}>
              <AnimatePresence>
                {isChatSearchOpen && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div className="relative mb-4">
                      <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-[var(--color-text-muted)]" />
                      <input
                        type="text" value={chatSearchQuery} onChange={(e) => setChatSearchQuery(e.target.value)}
                        placeholder={t.chatSearchPlaceholder} autoFocus dir="auto"
                        className="w-full bg-[var(--color-bg-subtle)]/50 border border-[var(--color-border)] rounded-xl ps-9 pe-9 py-2.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                      />
                      {chatSearchQuery && (
                        <button onClick={() => setChatSearchQuery('')} className="absolute top-1/2 -translate-y-1/2 end-2 w-7 h-7 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="flex-1 overflow-y-auto space-y-3 mb-4 pe-2">
                {(() => {
                  const visibleMessages = chatSearchQuery.trim()
                    ? chatMessages.filter((m) => m.content.toLowerCase().includes(chatSearchQuery.trim().toLowerCase()))
                    : chatMessages;
                  if (chatSearchQuery.trim() && visibleMessages.length === 0) {
                    return <p className="text-center text-sm text-[var(--color-text-muted)] py-6">{t.chatNoResults}</p>;
                  }
                  return buildChatTimeline(visibleMessages, lang).map((entry) => {
                    if (entry.type === 'separator') {
                      return (
                        <div key={entry.key} className="flex justify-center py-1">
                          <span className="text-[11px] font-medium text-[var(--color-text-muted)] bg-[var(--color-bg-subtle)] rounded-full px-3 py-1">
                            {entry.label}
                          </span>
                        </div>
                      );
                    }
                    const msg = entry.msg;
                    return (
                      <div key={entry.key} className={`flex flex-col ${msg.user_id === currentUser?.id ? 'items-end' : 'items-start'}`}>
                        <div className={`px-4 py-2 rounded-2xl max-w-[80%] text-sm ${msg.user_id === currentUser?.id ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)]' : 'bg-[var(--color-bg-subtle)] text-[var(--color-text-primary)]'}`}>
                          <HighlightMatch text={msg.content} query={chatSearchQuery} />
                        </div>
                        <span className="text-[10px] text-[var(--color-text-muted)] mt-1">
                          {msg.nickname} · {formatMessageTimestamp(msg.created_at, lang)}
                        </span>
                      </div>
                    );
                  });
                })()}
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
        {currentView === 'COMMUNITY' && (
          <motion.div key={currentView} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}
            className="flex-1 flex flex-col items-center justify-center min-h-[50vh] bg-[var(--color-bg-panel)]/60 backdrop-blur-xl rounded-3xl border border-[var(--color-border)] shadow-xl p-8 text-center">
            <div className="w-20 h-20 bg-[var(--color-bg-subtle)]/50 rounded-2xl flex items-center justify-center mb-6 border border-[var(--color-border)]/50 text-[var(--color-accent)]">
              <Users className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-bold text-[var(--color-text-primary)] mb-2">{t.navCommunity}</h2>
            <p className="text-[var(--color-text-muted)]">{t.placeholderDesc}</p>
            <button onClick={() => setCurrentView('HOME')} className="mt-8 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-[var(--color-accent-text)] px-6 py-2 rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-[var(--color-accent)]/20">
              {t.backToHome}
            </button>
          </motion.div>
        )}

        {/* ═══ ANALYTICS ═══ */}
        {currentView === 'ANALYTICS' && (
          <AnalyticsView t={t} lang={lang} currentUserId={currentUser?.id ?? null} />
        )}

        {/* ═══ SCAN ═══ */}
        {currentView === 'SCAN' && (
          <motion.div key="SCAN" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}
            className="flex-1 flex flex-col gap-6 max-w-lg mx-auto w-full">

            <div className="text-center mt-6">
              <h2 className="text-2xl font-bold text-[var(--color-text-primary)] mb-1">{t.scanTitle}</h2>
              <p className="text-[var(--color-text-muted)] text-sm">{t.scanSubtitle}</p>
            </div>

            {/* Idle: camera not started yet — requires an explicit tap. Never
                auto-starts on mount, since getUserMedia calls with no
                preceding user gesture are what iOS Safari/Android Chrome
                silently block. */}
            {scanStage === 'idle' && (
              <div className="relative w-full aspect-[3/4] max-h-[420px] bg-black rounded-3xl overflow-hidden border border-[var(--color-border)] shadow-xl">
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center bg-[var(--color-bg-panel)]">
                  <Camera className="w-10 h-10 text-[var(--color-text-muted)]" />
                  {hasCameraSupport ? (
                    <button
                      onClick={handleStartScan}
                      className="min-h-[44px] px-6 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-[var(--color-accent-text)] rounded-xl font-semibold transition-colors shadow-lg shadow-[var(--color-accent)]/20"
                    >
                      {t.scanStartCamera}
                    </button>
                  ) : (
                    <p className="text-sm text-[var(--color-text-secondary)]">{t.scanNoCameraMsg}</p>
                  )}
                </div>
              </div>
            )}

            {/* Live camera viewfinder — shown only while actively scanning */}
            {scanStage === 'scanning' && (
              <div className="relative w-full aspect-[3/4] max-h-[420px] bg-black rounded-3xl overflow-hidden border border-[var(--color-border)] shadow-xl">
                {cameraStatus === 'denied' ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center bg-[var(--color-bg-panel)]">
                    <VideoOff className="w-10 h-10 text-[var(--color-text-muted)]" />
                    <p className="text-sm text-[var(--color-text-secondary)]">{t.scanCameraDeniedMsg}</p>
                    <button
                      onClick={handleStartScan}
                      className="min-h-[44px] px-5 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-[var(--color-accent-text)] rounded-xl font-semibold transition-colors"
                    >
                      {t.scanEnableCamera}
                    </button>
                  </div>
                ) : cameraStatus === 'unavailable' ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center bg-[var(--color-bg-panel)]">
                    <Camera className="w-10 h-10 text-[var(--color-text-muted)]" />
                    <p className="text-sm text-[var(--color-text-secondary)]">{t.scanNoCameraMsg}</p>
                  </div>
                ) : (
                  <>
                    <video ref={scanVideoRef} className="w-full h-full object-cover" muted playsInline autoPlay />
                    {/* Scanning overlay: centered rectangle with corner markers (CSS only) */}
                    <div className="absolute inset-8 pointer-events-none">
                      <div className="absolute top-0 start-0 w-8 h-8 border-t-4 border-s-4 border-white/90 rounded-tl-lg" />
                      <div className="absolute top-0 end-0 w-8 h-8 border-t-4 border-e-4 border-white/90 rounded-tr-lg" />
                      <div className="absolute bottom-0 start-0 w-8 h-8 border-b-4 border-s-4 border-white/90 rounded-bl-lg" />
                      <div className="absolute bottom-0 end-0 w-8 h-8 border-b-4 border-e-4 border-white/90 rounded-br-lg" />
                    </div>
                    <div className="absolute top-3 start-3 w-9 h-9 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-[var(--color-accent-text)] shadow-lg">
                      <ScanBarcode className="w-4 h-4" />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Looking up the scanned barcode */}
            {scanStage === 'looking-up' && (
              <div className="w-full flex flex-col items-center justify-center gap-3 py-16 bg-[var(--color-bg-panel)]/60 backdrop-blur-xl rounded-3xl border border-[var(--color-border)] shadow-xl">
                <Loader2 className="w-8 h-8 text-[var(--color-accent)] animate-spin" />
                <p className="text-sm text-[var(--color-text-muted)]">{t.scanFindingProduct}</p>
              </div>
            )}

            {/* Product found */}
            {scanStage === 'found' && scannedProduct && (
              <div className="w-full flex flex-col gap-4 bg-[var(--color-bg-panel)]/60 backdrop-blur-xl rounded-3xl border border-[var(--color-border)] shadow-xl p-6">
                <div>
                  <h3 className="font-bold text-lg text-[var(--color-text-primary)]">{scannedProduct.name_he}</h3>
                  {scannedProduct.name_en && <p className="text-sm text-[var(--color-text-muted)]">{scannedProduct.name_en}</p>}
                  {scannedProduct.category && <p className="text-xs text-[var(--color-text-muted)] mt-1">{scannedProduct.category}</p>}
                </div>
                <ChainPriceBreakdown prices={scannedProduct.prices} chains={chains} lang={lang} />
                <div className="flex gap-3">
                  <button
                    onClick={() => { handleAddProduct(scannedProduct); setCurrentView('HOME'); }}
                    className="flex-1 min-h-[44px] bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-[var(--color-accent-text)] rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-[var(--color-accent)]/20"
                  >
                    {t.scanAddToBasket}
                  </button>
                  <button
                    onClick={handleScanAgain}
                    className="flex-1 min-h-[44px] bg-[var(--color-bg-subtle)] hover:bg-[var(--color-bg-hover)] text-[var(--color-text-primary)] border border-[var(--color-border)] rounded-xl text-sm font-semibold transition-colors"
                  >
                    {t.scanAgain}
                  </button>
                </div>
              </div>
            )}

            {/* Product not found */}
            {scanStage === 'not-found' && (
              <div className="w-full flex flex-col items-center gap-3 bg-[var(--color-bg-panel)]/60 backdrop-blur-xl rounded-3xl border border-[var(--color-border)] shadow-xl p-6 text-center">
                <AlertCircle className="w-8 h-8 text-[var(--color-danger)]" />
                <p className="font-semibold text-[var(--color-text-primary)]">{t.scanNotFound}</p>
                {lastScannedBarcode && <p className="font-mono text-xs text-[var(--color-text-muted)]">{lastScannedBarcode}</p>}
                <div className="flex gap-3 w-full mt-1">
                  <button
                    onClick={handleScanAgain}
                    className="flex-1 min-h-[44px] bg-[var(--color-bg-subtle)] hover:bg-[var(--color-bg-hover)] text-[var(--color-text-primary)] border border-[var(--color-border)] rounded-xl text-sm font-semibold transition-colors"
                  >
                    {t.scanAgain}
                  </button>
                  <button
                    onClick={() => lastScannedBarcode && setScanBarcodeInput(lastScannedBarcode)}
                    className="flex-1 min-h-[44px] bg-[var(--color-accent)]/10 hover:bg-[var(--color-accent)]/20 text-[var(--color-accent)] border border-[var(--color-accent)]/20 rounded-xl text-sm font-semibold transition-colors"
                  >
                    {t.scanManually}
                  </button>
                </div>
              </div>
            )}

            {/* Manual barcode entry fallback */}
            <div className="bg-[var(--color-bg-panel)]/60 backdrop-blur-xl rounded-3xl border border-[var(--color-border)] shadow-xl p-6">
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-2">{t.scanManualLabel}</label>
              <form
                onSubmit={(e) => { e.preventDefault(); handleScanSearch(); }}
                className="flex gap-3"
              >
                <input
                  type="text"
                  inputMode="numeric"
                  value={scanBarcodeInput}
                  onChange={(e) => setScanBarcodeInput(e.target.value)}
                  placeholder={t.scanManualPlaceholder}
                  className="flex-1 min-h-[44px] bg-[var(--color-bg-subtle)]/50 border border-[var(--color-border)] rounded-xl px-4 text-[var(--color-text-primary)] font-mono focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                  dir="ltr"
                />
                <button
                  type="submit"
                  disabled={!scanBarcodeInput.trim() || isScanSearching}
                  className="min-h-[44px] px-5 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-[var(--color-accent-text)] rounded-xl font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isScanSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  {t.search}
                </button>
              </form>

              {scanSearched && !isScanSearching && (
                <div className="mt-4 flex flex-col gap-2">
                  {scanResults.length === 0 && (
                    <p className="text-sm text-[var(--color-text-muted)]">{t.noResults}</p>
                  )}
                  {scanResults.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleAddProduct(p)}
                      className="w-full flex items-center justify-between p-3 bg-[var(--color-bg-subtle)]/50 hover:bg-[var(--color-bg-hover)] rounded-xl border border-[var(--color-border)]/50 transition-colors text-start"
                    >
                      <span className="font-medium text-sm text-[var(--color-text-primary)]">{p.name_he}</span>
                      {p.min_price !== null && (
                        <span className="font-mono text-[var(--color-success)] text-sm shrink-0 ms-3">₪{p.min_price.toFixed(2)}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ═══ COUPONS ═══ */}
        {currentView === 'COUPONS' && (
          <motion.div key="COUPONS" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}
            className="flex-1 flex flex-col gap-6 max-w-lg mx-auto w-full">
            <div className="text-center mt-6">
              <div className="w-20 h-20 mx-auto bg-[var(--color-bg-subtle)]/50 rounded-2xl flex items-center justify-center mb-4 border border-[var(--color-border)]/50 text-[var(--color-accent)]">
                <Ticket className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-bold text-[var(--color-text-primary)] mb-1">{t.couponsTitle}</h2>
              <p className="text-[var(--color-text-muted)] text-sm">{t.couponsSubtitle}</p>
            </div>

            {/* Placeholder coupon cards (illustrative only, no real data) */}
            <div className="flex flex-col gap-3">
              {[
                { pct: '15%', color: 'var(--color-success)' },
                { pct: '20%', color: 'var(--color-accent)' },
                { pct: '10%', color: 'var(--color-warning)' },
              ].map((c, i) => (
                <div
                  key={i}
                  className="relative flex items-center gap-4 bg-[var(--color-bg-panel)]/60 border border-dashed border-[var(--color-border-strong)] rounded-2xl p-5 opacity-60 select-none"
                >
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0"
                    style={{ backgroundColor: c.color }}
                  >
                    {c.pct}
                  </div>
                  <div className="flex-1 h-3 bg-[var(--color-bg-subtle)] rounded-full" />
                  <Ticket className="w-5 h-5 text-[var(--color-text-muted)] shrink-0" />
                </div>
              ))}
            </div>

            {/* Waitlist signup */}
            <div className="bg-[var(--color-bg-panel)]/60 backdrop-blur-xl rounded-3xl border border-[var(--color-border)] shadow-xl p-6">
              <p className="text-sm font-medium text-[var(--color-text-primary)] mb-3 flex items-center gap-2">
                <Mail className="w-4 h-4 text-[var(--color-accent)]" /> {t.couponsNotifyMe}
              </p>
              <form onSubmit={handleJoinWaitlist} className="flex flex-col sm:flex-row gap-3">
                <input
                  type="email"
                  required
                  value={couponEmail}
                  onChange={(e) => setCouponEmail(e.target.value)}
                  placeholder={t.couponsEmailPlaceholder}
                  className="flex-1 min-h-[44px] bg-[var(--color-bg-subtle)]/50 border border-[var(--color-border)] rounded-xl px-4 text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                  dir="ltr"
                />
                <button
                  type="submit"
                  disabled={couponStatus === 'loading' || !couponEmail.trim()}
                  className="min-h-[44px] px-5 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-[var(--color-accent-text)] rounded-xl font-semibold transition-colors disabled:opacity-50"
                >
                  {couponStatus === 'loading' ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t.couponsJoinButton}
                </button>
              </form>
              {couponStatus === 'success' && (
                <p className="mt-3 text-sm font-bold text-[var(--color-success)] flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" /> {t.couponsJoined}
                </p>
              )}
              {couponStatus === 'error' && (
                <p className="mt-3 text-sm font-bold text-[var(--color-danger)] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> {t.couponsError}
                </p>
              )}
            </div>
          </motion.div>
        )}

      </AnimatePresence>

      {/* ── Footer (hidden on LOCATION so the map truly fills all remaining space) ── */}
      {currentView !== 'LOCATION' && (
        <footer className="mt-8 pt-6 border-t border-[var(--color-border)]/50 flex justify-center md:justify-end">
          <div className="flex items-center gap-2 bg-[var(--color-bg-panel)]/50 px-4 py-2 rounded-full border border-[var(--color-border)]/50 opacity-60">
            <div className="w-2 h-2 rounded-full bg-[var(--color-success)] animate-pulse" />
            <span className="text-xs font-mono text-[var(--color-text-muted)]">{t.devOptionsLocked}</span>
          </div>
        </footer>
      )}

      <BottomNav currentView={currentView} setCurrentView={setCurrentView} t={t} />

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
                <DrawerItem view="PROFILE"       currentView={currentView} setCurrentView={setCurrentView} icon={User}         label={t.navProfile}      close={() => setIsDrawerOpen(false)} />
                <DrawerItem view="SAVED_LISTS"   currentView={currentView} setCurrentView={setCurrentView} icon={List}         label={t.navSavedLists}   close={() => setIsDrawerOpen(false)} />
                <DrawerItem view="CHAT"          currentView={currentView} setCurrentView={setCurrentView} icon={MessageSquare} label={t.navChat}         close={() => setIsDrawerOpen(false)} />
                <DrawerItem view="ANALYTICS" currentView={currentView} setCurrentView={setCurrentView} icon={TrendingDown} label={t.navAnalytics} close={() => setIsDrawerOpen(false)} />
                <DrawerItem view="COMMUNITY"     currentView={currentView} setCurrentView={setCurrentView} icon={Users}        label={t.navCommunity}    close={() => setIsDrawerOpen(false)} />
                <button onClick={() => { setIsDrawerOpen(false); setIsSupportOpen(true); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] transition-colors">
                  <LifeBuoy className="w-5 h-5" /> {t.supportChannel}
                </button>
              </div>
              <div className="p-4 border-t border-[var(--color-border)]">
                <button onClick={async () => {
                  if (supabase) await supabase.auth.signOut();
                  setCurrentUser(null); setIsDrawerOpen(false); setCurrentView('HOME');
                }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 rounded-xl transition-colors">
                  <LogOut className="w-5 h-5" /> {t.signOut}
                </button>
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

      <Toast message={toastMsg} />

      {/* ── About sheet ── */}
      <AnimatePresence>
        {isAboutOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsAboutOpen(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative bg-[var(--color-bg-panel)] border border-[var(--color-border)] shadow-2xl rounded-3xl w-full max-w-sm overflow-hidden text-center">
              <div className="p-8 flex flex-col items-center gap-3">
                <div className="w-14 h-14 bg-[var(--color-accent)] rounded-2xl flex items-center justify-center text-[var(--color-accent-text)] shadow-lg shadow-[var(--color-accent)]/20">
                  <ShoppingCart className="w-7 h-7" />
                </div>
                <h2 className="text-xl font-bold text-[var(--color-text-primary)]">{t.aboutTitle}</h2>
                <p className="text-sm text-[var(--color-text-muted)]">{t.aboutTagline}</p>
                <p className="text-xs text-[var(--color-text-muted)] font-mono mt-2">{t.aboutVersion} 1.0.0</p>
                <button
                  onClick={() => setIsAboutOpen(false)}
                  className="mt-4 w-full min-h-[44px] bg-[var(--color-bg-subtle)] hover:bg-[var(--color-bg-hover)] text-[var(--color-text-primary)] border border-[var(--color-border)] rounded-xl font-semibold transition-colors"
                >
                  {t.close}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Delete saved-list confirmation ── */}
      <AnimatePresence>
        {deleteConfirmId && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirmId(null)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative bg-[var(--color-bg-panel)] border border-[var(--color-border)] shadow-2xl rounded-3xl w-full max-w-sm overflow-hidden">
              <div className="p-6 flex flex-col gap-5">
                <p className="text-center font-semibold text-[var(--color-text-primary)]">{t.deleteListConfirm}</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setDeleteConfirmId(null)}
                    className="flex-1 min-h-[44px] bg-[var(--color-bg-subtle)] hover:bg-[var(--color-bg-hover)] text-[var(--color-text-primary)] border border-[var(--color-border)] rounded-xl font-semibold transition-colors"
                  >
                    {t.cancelAction}
                  </button>
                  <button
                    onClick={() => handleDeleteSavedList(deleteConfirmId)}
                    className="flex-1 min-h-[44px] bg-[var(--color-danger)] hover:opacity-90 text-white rounded-xl font-semibold transition-colors"
                  >
                    {t.deleteAction}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
