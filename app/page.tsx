"use client";

import React, { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import {
  Search,
  ShoppingCart,
  List,
  User,
  TrendingDown,
  Check,
  Shield,
  AlertTriangle,
  RefreshCw,
  Plus,
  Trash2,
  Download,
  MapPin,
  Sparkles,
  ChevronDown,
  Bookmark,
  TrendingUp,
  Coins,
  Heart,
  Calendar,
  Menu,
  X,
  Settings,
  LogOut,
  Palette
} from "lucide-react";
import AuthModal from "./components/AuthModal";
import BranchMapContainer from "./components/BranchMapContainer";
import { motion, AnimatePresence } from "motion/react";

interface GroceryItem {
  productName: string;
  productNameEn?: string;
  quantity: string;
  quantityEn?: string;
  quantityValue: number;
  shufersalPrice: number;
  yohananofPrice: number;
  victoryPrice: number;
}

const PRESETS = [
  {
    name: { he: "סל בסיסי לשבת", en: "Shabbat Basic Basket" },
    list: {
      he: "3 יחידות חלב תנובה 3% בקרטון 1 ליטר\n2 ק\"ג עגבניות טריות (בתפזורת)\n1 יחידה קפה נמס עלית (פחית 200 גרם)\n1 יחידה ביצים XL (מארז 12)\n1 יחידה לחם אחיד פרוס 750 גרם\n2 יחידות פסטה ברילה ספגטי",
      en: "3 units Tnuva Milk 3% 1L\n2 kg Fresh Tomatoes (bulk)\n1 unit Elite Instant Coffee 200g\n1 unit Eggs XL (12-pack)\n1 unit Sliced Uniform Bread 750g\n2 units Barilla Spaghetti"
    }
  },
  {
    name: { he: "סל ירקות חקלאי", en: "Farm Fresh Vegetables" },
    list: {
      he: "3 ק\"ג עגבניות טריות\n2 ק\"ג מלפפון בלאדי\n1 ק\"ג בצל יבש באריזה\n2 ק\"ג תפוח אדמה אדום",
      en: "3 kg Fresh Tomatoes\n2 kg Baladi Cucumbers\n1 kg Dry Onions pack\n2 kg Red Potatoes"
    }
  },
  {
    name: { he: "סל מוצרי חלב ומזווה", en: "Dairy & Pantry Basket" },
    list: {
      he: "2 יחידות גבינת קוטג׳ 5% תנובה\n3 יחידות חלב תנובה 3%\n1 יחידה שמן קנולה מזוכך 1 ליטר\n1 יחידה אורז בסמטי קלאסי 1 ק\"ג",
      en: "2 units Cottage Cheese 5% Tnuva\n3 units Tnuva Milk 3%\n1 unit Canola Oil 1L\n1 unit Basmati Rice 1kg"
    }
  }
];

const CITIES = [
  { 
    name: { he: "רחובות", en: "Rehovot" }, 
    shufersalSuffix: { he: "קניון רחובות", en: "Rehovot Mall" }, 
    yohananofSuffix: { he: "רחובות ספורטק", en: "Rehovot Sportek" }, 
    victorySuffix: { he: "שערי רחובות", en: "Rehovot Gates" } 
  },
  { 
    name: { he: "תל אביב", en: "Tel Aviv" }, 
    shufersalSuffix: { he: "דיזנגוף סנטר", en: "Dizengoff Center" }, 
    yohananofSuffix: { he: "התקווה", en: "Hatikva" }, 
    victorySuffix: { he: "אבן גבירול" , en: "Ibn Gabirol" } 
  },
  { 
    name: { he: "ירושלים", en: "Jerusalem" }, 
    shufersalSuffix: { he: "תלפיות", en: "Talpiot" }, 
    yohananofSuffix: { he: "גבעת שאול", en: "Givat Shaul" }, 
    victorySuffix: { he: "שמאי", en: "Shamai" } 
  },
  { 
    name: { he: "חיפה", en: "Haifa" }, 
    shufersalSuffix: { he: "גרנד קניון", en: "Grand Canyon" }, 
    yohananofSuffix: { he: "צ'ק פוסט", en: "Check Post" }, 
    victorySuffix: { he: "מרכז חורב", en: "Horev Center" } 
  },
  { 
    name: { he: "בילו / קרית עקרון", en: "Bilu / Kiryat Ekron" }, 
    shufersalSuffix: { he: "עקרון צפון", en: "Ekron North" }, 
    yohananofSuffix: { he: "צומת בילו", en: "Bilu Junction" }, 
    victorySuffix: { he: "בילו סנטר", en: "Bilu Center" } 
  }
];

const DICTIONARY = {
  he: {
    dir: "rtl" as const,
    title: "Smart Grocery IL",
    subtitle: "סל קניות אלגוריתמי מבוסס בינה מלאכותית",
    searchPlaceholder: "חיפוש מהיר של מוצרים ומותגים בסל...",
    areaComparison: "אזור השוואה:",
    dashboardTitle: "לוח בקרה אלגוריתמי",
    dashboardActive: "פעיל",
    savedLists: "רשימות שמורות",
    savedListsCount: "3 סלים",
    householdProfile: "פרופיל משק בית",
    historicalPriceAnalysis: "ניתוח מחירים היסטורי",
    sampleLists: "רשימות קניות לדוגמה",
    rawListTitle: "רשימת קניות גולמית",
    rawListDesc: "הקלידו או הדביקו רשימה חופשית בעברית. אלגוריתם הניתוח יחלץ את המוצרים, יזהה כמויות ויערוך השוואת מחירים מיידית בין הרשתות.",
    rawListPlaceholder: `הזינו רשימה כאן... לדוגמה:\n2 ק"ג עגבניות\nחלב 3% תנובה\nקפה נמס עלית\nביצים L`,
    optimizeBtn: "בצע אופטימיזציה לסל",
    optimizingText: "מנתח את הסל אלגוריתמית...",
    cheapestBasket: "הסל הזול ביותר",
    recommended: "מומלץ",
    chainLabel: "רשת:",
    averageBasket: "סל ממוצע ארצי/אזורי",
    averageBasketDesc: "עלות רשת ממוצעת לסל זה",
    potentialSavings: "חיסכון פוטנציאלי",
    calculated: "מחושב",
    savingsDesc: "חיסכון ריאלי ממעבר רשת",
    matrixTitle: "מטריצת השוואת מחירים (אלגוריתמית)",
    itemsCount: "פריטים זוהו",
    manualAddBtn: "הוספת פריט ידנית",
    exportBtn: "ייצוא סל",
    exportingText: "דוח יוצא...",
    addFormProductName: "שם מוצר חילופי",
    addFormProductPlaceholder: "לדוגמא: לחם כוסמין",
    addFormQtyText: "כמות (מלל)",
    addFormQtyPlaceholder: "1 יחידה",
    addFormMultiplier: "מכפיל",
    addFormShufersalPrice: "מחיר שופרסל (₪)",
    addFormYohananofPrice: "מחיר יוחננוף (₪)",
    addFormVictoryPrice: "ויקטורי (₪)",
    addBtn: "הוסף",
    tableColProduct: "מוצר זוהה באלגוריתם",
    tableColQty: "כמות",
    tableColShufersal: "שופרסל",
    tableColYohananof: "יוחננוף",
    tableColVictory: "ויקטורי",
    tableColDelete: "מחיקה",
    cheapBadge: "זול",
    totalCalculated: "סה״כ סל קניות מחושב",
    milestone3: "Milestone 3: Branch Mapping Infrastructure",
    branchMapActive: "מפת סניפים פתוחה (מבוסס מיקום תל אביב)",
    requestingGeo: "מבקש הרשאת מיקום...",
    lockedGeo: "Locked • לחץ כאן לאישור הרשאת מיקום (GPS)",
    liveSync: "LIVE PRICE SYNC ACTIVE",
    exportSuccess: "הדוח יוצא בהצלחה! קובץ CSV נוצר במערכת.",
    noProductsFound: "לא נמצאו מוצרים התואמים את החיפוש",
    tryEditing: "נסו לערוך את רשימת הקניות מצד ימין מחדש",
    developmentVersion: "גרסת פיתוח פעילה",
    developmentMilestone: "Milestone 1: UI/UX High-Fidelity",
    frameworks: "React 19 + Next.js 15 App Router",
    userDefaultName: "ישראל ישראלי",
    userStatus: "Premium Member",
    userInitials: "יי",
    themeLabel: "ערכת נושא",
    themeLight: "בהיר",
    themeSlate: "אמרלד",
    themeCyberpunk: "סייבר",
    workspaceTitle: "לוח עבודה אישי",
    workspaceSubtitle: "ניהול סלים שמורים ומדדי חיסכון",
    savedBasketsTitle: "סלים שמורים",
    lifetimeSavingsTitle: "חיסכון מצטבר לכל החיים",
    saveCurrentBasket: "שמור סל נוכחי",
    basketSavedSuccess: "הסל נשמר בהצלחה בלוח העבודה!",
    noSavedBaskets: "אין עדיין סלים שמורים",
    quickSaveToolTip: "שמירה מהירה של הסל האופטימלי",
    savedAt: "נשמר ב-",
    items: "מוצרים",
  },
  en: {
    dir: "ltr" as const,
    title: "Smart Grocery IL",
    subtitle: "AI-Powered Algorithmic Grocery Shopping Cart",
    searchPlaceholder: "Quick search for products and brands...",
    areaComparison: "Comparison Area:",
    dashboardTitle: "Algorithmic Dashboard",
    dashboardActive: "Active",
    savedLists: "Saved Lists",
    savedListsCount: "3 Baskets",
    householdProfile: "Household Profile",
    historicalPriceAnalysis: "Historical Prices",
    sampleLists: "Sample Shopping Lists",
    rawListTitle: "Raw Shopping List",
    rawListDesc: "Type or paste any free-text shopping list in Hebrew or English. Our AI parsing model extracts products, quantities, and maps real store prices.",
    rawListPlaceholder: `Enter shopping items... e.g.:\n2 kg tomatoes\n1 carton milk 3%\nElite instant coffee\n12 eggs XL`,
    optimizeBtn: "Optimize Shopping Cart",
    optimizingText: "Analyzing list...",
    cheapestBasket: "Cheapest Basket",
    recommended: "Recommended",
    chainLabel: "Chain:",
    averageBasket: "National/Regional Avg",
    averageBasketDesc: "Average supermarket chain cost",
    potentialSavings: "Potential Savings",
    calculated: "Calculated",
    savingsDesc: "Real savings by switching chains",
    matrixTitle: "Price Comparison Matrix (Algorithmic)",
    itemsCount: "items detected",
    manualAddBtn: "Add Item Manually",
    exportBtn: "Export Basket",
    exportingText: "Exporting...",
    addFormProductName: "Alternative Product",
    addFormProductPlaceholder: "e.g., Spelt Bread",
    addFormQtyText: "Quantity (text)",
    addFormQtyPlaceholder: "1 unit",
    addFormMultiplier: "Mult.",
    addFormShufersalPrice: "Shufersal Price ($)",
    addFormYohananofPrice: "Yohananof Price ($)",
    addFormVictoryPrice: "Victory ($)",
    addBtn: "Add",
    tableColProduct: "Algorithm Identified Product",
    tableColQty: "Qty",
    tableColShufersal: "Shufersal",
    tableColYohananof: "Yohananof",
    tableColVictory: "Victory",
    tableColDelete: "Delete",
    cheapBadge: "Cheap",
    totalCalculated: "Total Calculated Basket",
    milestone3: "Milestone 3: Branch Mapping Infrastructure",
    branchMapActive: "Branch map active (Based on Tel Aviv location)",
    requestingGeo: "Requesting GPS permissions...",
    lockedGeo: "Locked • Click to authorize location (GPS)",
    liveSync: "LIVE PRICE SYNC ACTIVE",
    exportSuccess: "Report exported successfully! CSV downloaded.",
    noProductsFound: "No products found matching your search",
    tryEditing: "Try editing the shopping list text on the side",
    developmentVersion: "Dev Environment Active",
    developmentMilestone: "Milestone 1: UI/UX High-Fidelity",
    frameworks: "React 19 + Next.js 15 App Router",
    userDefaultName: "Yisrael Yisraeli",
    userStatus: "Premium Member",
    userInitials: "YY",
    themeLabel: "Theme",
    themeLight: "Light",
    themeSlate: "Emerald",
    themeCyberpunk: "Cyberpunk",
    workspaceTitle: "User Workspace",
    workspaceSubtitle: "Manage saved baskets & savings metrics",
    savedBasketsTitle: "Saved Baskets",
    lifetimeSavingsTitle: "Lifetime Savings",
    saveCurrentBasket: "Save Current Basket",
    basketSavedSuccess: "Basket saved successfully to your workspace!",
    noSavedBaskets: "No saved baskets yet",
    quickSaveToolTip: "Quick save the optimized basket",
    savedAt: "Saved on",
    items: "items",
  }
};

export default function Dashboard() {
  const [lang, setLang] = useState<"he" | "en">("he");
  const [skin, setSkin] = useState<"light" | "slate" | "cyberpunk">("slate");
  const { data: session, status } = useSession();
  const isLoggedIn = status === "authenticated";
  const currentUser = session?.user?.name || null;
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const t = DICTIONARY[lang];

  const [rawList, setRawList] = useState<string>(PRESETS[0].list.he);

  const [items, setItems] = useState<GroceryItem[]>([
    {
      productName: "חלב תנובה 3% בקרטון 1 ליטר",
      productNameEn: "Tnuva Milk 3% 1L carton",
      quantity: "3 יחידות",
      quantityEn: "3 units",
      quantityValue: 3,
      shufersalPrice: 6.20,
      yohananofPrice: 5.90,
      victoryPrice: 6.20
    },
    {
      productName: "עגבניות טריות (בתפזורת)",
      productNameEn: "Fresh Tomatoes (Bulk)",
      quantity: "2 ק\"ג",
      quantityEn: "2 kg",
      quantityValue: 2,
      shufersalPrice: 4.90,
      yohananofPrice: 5.50,
      victoryPrice: 5.20
    },
    {
      productName: "קפה נמס עלית (פחית 200 גרם)",
      productNameEn: "Elite Instant Coffee (200g can)",
      quantity: "1 יחידה",
      quantityEn: "1 unit",
      quantityValue: 1,
      shufersalPrice: 16.90,
      yohananofPrice: 14.90,
      victoryPrice: 15.50
    },
    {
      productName: "ביצים XL (מארז 12)",
      productNameEn: "Eggs XL (12-pack)",
      quantity: "1 יחידה",
      quantityEn: "1 unit",
      quantityValue: 1,
      shufersalPrice: 13.40,
      yohananofPrice: 12.90,
      victoryPrice: 13.20
    }
  ]);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedCity, setSelectedCity] = useState(CITIES[0]);
  const [showMapDrawer, setShowMapDrawer] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [geoAuthStatus, setGeoAuthStatus] = useState<"locked" | "requesting" | "granted">("locked");
  const [isAiPowered, setIsAiPowered] = useState<boolean | null>(null);
  const [isDownloaded, setIsDownloaded] = useState(false);

  // User Workspace States
  const [savedBaskets, setSavedBaskets] = useState([
    {
      id: "basket-1",
      nameHe: "סל קניות שבועי יסודי",
      nameEn: "Weekly Essentials Basket",
      date: "24/06/2026",
      itemCount: 6,
      totalPrice: 84.50,
      chainNameHe: "יוחננוף",
      chainNameEn: "Yohananof",
      listTextHe: "3 יחידות חלב תנובה 3% בקרטון 1 ליטר\n2 ק\"ג עגבניות טריות (בתפזורת)\n1 יחידה קפה נמס עלית (פחית 200 גרם)",
      listTextEn: "3 units Tnuva Milk 3% 1L\n2 kg Fresh Tomatoes (bulk)\n1 unit Elite Instant Coffee 200g"
    },
    {
      id: "basket-2",
      nameHe: "ירקות ופירות טריים שוק",
      nameEn: "Fresh Produce Basket",
      date: "19/06/2026",
      itemCount: 4,
      totalPrice: 52.80,
      chainNameHe: "ויקטורי",
      chainNameEn: "Victory",
      listTextHe: "3 ק\"ג עגבניות טריות\n2 ק\"ג מלפפון בלאדי\n1 ק\"ג בצל יבש באריזה",
      listTextEn: "3 kg Fresh Tomatoes\n2 kg Baladi Cucumbers\n1 kg Dry Onions pack"
    }
  ]);
  const [lifetimeSavings, setLifetimeSavings] = useState(420);
  const [showSaveToast, setShowSaveToast] = useState(false);
  const [basketCounter, setBasketCounter] = useState(3);

  const handleSaveCurrentBasket = () => {
    const formattedDate = "24/06/2026";
    const newId = `basket-${basketCounter}`;
    setBasketCounter(prev => prev + 1);

    const newBasket = {
      id: newId,
      nameHe: lang === "he" ? `סל אופטימלי - ${formattedDate}` : `Optimized Basket - ${formattedDate}`,
      nameEn: lang === "en" ? `Optimized Basket - ${formattedDate}` : `סל אופטימלי - ${formattedDate}`,
      date: formattedDate,
      itemCount: items.length,
      totalPrice: cheapest.total,
      chainNameHe: cheapest.name,
      chainNameEn: cheapest.id === "shufersal" ? "Shufersal" : cheapest.id === "yohananof" ? "Yohananof" : "Victory",
      listTextHe: rawList,
      listTextEn: rawList,
    };

    setSavedBaskets([newBasket, ...savedBaskets]);
    
    const calculatedSaved = Math.max(15, Math.round(averageTotal - cheapest.total));
    setLifetimeSavings(prev => prev + (isNaN(calculatedSaved) ? 25 : calculatedSaved));

    setShowSaveToast(true);
    setTimeout(() => {
      setShowSaveToast(false);
    }, 3000);
  };

  const handleDeleteSavedBasket = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSavedBaskets(savedBaskets.filter(b => b.id !== id));
  };

  // New item inline form states
  const [newProductName, setNewProductName] = useState("");
  const [newQuantity, setNewQuantity] = useState("1 יחידה");
  const [newQuantityValue, setNewQuantityValue] = useState(1);
  const [newShufersalPrice, setNewShufersalPrice] = useState(10);
  const [newYohananofPrice, setNewYohananofPrice] = useState(9.5);
  const [newVictoryPrice, setNewVictoryPrice] = useState(9.8);
  const [showAddForm, setShowAddForm] = useState(false);

  // Dynamic calculations based on state items
  const shufersalTotal = items.reduce((sum, item) => sum + item.shufersalPrice * item.quantityValue, 0);
  const yohananofTotal = items.reduce((sum, item) => sum + item.yohananofPrice * item.quantityValue, 0);
  const victoryTotal = items.reduce((sum, item) => sum + item.victoryPrice * item.quantityValue, 0);

  const totals = [
    { name: "שופרסל", id: "shufersal", total: shufersalTotal, branch: selectedCity.shufersalSuffix[lang], color: "bg-blue-500" },
    { name: "יוחננוף", id: "yohananof", total: yohananofTotal, branch: selectedCity.yohananofSuffix[lang], color: "bg-emerald-500" },
    { name: "ויקטורי", id: "victory", total: victoryTotal, branch: selectedCity.victorySuffix[lang], color: "bg-amber-500" }
  ];

  // Sort by total price ascending to find the cheapest, average, etc.
  const sortedTotals = [...totals].sort((a, b) => a.total - b.total);
  const cheapest = sortedTotals[0];
  const averageTotal = (shufersalTotal + yohananofTotal + victoryTotal) / 3;
  const savingsPercent = averageTotal > 0 ? ((averageTotal - cheapest.total) / averageTotal) * 100 : 0;

  // Handle live optimization trigger
  const handleOptimize = async (customListText?: string) => {
    const textToParse = customListText !== undefined ? customListText : rawList;
    if (!textToParse.trim()) return;

    setIsLoading(true);
    try {
      const response = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawList: textToParse }),
      });

      if (!response.ok) {
        throw new Error("רשת המזון או שירותי הניתוח אינם זמינים כעת");
      }

      const data = await response.json();
      if (data.items) {
        setItems(data.items);
        setIsAiPowered(!data.isFallback);
      }
    } catch (err) {
      console.error("Error optimizing list:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Load preset shopping list
  const loadPreset = (presetListObj: { he: string; en: string }) => {
    const text = presetListObj[lang];
    setRawList(text);
    handleOptimize(text);
  };

  // Inline delete item
  const handleDeleteItem = (index: number) => {
    setItems(items.filter((_, idx) => idx !== index));
  };

  // Inline add item
  const handleAddItemSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProductName.trim()) return;

    const newItem: GroceryItem = {
      productName: newProductName.trim(),
      quantity: newQuantity,
      quantityValue: Number(newQuantityValue) || 1,
      shufersalPrice: Number(newShufersalPrice) || 0,
      yohananofPrice: Number(newYohananofPrice) || 0,
      victoryPrice: Number(newVictoryPrice) || 0
    };

    setItems([...items, newItem]);
    // Reset fields
    setNewProductName("");
    setNewQuantity("1 יחידה");
    setNewQuantityValue(1);
    setNewShufersalPrice(10);
    setNewYohananofPrice(9.5);
    setNewVictoryPrice(9.8);
    setShowAddForm(false);
  };

  // Geolocation trigger simulation
  const requestGeolocation = () => {
    setGeoAuthStatus("requesting");
    setTimeout(() => {
      // Simulate access granted
      setGeoAuthStatus("granted");
      // Find closest branch based on "location" -> set to a closer city
      setSelectedCity(CITIES[1]); // Tel Aviv
    }, 1500);
  };

  // CSV/Report download simulation
  const triggerDownload = () => {
    setIsDownloaded(true);
    setTimeout(() => setIsDownloaded(false), 3000);
  };

  // Filter items matching the search query if any
  const filteredItems = items.filter(item => {
    const query = searchQuery.toLowerCase();
    const matchHe = item.productName.toLowerCase().includes(query) || item.quantity.toLowerCase().includes(query);
    const matchEn = item.productNameEn?.toLowerCase().includes(query) || item.quantityEn?.toLowerCase().includes(query);
    return matchHe || matchEn;
  });

  return (
    <div 
      id="app-root-container" 
      data-skin={skin} 
      className="flex h-screen w-full bg-[var(--background)] text-[var(--text)] font-sans overflow-hidden transition-all duration-300" 
      dir={t.dir}
    >
      {/* Dynamic Background Blur Effects */}
      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-[var(--accent)]/10 rounded-full blur-[140px] pointer-events-none z-0 transition-colors duration-300"></div>
      <div className="absolute bottom-[-10%] left-[-5%] w-[400px] h-[400px] bg-[var(--primary)]/5 rounded-full blur-[110px] pointer-events-none z-0 transition-colors duration-300"></div>

      {/* Mobile Sidebar Overlay Backdrop */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-35 lg:hidden backdrop-blur-xs"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar Section */}
      <aside 
        id="sidebar-panel" 
        className={`fixed lg:static inset-y-0 start-0 border-e z-40 w-72 bg-[var(--panel)] border-[var(--panel-border)] flex flex-col shrink-0 transition-transform duration-300 lg:translate-x-0 ${
          isSidebarOpen 
            ? "translate-x-0" 
            : lang === "he" 
              ? "translate-x-full" 
              : "-translate-x-full"
        }`}
      >
        <div className="p-6 border-b border-[var(--panel-border)] transition-colors duration-300 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[var(--primary)] rounded-lg flex items-center justify-center font-black text-[var(--text-highlight)] text-lg shadow-[0_0_15px_var(--primary-glow)] transition-all duration-300">
              S
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[var(--text-highlight)] flex items-center gap-1.5 transition-colors duration-300">
                {t.title}
              </h1>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5 transition-colors duration-300">{t.subtitle}</p>
            </div>
          </div>
          {/* Close button for mobile sidebar */}
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="p-1.5 rounded-lg hover:bg-[var(--background)] border border-[var(--panel-border)] text-[var(--text)] lg:hidden cursor-pointer"
            title="Close Menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <div className="px-3 py-2.5 bg-blue-500/10 text-blue-400 rounded-xl flex items-center justify-between border border-blue-500/20">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
              </div>
              <span className="font-semibold text-sm">{t.dashboardTitle}</span>
            </div>
            <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-md border border-blue-500/30">{t.dashboardActive}</span>
          </div>

          <div className="px-3 py-2.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 rounded-xl flex items-center justify-between transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <List className="w-4 h-4 text-slate-500" />
              <span className="text-sm">{t.savedLists}</span>
            </div>
            <span className="text-xs text-slate-600 font-mono">{t.savedListsCount}</span>
          </div>

          <div className="px-3 py-2.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 rounded-xl flex items-center gap-3 transition-all cursor-pointer">
            <User className="w-4 h-4 text-slate-500" />
            <span className="text-sm">{t.householdProfile}</span>
          </div>

          <div className="px-3 py-2.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 rounded-xl flex items-center gap-3 transition-all cursor-pointer">
            <TrendingDown className="w-4 h-4 text-slate-500" />
            <span className="text-sm">{t.historicalPriceAnalysis}</span>
          </div>

          {/* Visual Divider */}
          <div className="border-t border-[var(--panel-border)] my-4"></div>

          {/* Customization / התאמה אישית Section */}
          <div className="space-y-3 px-1">
            <div className="flex items-center gap-1.5 text-[var(--text-highlight)] px-2">
              <Palette className="w-3.5 h-3.5 text-[var(--primary)]" />
              <span className="text-xs font-bold uppercase tracking-wider">
                {lang === "he" ? "התאמה אישית" : "Customization / התאמה אישית"}
              </span>
            </div>

            {/* Bilingual Language toggles */}
            <div className="grid grid-cols-2 gap-1 bg-[var(--background)] p-1 rounded-lg border border-[var(--panel-border)]">
              <button
                onClick={() => setLang("he")}
                className={`py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${
                  lang === "he"
                    ? "bg-[var(--primary)] text-[var(--text-highlight)] shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                עברית
              </button>
              <button
                onClick={() => setLang("en")}
                className={`py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${
                  lang === "en"
                    ? "bg-[var(--primary)] text-[var(--text-highlight)] shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                EN
              </button>
            </div>

            {/* 3-Skin theme palette swapper buttons */}
            <div className="grid grid-cols-3 gap-1 bg-[var(--background)] p-1 rounded-lg border border-[var(--panel-border)]">
              <button
                onClick={() => setSkin("light")}
                className={`py-1 rounded text-[9px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                  skin === "light"
                    ? "bg-[var(--primary)] text-[var(--text-highlight)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-slate-100 border border-slate-300"></span>
                <span>{lang === "he" ? "בהיר" : "Light"}</span>
              </button>
              <button
                onClick={() => setSkin("slate")}
                className={`py-1 rounded text-[9px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                  skin === "slate"
                    ? "bg-[var(--primary)] text-[var(--text-highlight)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>{lang === "he" ? "אמרלד" : "Emerald"}</span>
              </button>
              <button
                onClick={() => setSkin("cyberpunk")}
                className={`py-1 rounded text-[9px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                  skin === "cyberpunk"
                    ? "bg-[var(--primary)] text-[var(--text-highlight)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-pink-500"></span>
                <span>{lang === "he" ? "סייבר" : "Cyber"}</span>
              </button>
            </div>

            {/* Log Out option directly inside Customization Section */}
            {isLoggedIn && (
              <button
                onClick={() => {
                  signOut({ redirect: false });
                }}
                className="w-full mt-2 py-1.5 px-3 rounded-lg text-xs font-bold text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all flex items-center justify-between cursor-pointer border border-transparent hover:border-red-500/20"
              >
                <span className="flex items-center gap-1.5">
                  <LogOut className="w-3.5 h-3.5" />
                  <span>{lang === "he" ? "התנתק מהמערכת" : "Sign Out"}</span>
                </span>
                <span>➔</span>
              </button>
            )}
          </div>

          <div className="pt-6">
            <p className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">{t.sampleLists}</p>
            <div className="space-y-1.5 px-2">
              {PRESETS.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => loadPreset(p.list)}
                  className="w-full text-start text-xs px-3 py-2 rounded-lg bg-slate-950/40 hover:bg-slate-800 text-slate-300 border border-slate-800/50 hover:border-slate-700 transition-all flex items-center justify-between group"
                >
                  <span className="truncate">{p.name[lang]}</span>
                  <Sparkles className="w-3.5 h-3.5 text-slate-500 group-hover:text-blue-400 transition-colors shrink-0 ms-2" />
                </button>
              ))}
            </div>
          </div>
        </nav>

        {/* Sidebar Footer */}
        <div className="p-5 border-t border-slate-800 bg-slate-950/40">
          <div className="p-4 bg-blue-950/20 border border-blue-900/50 rounded-xl">
            <p className="text-[10px] text-blue-400 font-semibold uppercase mb-1 tracking-widest">{t.developmentVersion}</p>
            <p className="text-xs text-slate-300 font-medium">{t.developmentMilestone}</p>
            <p className="text-[10px] text-slate-500 mt-2 font-mono">{t.frameworks}</p>
          </div>
        </div>
      </aside>

      {/* Main Container Section */}
      <main id="main-content-panel" className="flex-1 flex flex-col relative overflow-hidden">
        {/* Header Component */}
        <header id="top-navbar-header" className="relative min-h-16 border-b border-[var(--panel-border)] bg-[var(--panel)] flex flex-col lg:flex-row items-center justify-between p-4 md:px-8 gap-4 z-10 shrink-0 transition-all duration-300">
          
          {/* Mobile top-row container for brand title + mobile menu toggle */}
          <div className="flex items-center justify-between w-full lg:hidden">
            {/* Mobile Left Block: Single Sign In Button / Signed In Badge (Top-left of the header bar) */}
            <div className="flex flex-col items-start">
              <div>
                {isLoggedIn ? (
                  <div
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white flex items-center gap-1 text-[10px] font-black select-none shrink-0 border border-emerald-500/20 shadow-md shadow-emerald-950/20"
                    title={lang === "he" ? "מחובר למערכת" : "Signed In to System"}
                  >
                    <Check className="w-3 h-3" />
                    <span>{lang === "he" ? "✓ מחובר" : "✓ Signed In / מחובר"}</span>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsAuthOpen(true)}
                    className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-[var(--primary)] to-[var(--accent)] text-white hover:scale-105 active:scale-95 transition-all duration-200 flex items-center gap-1 text-[10px] font-extrabold cursor-pointer shadow-lg shadow-[var(--primary-glow)] shrink-0"
                    title={lang === "he" ? "התחברות למערכת" : "Sign In to System"}
                  >
                    <User className="w-3 h-3" />
                    <span>{lang === "he" ? "התחברות" : "Sign In"}</span>
                  </button>
                )}
              </div>
              <div className="flex flex-col mt-1 space-y-0.5 text-start">
                <span className="text-[9px] font-bold text-[var(--text-highlight)]">
                  {isLoggedIn ? (session?.user?.name || t.userDefaultName) : "אורח / Guest"}
                </span>
                <span className="text-[8px] text-[var(--text-muted)] font-medium">
                  {isLoggedIn ? ((session?.user as any)?.membershipTier || "Premium") : (lang === "he" ? "דרגת בסיס" : "Standard Tier")}
                </span>
              </div>
            </div>

            {/* Mobile Right Block with menu toggle and profile dropdown */}
            <div className="flex items-center gap-2">
              {/* Quick Profile Avatar for Mobile */}
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[var(--primary)] to-[var(--accent)] p-0.5 shadow-md select-none">
                <div className="w-full h-full rounded-[6px] bg-[var(--background)] flex items-center justify-center font-bold text-xs text-[var(--text-highlight)]">
                  {currentUser ? currentUser.slice(0, 2).toUpperCase() : t.userInitials}
                </div>
              </div>

              {/* Brand Logo */}
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-[var(--primary)] rounded flex items-center justify-center font-black text-white text-xs shadow-md">
                  S
                </div>
                <span className="font-bold text-xs text-[var(--text-highlight)]">{t.title}</span>
              </div>

              {/* Sidebar Menu Toggle */}
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 rounded-lg hover:bg-[var(--background)] border border-[var(--panel-border)] text-[var(--text)] cursor-pointer"
                title="Toggle Menu"
              >
                <Menu className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Desktop Left Block: Single Sign In Button / Signed In Badge (Always at the start corner on desktop) */}
          <div className="hidden lg:flex flex-col items-start shrink-0 transition-all">
            <div>
              {isLoggedIn ? (
                <div
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white flex items-center gap-1.5 text-xs font-bold select-none shrink-0 border border-emerald-500/20 shadow-md shadow-emerald-950/20"
                  title={lang === "he" ? "מחובר למערכת" : "Signed In to System"}
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{lang === "he" ? "✓ מחובר" : "✓ Signed In / מחובר"}</span>
                </div>
              ) : (
                <button
                  onClick={() => setIsAuthOpen(true)}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-[var(--primary)] to-[var(--accent)] text-white hover:scale-105 active:scale-95 transition-all duration-200 flex items-center gap-1.5 text-xs font-bold cursor-pointer shadow-lg shadow-[var(--primary-glow)] shrink-0"
                  title={lang === "he" ? "התחברות למערכת" : "Sign In to System"}
                >
                  <User className="w-3.5 h-3.5" />
                  <span>{lang === "he" ? "התחברות" : "Sign In"}</span>
                </button>
              )}
            </div>
            <div className="flex flex-col mt-1 space-y-0.5 text-start">
              <span className="text-[11px] font-bold text-[var(--text-highlight)]">
                {isLoggedIn ? (session?.user?.name || t.userDefaultName) : "אורח / Guest"}
              </span>
              <span className="text-[9px] text-[var(--text-muted)] font-medium">
                {isLoggedIn ? ((session?.user as any)?.membershipTier || "Premium") : (lang === "he" ? "דרגת בסיס" : "Standard Tier")}
              </span>
            </div>
          </div>

          {/* Search bar & Location wrapper (Always centered on desktop) */}
          <div className="flex flex-col md:flex-row gap-4 items-center w-full lg:flex-1 lg:max-w-2xl">
            {/* Search Input (Takes 3/4 space on desktop, full on mobile) */}
            <div className="relative w-full md:w-3/4">
              <Search className="absolute start-3.5 top-2.5 w-4 h-4 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder={t.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 bg-[var(--background)]/80 border border-[var(--panel-border)] hover:border-[var(--primary)]/50 focus:border-[var(--primary)] rounded-full text-xs text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none transition-all ps-10 pe-4"
              />
            </div>

            {/* City Branch Selector (Takes 1/4 space on desktop, full on mobile) */}
            <div 
              onClick={() => setShowMapDrawer(true)}
              className="flex items-center gap-2 bg-[var(--background)]/80 border border-[var(--panel-border)] hover:border-[var(--primary)]/50 focus-within:border-[var(--primary)] rounded-full px-3.5 h-9 w-full md:w-1/4 transition-colors duration-300 cursor-pointer"
            >
              <MapPin className="w-3.5 h-3.5 text-[var(--primary)] shrink-0 transition-colors duration-300" />
              <select
                value={selectedCity.name.he}
                onChange={(e) => {
                  const cityObj = CITIES.find(c => c.name.he === e.target.value || c.name.en === e.target.value);
                  if (cityObj) {
                    setSelectedCity(cityObj);
                    setShowMapDrawer(true);
                  }
                }}
                className="w-full bg-transparent text-xs text-[var(--text-highlight)] font-semibold focus:outline-none cursor-pointer pe-1"
              >
                {CITIES.map((c, idx) => (
                  <option key={idx} value={c.name[lang]} className="bg-[var(--background)] text-[var(--text)]">
                    {c.name[lang]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Nav Actions (User Profile) (Always at the end corner on desktop) */}
          <div className="flex items-center justify-center gap-3 md:gap-4 w-full lg:w-auto">
            {/* Profile Avatar (Desktop) */}
            <div className="hidden lg:flex items-center gap-3 select-none" title={lang === "he" ? "חשבון משתמש" : "User Account"}>
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[var(--primary)] to-[var(--accent)] p-0.5 shadow-md">
                <div className="w-full h-full rounded-[6px] bg-[var(--background)] flex items-center justify-center font-bold text-xs text-[var(--text-highlight)] transition-colors duration-300">
                  {currentUser ? currentUser.slice(0, 2).toUpperCase() : t.userInitials}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Sliding Branch Map Drawer */}
        <AnimatePresence>
          {showMapDrawer && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="border-b border-[var(--panel-border)] bg-slate-950/90 backdrop-blur-md overflow-hidden shrink-0"
            >
              <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <h2 className="text-sm font-black text-[var(--text-highlight)] tracking-tight">
                      {lang === "he" ? "מפת סניפים חכמה ושירותים מבוססי מיקום" : "Smart Branch Map & Location Services"}
                    </h2>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMapDrawer(false);
                    }}
                    className="text-xs font-bold text-red-400 hover:text-red-300 transition-colors flex items-center gap-1.5 cursor-pointer bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 rounded-lg border border-red-500/20"
                  >
                    <span>{lang === "he" ? "✕ סגור מפה" : "✕ Close Map"}</span>
                  </button>
                </div>
                <BranchMapContainer selectedCity={selectedCity} lang={lang} skin={skin} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dashboard Dynamic Workspace Grid */}
        <div id="grid-layout-workspace" className="flex-1 p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-y-auto lg:overflow-hidden h-full">
          
          {/* Raw Text Shopping List Parser Side */}
          <section id="input-editor-column" className="col-span-1 lg:col-span-4 flex flex-col gap-6 h-auto lg:h-full lg:overflow-hidden">
            {currentUser && (
              <div className="bg-[var(--panel)] backdrop-blur-md border border-[var(--panel-border)] p-5 rounded-2xl flex flex-col relative transition-all duration-300 shrink-0">
                <div className="absolute top-0 right-0 left-0 h-[2px] bg-gradient-to-r from-[var(--primary)] to-[var(--accent)]"></div>
                
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Bookmark className="w-4 h-4 text-[var(--primary)]" />
                    <h3 className="text-sm font-bold text-[var(--text-highlight)]">{t.workspaceTitle}</h3>
                  </div>
                  <span className="text-[9px] bg-[var(--primary)]/15 text-[var(--primary)] px-2 py-0.5 rounded font-mono font-bold uppercase">
                    Premium Active
                  </span>
                </div>

                {/* Lifetime metric card */}
                <div className="bg-[var(--background)] border border-[var(--panel-border)] p-3 rounded-xl flex items-center justify-between mb-4 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-[var(--primary)]/5 rounded-full blur-xl pointer-events-none"></div>
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-[var(--primary)]/10 text-[var(--primary)] rounded-lg">
                      <Coins className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">{t.lifetimeSavingsTitle}</p>
                      <p className="text-lg font-black text-[var(--text-highlight)] font-mono">₪{lifetimeSavings}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full">
                    <TrendingUp className="w-3 h-3" />
                    <span>+12.4%</span>
                  </div>
                </div>

                {/* Saved Baskets list */}
                <p className="text-[10px] text-[var(--text-muted)] font-extrabold uppercase tracking-wider mb-2">{t.savedBasketsTitle}</p>
                <div className="space-y-2 max-h-[140px] overflow-y-auto scrollbar-thin pr-1">
                  {savedBaskets.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)] italic py-2 text-center">{t.noSavedBaskets}</p>
                  ) : (
                    savedBaskets.map((basket) => (
                      <div 
                        key={basket.id}
                        onClick={() => {
                          const targetText = lang === "he" ? basket.listTextHe : basket.listTextEn;
                          setRawList(targetText);
                          handleOptimize(targetText);
                        }}
                        className="bg-[var(--background)]/60 hover:bg-[var(--background)] border border-[var(--panel-border)] hover:border-[var(--primary)]/40 p-2.5 rounded-xl flex items-center justify-between cursor-pointer transition-all group"
                        title={lang === "he" ? "לחץ לטעינת ושערוך הסל" : "Click to load and re-optimize basket"}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-[var(--text-highlight)] truncate group-hover:text-[var(--primary)] transition-colors">
                            {lang === "he" ? basket.nameHe : basket.nameEn}
                          </p>
                          <div className="flex items-center gap-2 mt-1 text-[10px] text-[var(--text-muted)]">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {basket.date}
                            </span>
                            <span>•</span>
                            <span>{basket.itemCount} {t.items}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-bold text-[var(--primary)] font-mono">
                            ₪{basket.totalPrice.toFixed(0)}
                          </span>
                          <button
                            onClick={(e) => handleDeleteSavedBasket(basket.id, e)}
                            className="p-1 rounded hover:bg-red-950/40 text-[var(--text-muted)] hover:text-red-400 border border-transparent hover:border-red-900 transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                            title={lang === "he" ? "מחק סל" : "Delete basket"}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="flex-1 bg-[var(--panel)] backdrop-blur-md border border-[var(--panel-border)] p-5 rounded-2xl flex flex-col overflow-hidden relative">
              <div className="absolute top-0 right-0 left-0 h-[2px] bg-gradient-to-r from-[var(--primary)] to-[var(--accent)] transition-all duration-300"></div>

              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-[var(--primary)]" />
                  <h3 className="text-base font-bold text-[var(--text-highlight)]">{t.rawListTitle}</h3>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] bg-[var(--accent)]/15 text-[var(--accent)] px-2 py-0.5 rounded border border-[var(--panel-border)] font-bold tracking-wider font-mono uppercase">
                    AI PARSER READY
                  </span>
                  {isAiPowered && (
                    <span className="text-[9px] bg-[var(--primary)]/15 text-[var(--primary)] px-2 py-0.5 rounded border border-[var(--primary)]/30 font-bold tracking-wider font-mono uppercase">
                      ACTIVE GEMINI
                    </span>
                  )}
                </div>
              </div>

              <p className="text-xs text-[var(--text-muted)] mb-3 leading-relaxed">
                {t.rawListDesc}
              </p>

              <textarea
                value={rawList}
                onChange={(e) => setRawList(e.target.value)}
                className={`flex-1 bg-[var(--background)]/60 border border-[var(--panel-border)] rounded-xl p-4 text-xs font-mono text-[var(--text)] focus:outline-none focus:border-[var(--primary)]/50 resize-none leading-relaxed transition-all scrollbar-thin`}
                placeholder={t.rawListPlaceholder}
                dir={lang === "he" ? "rtl" : "ltr"}
                disabled={isLoading}
              ></textarea>

              <div className="mt-4 flex flex-col gap-2">
                <button
                  onClick={() => handleOptimize()}
                  disabled={isLoading}
                  className="w-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] disabled:opacity-60 py-3 rounded-xl font-bold text-xs text-white transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-[var(--primary-glow)] cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      {t.optimizingText}
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      {t.optimizeBtn}
                    </>
                  )}
                </button>
              </div>
            </div>
          </section>

          {/* Left Grid Side (Stats and Comparison Matrix Table) */}
          <section id="analytics-data-column" className="col-span-1 lg:col-span-8 flex flex-col gap-6 h-auto lg:h-full lg:overflow-y-auto scrollbar-thin pe-1">
            
            {/* Top Stats Cards Block */}
            <div id="quick-metrics-grid" className="h-auto lg:h-[140px] grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
              
              {/* Cheapest Basket Metric */}
              <div className="bg-[var(--panel)] backdrop-blur-md border border-[var(--panel-border)] p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden group hover:border-[var(--primary)]/50 transition-all">
                <div className="absolute top-0 right-0 w-24 h-24 bg-[var(--primary)]/5 rounded-full blur-2xl pointer-events-none"></div>
                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-[var(--text-muted)] uppercase font-extrabold tracking-widest">{t.cheapestBasket}</p>
                    <div className="flex items-center gap-1.5">
                      {currentUser && (
                        <button
                          onClick={handleSaveCurrentBasket}
                          className="px-2 py-1 rounded bg-[var(--primary)]/10 hover:bg-[var(--primary)] text-[var(--primary)] hover:text-white border border-[var(--primary)]/20 hover:border-[var(--primary)] transition-all flex items-center gap-1 text-[9px] font-bold cursor-pointer"
                          title={t.quickSaveToolTip}
                        >
                          <Bookmark className="w-2.5 h-2.5 fill-current" />
                          <span>{t.saveCurrentBasket}</span>
                        </button>
                      )}
                      <span className="text-[9px] bg-[var(--primary)]/15 text-[var(--primary)] px-2 py-0.5 rounded font-mono border border-[var(--primary)]/30">{t.recommended}</span>
                    </div>
                  </div>
                  <h2 className="text-2xl font-black text-[var(--primary)] mt-2 font-mono">
                    ₪{cheapest.total.toFixed(2)}
                  </h2>
                  <p className="text-xs text-[var(--text-muted)] mt-1.5">
                    {t.chainLabel} <span className="text-[var(--text-highlight)] font-semibold">{cheapest.name} ({cheapest.branch})</span>
                  </p>
                </div>
                <div className="mt-3">
                  <div className="h-1.5 w-full bg-[var(--background)] rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--primary)] w-[100%] rounded-full shadow-[0_0_8px_var(--primary-glow)]"></div>
                  </div>
                </div>
              </div>

              {/* Average Basket Metric */}
              <div className="bg-[var(--panel)] backdrop-blur-md border border-[var(--panel-border)] p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden hover:border-[var(--primary)]/50 transition-all">
                <div>
                  <p className="text-[10px] text-[var(--text-muted)] uppercase font-extrabold tracking-widest">{t.averageBasket}</p>
                  <h2 className="text-2xl font-black text-[var(--text-highlight)] mt-3 font-mono">
                    ₪{averageTotal.toFixed(2)}
                  </h2>
                  <p className="text-xs text-[var(--text-muted)] mt-1.5">
                    {t.averageBasketDesc}
                  </p>
                </div>
                <div className="mt-3">
                  <div className="h-1.5 w-full bg-[var(--background)] rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-[var(--accent)] rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, (cheapest.total / (averageTotal || 1)) * 100)}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* Potential Savings Metric */}
              <div className="bg-[var(--panel)] backdrop-blur-md border border-[var(--panel-border)] p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden hover:border-[var(--primary)]/50 transition-all">
                <div className="absolute top-0 right-0 w-24 h-24 bg-[var(--accent)]/5 rounded-full blur-2xl pointer-events-none"></div>
                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-[var(--text-muted)] uppercase font-extrabold tracking-widest">{t.potentialSavings}</p>
                    <span className="text-[9px] bg-[var(--accent)]/15 text-[var(--accent)] px-2 py-0.5 rounded font-mono border border-[var(--panel-border)] font-bold">{t.calculated}</span>
                  </div>
                  <h2 className="text-2xl font-black text-[var(--accent)] mt-2 font-mono">
                    {savingsPercent.toFixed(1)}%
                  </h2>
                  <p className="text-xs text-[var(--text-muted)] mt-1.5">
                    {t.savingsDesc}
                  </p>
                </div>
                <div className="mt-3">
                  <div className="h-1.5 w-full bg-[var(--background)] rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-[var(--accent)] rounded-full shadow-[0_0_8px_var(--accent-glow)] transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(10, savingsPercent * 3))}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Price Comparison Matrix Board */}
            <div id="price-comparison-matrix-card" className="flex-1 bg-[var(--panel)] backdrop-blur-md border border-[var(--panel-border)] rounded-2xl flex flex-col overflow-hidden transition-all duration-300">
              
              {/* Card Header */}
              <div className="p-5 border-b border-[var(--panel-border)] flex items-center justify-between shrink-0 bg-[var(--background)]/20 transition-all duration-300">
                <div className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-[var(--primary)] animate-pulse"></div>
                  <h3 className="font-bold text-[var(--text-highlight)] text-sm">{t.matrixTitle}</h3>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono">({filteredItems.length} {t.itemsCount})</span>
                </div>
                
                <div className="flex items-center gap-3">
                  {currentUser && (
                    <button
                      onClick={handleSaveCurrentBasket}
                      className="h-8 px-3 rounded-lg bg-[var(--primary)]/10 hover:bg-[var(--primary)] border border-[var(--primary)]/30 text-xs font-semibold text-[var(--primary)] hover:text-white transition-all flex items-center gap-1.5 cursor-pointer"
                      title={t.quickSaveToolTip}
                    >
                      <Bookmark className="w-3.5 h-3.5" />
                      <span>{t.saveCurrentBasket}</span>
                    </button>
                  )}

                  {/* Inline Add Item Trigger */}
                  <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="h-8 px-3 rounded-lg bg-[var(--background)]/80 hover:bg-[var(--background)] border border-[var(--panel-border)] text-xs font-semibold text-[var(--text)] transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-[var(--primary)]" />
                    {t.manualAddBtn}
                  </button>

                  {/* Print / Download Button */}
                  <button
                    onClick={triggerDownload}
                    className="h-8 px-3 rounded-lg bg-[var(--background)]/80 hover:bg-[var(--background)] border border-[var(--panel-border)] text-xs font-semibold text-[var(--text)] transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    {isDownloaded ? t.exportingText : t.exportBtn}
                  </button>
                </div>
              </div>

              {/* Inline Add Item Form (Optional Drawer) */}
              {showAddForm && (
                <form onSubmit={handleAddItemSubmit} className="p-4 bg-[var(--background)]/90 border-b border-[var(--panel-border)] flex flex-col md:grid md:grid-cols-12 gap-3 items-stretch md:items-end animate-fade-in shrink-0 transition-all duration-300">
                  <div className="md:col-span-3">
                    <label className="block text-[10px] text-[var(--text-muted)] mb-1">{t.addFormProductName}</label>
                    <input
                      type="text"
                      required
                      placeholder={t.addFormProductPlaceholder}
                      value={newProductName}
                      onChange={(e) => setNewProductName(e.target.value)}
                      className="w-full h-8 bg-[var(--panel)] border border-[var(--panel-border)] rounded px-2.5 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--primary)]"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] text-[var(--text-muted)] mb-1">{t.addFormQtyText}</label>
                    <input
                      type="text"
                      placeholder={t.addFormQtyPlaceholder}
                      value={newQuantity}
                      onChange={(e) => setNewQuantity(e.target.value)}
                      className="w-full h-8 bg-[var(--panel)] border border-[var(--panel-border)] rounded px-2.5 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--primary)]"
                    />
                  </div>
                  <div className="md:col-span-1">
                    <label className="block text-[10px] text-[var(--text-muted)] mb-1">{t.addFormMultiplier}</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={newQuantityValue}
                      onChange={(e) => setNewQuantityValue(Number(e.target.value))}
                      className="w-full h-8 bg-[var(--panel)] border border-[var(--panel-border)] rounded px-2 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--primary)] text-center font-mono"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] text-[var(--text-muted)] mb-1">{t.addFormShufersalPrice}</label>
                    <input
                      type="number"
                      step="0.1"
                      required
                      value={newShufersalPrice}
                      onChange={(e) => setNewShufersalPrice(Number(e.target.value))}
                      className="w-full h-8 bg-[var(--panel)] border border-[var(--panel-border)] rounded px-2 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--primary)] font-mono"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] text-[var(--text-muted)] mb-1">{t.addFormYohananofPrice}</label>
                    <input
                      type="number"
                      step="0.1"
                      required
                      value={newYohananofPrice}
                      onChange={(e) => setNewYohananofPrice(Number(e.target.value))}
                      className="w-full h-8 bg-[var(--panel)] border border-[var(--panel-border)] rounded px-2 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--primary)] font-mono"
                    />
                  </div>
                  <div className="md:col-span-2 flex items-end gap-1.5">
                    <div className="flex-1">
                      <label className="block text-[10px] text-[var(--text-muted)] mb-1">{t.addFormVictoryPrice}</label>
                      <input
                        type="number"
                        step="0.1"
                        required
                        value={newVictoryPrice}
                        onChange={(e) => setNewVictoryPrice(Number(e.target.value))}
                        className="w-full h-8 bg-[var(--panel)] border border-[var(--panel-border)] rounded px-2 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--primary)] font-mono"
                      />
                    </div>
                    <button
                      type="submit"
                      className="h-8 px-4 bg-[var(--primary)] hover:bg-[var(--primary-hover)] rounded text-xs font-bold text-white shrink-0 cursor-pointer transition-colors"
                    >
                      {t.addBtn}
                    </button>
                  </div>
                </form>
              )}

              {/* Data Grid Table View */}
              <div className="flex-1 overflow-y-auto scrollbar-thin">
                {filteredItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] p-8">
                    <ShoppingCart className="w-12 h-12 text-[var(--panel-border)] mb-3 animate-pulse" />
                    <p className="text-sm">{t.noProductsFound}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">{t.tryEditing}</p>
                  </div>
                ) : (
                  <table className="w-full text-start text-xs relative">
                    <thead>
                      <tr className="bg-[var(--background)] border-b border-[var(--panel-border)] text-[var(--text-muted)] font-bold uppercase tracking-wider sticky top-0 z-10 transition-colors duration-300">
                        <th className="p-4 font-semibold text-[var(--text)]">{t.tableColProduct}</th>
                        <th className="p-4 font-semibold text-[var(--text)] text-center">{t.tableColQty}</th>
                        <th className="p-4 font-semibold text-[var(--text)] text-end">{t.tableColShufersal} ({selectedCity.name[lang]})</th>
                        <th className="p-4 font-semibold text-[var(--text)] text-end">{t.tableColYohananof} ({selectedCity.name[lang]})</th>
                        <th className="p-4 font-semibold text-[var(--text)] text-end">{t.tableColVictory} ({selectedCity.name[lang]})</th>
                        <th className="p-4 font-semibold text-[var(--text)] text-center w-12">{t.tableColDelete}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--panel-border)]/60">
                      {filteredItems.map((item, idx) => {
                        // Find the lowest price for this specific row
                        const minPrice = Math.min(item.shufersalPrice, item.yohananofPrice, item.victoryPrice);

                        return (
                          <tr key={idx} className="hover:bg-[var(--background)]/30 transition-colors group">
                            <td className="p-4 font-medium text-[var(--text-highlight)] max-w-xs truncate">
                              <span className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] transition-colors duration-300"></span>
                                {lang === "en" && item.productNameEn ? item.productNameEn : item.productName}
                              </span>
                            </td>
                            <td className="p-4 text-center text-[var(--text)] font-mono font-bold">
                              {lang === "en" && item.quantityEn ? item.quantityEn : item.quantity}
                            </td>
                            
                            {/* Shufersal Price Cell */}
                            <td className={`p-4 text-end font-mono text-sm ${
                              item.shufersalPrice === minPrice 
                                ? "text-[var(--primary)] font-bold bg-[var(--primary)]/5" 
                                : "text-[var(--text)]"
                            }`}>
                              ₪{item.shufersalPrice.toFixed(2)}
                              {item.shufersalPrice === minPrice && (
                                <span className="text-[9px] bg-[var(--primary)]/15 text-[var(--primary)] px-1 py-0.5 rounded ms-1">{t.cheapBadge}</span>
                              )}
                            </td>

                            {/* Yohananof Price Cell */}
                            <td className={`p-4 text-end font-mono text-sm ${
                              item.yohananofPrice === minPrice 
                                ? "text-[var(--primary)] font-bold bg-[var(--primary)]/5" 
                                : "text-[var(--text)]"
                            }`}>
                              ₪{item.yohananofPrice.toFixed(2)}
                              {item.yohananofPrice === minPrice && (
                                <span className="text-[9px] bg-[var(--primary)]/15 text-[var(--primary)] px-1 py-0.5 rounded ms-1">{t.cheapBadge}</span>
                              )}
                            </td>

                            {/* Victory Price Cell */}
                            <td className={`p-4 text-end font-mono text-sm ${
                              item.victoryPrice === minPrice 
                                ? "text-[var(--primary)] font-bold bg-[var(--primary)]/5" 
                                : "text-[var(--text)]"
                            }`}>
                              ₪{item.victoryPrice.toFixed(2)}
                              {item.victoryPrice === minPrice && (
                                <span className="text-[9px] bg-[var(--primary)]/15 text-[var(--primary)] px-1 py-0.5 rounded ms-1">{t.cheapBadge}</span>
                              )}
                            </td>

                            {/* Delete Cell */}
                            <td className="p-4 text-center">
                              <button
                                onClick={() => handleDeleteItem(idx)}
                                className="p-1 rounded bg-[var(--background)] hover:bg-red-950/40 text-[var(--text-muted)] hover:text-red-400 border border-[var(--panel-border)] hover:border-red-900 transition-all opacity-40 group-hover:opacity-100 cursor-pointer"
                                title="מחיקת פריט"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    
                    {/* Totals Row */}
                    <tfoot>
                      <tr className="bg-[var(--background)]/85 border-t border-[var(--panel-border)] text-xs font-bold font-mono transition-colors duration-300">
                        <td className="p-4 text-[var(--text-highlight)] font-sans text-sm">{t.totalCalculated}</td>
                        <td className="p-4"></td>
                        
                        {/* Shufersal Total Column */}
                        <td className={`p-4 text-end text-sm ${
                          shufersalTotal === cheapest.total ? "text-[var(--primary)] font-black" : "text-[var(--text)]"
                        }`}>
                          ₪{shufersalTotal.toFixed(2)}
                          {shufersalTotal === cheapest.total && (
                            <div className="text-[8px] bg-[var(--primary)]/15 text-[var(--primary)] px-1 py-0.5 rounded mt-1 text-center font-sans">{t.cheapestBasket}</div>
                          )}
                        </td>

                        {/* Yohananof Total Column */}
                        <td className={`p-4 text-end text-sm ${
                          yohananofTotal === cheapest.total ? "text-[var(--primary)] font-black" : "text-[var(--text)]"
                        }`}>
                          ₪{yohananofTotal.toFixed(2)}
                          {yohananofTotal === cheapest.total && (
                            <div className="text-[8px] bg-[var(--primary)]/15 text-[var(--primary)] px-1 py-0.5 rounded mt-1 text-center font-sans">{t.cheapestBasket}</div>
                          )}
                        </td>

                        {/* Victory Total Column */}
                        <td className={`p-4 text-end text-sm ${
                          victoryTotal === cheapest.total ? "text-[var(--primary)] font-black" : "text-[var(--text)]"
                        }`}>
                          ₪{victoryTotal.toFixed(2)}
                          {victoryTotal === cheapest.total && (
                            <div className="text-[8px] bg-[var(--primary)]/15 text-[var(--primary)] px-1 py-0.5 rounded mt-1 text-center font-sans">{t.cheapestBasket}</div>
                          )}
                        </td>
                        <td className="p-4"></td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Footer Navigation Area */}
        <footer id="bottom-status-footer" className="h-12 border-t border-[var(--panel-border)] bg-[var(--panel)]/80 backdrop-blur-md px-8 flex items-center justify-between z-10 shrink-0 transition-all duration-300">
          <div className="flex items-center gap-4 text-[10px] text-[var(--text-muted)] tracking-widest uppercase font-semibold">
            <span>{t.milestone3}</span>
            <div className="w-4 h-px bg-[var(--panel-border)]"></div>
            {geoAuthStatus === "granted" ? (
              <span className="text-[var(--primary)] flex items-center gap-1 font-semibold">
                <Check className="w-3 h-3" /> {t.branchMapActive}
              </span>
            ) : geoAuthStatus === "requesting" ? (
              <span className="text-[var(--accent)] animate-pulse">{t.requestingGeo}</span>
            ) : (
              <button 
                onClick={requestGeolocation} 
                className="text-[var(--accent)] hover:text-[var(--primary)] flex items-center gap-1 hover:underline font-semibold cursor-pointer"
              >
                {t.lockedGeo}
              </button>
            )}
          </div>
          
          <div className="flex gap-4 items-center">
            {isDownloaded && (
              <span className="text-[10px] text-[var(--primary)] bg-[var(--primary)]/15 px-2.5 py-1 border border-[var(--primary)]/20 rounded-md animate-bounce">
                {t.exportSuccess}
              </span>
            )}
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--primary)] shadow-[0_0_8px_var(--primary-glow)] animate-pulse"></span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono tracking-wider font-semibold uppercase">{t.liveSync}</span>
            </div>
          </div>
        </footer>
      </main>

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        lang={lang}
      />



      {/* Toast Notification */}
      <AnimatePresence>
        {showSaveToast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            className="fixed bottom-16 right-8 z-50 p-4 bg-[var(--panel)] border border-[var(--primary)]/30 rounded-xl shadow-xl flex items-center gap-3 backdrop-blur-xl"
            dir={lang === "he" ? "rtl" : "ltr"}
          >
            <div className="p-2 bg-[var(--primary)]/10 text-[var(--primary)] rounded-lg">
              <Check className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-[var(--text-highlight)]">{t.basketSavedSuccess}</p>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                {lang === "he" ? "הסל שמור כעת בלוח העבודה האישי" : "The basket is now available in your workspace"}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
