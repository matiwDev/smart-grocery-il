'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ShoppingCart, ExternalLink, TrendingDown,
  LogOut, Globe, User, X, Home, List, Users, Search,
  ChevronDown,
  LifeBuoy, MessageCircle, MessageSquare, CheckCircle, AlertCircle,
  Loader2, Bell, Copy, UserPlus, Sun, Moon,
  ScanBarcode, Camera, VideoOff, Trash2,
  Store, Bookmark, Plus,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line,
} from 'recharts';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { AuthModal, AuthMode } from '@/components/AuthModal';
import { supabase } from '@/utils/supabase';
import { DebugPanel } from '@/components/DebugPanel';
import { isDebugAllowed } from '@/lib/debug';
import { ShoppingList } from '@/components/ShoppingList';
import { ItemEditSheet, ItemEditValues } from '@/components/ItemEditSheet';
import { DoneShoppingSheet } from '@/components/DoneShoppingSheet';
import { RecentTrips } from '@/components/RecentTrips';
import {
  BasketItem, BasketItemRow, ChainMeta, ChainPrice, OverrideMap,
  effective, unitPrice, estimate, rowToBasketItem, itemToRow, loadOverrides, uploadItemPhoto,
} from '@/lib/list';
import { categoryLabel, normalizeCategory } from '@/lib/categories';

type Lang = 'he' | 'en';
type View = 'HOME' | 'PROFILE' | 'SAVED_LISTS' | 'ANALYTICS' | 'COMMUNITY' | 'CHAT' | 'SCAN';
type Theme = 'light' | 'dark';

const BOTTOM_NAV_TABS: { view: View; icon: React.ComponentType<{ className?: string }> }[] = [
  { view: 'HOME', icon: Home },
  { view: 'SCAN', icon: ScanBarcode },
  { view: 'SAVED_LISTS', icon: Bookmark },
  { view: 'ANALYTICS', icon: TrendingDown },
];

const THEME_STORAGE_KEY = 'sg_theme';

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface UserProfile {
  id?: string;
  nickname: string;
  email: string;
  phone: string;
  avatar: string;
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
    analyticsChainRankingTitle: 'הרשת הזולה עבורכם',
    analyticsTrendTitle: 'מגמת מחיר למוצר',
    analyticsTrendSearchPlaceholder: 'הקלד שם מוצר...',
    analyticsNotEnoughHistory: 'אין מספיק היסטוריה עדיין — בדקו שוב מחר',
    analyticsEmptyRanking: 'אין עדיין נתוני מחירים',
    analyticsSpendingOverviewTitle: 'סקירת הוצאות',
    analyticsWeeklyAverage: 'ממוצע שבועי',
    analyticsMonthTotal: 'סה״כ הוצאות החודש',
    analyticsChainsSpendingLine: 'רשתות שיווק',
    analyticsOtherExpenses: 'הוצאות נוספות',
    analyticsNotEnoughSpendingData: 'עדיין אין מספיק נתונים — המשיכו לקנות כדי לראות את המגמות שלכם!',
    analyticsNoPurchasesYetTitle: 'עוד לא ביצעתם קניות',
    analyticsNoPurchasesYetSubtitle: 'הוסיפו מוצרים לסל והשוו מחירים כדי לראות את הסטטיסטיקות שלכם',
    savedListsEmptyTitle: 'אין רשימות שמורות',
    savedListsEmptySubtitle: 'שמרו רשימת קניות מהמסך הראשי',
    analyticsMonthlyBreakdownTitle: 'פירוט חודשי אחרון',
    analyticsColMonth: 'חודש',
    analyticsColTotal: 'סה״כ',
    analyticsColAvgWeek: 'ממוצע לשבוע',
    analyticsColTrips: 'קניות',
    analyticsAnnualProjection: 'תחזית שנתית',
    analyticsAnnualToDate: 'סה״כ שנתי עד כה',
    analyticsCustomMarketsLine: 'שווקים מקומיים',
    analyticsChainRankingForYou: 'עבורך',
    analyticsChainRankingGeneral: 'כללי',
    analyticsMonthlyBasketTitle: 'סיכום סל חודשי',
    analyticsMonthlyBasketProductsLabel: 'מוצרים החודש',
    analyticsMonthlyBasketItemsLabel: 'פריטים',
    analyticsEmptyMonthlyBasket: 'עדיין לא נוספו מוצרים החודש',
    analyticsExportList: 'ייצוא רשימה',
    analyticsExportCopiedToast: 'הרשימה הועתקה',
    analyticsExportHeader: 'רשימת קניות',
    analyticsCustomMarketsTitle: 'שווקים מקומיים',
    analyticsAddMarket: 'הוסף שוק',
    analyticsMarketNamePlaceholder: 'שם השוק',
    analyticsAddExpense: 'הוסף הוצאה',
    analyticsExpenseAmountPlaceholder: 'סכום (₪)',
    analyticsExpenseNotePlaceholder: 'הערה (לא חובה)',
    analyticsNoMarketsYet: 'טרם הוספתם שווקים מקומיים',
    analyticsNoMarketsYetSubtitle: 'הוסיפו שוק או חנות מקומית למעקב הוצאות',
    saveAction: 'שמור',
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
    basketRestoredToast: 'הסל שלך שוחזר',
    listDeletedToast: 'הרשימה נמחקה',
    deleteListConfirm: 'למחוק רשימה זו?',
    deleteAction: 'מחק',
    cancelAction: 'ביטול',
    duplicateListConfirm: 'רשימה בשם זה כבר קיימת. להחליף אותה?',
    replaceAction: 'החלף',
    saveAsNewAction: 'שמור כחדש',
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
    chainInDevelopment: 'בפיתוח',
    chainInDevelopmentToast: 'רשת זו עדיין בפיתוח ותתווסף בקרוב',
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
    // Phase 15 — basket view modes
    basketModeSmart: 'חכם', basketModeChain: 'רשת', basketModeCompare: 'השוואה',
    notAvailable: 'לא זמין',
    // Phase 18 — branch-level pricing confidence indicators
    matchTypeChainFallback: '⚠ מחיר ממוצע',
    matchTypeNotLocal: 'לא נמצא בסניפים קרובים',
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
    analyticsChainRankingTitle: 'Cheapest chain for you',
    analyticsTrendTitle: 'Price trend for a product',
    analyticsTrendSearchPlaceholder: 'Type a product name...',
    analyticsNotEnoughHistory: 'Not enough history yet — check back tomorrow',
    analyticsEmptyRanking: 'No price data yet',
    analyticsSpendingOverviewTitle: 'Spending Overview',
    analyticsWeeklyAverage: 'Weekly average',
    analyticsMonthTotal: 'Total expenses this month',
    analyticsChainsSpendingLine: 'Supermarket chains',
    analyticsOtherExpenses: 'Other expenses',
    analyticsNotEnoughSpendingData: 'Not enough data yet — keep shopping to see your trends!',
    analyticsNoPurchasesYetTitle: 'No purchases yet',
    analyticsNoPurchasesYetSubtitle: 'Add products to your basket and compare prices to see your statistics',
    savedListsEmptyTitle: 'No saved lists yet',
    savedListsEmptySubtitle: 'Save a shopping list from the home screen',
    analyticsMonthlyBreakdownTitle: 'Recent monthly breakdown',
    analyticsColMonth: 'Month',
    analyticsColTotal: 'Total',
    analyticsColAvgWeek: 'Avg per week',
    analyticsColTrips: 'Trips',
    analyticsAnnualProjection: 'Annual projection',
    analyticsAnnualToDate: 'Annual total to date',
    analyticsCustomMarketsLine: 'Local markets',
    analyticsChainRankingForYou: 'For you',
    analyticsChainRankingGeneral: 'General',
    analyticsMonthlyBasketTitle: 'Monthly Basket Summary',
    analyticsMonthlyBasketProductsLabel: 'products this month',
    analyticsMonthlyBasketItemsLabel: 'items',
    analyticsEmptyMonthlyBasket: 'No products added yet this month',
    analyticsExportList: 'Export list',
    analyticsExportCopiedToast: 'List copied',
    analyticsExportHeader: 'Shopping list',
    analyticsCustomMarketsTitle: 'Local Markets',
    analyticsAddMarket: 'Add market',
    analyticsMarketNamePlaceholder: 'Market name',
    analyticsAddExpense: 'Add expense',
    analyticsExpenseAmountPlaceholder: 'Amount (₪)',
    analyticsExpenseNotePlaceholder: 'Note (optional)',
    analyticsNoMarketsYet: 'No local markets added yet',
    analyticsNoMarketsYetSubtitle: 'Add a local market or shop to track spending',
    saveAction: 'Save',
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
    basketRestoredToast: 'Your basket restored',
    listDeletedToast: 'List deleted',
    deleteListConfirm: 'Delete this list?',
    deleteAction: 'Delete',
    cancelAction: 'Cancel',
    duplicateListConfirm: 'A list with this name already exists. Replace it?',
    replaceAction: 'Replace',
    saveAsNewAction: 'Save as new',
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
    chainInDevelopment: 'In development',
    chainInDevelopmentToast: 'This chain is still in development and coming soon',
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
    // Phase 15 — basket view modes
    basketModeSmart: 'Smart', basketModeChain: 'Chain', basketModeCompare: 'Compare',
    notAvailable: 'N/A',
    // Phase 18 — branch-level pricing confidence indicators
    matchTypeChainFallback: '⚠ Average price',
    matchTypeNotLocal: 'Not found at nearby branches',
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
    HOME: t.navHome, SCAN: t.navScan, SAVED_LISTS: t.navSavedLists, ANALYTICS: t.navAnalytics,
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

// Freshness badge for a price's captured_at (Phase 18). Deliberately absent
// from collapsed rows — only shown in an expanded fold-down / breakdown, per
// spec, to keep the compact list clean.
function formatFreshness(capturedAt: string | undefined, lang: Lang): { emoji: string; label: string } | null {
  if (!capturedAt) return null;
  const hoursAgo = (Date.now() - new Date(capturedAt).getTime()) / (1000 * 60 * 60);
  if (!Number.isFinite(hoursAgo) || hoursAgo < 0) return null;
  if (hoursAgo < 6) return { emoji: '🟢', label: lang === 'he' ? 'עודכן היום' : 'Updated today' };
  if (hoursAgo < 24) return { emoji: '🟡', label: lang === 'he' ? 'עודכן אתמול' : 'Updated yesterday' };
  if (hoursAgo < 72) {
    const days = Math.floor(hoursAgo / 24);
    return { emoji: '🟠', label: lang === 'he' ? `לפני ${days} ימים` : `${days} days ago` };
  }
  return { emoji: '🔴', label: lang === 'he' ? 'מחיר ישן' : 'Price may be outdated' };
}

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
          const freshness = formatFreshness(cp.captured_at, lang);
          return (
            <div
              key={cid}
              className={`flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded-lg ${
                isCheapest ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]' :
                isExpensive ? 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]' :
                'text-[var(--color-text-muted)]'
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate">{cName}</span>
              </span>
              <span className="text-end shrink-0">
                <span className="font-mono font-medium block">₪{cp.price.toFixed(2)}</span>
                {unitLine && <span className="block text-[10px] opacity-70 font-mono">{unitLine}</span>}
                {freshness && (
                  <span className="block text-[10px] opacity-70" title={freshness.label}>
                    {freshness.emoji} {freshness.label}
                  </span>
                )}
              </span>
            </div>
          );
        })}
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

interface PersonalChainRankingEntry {
  chain_id: string;
  name_he: string;
  name_en: string;
  color_hex: string;
  total_cost: number;
  items_covered: number;
}

interface MonthlyBreakdownEntry {
  month: string; // YYYY-MM
  total: number;
  avg_per_week: number;
  trips: number;
}

interface SpendingOverview {
  not_enough_data: boolean;
  basket_total?: number;
  custom_total?: number;
  combined_total?: number;
  weekly_avg?: number;
  monthly_breakdown?: MonthlyBreakdownEntry[];
  annual_projection?: number;
  annual_total_to_date?: number;
}

interface MonthlyBasketProduct {
  product_id: string;
  name_he: string;
  name_en: string | null;
  category: string | null;
  total_qty: number;
  cheapest_price: number | null;
}

interface CustomMarketEntry {
  id: string;
  amount: number;
  note: string | null;
  spent_at: string;
}

interface MonthlyCustomEntry {
  market_name: string;
  amount: number;
  note: string | null;
  spent_at: string;
}

interface CustomMarket {
  id: string;
  name: string;
  total_spent: number;
  recent_entries: CustomMarketEntry[];
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

// Groups price_trend points (monthly averages from product_price_monthly) into one row per date (recharts wants a flat
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

// Shown in the basket panel while the login-time rehydration fetch is in
// flight, so a reload never flashes an empty basket before the real one loads.
function BasketSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="w-full h-14 rounded-xl bg-[var(--color-bg-subtle)] animate-[pulse_1.5s_ease-in-out_infinite]" />
      ))}
    </div>
  );
}

function AnalyticsEmptyState({ text }: { text: string }) {
  return <p className="text-sm text-[var(--color-text-muted)] text-center py-6">{text}</p>;
}

// Icon + title + subtext empty state, used where a bare line of muted text
// isn't enough context on its own (analytics with no history, no local
// markets, no saved lists).
function IconEmptyState({ icon: Icon, title, subtitle }: { icon: React.ComponentType<{ className?: string }>; title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-8 px-4">
      <Icon className="w-10 h-10 mb-3 text-[var(--color-text-muted)] opacity-40" />
      <p className="text-sm font-medium text-[var(--color-text-primary)]">{title}</p>
      <p className="text-xs text-[var(--color-text-muted)] mt-1.5 max-w-xs">{subtitle}</p>
    </div>
  );
}

function AnalyticsView({ t, lang, currentUserId, showToast }: { t: Dictionary; lang: Lang; currentUserId: string | null; showToast: (msg: string) => void }) {
  // Section A — spending overview
  const [spending, setSpending] = useState<SpendingOverview | null>(null);
  const [spendingLoading, setSpendingLoading] = useState(true);
  const [spendingExpanded, setSpendingExpanded] = useState(false);

  // Section B — chain ranking (general vs. personal)
  const [rankingTab, setRankingTab] = useState<'personal' | 'general'>('personal');
  const [ranking, setRanking] = useState<ChainRankingEntry[]>([]);
  const [rankingLoading, setRankingLoading] = useState(true);
  const [personalRanking, setPersonalRanking] = useState<PersonalChainRankingEntry[]>([]);
  const [personalRankingLoading, setPersonalRankingLoading] = useState(true);

  // Section C — monthly basket summary
  const [monthlyBasket, setMonthlyBasket] = useState<MonthlyBasketProduct[]>([]);
  const [monthlyBasketTotalItems, setMonthlyBasketTotalItems] = useState(0);
  const [monthlyCustomEntries, setMonthlyCustomEntries] = useState<MonthlyCustomEntry[]>([]);
  const [monthlyCustomTotal, setMonthlyCustomTotal] = useState(0);
  const [monthlyBasketLoading, setMonthlyBasketLoading] = useState(true);
  const [monthlyBasketExpanded, setMonthlyBasketExpanded] = useState(false);

  // Section D — custom markets
  const [markets, setMarkets] = useState<CustomMarket[]>([]);
  const [marketsLoading, setMarketsLoading] = useState(true);
  const [isAddingMarket, setIsAddingMarket] = useState(false);
  const [newMarketName, setNewMarketName] = useState('');
  const [expenseFormMarketId, setExpenseFormMarketId] = useState<string | null>(null);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState('');
  const [expenseNote, setExpenseNote] = useState('');

  const [trendQuery, setTrendQuery] = useState('');
  const [trendResults, setTrendResults] = useState<TrendSearchResult[]>([]);
  const [trendSelected, setTrendSelected] = useState<TrendSearchResult | null>(null);
  const [trendData, setTrendData] = useState<Array<Record<string, string | number>>>([]);
  const [trendChainsPresent, setTrendChainsPresent] = useState<ChainMeta[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendHasEnough, setTrendHasEnough] = useState(true);

  const loadMarkets = useCallback(() => {
    if (!currentUserId) { setMarketsLoading(false); return; }
    setMarketsLoading(true);
    fetch(`/api/analytics?type=custom_markets&user_id=${currentUserId}`)
      .then((r) => r.json()).then((d) => setMarkets(d.markets ?? []))
      .finally(() => setMarketsLoading(false));
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) {
      setSpendingLoading(false);
      setPersonalRankingLoading(false);
      setMonthlyBasketLoading(false);
      return;
    }
    setSpendingLoading(true);
    fetch(`/api/analytics?type=spending_overview&user_id=${currentUserId}`)
      .then((r) => r.json()).then((d) => setSpending(d))
      .finally(() => setSpendingLoading(false));

    setPersonalRankingLoading(true);
    fetch(`/api/analytics?type=personal_chain_ranking&user_id=${currentUserId}`)
      .then((r) => r.json()).then((d) => setPersonalRanking(d.ranking ?? []))
      .finally(() => setPersonalRankingLoading(false));

    setMonthlyBasketLoading(true);
    fetch(`/api/analytics?type=monthly_basket&user_id=${currentUserId}`)
      .then((r) => r.json()).then((d) => {
        setMonthlyBasket(d.products ?? []);
        setMonthlyBasketTotalItems(d.total_items ?? 0);
        setMonthlyCustomEntries(d.custom_entries ?? []);
        setMonthlyCustomTotal(d.custom_total ?? 0);
      })
      .finally(() => setMonthlyBasketLoading(false));

    loadMarkets();
  }, [currentUserId, loadMarkets]);

  useEffect(() => {
    setRankingLoading(true);
    fetch('/api/analytics?type=chain_ranking')
      .then((r) => r.json()).then((d) => setRanking(d.ranking ?? []))
      .finally(() => setRankingLoading(false));
  }, []);

  const handleAddMarket = async () => {
    if (!supabase || !currentUserId || !newMarketName.trim()) return;
    const { error } = await supabase.from('custom_markets').insert({ user_id: currentUserId, name: newMarketName.trim() });
    if (!error) {
      setNewMarketName('');
      setIsAddingMarket(false);
      loadMarkets();
    }
  };

  const handleOpenExpenseForm = (marketId: string) => {
    setExpenseFormMarketId(marketId);
    setExpenseAmount('');
    setExpenseNote('');
    setExpenseDate(new Date().toISOString().slice(0, 10));
  };

  const handleAddExpense = async () => {
    if (!supabase || !expenseFormMarketId) return;
    const amount = parseFloat(expenseAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const { error } = await supabase.from('custom_market_entries').insert({
      market_id: expenseFormMarketId,
      amount,
      note: expenseNote.trim() || null,
      spent_at: expenseDate || new Date().toISOString().slice(0, 10),
    });
    if (!error) {
      setExpenseFormMarketId(null);
      loadMarkets();
    }
  };

  const handleDeleteExpense = async (entryId: string) => {
    if (!supabase) return;
    setMarkets((prev) => prev.map((m) => ({ ...m, recent_entries: m.recent_entries.filter((e) => e.id !== entryId) })));
    await supabase.from('custom_market_entries').delete().eq('id', entryId);
    loadMarkets();
  };

  const handleExportMonthlyBasket = async () => {
    const now = new Date();
    const monthLabel = now.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { month: 'long', year: 'numeric' });
    const lines = [`${t.analyticsExportHeader} ${monthLabel}`];
    for (const p of monthlyBasket) {
      const name = lang === 'he' ? p.name_he : (p.name_en ?? p.name_he);
      lines.push(`• ${name} x${p.total_qty}`);
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      showToast(t.analyticsExportCopiedToast);
    } catch {}
  };

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
      const res = await fetch(`/api/analytics?type=price_trend&product_id=${p.id}&months=12`);
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

      {/* A: spending overview */}
      <div className={cardClass}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-[var(--color-text-primary)]">{t.analyticsSpendingOverviewTitle}</h3>
          {spending && !spending.not_enough_data && (
            <button
              onClick={() => setSpendingExpanded((v) => !v)}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] transition-colors"
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${spendingExpanded ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
        {spendingLoading ? (
          <SkeletonBlock height={80} />
        ) : !spending || spending.not_enough_data ? (
          <IconEmptyState icon={ShoppingCart} title={t.analyticsNoPurchasesYetTitle} subtitle={t.analyticsNoPurchasesYetSubtitle} />
        ) : (
          <>
            {/* Collapsed: one combined number — basket spending (cheapest chain
                prices) + custom market entries, this month. */}
            <div>
              <p className="text-xs text-[var(--color-text-muted)] mb-1">{t.analyticsMonthTotal}</p>
              <p className="text-3xl font-bold text-[var(--color-text-primary)]">₪{(spending.combined_total ?? 0).toFixed(2)}</p>
            </div>
            <AnimatePresence>
              {spendingExpanded && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="mt-5 pt-5 border-t border-[var(--color-border)]">
                    {/* Breakdown: chains vs. local markets vs. total, this month */}
                    <div className="flex flex-col gap-2 mb-5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[var(--color-text-muted)]">{t.analyticsChainsSpendingLine}</span>
                        <span className="text-[var(--color-text-primary)] font-medium">₪{(spending.basket_total ?? 0).toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[var(--color-text-muted)]">{t.analyticsCustomMarketsLine}</span>
                        <span className="text-[var(--color-text-primary)] font-medium">₪{(spending.custom_total ?? 0).toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-[var(--color-border)]">
                        <span className="text-[var(--color-text-primary)] font-semibold">{t.analyticsColTotal}</span>
                        <span className="text-[var(--color-text-primary)] font-bold text-lg">₪{(spending.combined_total ?? 0).toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mb-5">
                      <div>
                        <p className="text-xs text-[var(--color-text-muted)] mb-1">{t.analyticsWeeklyAverage}</p>
                        <p className="text-lg font-bold text-[var(--color-text-primary)]">₪{(spending.weekly_avg ?? 0).toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[var(--color-text-muted)] mb-1">{t.analyticsAnnualProjection}</p>
                        <p className="text-lg font-bold text-[var(--color-text-primary)]">₪{(spending.annual_projection ?? 0).toFixed(2)}</p>
                      </div>
                    </div>
                    <p className="text-xs font-semibold text-[var(--color-text-muted)] mb-2">{t.analyticsMonthlyBreakdownTitle}</p>
                    <div className="overflow-x-auto -mx-1">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-[var(--color-text-muted)] text-start">
                            <th className="font-medium text-start px-1 pb-2">{t.analyticsColMonth}</th>
                            <th className="font-medium text-start px-1 pb-2">{t.analyticsColTotal}</th>
                            <th className="font-medium text-start px-1 pb-2">{t.analyticsColAvgWeek}</th>
                            <th className="font-medium text-start px-1 pb-2">{t.analyticsColTrips}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(spending.monthly_breakdown ?? []).map((m) => (
                            <tr key={m.month} className="border-t border-[var(--color-border)]">
                              <td className="px-1 py-2 text-[var(--color-text-primary)]">{m.month}</td>
                              <td className="px-1 py-2 text-[var(--color-text-primary)]">₪{m.total.toFixed(2)}</td>
                              <td className="px-1 py-2 text-[var(--color-text-muted)]">₪{m.avg_per_week.toFixed(2)}</td>
                              <td className="px-1 py-2 text-[var(--color-text-muted)]">{m.trips}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-4">
                      <p className="text-xs text-[var(--color-text-muted)] mb-1">{t.analyticsAnnualToDate}</p>
                      <p className="text-lg font-bold text-[var(--color-text-primary)]">₪{(spending.annual_total_to_date ?? 0).toFixed(2)}</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>

      {/* B: cheapest chain ranking — personal vs. general */}
      <div className={cardClass}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-[var(--color-text-primary)]">{t.analyticsChainRankingTitle}</h3>
          <div className="flex items-center gap-1 bg-[var(--color-bg-subtle)] rounded-lg p-1">
            <button
              onClick={() => setRankingTab('personal')}
              className={`px-3 h-7 rounded-md text-xs font-medium transition-colors ${rankingTab === 'personal' ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)]' : 'text-[var(--color-text-muted)]'}`}
            >
              {t.analyticsChainRankingForYou}
            </button>
            <button
              onClick={() => setRankingTab('general')}
              className={`px-3 h-7 rounded-md text-xs font-medium transition-colors ${rankingTab === 'general' ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)]' : 'text-[var(--color-text-muted)]'}`}
            >
              {t.analyticsChainRankingGeneral}
            </button>
          </div>
        </div>
        {rankingTab === 'personal' ? (
          personalRankingLoading ? (
            <SkeletonBlock height={180} />
          ) : personalRanking.length === 0 ? (
            <AnalyticsEmptyState text={t.analyticsEmptyRanking} />
          ) : (
            <div style={{ width: '100%', height: Math.max(120, personalRanking.length * 48) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={personalRanking} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 4 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey={lang === 'he' ? 'name_he' : 'name_en'} width={90} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(value) => [`₪${value}`, '']} />
                  <Bar dataKey="total_cost" radius={[0, 8, 8, 0]} barSize={22}>
                    {personalRanking.map((r) => <Cell key={r.chain_id} fill={r.color_hex} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )
        ) : rankingLoading ? (
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

      {/* C: monthly basket summary */}
      <div className={cardClass}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="font-semibold text-[var(--color-text-primary)]">{t.analyticsMonthlyBasketTitle}</h3>
            {!monthlyBasketLoading && (
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                {monthlyBasket.length} {t.analyticsMonthlyBasketProductsLabel}, {t.analyticsColTotal} {monthlyBasketTotalItems} {t.analyticsMonthlyBasketItemsLabel}
              </p>
            )}
          </div>
          {(monthlyBasket.length > 0 || monthlyCustomEntries.length > 0) && (
            <button
              onClick={() => setMonthlyBasketExpanded((v) => !v)}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] transition-colors shrink-0"
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${monthlyBasketExpanded ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
        {monthlyBasketLoading ? (
          <SkeletonBlock height={60} />
        ) : monthlyBasket.length === 0 && monthlyCustomEntries.length === 0 ? (
          <AnalyticsEmptyState text={t.analyticsEmptyMonthlyBasket} />
        ) : (
          <AnimatePresence>
            {monthlyBasketExpanded && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
                  {Object.entries(
                    monthlyBasket.reduce<Record<string, MonthlyBasketProduct[]>>((acc, p) => {
                      const cat = p.category ?? 'other';
                      (acc[cat] ??= []).push(p);
                      return acc;
                    }, {})
                  ).map(([cat, products]) => (
                    <div key={cat} className="mb-4 last:mb-0">
                      <p className="text-xs font-semibold text-[var(--color-text-muted)] mb-1.5">{categoryLabel(cat, lang)}</p>
                      {products.map((p) => (
                        <div key={p.product_id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                          <span className="text-[var(--color-text-primary)] truncate">{lang === 'he' ? p.name_he : (p.name_en ?? p.name_he)}</span>
                          <span className="text-[var(--color-text-muted)] shrink-0">×{p.total_qty} {p.cheapest_price != null ? `· ₪${p.cheapest_price.toFixed(2)}` : ''}</span>
                        </div>
                      ))}
                    </div>
                  ))}

                  {monthlyBasket.length > 0 && (
                    <button
                      onClick={handleExportMonthlyBasket}
                      className="w-full mt-2 min-h-[40px] bg-[var(--color-accent)]/10 hover:bg-[var(--color-accent)]/20 text-[var(--color-accent)] rounded-xl text-sm font-semibold transition-colors"
                    >
                      {t.analyticsExportList}
                    </button>
                  )}

                  {monthlyCustomEntries.length > 0 && (
                    <div className={monthlyBasket.length > 0 ? 'mt-4 pt-4 border-t border-[var(--color-border)]' : ''}>
                      <p className="text-xs font-semibold text-[var(--color-text-muted)] mb-1.5">{t.analyticsOtherExpenses}</p>
                      {monthlyCustomEntries.map((e, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                          <span className="text-[var(--color-text-primary)] truncate">
                            {e.market_name} — {e.spent_at}{e.note ? ` — ${e.note}` : ''}
                          </span>
                          <span className="text-[var(--color-text-muted)] shrink-0">₪{Number(e.amount).toFixed(2)}</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between gap-3 pt-2 mt-1 border-t border-[var(--color-border)] text-sm font-semibold">
                        <span className="text-[var(--color-text-primary)]">{t.analyticsColTotal}</span>
                        <span className="text-[var(--color-text-primary)]">₪{monthlyCustomTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      {/* D: custom markets */}
      <div className={cardClass}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-[var(--color-text-primary)]">{t.analyticsCustomMarketsTitle}</h3>
          <button
            onClick={() => setIsAddingMarket((v) => !v)}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 transition-colors"
          >
            <span className="text-xl leading-none">+</span>
          </button>
        </div>

        {isAddingMarket && (
          <div className="flex items-center gap-2 mb-4">
            <input
              type="text" value={newMarketName} onChange={(e) => setNewMarketName(e.target.value)}
              placeholder={t.analyticsMarketNamePlaceholder} dir="auto"
              className="flex-1 bg-[var(--color-bg-subtle)]/50 border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
            />
            <button onClick={handleAddMarket} className="min-h-[40px] px-4 bg-[var(--color-accent)] text-[var(--color-accent-text)] rounded-xl text-sm font-semibold">
              {t.saveAction}
            </button>
          </div>
        )}

        {marketsLoading ? (
          <SkeletonBlock height={100} />
        ) : markets.length === 0 ? (
          <IconEmptyState icon={Store} title={t.analyticsNoMarketsYet} subtitle={t.analyticsNoMarketsYetSubtitle} />
        ) : (
          <div className="flex flex-col gap-3">
            {markets.map((m) => (
              <div key={m.id} className="bg-[var(--color-bg-subtle)]/50 border border-[var(--color-border)] rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium text-[var(--color-text-primary)]">{m.name}</p>
                  <p className="text-sm font-bold text-[var(--color-text-primary)]">₪{m.total_spent.toFixed(2)}</p>
                </div>

                {expenseFormMarketId === m.id ? (
                  <div className="flex flex-col gap-2 mt-2">
                    <input
                      type="number" step="0.01" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)}
                      placeholder={t.analyticsExpenseAmountPlaceholder}
                      className="bg-[var(--color-bg-panel)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
                    />
                    <input
                      type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)}
                      className="bg-[var(--color-bg-panel)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
                    />
                    <input
                      type="text" value={expenseNote} onChange={(e) => setExpenseNote(e.target.value)}
                      placeholder={t.analyticsExpenseNotePlaceholder} dir="auto"
                      className="bg-[var(--color-bg-panel)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => setExpenseFormMarketId(null)} className="flex-1 min-h-[40px] bg-[var(--color-bg-panel)] border border-[var(--color-border)] rounded-xl text-sm font-semibold text-[var(--color-text-primary)]">
                        {t.cancelAction}
                      </button>
                      <button onClick={handleAddExpense} className="flex-1 min-h-[40px] bg-[var(--color-accent)] text-[var(--color-accent-text)] rounded-xl text-sm font-semibold">
                        {t.saveAction}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => handleOpenExpenseForm(m.id)}
                    className="text-xs font-medium text-[var(--color-accent)] hover:underline"
                  >
                    + {t.analyticsAddExpense}
                  </button>
                )}

                {m.recent_entries.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-[var(--color-border)] flex flex-col gap-1.5">
                    {m.recent_entries.map((e) => (
                      <button
                        key={e.id}
                        onClick={() => handleDeleteExpense(e.id)}
                        className="flex items-center justify-between gap-2 text-xs text-start hover:bg-[var(--color-bg-hover)] rounded-lg px-1.5 py-1 transition-colors"
                      >
                        <span className="text-[var(--color-text-muted)]">{e.spent_at}{e.note ? ` · ${e.note}` : ''}</span>
                        <span className="text-[var(--color-text-primary)] font-medium shrink-0">₪{Number(e.amount).toFixed(2)}</span>
                      </button>
                    ))}
                  </div>
                )}
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
  const [duplicateListPrompt, setDuplicateListPrompt] = useState<{ name: string; existingId: string } | null>(null);

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

  // Basket state
  const [basket, setBasket] = useState<BasketItem[]>([]);
  const [activeBasketId, setActiveBasketId] = useState<string | null>(null);
  const [isBasketLoading, setIsBasketLoading] = useState(true);

  // List v2 (phase 2): household edits to products, edit sheet, done-shopping sheet
  const [overrides, setOverrides] = useState<OverrideMap>({});
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [isDoneSheetOpen, setIsDoneSheetOpen] = useState(false);
  const [tripsRefreshKey, setTripsRefreshKey] = useState(0);

  // Saved lists
  const [savedBaskets, setSavedBaskets] = useState<SavedBasket[]>([]);
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);
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
    supabase.from('chains').select('id, name_he, name_en, color_hex, status').then(({ data }) => {
      if (data) setChains(data);
    });
  }, []);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 2500);
  }, []);

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
    if (!currentUser?.id || currentUser.id === '00000000-0000-0000-0000-000000000000' || !supabase) {
      // No rehydration needed (not logged in) — nothing to wait for.
      setIsBasketLoading(false);
      return;
    }

    setIsBasketLoading(true);
    (async () => {
      try {
        const { data: bData } = await supabase.from('baskets')
          .select('id')
          .eq('user_id', currentUser.id)
          .eq('is_archived', false)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (bData) {
          setActiveBasketId(bData.id);

          // Single round trip: the API route joins basket_items -> products ->
          // chain_prices server-side instead of the client doing it in two
          // separate queries.
          const res = await fetch(`/api/baskets/${bData.id}/items?user_id=${currentUser.id}`);
          if (!res.ok) { setBasket([]); return; }
          const { items } = await res.json() as { items: BasketItemRow[] };
          if (items.length > 0) {
            setBasket(items.map(rowToBasketItem));
            showToast(t.basketRestoredToast);
          }
        } else {
          const { data: newB } = await supabase.from('baskets').insert({
            user_id: currentUser.id,
            name: lang === 'he' ? 'רשימת קניות' : 'My Grocery List',
          }).select().single();
          if (newB) setActiveBasketId(newB.id);
        }
      } catch {
        setBasket([]);
      } finally {
        setIsBasketLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  // ── Household + its product edits (phase 2) ─────────────────────────────────
  // Every signed-in user belongs to a household (created on first use), so
  // edits to catalog products are shared with everyone in it.

  useEffect(() => {
    if (!currentUser?.id || !supabase) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc('get_or_create_own_household').single();
      if (cancelled || !data) return;
      const h = data as { id: string; name: string; invite_code: string | null };
      setHousehold(h);
      const map = await loadOverrides(supabase, h.id);
      if (!cancelled) setOverrides(map);
    })();
    return () => { cancelled = true; };
  }, [currentUser?.id]);

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

  // ── Basket CRUD ──────────────────────────────────────────────────────────────

  const handleAddProduct = async (product: ProductResult) => {
    setSearchQuery('');
    setShowPredictions(false);

    const existing = basket.find((i) => i.productId === product.id);
    if (existing) {
      const newQ = existing.quantity + 1;
      setBasket((prev) => prev.map((i) => i.id === existing.id ? { ...i, quantity: newQ, checked: false } : i));
      if (supabase && existing.dbId) {
        await supabase.from('basket_items').update({ quantity_value: newQ, checked: false }).eq('id', existing.dbId);
      }
      return;
    }

    let dbId: string | undefined;
    if (supabase && activeBasketId) {
      const { data } = await supabase.from('basket_items').insert({
        basket_id: activeBasketId,
        product_id: product.id,
        product_name: product.name_he,
        quantity_value: 1,
      }).select('id').single();
      dbId = data?.id;
    }

    const values = Object.values(product.prices).map((p) => Number(p.price));
    setBasket((prev) => [
      ...prev,
      {
        id: product.id,
        dbId,
        productId: product.id,
        name_he: product.name_he,
        name_en: product.name_en,
        category: product.category,
        barcode: product.barcode,
        prices: product.prices,
        min_price: values.length > 0 ? Math.min(...values) : null,
        quantity: 1,
        checked: false,
        customPrice: null,
        imageUrl: null,
      },
    ]);
  };

  // Free-text item ("tomatoes"): no catalog product, so no price or photo until
  // the household adds one. Its aisle is guessed with the same rules the
  // catalog uses (categorize_product, migration 018).
  const handleAddFreeText = async (rawName: string) => {
    const name = rawName.trim();
    if (!name) return;
    setSearchQuery('');
    setShowPredictions(false);

    const dup = basket.find((i) => !i.productId && i.name_he === name);
    if (dup) { await updateQuantity(dup.id, 1); return; }

    let category = 'other';
    if (supabase) {
      const { data } = await supabase.rpc('categorize_product', { p_name: name });
      if (typeof data === 'string') category = data;
    }

    let dbId: string | undefined;
    if (supabase && activeBasketId) {
      const { data } = await supabase.from('basket_items').insert({
        basket_id: activeBasketId,
        product_id: null,
        product_name: name,
        quantity_value: 1,
        category,
      }).select('id').single();
      dbId = data?.id;
    }

    setBasket((prev) => [
      ...prev,
      {
        id: `free:${dbId ?? crypto.randomUUID()}`,
        dbId,
        productId: null,
        name_he: name,
        name_en: null,
        category,
        barcode: null,
        prices: {},
        min_price: null,
        quantity: 1,
        checked: false,
        customPrice: null,
        imageUrl: null,
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

  const toggleChecked = async (id: string) => {
    const item = basket.find((i) => i.id === id);
    if (!item) return;
    const checked = !item.checked;
    setBasket((prev) => prev.map((i) => i.id === id ? { ...i, checked } : i));
    if (supabase && item.dbId) {
      await supabase.from('basket_items').update({ checked }).eq('id', item.dbId);
    }
  };

  const setAllChecked = async (checked: boolean) => {
    setBasket((prev) => prev.map((i) => ({ ...i, checked })));
    if (supabase && activeBasketId) {
      await supabase.from('basket_items').update({ checked }).eq('basket_id', activeBasketId);
    }
  };

  // Catalog product → household-wide edit (product_overrides); free-text item →
  // saved on the list item itself. Only values that differ from the catalog
  // are stored, so "back to catalog" is just deleting the override.
  const saveItemEdit = async (item: BasketItem, v: ItemEditValues) => {
    if (!supabase) return;
    if (item.productId) {
      if (!household) throw new Error(lang === 'he' ? 'משק הבית עדיין נטען, נסו שוב' : 'Household is still loading, try again');
      const row = {
        household_id: household.id,
        product_id: item.productId,
        name: v.name !== item.name_he ? v.name : null,
        category: v.category !== normalizeCategory(item.category) ? v.category : null,
        price: v.price,
        image_url: v.image,
      };
      if (row.name == null && row.category == null && row.price == null && row.image_url == null) {
        await resetOverride(item);
      } else {
        const { error } = await supabase.from('product_overrides').upsert({ ...row, updated_at: new Date().toISOString() });
        if (error) throw error;
        const productId = item.productId;
        setOverrides((prev) => ({ ...prev, [productId]: { product_id: productId, name: row.name, category: row.category, price: row.price, image_url: row.image_url } }));
      }
    } else {
      if (item.dbId) {
        const { error } = await supabase.from('basket_items')
          .update({ product_name: v.name, category: v.category, custom_price: v.price, image_url: v.image })
          .eq('id', item.dbId);
        if (error) throw error;
      }
      setBasket((prev) => prev.map((i) => i.id === item.id ? { ...i, name_he: v.name, category: v.category, customPrice: v.price, imageUrl: v.image } : i));
    }
    showToast(lang === 'he' ? 'הפריט עודכן' : 'Item updated');
  };

  const resetOverride = async (item: BasketItem) => {
    if (!supabase || !household || !item.productId) return;
    const { error } = await supabase.from('product_overrides').delete().eq('household_id', household.id).eq('product_id', item.productId);
    if (error) throw error;
    const productId = item.productId;
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  // "Done shopping at …": the items in the cart become a saved trip with an
  // ESTIMATED total (prices at that chain, or the household's own prices),
  // then leave the list. Unchecked items stay for next time.
  const finishTrip = async (chainId: string | null, label: string) => {
    if (!supabase || !currentUser?.id) return;
    const cart = basket.filter((i) => i.checked);
    if (cart.length === 0) return;
    const est = estimate(cart, overrides, chainId);
    const failed = lang === 'he' ? 'שמירת הקנייה נכשלה' : 'Could not save the trip';

    const { data: trip, error } = await supabase.from('shopping_trips').insert({
      household_id: household?.id ?? null,
      chain_id: chainId,
      store_label: label,
      est_total: est.total,
      item_count: est.count,
      priced_count: est.priced,
    }).select('id').single();
    if (error || !trip) { showToast(failed); throw error ?? new Error(failed); }

    const rows = cart.map((i) => {
      const e = effective(i, overrides);
      const p = unitPrice(i, overrides, chainId);
      return { trip_id: trip.id, product_id: i.productId, name: e.name, category: e.category, quantity: i.quantity, unit_price: p.price, price_source: p.source };
    });
    const { error: itemsError } = await supabase.from('trip_items').insert(rows);
    if (itemsError) {
      await supabase.from('shopping_trips').delete().eq('id', trip.id);
      showToast(failed);
      throw itemsError;
    }

    const ids = cart.map((i) => i.dbId).filter((x): x is string => !!x);
    if (ids.length > 0) await supabase.from('basket_items').delete().in('id', ids);
    setBasket((prev) => prev.filter((i) => !i.checked));
    setTripsRefreshKey((k) => k + 1);
    showToast(lang === 'he'
      ? `נשמרה קנייה ב${label}: ₪${est.total.toFixed(2)} משוער`
      : `Trip saved at ${label}: ₪${est.total.toFixed(2)} estimated`);
  };

  const handleSaveList = async () => {
    if (!supabase || !currentUser?.id || basket.length === 0) return;
    const defaultName = new Date().toLocaleDateString('he-IL');
    const name = window.prompt(t.saveListPrompt, defaultName);
    if (!name || !name.trim()) return;
    const trimmed = name.trim();

    const { data: existing } = await supabase
      .from('baskets')
      .select('id')
      .eq('user_id', currentUser.id)
      .eq('name', trimmed)
      .eq('is_archived', true)
      .maybeSingle();

    if (existing) {
      setDuplicateListPrompt({ name: trimmed, existingId: existing.id });
      return;
    }

    await saveNewList(trimmed);
  };

  const saveNewList = async (name: string) => {
    if (!supabase || !currentUser?.id) return;
    const { data: newBasket } = await supabase.from('baskets').insert({
      user_id: currentUser.id,
      name,
      is_archived: true,
    }).select().single();

    if (newBasket) {
      await supabase.from('basket_items').insert(basket.map((item) => itemToRow(item, newBasket.id)));
    }

    showToast(t.listSavedToast);
  };

  // "Replace" branch of the duplicate-name confirmation: overwrites the
  // existing saved list's items in place rather than creating a second
  // basket row with the same name.
  const handleReplaceSavedList = async () => {
    if (!supabase || !duplicateListPrompt) return;
    const { existingId } = duplicateListPrompt;
    setDuplicateListPrompt(null);

    await supabase.from('basket_items').delete().eq('basket_id', existingId);
    await supabase.from('basket_items').insert(basket.map((item) => itemToRow(item, existingId)));
    await supabase.from('baskets').update({ updated_at: new Date().toISOString() }).eq('id', existingId);

    showToast(t.listSavedToast);
  };

  const handleSaveListAsNew = async () => {
    if (!duplicateListPrompt) return;
    const { name } = duplicateListPrompt;
    setDuplicateListPrompt(null);
    await saveNewList(name);
  };

  // "Cancel" returns to the name prompt rather than dropping the save
  // attempt entirely, per spec.
  const handleCancelDuplicateList = () => {
    setDuplicateListPrompt(null);
    handleSaveList();
  };

  // Loads a saved (is_archived=true) list into the working view with current
  // estimated prices — same route as the login-time rehydration.
  const handleLoadSavedList = async (sb: SavedBasket) => {
    if (!currentUser?.id) return;
    const res = await fetch(`/api/baskets/${sb.id}/items?user_id=${currentUser.id}`);
    const { items } = res.ok ? (await res.json() as { items: BasketItemRow[] }) : { items: [] as BasketItemRow[] };
    setActiveBasketId(sb.id);
    setBasket(items.map(rowToBasketItem));
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
                      {searchQuery.trim() && (
                        <button
                          onClick={() => handleAddFreeText(searchQuery)}
                          className="w-full flex items-center gap-2 p-4 hover:bg-[var(--color-bg-hover)]/50 transition-colors text-start text-sm font-semibold text-[var(--color-accent)]"
                        >
                          <Plus className="w-4 h-4 shrink-0" />
                          <span className="truncate">{lang === 'he' ? `הוסף "${searchQuery.trim()}" כפריט משלך` : `Add “${searchQuery.trim()}” as your own item`}</span>
                        </button>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
            </div>

            {/* Shopping list */}
            <div className="flex-1 flex flex-col gap-6">

              {/* Basket list */}
              <div className="flex-1 bg-[var(--color-bg-panel)]/40 backdrop-blur-sm border border-[var(--color-border)]/80 rounded-3xl p-4 sm:p-6 overflow-y-auto min-h-[300px]">
                {isBasketLoading ? (
                  <BasketSkeleton />
                ) : (
                  <ShoppingList
                    items={basket}
                    overrides={overrides}
                    lang={lang}
                    onToggle={toggleChecked}
                    onQuantity={updateQuantity}
                    onEdit={setEditingItemId}
                    onDone={() => setIsDoneSheetOpen(true)}
                    onSave={handleSaveList}
                    onClear={handleClearList}
                  />
                )}
              </div>

            </div>
          </motion.div>
        )}

        {/* ═══ SAVED LISTS ═══ */}
        {currentView === 'SAVED_LISTS' && (
          <motion.div key="SAVED_LISTS" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="flex-1 max-w-4xl mx-auto w-full flex flex-col gap-6 text-start mt-6">
            <RecentTrips chains={chains} lang={lang} refreshKey={tripsRefreshKey} />
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
              <div className="bg-[var(--color-bg-panel)]/60 rounded-3xl p-8 border border-[var(--color-border)]">
                <IconEmptyState icon={Bookmark} title={t.savedListsEmptyTitle} subtitle={t.savedListsEmptySubtitle} />
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
          <AnalyticsView t={t} lang={lang} currentUserId={currentUser?.id ?? null} showToast={showToast} />
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

      </AnimatePresence>

      {/* ── Footer ── */}
      {(
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

      {(() => {
        const editingItem = basket.find((i) => i.id === editingItemId);
        return editingItem && supabase && currentUser?.id ? (
          <ItemEditSheet
            item={editingItem}
            overrides={overrides}
            chains={chains}
            lang={lang}
            onUploadPhoto={(file) => uploadItemPhoto(supabase!, currentUser.id!, file)}
            onSave={(v) => saveItemEdit(editingItem, v)}
            onReset={() => resetOverride(editingItem)}
            onRemove={() => removeProduct(editingItem.id)}
            onClose={() => setEditingItemId(null)}
          />
        ) : null;
      })()}

      {isDoneSheetOpen && (
        <DoneShoppingSheet
          items={basket.filter((i) => i.checked)}
          overrides={overrides}
          chains={chains}
          lang={lang}
          onConfirm={finishTrip}
          onClose={() => setIsDoneSheetOpen(false)}
        />
      )}

      {isDebugAllowed(currentUser?.email) && (
        <DebugPanel
          userId={currentUser?.id ?? null}
          userEmail={currentUser?.email ?? null}
          lang={lang}
          onToggleLang={() => setLang((l) => (l === 'he' ? 'en' : 'he'))}
          onToggleTheme={toggleTheme}
          basketCount={basket.length}
          onAddProduct={(p) => handleAddProduct(p as ProductResult)}
          onClearBasket={async () => {
            for (const item of basket) await removeProduct(item.id);
          }}
          onAddFreeText={handleAddFreeText}
          onSetAllChecked={setAllChecked}
          onGoTo={(v) => setCurrentView(v as typeof currentView)}
          showToast={showToast}
        />
      )}

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

      {/* ── Duplicate saved-list name confirmation ── */}
      <AnimatePresence>
        {duplicateListPrompt && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDuplicateListPrompt(null)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative bg-[var(--color-bg-panel)] border border-[var(--color-border)] shadow-2xl rounded-3xl w-full max-w-sm overflow-hidden">
              <div className="p-6 flex flex-col gap-5">
                <p className="text-center font-semibold text-[var(--color-text-primary)]">{t.duplicateListConfirm}</p>
                <div className="flex flex-col gap-3">
                  <button
                    onClick={handleReplaceSavedList}
                    className="min-h-[44px] bg-[var(--color-danger)] hover:opacity-90 text-white rounded-xl font-semibold transition-colors"
                  >
                    {t.replaceAction}
                  </button>
                  <button
                    onClick={handleSaveListAsNew}
                    className="min-h-[44px] bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-[var(--color-accent-text)] rounded-xl font-semibold transition-colors"
                  >
                    {t.saveAsNewAction}
                  </button>
                  <button
                    onClick={handleCancelDuplicateList}
                    className="min-h-[44px] bg-[var(--color-bg-subtle)] hover:bg-[var(--color-bg-hover)] text-[var(--color-text-primary)] border border-[var(--color-border)] rounded-xl font-semibold transition-colors"
                  >
                    {t.cancelAction}
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
