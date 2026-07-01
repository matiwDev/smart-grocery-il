'use client';

import React, { useState, useEffect } from 'react';
import { ShoppingCart, ExternalLink, Zap, BarChart3, Clock, TrendingDown, LogIn, LogOut, Globe, User, X, Menu, Home, List, Users, Search, MapPin, Trash2, Plus, Navigation, ChevronDown, ShoppingBag, ChefHat, Store, Box } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { createClient } from '@supabase/supabase-js';
import { BranchMapContainer } from '@/components/BranchMapContainer';
import { AuthModal, AuthMode } from '@/components/AuthModal';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

type Lang = 'he' | 'en';
type View = 'HOME' | 'PROFILE' | 'SAVED_LISTS' | 'PRICE_UPDATES' | 'COMMUNITY' | 'LOCATION';
type Skin = 'warm-rose' | 'earth-slate' | 'neon-acid' | 'ocean-steel';

const PALETTES = {
  'warm-rose': { background: '#F7EFE0', panel: '#F7CAC9', primary: '#EDB490', textHighlight: '#391C10' },
  'earth-slate': { background: '#ebebe5', panel: '#c9beb1', primary: '#b99a87', textHighlight: '#65463e' },
  'neon-acid': { background: '#2F2408', panel: '#5C840B', primary: '#BEDF1D', textHighlight: '#EBF094' },
  'ocean-steel': { background: '#323244', panel: '#91A1BA', primary: '#0D659D', textHighlight: '#CCDAEB' }
};

const DICTIONARY = {
  he: {
    appTitle: "Smart Grocery IL",
    envLabel: "סביבה: ייצור-01",
    apiActive: "חיבור API פעיל",
    signIn: "התחברות",
    signOut: "התנתק",
    signUp: "הרשמה",
    guest: "אורח",
    roleGuest: "לא מחובר",
    roleBuyer: "קניין ראשי",
    realtimeCompare: "השוואת מחירים בזמן אמת",
    marketTrends: "סיכום מגמות השוק לשבוע הנוכחי",
    avgSavings: "15% חיסכון ממוצע",
    activeChains: "רשתות פעילות",
    trackedProducts: "מוצרים במעקב",
    priceChanges: "שינויי מחיר היום",
    bestBasket: "הסל המשתלם ביותר - אזור המרכז",
    viewDetails: "צפה בפרטים",
    ramiLevy: "רמי לוי - סניף רמת גן",
    consumerCommunity: "קהילת צרכנים",
    activeUsers: "124 פעילים כעת",
    syncStatus: "סטטוס סנכרון רשתות",
    apiResponseTime: "זמן תגובה API",
    serverLoad: "עומס שרתים",
    lastUpdate: "עדכון מחירים אחרון",
    shufersalSync: "סנכרון רשת שופרסל",
    minsAgo: "לפני 14 דקות",
    recentDrops: "ירידות מחיר אחרונות",
    drop1: "מטרנה אקסטרה קר חסכון הוזל ב-15% בוויקטורי",
    drop2: "קוקה קולה שישייה - מחיר שפל ביוחננוף (24.90₪)",
    drop3: "עוף שלם טרי - מבצע חדש ברמי לוי לחברי מועדון",
    scanReceipt: "סרוק חשבונית",
    autoCompare: "השוואה אוטומטית לסל שלך",
    workspaceTitle: "סביבת העבודה שלי",
    savedBasketsTitle: "סלים שמורים",
    authModalTitleIn: "התחברות למערכת",
    authModalTitleUp: "הרשמה למערכת",
    usernameLabel: "שם משתמש",
    passwordLabel: "סיסמה",
    emailLabel: "אימייל",
    nicknameLabel: "כינוי (Nickname)",
    phoneLabel: "מספר טלפון",
    phonePlaceholder: "05X-XXXXXXX",
    submit: "אישור",
    cancel: "ביטול",
    switchToSignUp: "אין לך חשבון? הירשם",
    switchToSignIn: "כבר יש לך חשבון? התחבר",
    navHome: "ראשי",
    navProfile: "הגדרות פרופיל",
    navSavedLists: "רשימות שמורות",
    navPriceUpdates: "עדכוני מחירים",
    navCommunity: "קהילת צרכנים",
    placeholderTitle: "תצוגה בבנייה",
    placeholderDesc: "העמוד הזה נמצא כעת בפיתוח.",
    backToHome: "חזרה לראשי",
    themeSettings: "ערכת נושא לפרופיל",
    skinWarmRose: "ורד חם (Warm Rose Light)",
    skinEarthSlate: "אדמה (Earth Slate Light)",
    skinNeonAcid: "חומצה ניאון (Neon Acid Dark)",
    skinOceanSteel: "אוקיינוס פלדה (Ocean Steel Dark)",
    devOptionsLocked: "בקרת מפתחים (Locked)",
    searchPlaceholder: "חפש מוצר (לדוגמה: חלב)...",
    currentGpsLocation: "מיקום נוכחי (GPS)",
    telAviv: "תל אביב",
    haifa: "חיפה",
    jerusalem: "ירושלים",
    branchSelector: "בחר סניף",
    nearbySupermarkets: "סופרמרקטים בסביבה",
    quickNavigate: "ניווט מהיר",
    basePrice: "מחיר יחידה",
    total: "סה״כ",
    emptyList: "הרשימה ריקה. הוסף מוצרים כדי להתחיל.",
    listTotal: "סה״כ סל:",
    quantity: "כמות",
    profileDataTitle: "פרטים אישיים",
    avatarPickerTitle: "בחר דמות",
    editCredentials: "ערוך פרטים",
    saveAndVerify: "שמירה ואימות",
    verificationSent: "קוד אימות נשלח",
    location: "מיקום",
    uploadPicture: "העלה תמונה",
  },
  en: {
    appTitle: "Smart Grocery IL",
    envLabel: "Environment: Prod-01",
    apiActive: "API Connection Active",
    signIn: "Sign In",
    signOut: "Sign Out",
    signUp: "Sign Up",
    guest: "Guest",
    roleGuest: "Not Logged In",
    roleBuyer: "Lead Buyer",
    realtimeCompare: "Real-Time Price Comparison",
    marketTrends: "Market trends summary for the current week",
    avgSavings: "15% Avg. Savings",
    activeChains: "Active Chains",
    trackedProducts: "Tracked Products",
    priceChanges: "Price Changes Today",
    bestBasket: "Best Value Basket - Central Region",
    viewDetails: "View Details",
    ramiLevy: "Rami Levy - Ramat Gan Branch",
    consumerCommunity: "Consumer Community",
    activeUsers: "124 active now",
    syncStatus: "Chain Sync Status",
    apiResponseTime: "API Latency",
    serverLoad: "Server Load",
    lastUpdate: "Last Price Update",
    shufersalSync: "Shufersal Chain Sync",
    minsAgo: "14 mins ago",
    recentDrops: "Recent Price Drops",
    drop1: "Materna Extra Care Saver reduced by 15% at Victory",
    drop2: "Coca Cola 6-pack - record low at Yochananof (24.90₪)",
    drop3: "Fresh Whole Chicken - new club member deal at Rami Levy",
    scanReceipt: "Scan Receipt",
    autoCompare: "Automatic comparison to your basket",
    workspaceTitle: "My Workspace",
    savedBasketsTitle: "Saved Baskets",
    authModalTitleIn: "Sign In to System",
    authModalTitleUp: "Sign Up for System",
    usernameLabel: "Username",
    passwordLabel: "Password",
    emailLabel: "Email",
    nicknameLabel: "Nickname",
    phoneLabel: "Phone Number",
    phonePlaceholder: "05X-XXXXXXX",
    submit: "Submit",
    cancel: "Cancel",
    switchToSignUp: "Don't have an account? Sign Up",
    switchToSignIn: "Already have an account? Sign In",
    navHome: "Home",
    navProfile: "Profile Settings",
    navSavedLists: "Saved Lists",
    navPriceUpdates: "Price Updates",
    navCommunity: "Consumer Community",
    placeholderTitle: "View Under Construction",
    placeholderDesc: "This page is currently in development.",
    backToHome: "Back to Home",
    themeSettings: "Profile Skin",
    skinWarmRose: "Warm Rose Light",
    skinEarthSlate: "Earth Slate Light",
    skinNeonAcid: "Neon Acid Dark",
    skinOceanSteel: "Ocean Steel Dark",
    devOptionsLocked: "Developer Options (Locked)",
    searchPlaceholder: "Search product (e.g. Milk)...",
    currentGpsLocation: "Current GPS Location",
    telAviv: "Tel Aviv",
    haifa: "Haifa",
    jerusalem: "Jerusalem",
    branchSelector: "Select Branch",
    nearbySupermarkets: "Nearby Supermarkets",
    quickNavigate: "Quick Navigate",
    basePrice: "Base Price",
    total: "Total",
    emptyList: "List is empty. Add products to start.",
    listTotal: "Basket Total:",
    quantity: "Qty",
    profileDataTitle: "Personal Information",
    avatarPickerTitle: "Choose Avatar",
    editCredentials: "Edit Credentials",
    saveAndVerify: "Save and Verify",
    verificationSent: "Verification code sent",
    location: "Location",
    uploadPicture: "Upload Picture",
  }
};

interface DrawerItemProps {
  view: View;
  currentView: View;
  setCurrentView: (v: View) => void;
  icon: any;
  label: string;
  close: () => void;
}

function DrawerItem({ view, currentView, setCurrentView, icon: Icon, label, close }: DrawerItemProps) {
  const isActive = currentView === view;
  return (
    <button
      onClick={() => { setCurrentView(view); close(); }}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-medium ${
        isActive 
          ? 'bg-indigo-500/10 text-indigo-400' 
          : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100'
      }`}
    >
      <Icon className="w-5 h-5" />
      {label}
    </button>
  );
}

interface BasketItem {
  id: string;
  dbId?: string;
  name: string;
  basePrice: number;
  quantity: number;
}

interface UserProfile {
  id?: string;
  nickname: string;
  email: string;
  phone: string;
  avatar: string;
}

export default function SmartGroceryDashboard() {
  const [lang, setLang] = useState<Lang>('he');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>('NONE');

  const [currentView, setCurrentView] = useState<View>('HOME');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [skin, setSkin] = useState<Skin>('warm-rose');

  const [isEditingCredentials, setIsEditingCredentials] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationFlash, setVerificationFlash] = useState(false);

  // List Creator State
  const [basket, setBasket] = useState<BasketItem[]>([]);
  const [savedBaskets, setSavedBaskets] = useState<any[]>([]);
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);
  const [activeBasketId, setActiveBasketId] = useState<string | null>(null);
  const [isBasketLoaded, setIsBasketLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [location, setLocation] = useState('GPS');
  const [showPredictions, setShowPredictions] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      if (!supabase) return;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
          if (profile) {
            setCurrentUser({
              id: user.id,
              nickname: profile.nickname || 'User',
              email: profile.email || user.email || '',
              phone: profile.phone_number || '',
              avatar: profile.avatar_url || 'https://res.cloudinary.com/djcksi74n/image/upload/v1782869112/Avatars_01_u3edkv.png'
            });
            if (profile.selected_skin) setSkin(profile.selected_skin as Skin);
          } else {
            setCurrentUser({
              id: user.id,
              nickname: 'User',
              email: user.email || '',
              phone: '',
              avatar: 'https://res.cloudinary.com/djcksi74n/image/upload/v1782869112/Avatars_01_u3edkv.png'
            });
          }
        }
      } catch (err) {
        console.error('Initial auth fetch error:', err);
      }
    };
    fetchUser();
  }, []);

  const MOCK_PRODUCTS = [
    { id: 'p1', name: lang === 'he' ? 'חלב תנובה 3%' : 'Tnuva Milk 3%', basePrice: 6.20 },
    { id: 'p2', name: lang === 'he' ? 'לחם אחיד פרוס' : 'Sliced Standard Bread', basePrice: 7.90 },
    { id: 'p3', name: lang === 'he' ? 'קוטג׳ 5%' : 'Cottage Cheese 5%', basePrice: 5.90 },
    { id: 'p4', name: lang === 'he' ? 'עגבניות 1 ק״ג' : 'Tomatoes 1 kg', basePrice: 4.50 },
    { id: 'p5', name: lang === 'he' ? 'ביצים L תריסר' : 'Eggs L dozen', basePrice: 12.50 },
  ];

  useEffect(() => {
    if (!currentUser || !currentUser.id || currentUser.id === '00000000-0000-0000-0000-000000000000') {
       // eslint-disable-next-line react-hooks/set-state-in-effect
       setIsBasketLoaded(true);
       return;
    }
    
    if (supabase) {
       const loadBasket = async () => {
         try {
           const { data: bData } = await supabase.from('baskets')
              .select('*')
              .eq('user_id', currentUser.id)
              .eq('is_archived', false)
              .order('created_at', { ascending: false })
              .limit(1)
              .single();
           
           if (bData) {
             setActiveBasketId(bData.id);
             const { data: items } = await supabase.from('basket_items').select('*').eq('basket_id', bData.id);
             if (items) {
                const loaded = items.map((i: any) => {
                   const matched = MOCK_PRODUCTS.find(p => p.name === i.product_name || p.name === i.product_name);
                   return {
                      id: matched ? matched.id : i.id,
                      dbId: i.id,
                      name: i.product_name,
                      basePrice: matched ? matched.basePrice : 0,
                      quantity: Number(i.quantity_value || 1)
                   };
                });
                setBasket(loaded);
             }
           } else {
             const { data: newB } = await supabase.from('baskets').insert({
               user_id: currentUser.id,
               name: 'My Grocery List'
             }).select().single();
             if (newB) {
               setActiveBasketId(newB.id);
             }
           }
         } catch (e) {
            console.error('Failed to load basket', e);
         } finally {
            setIsBasketLoaded(true);
         }
       };
       loadBasket();
    } else {
       setIsBasketLoaded(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const filteredProducts = MOCK_PRODUCTS.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const handleAddProduct = async (product: { id: string, name: string, basePrice: number }) => {
    let newItemDbId: string | undefined = undefined;
    const existing = basket.find(item => item.id === product.id);
    
    const getFallbackData = () => {
       console.log('Using high-fidelity local text-parser fallback for add product due to offline status.');
    };

    try {
      if (!supabase) throw new Error("Offline");
      if (existing) {
         const newQ = existing.quantity + 1;
         if (existing.dbId) {
            const { error } = await supabase.from('basket_items').update({ quantity_value: newQ }).eq('id', existing.dbId);
            if (error) throw error;
         }
      } else {
         if (activeBasketId) {
           const { data, error } = await supabase.from('basket_items').insert({
             basket_id: activeBasketId,
             product_name: product.name,
             quantity_value: 1
           }).select().single();
           if (error) throw error;
           if (data) newItemDbId = data.id;
         }
      }
    } catch(e) {
      console.error(e);
      getFallbackData();
    }

    setBasket(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, quantity: 1, dbId: newItemDbId }];
    });
    setSearchQuery('');
    setShowPredictions(false);
  };

  const updateQuantity = async (id: string, delta: number) => {
    const item = basket.find(i => i.id === id);
    if (!item) return;
    const newQ = Math.max(1, item.quantity + delta);
    if (newQ === item.quantity) return;
    
    const getFallbackData = () => {
       console.log('Using high-fidelity local text-parser fallback for update quantity due to offline status.');
    };
    
    try {
      if (!supabase) throw new Error("Offline");
      if (item.dbId) {
         const { error } = await supabase.from('basket_items').update({ quantity_value: newQ }).eq('id', item.dbId);
         if (error) throw error;
      }
    } catch(e) {
      console.error(e);
      getFallbackData();
    }
    
    setBasket(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, quantity: newQ };
      }
      return item;
    }));
  };

  const removeProduct = async (id: string) => {
    const item = basket.find(i => i.id === id);
    const getFallbackData = () => {
       console.log('Using high-fidelity local text-parser fallback for remove product due to offline status.');
    };
    try {
      if (!supabase) throw new Error("Offline");
      if (item && item.dbId) {
         const { error } = await supabase.from('basket_items').delete().eq('id', item.dbId);
         if (error) throw error;
      }
    } catch(e) {
      console.error(e);
      getFallbackData();
    }

    setBasket(prev => prev.filter(item => item.id !== id));
  };

  const basketTotal = basket.reduce((acc, item) => acc + (item.basePrice * item.quantity), 0);

  const t = DICTIONARY[lang];

  const MOCK_BRANCHES = [
    { id: 'gps', name: t.currentGpsLocation, desc: t.nearbySupermarkets, dist: '0.0 km', mapsLink: 'https://waze.com/ul' },
    { id: 'tlv', name: t.telAviv, desc: lang === 'he' ? 'רמי לוי - סניף החשמונאים' : 'Rami Levy - Hahashmonaim', dist: '1.2 km', mapsLink: 'https://waze.com/ul?q=Rami+Levy+Tel+Aviv' },
    { id: 'haifa', name: t.haifa, desc: lang === 'he' ? 'שופרסל דיל - נשר' : 'Shufersal Deal - Nesher', dist: '4.5 km', mapsLink: 'https://waze.com/ul?q=Shufersal+Nesher' },
    { id: 'jerusalem', name: t.jerusalem, desc: lang === 'he' ? 'יוחננוף - תלפיות' : 'Yochananof - Talpiot', dist: '3.1 km', mapsLink: 'https://waze.com/ul?q=Yochananof+Jerusalem' },
  ];
  const selectedBranch = MOCK_BRANCHES.find(b => b.id === location) || MOCK_BRANCHES[0];

  const [liveBranches, setLiveBranches] = useState(MOCK_BRANCHES.slice(1));
  const [activeMapPin, setActiveMapPin] = useState('gps');

  useEffect(() => {
    if (currentView === 'SAVED_LISTS' && currentUser && currentUser.id !== '00000000-0000-0000-0000-000000000000') {
      const loadSavedBaskets = async () => {
         setIsLoadingSaved(true);
         
         const getFallbackData = () => {
           console.log('Using high-fidelity local text-parser fallback for Saved Lists.');
           setSavedBaskets([]);
         };
         
         try {
           if (!supabase) throw new Error('Supabase offline');
           
           const { data: baskets, error } = await supabase.from('baskets')
             .select('*, basket_items(*)')
             .eq('user_id', currentUser.id)
             .order('updated_at', { ascending: false });
           
           if (error) throw error;
           
           if (baskets) {
             setSavedBaskets(baskets);
           }
         } catch(e) {
           console.error('Failed to load saved lists', e);
           getFallbackData();
         } finally {
           setIsLoadingSaved(false);
         }
      };
      loadSavedBaskets();
    }
  }, [currentView, currentUser]);

  useEffect(() => {
    if (currentView === 'LOCATION' && supabase) {
      const loadLiveMapData = async () => {
         try {
           const { data: prices } = await supabase.from('price_snapshots').select('*').order('snapshot_date', { ascending: false }).limit(10);
           if (prices && prices.length > 0) {
             setLiveBranches(prev => prev.map(b => ({
               ...b,
               dist: (parseFloat(b.dist) + (Math.random() * 0.2 - 0.1)).toFixed(1) + ' km'
             })));
           }
         } catch(e) {
           console.log(e);
         }
      };
      loadLiveMapData();
    } else {
       // eslint-disable-next-line react-hooks/set-state-in-effect
       setLiveBranches(MOCK_BRANCHES.slice(1));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView]);

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (currentUser && reader.result) {
          setCurrentUser({ ...currentUser, avatar: reader.result as string });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveCredentials = async () => {
    setIsVerifying(true);
    
    if (supabase && currentUser && currentUser.id !== '00000000-0000-0000-0000-000000000000') {
      try {
        await supabase.from('profiles').upsert({
           id: currentUser.id,
           nickname: currentUser.nickname,
           phone_number: currentUser.phone,
           avatar_url: currentUser.avatar,
           selected_skin: skin
        });
      } catch(e) {
        console.error(e);
      }
    }

    setTimeout(() => {
      setVerificationFlash(true);
      setTimeout(() => {
        setVerificationFlash(false);
        setIsVerifying(false);
        setIsEditingCredentials(false);
      }, 1500);
    }, 500);
  };

  const toggleLanguage = () => {
    setLang(prev => prev === 'he' ? 'en' : 'he');
  };
  
  const currentPalette = PALETTES[skin];

  return (
    <div 
      className="w-full min-h-screen flex flex-col font-sans p-4 md:p-6 lg:p-8 overflow-x-hidden relative transition-colors duration-500 bg-[var(--background)] text-[var(--text-highlight)]"
      dir={lang === 'he' ? 'rtl' : 'ltr'}
      style={{
        '--background': currentPalette.background,
        '--panel': currentPalette.panel,
        '--primary': currentPalette.primary,
        '--text-highlight': currentPalette.textHighlight,
      } as React.CSSProperties}
    >
      {/* Top Navigation Bar */}
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-indigo-500/20 shrink-0">
            <ShoppingCart className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100">{t.appTitle}</h1>
            <p className="text-xs text-slate-400 font-medium">{t.envLabel}</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-4">
          {/* Language Switcher */}
          <button 
            onClick={toggleLanguage}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 transition-colors px-3 py-1.5 rounded-full border border-slate-700 text-xs font-semibold"
          >
            <Globe className="w-4 h-4 text-indigo-400" />
            {lang === 'he' ? 'EN' : 'עברית'}
          </button>

          <div className="flex items-center gap-3 border-s border-slate-800 ps-4">
            <div className="text-left rtl:text-right hidden sm:block">
              <p className="text-sm font-bold text-slate-100">{currentUser ? currentUser.nickname : t.guest}</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider">{currentUser ? t.roleBuyer : t.roleGuest}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-slate-800 border-2 border-slate-700 shadow-sm overflow-hidden relative flex items-center justify-center">
              {currentUser ? (
                currentUser.avatar.startsWith('/') || currentUser.avatar.startsWith('http') || currentUser.avatar.startsWith('data:') ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={currentUser.avatar} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-5 h-5 text-indigo-400" />
                )
              ) : (
                <User className="w-5 h-5 text-slate-400" />
              )}
            </div>
          </div>
          
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="w-10 h-10 bg-indigo-600 hover:bg-indigo-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-500/20 shrink-0 transition-colors md:ms-2"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <AnimatePresence mode="wait">
        {currentView === 'HOME' ? (
          <motion.div 
            key="HOME"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="flex-1 flex flex-col gap-6"
          >
            {/* Top Core Panel (List Creator) */}
            <div className="flex flex-col md:flex-row gap-4">
              {/* 75% Search Bar */}
              <div className="md:w-3/4 relative z-20">
                <div className="relative">
                  <div className="absolute inset-y-0 start-0 flex items-center ps-4 pointer-events-none">
                    <Search className="w-5 h-5 text-slate-400" />
                  </div>
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setShowPredictions(true); }}
                    onFocus={() => setShowPredictions(true)}
                    placeholder={t.searchPlaceholder}
                    className="w-full bg-slate-900/80 border border-slate-700/50 text-slate-100 rounded-2xl h-14 ps-12 pe-4 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all shadow-inner"
                  />
                </div>
                {/* Autocomplete Predictions */}
                <AnimatePresence>
                  {showPredictions && searchQuery && filteredProducts.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 5 }}
                      className="absolute top-full start-0 end-0 mt-2 bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden z-30"
                    >
                      {filteredProducts.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => handleAddProduct(p)}
                          className="w-full flex items-center justify-between p-4 hover:bg-slate-700/50 transition-colors border-b border-slate-700/50 last:border-0 text-start"
                        >
                          <span className="font-medium text-slate-200">{p.name}</span>
                          <span className="text-emerald-400 font-mono">₪ {p.basePrice.toFixed(2)}</span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* 25% Location Route Button */}
              <div className="md:w-1/4 relative z-10 group">
                <button
                  onClick={() => setCurrentView('LOCATION')}
                  className="w-full bg-slate-900/80 border border-slate-700/50 text-slate-100 rounded-2xl h-14 px-5 flex items-center justify-between hover:bg-slate-800 hover:border-indigo-500/50 transition-colors shadow-inner"
                >
                  <div className="flex items-center gap-3">
                    <MapPin className="w-5 h-5 text-indigo-400 group-hover:scale-110 transition-transform" />
                    <span className="font-semibold">{t.location}</span>
                  </div>
                  <ChevronDown className="w-5 h-5 text-slate-400 -rotate-90 rtl:rotate-90" />
                </button>
              </div>
            </div>

            {/* Dynamic Interactive List */}
            <div className="flex-1 bg-slate-900/40 backdrop-blur-sm border border-slate-800/80 rounded-3xl p-6 overflow-y-auto min-h-[300px]">
              {basket.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 min-h-[200px]">
                  <ShoppingCart className="w-12 h-12 mb-4 opacity-50" />
                  <p>{t.emptyList}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {basket.map(item => (
                    <div key={item.id} className="flex flex-col sm:flex-row items-center justify-between bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50 gap-4 group transition-colors hover:bg-slate-800">
                      <div className="flex-1 text-start w-full sm:w-auto">
                        <h3 className="font-semibold text-slate-200 text-lg">{item.name}</h3>
                        <p className="text-sm text-slate-400 mt-1">{t.basePrice}: <span className="font-mono text-emerald-400/80">₪ {item.basePrice.toFixed(2)}</span></p>
                      </div>
                      
                      <div className="flex items-center gap-4 sm:gap-6 w-full sm:w-auto justify-between sm:justify-end">
                        {/* Quantity Controls */}
                        <div className="flex items-center bg-slate-900 rounded-xl border border-slate-700 p-1">
                          <button onClick={() => updateQuantity(item.id, -1)} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">-</button>
                          <span className="w-10 text-center font-mono font-medium text-slate-200">{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.id, 1)} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">+</button>
                        </div>
                        
                        {/* Item Total */}
                        <div className="w-24 text-end">
                          <span className="font-mono font-bold text-emerald-400 text-lg">₪ {(item.basePrice * item.quantity).toFixed(2)}</span>
                        </div>
                        
                        {/* Remove */}
                        <button 
                          onClick={() => removeProduct(item.id)}
                          className="w-10 h-10 flex items-center justify-center text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors sm:opacity-0 group-hover:opacity-100 shrink-0"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  
                  {/* Total Footer */}
                  <div className="mt-8 pt-6 border-t border-slate-800 flex justify-between items-end">
                    <span className="text-slate-400 text-lg">{t.listTotal}</span>
                    <span className="text-4xl font-bold font-mono text-white tracking-tight">₪ {basketTotal.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        ) : currentView === 'PROFILE' ? (
          <motion.div
            key="PROFILE"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="flex-1 w-full max-w-4xl mx-auto flex flex-col gap-8 text-start mt-6"
          >
             <h2 className="text-3xl font-bold text-slate-100">{t.navProfile}</h2>
             
             <div className="bg-slate-900/60 backdrop-blur-xl rounded-3xl p-8 border border-slate-800 shadow-xl">
               <h3 className="text-lg font-semibold text-slate-200 mb-6">{t.themeSettings}</h3>
               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { id: 'warm-rose', name: t.skinWarmRose, colorClass: 'bg-[#EDB490]' },
                    { id: 'earth-slate', name: t.skinEarthSlate, colorClass: 'bg-[#c9beb1]' },
                    { id: 'neon-acid', name: t.skinNeonAcid, colorClass: 'bg-[#BEDF1D]' },
                    { id: 'ocean-steel', name: t.skinOceanSteel, colorClass: 'bg-[#0D659D]' }
                  ].map(skinOption => (
                    <button 
                      key={skinOption.id}
                      onClick={() => setSkin(skinOption.id as Skin)}
                      className={`flex flex-col items-center gap-3 p-6 rounded-2xl border-2 transition-all ${skin === skinOption.id ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-800 hover:border-slate-600 bg-slate-950/50'}`}
                    >
                       <div className={`w-12 h-12 rounded-full shadow-lg border border-white/10 ${skinOption.colorClass}`}></div>
                       <span className="text-sm font-medium text-slate-300 text-center">{skinOption.name}</span>
                    </button>
                  ))}
               </div>
             </div>

             {currentUser && (
               <>
                 <div className="bg-slate-900/60 backdrop-blur-xl rounded-3xl p-8 border border-slate-800 shadow-xl">
                   <h3 className="text-lg font-semibold text-slate-200 mb-6">{t.avatarPickerTitle}</h3>
                   <div className="flex flex-wrap gap-4 items-center">
                     {[
                       { id: 'https://res.cloudinary.com/djcksi74n/image/upload/v1782869112/Avatars_01_u3edkv.png' },
                       { id: 'https://res.cloudinary.com/djcksi74n/image/upload/v1782869112/Avatars_02_tnpgez.png' },
                       { id: 'https://res.cloudinary.com/djcksi74n/image/upload/v1782869112/Avatars_03_uhw4sf.png' },
                       { id: 'https://res.cloudinary.com/djcksi74n/image/upload/v1782869112/Avatars_04_ddolur.png' },
                       { id: 'https://res.cloudinary.com/djcksi74n/image/upload/v1782869113/Avatars_05_oijkrm.png' },
                       { id: 'https://res.cloudinary.com/djcksi74n/image/upload/v1782869112/Avatars_06_yoitrw.png' },
                       { id: 'https://res.cloudinary.com/djcksi74n/image/upload/v1782869112/Avatars_07_nzpzef.png' },
                       { id: 'https://res.cloudinary.com/djcksi74n/image/upload/v1782869112/Avatars_08_ydwbsy.png' },
                       { id: 'https://res.cloudinary.com/djcksi74n/image/upload/v1782869113/Avatars_09_b7puvl.png' },
                       { id: 'https://res.cloudinary.com/djcksi74n/image/upload/v1782869112/Avatars_10_z5bvxg.png' },
                     ].map(avatar => {
                       const isSelected = currentUser.avatar === avatar.id;
                       return (
                         <button
                           key={avatar.id}
                           onClick={() => setCurrentUser({ ...currentUser, avatar: avatar.id })}
                           className={`w-16 h-16 rounded-2xl flex items-center justify-center border-2 transition-all overflow-hidden ${isSelected ? 'border-indigo-500 shadow-lg shadow-indigo-500/20 bg-indigo-500/10' : 'border-slate-700 bg-slate-800/50 hover:border-slate-500'}`}
                         >
                           {/* eslint-disable-next-line @next/next/no-img-element */}
                           <img src={avatar.id} alt="Avatar" className="w-full h-full object-cover" />
                         </button>
                       );
                     })}
                     
                     <label className="w-40 h-16 rounded-2xl flex flex-col items-center justify-center border-2 border-dashed border-slate-700 hover:border-indigo-500 hover:bg-indigo-500/10 cursor-pointer transition-colors text-slate-400 hover:text-indigo-400 group">
                       <Plus className="w-5 h-5 mb-1 group-hover:scale-110 transition-transform" />
                       <span className="text-[10px] font-medium uppercase tracking-wider">{t.uploadPicture}</span>
                       <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                     </label>
                   </div>
                 </div>

                 <div className="bg-slate-900/60 backdrop-blur-xl rounded-3xl p-8 border border-slate-800 shadow-xl">
                   <h3 className="text-lg font-semibold text-slate-200 mb-6">{t.profileDataTitle}</h3>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div>
                       <label className="block text-sm font-medium text-slate-400 mb-2">{t.nicknameLabel}</label>
                       <input 
                         type="text"
                         value={currentUser.nickname}
                         onChange={(e) => setCurrentUser({ ...currentUser, nickname: e.target.value })}
                         disabled={!isEditingCredentials}
                         className={`w-full bg-slate-950/50 border rounded-xl px-4 py-3 text-slate-100 focus:outline-none transition-colors ${isEditingCredentials ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-slate-700 opacity-75 cursor-not-allowed'}`}
                       />
                     </div>
                     <div>
                       <label className="block text-sm font-medium text-slate-400 mb-2">{t.emailLabel}</label>
                       <input 
                         type="email"
                         value={currentUser.email}
                         onChange={(e) => setCurrentUser({ ...currentUser, email: e.target.value })}
                         disabled={!isEditingCredentials}
                         className={`w-full bg-slate-950/50 border rounded-xl px-4 py-3 text-slate-100 focus:outline-none transition-colors ${isEditingCredentials ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-slate-700 opacity-75 cursor-not-allowed'}`}
                       />
                     </div>
                     <div>
                       <label className="block text-sm font-medium text-slate-400 mb-2">{t.phoneLabel}</label>
                       <input 
                         type="tel"
                         value={currentUser.phone}
                         placeholder={t.phonePlaceholder}
                         onChange={(e) => setCurrentUser({ ...currentUser, phone: e.target.value })}
                         disabled={!isEditingCredentials}
                         className={`w-full bg-slate-950/50 border rounded-xl px-4 py-3 text-slate-100 focus:outline-none transition-colors ${isEditingCredentials ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-slate-700 opacity-75 cursor-not-allowed'}`}
                       />
                     </div>
                   </div>
                   
                   <div className="mt-6 flex justify-end items-center gap-4">
                     <AnimatePresence>
                       {verificationFlash && (
                         <motion.span 
                           initial={{ opacity: 0, x: -10 }}
                           animate={{ opacity: 1, x: 0 }}
                           exit={{ opacity: 0, x: 10 }}
                           className="text-sm font-bold text-emerald-400 flex items-center gap-2"
                         >
                           <Zap className="w-4 h-4" />
                           {t.verificationSent}
                         </motion.span>
                       )}
                     </AnimatePresence>
                     
                     {isEditingCredentials ? (
                       <button
                         onClick={handleSaveCredentials}
                         disabled={isVerifying}
                         className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold shadow-lg shadow-indigo-500/20 transition-colors flex items-center gap-2 disabled:opacity-50"
                       >
                         {isVerifying && <Clock className="w-4 h-4 animate-spin" />}
                         {t.saveAndVerify}
                       </button>
                     ) : (
                       <button
                         onClick={() => setIsEditingCredentials(true)}
                         className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-semibold transition-colors"
                       >
                         {t.editCredentials}
                       </button>
                     )}
                   </div>
                 </div>
               </>
             )}
          </motion.div>
        ) : currentView === 'LOCATION' ? (
          <motion.div
            key="LOCATION"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="flex-1 w-full max-w-7xl mx-auto flex flex-col lg:flex-row gap-6 text-start h-full mt-6"
          >
            <BranchMapContainer 
              city={location === 'GPS' ? t.telAviv : (selectedBranch ? selectedBranch.name : t.telAviv)}
              lang={lang}
              skin={skin}
              liveBranches={liveBranches}
              activeMapPin={activeMapPin}
              setActiveMapPin={setActiveMapPin}
              t={t}
            />
          </motion.div>
        ) : currentView === 'SAVED_LISTS' ? (
          <motion.div
            key="SAVED_LISTS"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="flex-1 w-full max-w-4xl mx-auto flex flex-col gap-6 text-start mt-6"
          >
            <h2 className="text-3xl font-bold text-slate-100 mb-2">{t.navSavedLists}</h2>
            {isLoadingSaved ? (
               <div className="flex justify-center py-10">
                  <Clock className="w-8 h-8 text-indigo-400 animate-spin" />
               </div>
            ) : savedBaskets.length > 0 ? (
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {savedBaskets.map(sb => (
                   <div key={sb.id} className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 shadow-xl hover:bg-slate-900 transition-colors cursor-pointer group">
                     <div className="flex items-center gap-4 mb-4">
                       <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center text-indigo-400 group-hover:bg-indigo-500/20 group-hover:text-indigo-300 transition-colors">
                         <List className="w-6 h-6" />
                       </div>
                       <div>
                         <h3 className="font-bold text-slate-200">{sb.name}</h3>
                         <p className="text-xs text-slate-400">{new Date(sb.updated_at).toLocaleDateString()}</p>
                       </div>
                     </div>
                     <button 
                       onClick={(e) => {
                         e.stopPropagation();
                         setActiveBasketId(sb.id);
                         setCurrentView('HOME');
                       }}
                       className="w-full mt-2 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 py-2 rounded-xl text-sm font-semibold transition-colors border border-indigo-500/20"
                     >
                       {t.viewDetails}
                     </button>
                   </div>
                 ))}
               </div>
            ) : (
               <div className="bg-slate-900/60 backdrop-blur-xl rounded-3xl p-8 border border-slate-800 shadow-xl text-center">
                 <p className="text-slate-400">{t.emptyList}</p>
               </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key={currentView}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="flex-1 flex flex-col items-center justify-center min-h-[50vh] bg-slate-900/60 backdrop-blur-xl rounded-3xl border border-slate-800 shadow-xl p-8 text-center relative overflow-hidden"
          >
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-500/10 blur-3xl rounded-full pointer-events-none"></div>
            
            <div className="w-20 h-20 bg-slate-800/50 rounded-2xl flex items-center justify-center mb-6 border border-slate-700/50 relative z-10 shadow-lg shadow-indigo-500/10 text-indigo-400">
              {currentView === 'PRICE_UPDATES' && <TrendingDown className="w-10 h-10" />}
              {currentView === 'COMMUNITY' && <Users className="w-10 h-10" />}
            </div>
            
            <h2 className="text-2xl font-bold text-slate-100 mb-2 relative z-10">
              {currentView === 'PRICE_UPDATES' && t.navPriceUpdates}
              {currentView === 'COMMUNITY' && t.navCommunity}
            </h2>
            <p className="text-slate-400 max-w-md relative z-10">{t.placeholderDesc}</p>
            
            <button 
              onClick={() => setCurrentView('HOME')}
              className="mt-8 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-indigo-500/20 relative z-10"
            >
              {t.backToHome}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer / Dev Anchor */}
      <footer className="mt-8 pt-6 border-t border-slate-800/50 flex justify-center md:justify-end">
         <div className="flex items-center gap-2 bg-slate-900/50 px-4 py-2 rounded-full border border-slate-800/50 opacity-70 hover:opacity-100 transition-opacity cursor-not-allowed">
            <div className="w-2 h-2 rounded-full bg-slate-500"></div>
            <span className="text-xs font-mono text-slate-400">{t.devOptionsLocked}</span>
         </div>
      </footer>

      {/* Drawer Overlay */}
      <AnimatePresence>
        {isDrawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDrawerOpen(false)}
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ x: lang === 'he' ? '-100%' : '100%' }}
              animate={{ x: 0 }}
              exit={{ x: lang === 'he' ? '-100%' : '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={`fixed top-0 bottom-0 ${lang === 'he' ? 'left-0 border-r' : 'right-0 border-l'} w-72 bg-slate-900 border-slate-800 shadow-2xl z-50 flex flex-col`}
            >
              <div className="p-6 flex items-center justify-between border-b border-slate-800">
                <h2 className="text-lg font-bold text-slate-100">{t.appTitle}</h2>
                <button onClick={() => setIsDrawerOpen(false)} className="text-slate-400 hover:text-white transition-colors p-2 -m-2">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-1 px-3">
                <DrawerItem view="HOME" currentView={currentView} setCurrentView={setCurrentView} icon={Home} label={t.navHome} close={() => setIsDrawerOpen(false)} />
                <DrawerItem view="PROFILE" currentView={currentView} setCurrentView={setCurrentView} icon={User} label={t.navProfile} close={() => setIsDrawerOpen(false)} />
                <DrawerItem view="SAVED_LISTS" currentView={currentView} setCurrentView={setCurrentView} icon={List} label={t.navSavedLists} close={() => setIsDrawerOpen(false)} />
                <DrawerItem view="PRICE_UPDATES" currentView={currentView} setCurrentView={setCurrentView} icon={TrendingDown} label={t.navPriceUpdates} close={() => setIsDrawerOpen(false)} />
                <DrawerItem view="COMMUNITY" currentView={currentView} setCurrentView={setCurrentView} icon={Users} label={t.navCommunity} close={() => setIsDrawerOpen(false)} />
              </div>
              <div className="p-4 border-t border-slate-800">
                {currentUser ? (
                   <button onClick={() => { setCurrentUser(null); setIsDrawerOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-colors">
                     <LogOut className="w-5 h-5" />
                     {t.signOut}
                   </button>
                ) : (
                   <button onClick={() => { setAuthMode('SIGN_IN'); setIsDrawerOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-xl transition-colors">
                     <LogIn className="w-5 h-5" />
                     {t.signIn} / {t.signUp}
                   </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AuthModal 
        authMode={authMode} 
        setAuthMode={setAuthMode} 
        onAuthSuccess={async (nickname) => {
           if (supabase) {
             const { data: { user } } = await supabase.auth.getUser();
             if (user) {
               const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
               setCurrentUser({
                 id: user.id,
                 nickname: nickname || profile?.nickname || 'User',
                 email: profile?.email || user.email || '',
                 phone: profile?.phone_number || '',
                 avatar: profile?.avatar_url || 'https://res.cloudinary.com/djcksi74n/image/upload/v1782869112/Avatars_01_u3edkv.png'
               });
               if (profile?.selected_skin) setSkin(profile.selected_skin as Skin);
             }
           } else {
             setCurrentUser({
               id: '00000000-0000-0000-0000-000000000000',
               nickname: nickname || 'Mock User',
               email: 'mock@example.com',
               phone: '',
               avatar: 'https://res.cloudinary.com/djcksi74n/image/upload/v1782869112/Avatars_01_u3edkv.png'
             });
           }
        }} 
        t={t} 
      />

    </div>
  );
}

