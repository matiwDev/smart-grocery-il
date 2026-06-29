"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "motion/react"
import { MapPin, Clock, Compass, Navigation, Search, Check, Info } from "lucide-react"

interface City {
  name: { he: string; en: string }
  shufersalSuffix: { he: string; en: string }
  yohananofSuffix: { he: string; en: string }
  victorySuffix: { he: string; en: string }
}

interface BranchMapContainerProps {
  selectedCity: City
  lang: "he" | "en"
  skin: "light" | "slate" | "cyberpunk"
}

interface Branch {
  id: string
  chain: "shufersal" | "yohananof" | "victory" | "ramilevy"
  chainName: { he: string; en: string }
  branchName: { he: string; en: string }
  address: { he: string; en: string }
  distance: number // in km
  isOpen: boolean
  hours: string
  lat: number // custom relative % offset for mock map visual
  lng: number // custom relative % offset for mock map visual
  color: string
}

export default function BranchMapContainer({ selectedCity, lang, skin }: BranchMapContainerProps) {
  const [activeBranchId, setActiveBranchId] = useState<string>("shufersal-1")
  const [searchQuery, setSearchQuery] = useState("")

  // Generate branches based on the selected city
  const branches: Branch[] = [
    {
      id: "shufersal-1",
      chain: "shufersal",
      chainName: { he: "שופרסל דיל", en: "Shufersal Deal" },
      branchName: selectedCity.shufersalSuffix,
      address: {
        he: `שדרות המקצועות 12, ${selectedCity.name.he}`,
        en: `12 HaMikzo'ot Blvd, ${selectedCity.name.en}`,
      },
      distance: 1.2,
      isOpen: true,
      hours: "07:00 - 23:00",
      lat: 35,
      lng: 42,
      color: "#10b981", // emerald
    },
    {
      id: "yohananof-1",
      chain: "yohananof",
      chainName: { he: "יוחננוף", en: "Yohananof" },
      branchName: selectedCity.yohananofSuffix,
      address: {
        he: `דרך המשי 44, ${selectedCity.name.he}`,
        en: `44 Silk Road, ${selectedCity.name.en}`,
      },
      distance: 2.5,
      isOpen: true,
      hours: "08:00 - 22:00",
      lat: 65,
      lng: 28,
      color: "#ef4444", // red
    },
    {
      id: "victory-1",
      chain: "victory",
      chainName: { he: "ויקטורי", en: "Victory" },
      branchName: selectedCity.victorySuffix,
      address: {
        he: `רחוב העצמאות 8, ${selectedCity.name.he}`,
        en: `8 HaAtzmaut St, ${selectedCity.name.en}`,
      },
      distance: 3.1,
      isOpen: false,
      hours: "07:30 - 21:00",
      lat: 48,
      lng: 70,
      color: "#fdec0e", // yellow
    },
    {
      id: "ramilevy-1",
      chain: "ramilevy",
      chainName: { he: "רמי לוי", en: "Rami Levy" },
      branchName: {
        he: `אזור התעשייה, ${selectedCity.name.he}`,
        en: `Industrial Zone, ${selectedCity.name.en}`,
      },
      address: {
        he: `רחוב המלאכה 15, ${selectedCity.name.he}`,
        en: `15 HaMelacha St, ${selectedCity.name.en}`,
      },
      distance: 4.3,
      isOpen: true,
      hours: "07:30 - 23:00",
      lat: 78,
      lng: 55,
      color: "#3b82f6", // blue
    },
  ]

  // Filter branches based on search query
  const filteredBranches = branches.filter((b) => {
    const term = searchQuery.toLowerCase()
    const nameHe = b.chainName.he + " " + b.branchName.he + " " + b.address.he
    const nameEn = b.chainName.en + " " + b.branchName.en + " " + b.address.en
    return nameHe.toLowerCase().includes(term) || nameEn.toLowerCase().includes(term)
  })

  const activeBranch = branches.find((b) => b.id === activeBranchId) || filteredBranches[0] || branches[0]

  const isRTL = lang === "he"

  return (
    <div id="branch-map-container" className="w-full bg-[var(--panel)] backdrop-blur-md border border-[var(--panel-border)] rounded-2xl overflow-hidden flex flex-col md:grid md:grid-cols-12 min-h-[500px] transition-all duration-300">
      
      {/* Sidebar: Nearby Branches (1/3 space on desktop) */}
      <div className="md:col-span-4 border-b md:border-b-0 md:border-e border-[var(--panel-border)] flex flex-col h-[400px] md:h-[550px]">
        {/* Header Search Area */}
        <div className="p-4 border-b border-[var(--panel-border)] bg-[var(--background)]/20 shrink-0">
          <h3 className="text-sm font-bold text-[var(--text-highlight)] flex items-center gap-2 mb-3">
            <Compass className="w-4 h-4 text-[var(--primary)] animate-spin-slow" />
            <span>{lang === "he" ? "סניפים קרובים באזורך" : "Nearby Store Branches"}</span>
          </h3>
          <div className="relative">
            <Search className="absolute start-3 top-2.5 w-3.5 h-3.5 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder={lang === "he" ? "חפש סניף או רשת..." : "Search branch or chain..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 bg-[var(--background)]/80 border border-[var(--panel-border)] hover:border-[var(--primary)]/50 focus:border-[var(--primary)] rounded-lg text-xs text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none transition-all ps-9 pe-4"
            />
          </div>
        </div>

        {/* Scrollable Branch list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5 scrollbar-thin">
          <AnimatePresence mode="popLayout">
            {filteredBranches.map((b) => {
              const isActive = b.id === activeBranchId
              return (
                <motion.div
                  key={b.id}
                  layout
                  onClick={() => setActiveBranchId(b.id)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all duration-300 relative group overflow-hidden ${
                    isActive
                      ? "bg-[var(--primary)]/10 border-[var(--primary)]/50 shadow-md shadow-[var(--primary)]/5"
                      : "bg-[var(--background)]/40 border-[var(--panel-border)] hover:border-[var(--primary)]/30 hover:bg-[var(--background)]/70"
                  }`}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  {/* Visual Accent glow line for active branch */}
                  {isActive && (
                    <div className="absolute top-0 bottom-0 start-0 w-1 bg-[var(--primary)]" />
                  )}

                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-[var(--text-highlight)]">
                          {b.chainName[lang]}
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)] px-1.5 py-0.5 rounded bg-[var(--background)]/80 border border-[var(--panel-border)]">
                          {b.branchName[lang]}
                        </span>
                      </div>
                      <p className="text-[10px] text-[var(--text-muted)] truncate">
                        {b.address[lang]}
                      </p>
                    </div>

                    <div className="flex flex-col items-end shrink-0 gap-1.5">
                      <span className="text-[10px] font-mono font-bold text-[var(--primary)] bg-[var(--primary)]/10 px-1.5 py-0.5 rounded">
                        {b.distance} {lang === "he" ? 'ק"מ' : "km"}
                      </span>
                      {b.isOpen ? (
                        <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1 rounded">
                          {lang === "he" ? "פתוח" : "Open"}
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-1 rounded">
                          {lang === "he" ? "סגור" : "Closed"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Operational Hours Reveal on Active */}
                  {isActive && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="mt-2.5 pt-2 border-t border-[var(--panel-border)]/60 flex items-center justify-between text-[9px] text-[var(--text-muted)]"
                    >
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-[var(--primary)]" />
                        <span>{lang === "he" ? "שעות פעילות:" : "Hours:"} {b.hours}</span>
                      </span>
                      <span className="text-[9px] text-[var(--accent)] font-semibold flex items-center gap-0.5 hover:underline">
                        <Navigation className="w-2.5 h-2.5" />
                        <span>{lang === "he" ? "ניווט" : "Navigate"}</span>
                      </span>
                    </motion.div>
                  )}
                </motion.div>
              )
            })}

            {filteredBranches.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-[var(--text-muted)]">
                <MapPin className="w-8 h-8 text-[var(--panel-border)] mb-2 animate-pulse" />
                <p className="text-xs">{lang === "he" ? "לא נמצאו סניפים העונים לחיפוש" : "No branches match your search"}</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Map Placeholder Canvas Interface (2/3 space on desktop) */}
      <div className="md:col-span-8 h-[350px] md:h-[550px] relative bg-slate-950/80 overflow-hidden flex flex-col justify-between p-4">
        
        {/* Modern Cyberpunk Map Backdrop SVG (Visual Art) */}
        <div className="absolute inset-0 z-0 opacity-25 pointer-events-none select-none">
          <svg className="w-full h-full" viewBox="0 0 800 600" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Elegant Grid Lines */}
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(51, 65, 85, 0.4)" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />

            {/* Concentric rings to symbolize scanning/radar sweep */}
            <circle cx="400" cy="300" r="100" stroke="rgba(16, 185, 129, 0.15)" strokeWidth="1" strokeDasharray="5,5" />
            <circle cx="400" cy="300" r="200" stroke="rgba(16, 185, 129, 0.1)" strokeWidth="1" />
            <circle cx="400" cy="300" r="300" stroke="rgba(16, 185, 129, 0.05)" strokeWidth="1" strokeDasharray="10,10" />

            {/* Simulated abstract highway routing lines */}
            <path d="M 100 100 Q 300 150 400 300 T 700 500" stroke="rgba(59, 130, 246, 0.15)" strokeWidth="2" fill="none" />
            <path d="M 700 100 Q 500 250 400 300 T 100 500" stroke="rgba(16, 185, 129, 0.1)" strokeWidth="1.5" fill="none" strokeDasharray="3,3" />
            <path d="M 50 300 H 750" stroke="rgba(51, 65, 85, 0.2)" strokeWidth="1" fill="none" />
            <path d="M 400 50 V 550" stroke="rgba(51, 65, 85, 0.2)" strokeWidth="1" fill="none" />
          </svg>
        </div>

        {/* Theme-based animated radar scanning overlay */}
        {skin !== "light" && (
          <div className="absolute inset-0 pointer-events-none z-0">
            <motion.div
              className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border ${
                skin === "cyberpunk" ? "border-pink-500/20 bg-pink-500/2" : "border-emerald-500/10 bg-emerald-500/1"
              }`}
              initial={{ width: 0, height: 0, opacity: 0.8 }}
              animate={{ width: "600px", height: "600px", opacity: 0 }}
              transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
            />
            <motion.div
              className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border ${
                skin === "cyberpunk" ? "border-yellow-400/10" : "border-blue-500/10"
              }`}
              initial={{ width: 0, height: 0, opacity: 0.6 }}
              animate={{ width: "400px", height: "400px", opacity: 0 }}
              transition={{ repeat: Infinity, duration: 4, delay: 2, ease: "linear" }}
            />
          </div>
        )}

        {/* Map UI Floating Controls */}
        <div className="z-10 flex items-center justify-between gap-2 shrink-0">
          <div className="bg-[var(--panel)]/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-[var(--panel-border)] text-[10px] text-[var(--text-muted)] flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-[var(--primary)] animate-pulse" />
            <span className="font-bold text-[var(--text-highlight)]">{selectedCity.name[lang]}</span>
            <span>•</span>
            <span>{lang === "he" ? "מפות לווין משוערכות" : "Algorithmic Satellite Mapping"}</span>
          </div>

          <div className="flex gap-1.5">
            <button className="p-1.5 rounded-lg bg-[var(--panel)]/90 backdrop-blur-md border border-[var(--panel-border)] text-[var(--text-muted)] hover:text-[var(--primary)] transition-all cursor-pointer hover:scale-105" title={lang === "he" ? "מרכז מפה" : "Recenter Map"}>
              <Navigation className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Center Current Location Hub Indicator */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center">
          <div className="relative flex items-center justify-center">
            <div className="absolute w-8 h-8 rounded-full bg-[var(--accent)]/30 animate-ping" />
            <div className="absolute w-5 h-5 rounded-full bg-[var(--accent)]/50 animate-pulse" />
            <div className="w-3.5 h-3.5 rounded-full bg-[var(--accent)] border-2 border-white shadow-lg" />
          </div>
          <span className="mt-1 bg-slate-900/90 text-[8px] font-bold text-slate-200 px-1.5 py-0.5 rounded border border-slate-700/50 backdrop-blur-md">
            {lang === "he" ? "המיקום שלך" : "Your Location"}
          </span>
        </div>

        {/* Interactive Mock Map Pins */}
        <div className="absolute inset-0 z-10 pointer-events-auto">
          {branches.map((b) => {
            const isActive = b.id === activeBranchId
            return (
              <div
                key={b.id}
                className="absolute transition-all duration-700"
                style={{ top: `${b.lat}%`, left: `${b.lng}%` }}
              >
                <div className="relative -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group/pin">
                  {/* Pin Circle/Marker */}
                  <button
                    onClick={() => setActiveBranchId(b.id)}
                    className={`p-1.5 rounded-full shadow-lg border-2 transition-all duration-300 ${
                      isActive
                        ? "scale-125 z-30"
                        : "scale-100 hover:scale-110 z-20"
                    }`}
                    style={{
                      backgroundColor: isActive ? b.color : "rgba(15, 23, 42, 0.9)",
                      borderColor: b.color,
                    }}
                  >
                    <MapPin
                      className="w-3.5 h-3.5"
                      style={{ color: isActive ? "#000000" : b.color }}
                    />
                  </button>

                  {/* Micro label above pin */}
                  <div
                    className={`mt-1 bg-slate-950/95 border px-1.5 py-0.5 rounded text-[8px] font-bold whitespace-nowrap backdrop-blur-md pointer-events-none transition-all duration-300 ${
                      isActive
                        ? "opacity-100 scale-100 border-[var(--primary)] text-white"
                        : "opacity-40 group-hover/pin:opacity-100 scale-95 border-slate-700 text-slate-400"
                    }`}
                  >
                    {b.chainName[lang]}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Selected Branch Mini HUD Overlay at bottom of Map */}
        <AnimatePresence mode="wait">
          {activeBranch && (
            <motion.div
              key={activeBranch.id}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 15, opacity: 0 }}
              className="z-10 bg-slate-900/90 backdrop-blur-md border border-slate-800 p-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <div
                  className="p-2 rounded-lg shrink-0 mt-0.5"
                  style={{ backgroundColor: `${activeBranch.color}15` }}
                >
                  <MapPin className="w-4 h-4" style={{ color: activeBranch.color }} />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>{activeBranch.chainName[lang]}</span>
                    <span className="text-[10px] text-slate-400 font-normal">({activeBranch.branchName[lang]})</span>
                  </h4>
                  <p className="text-[10px] text-slate-400 mt-0.5 truncate">{activeBranch.address[lang]}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 justify-between sm:justify-end shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-800/60">
                <div className="flex flex-col items-start sm:items-end">
                  <span className="text-[9px] text-slate-500">{lang === "he" ? "מרחק משוער:" : "Estimated Distance:"}</span>
                  <span className="text-xs font-mono font-bold text-emerald-400">{activeBranch.distance} {lang === "he" ? 'ק"מ' : "km"}</span>
                </div>
                <button
                  className="h-8 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-950/40 border border-emerald-500/20 cursor-pointer hover:scale-102 transition-all"
                  onClick={() => alert(lang === "he" ? "הניווט לסניף זה הופעל בהצלחה במכשירך!" : "Navigation route opened successfully on your device!")}
                >
                  <Navigation className="w-3 h-3" />
                  <span>{lang === "he" ? "ניווט מהיר" : "Quick Navigate"}</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  )
}
