import React from 'react';
import dynamic from 'next/dynamic';
import { Navigation, Tag } from 'lucide-react';
import type { Dictionary } from '@/app/page';

const BranchLeafletMap = dynamic(
  () => import('@/components/BranchLeafletMap').then((mod) => mod.BranchLeafletMap),
  { ssr: false }
);

interface LiveBranch {
  id: string;
  name: string;
  desc: string;
  dist: string;
  mapsLink: string;
  chain_id: string;
  lat: number | null;
  lng: number | null;
  color_hex: string;
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

interface BranchMapContainerProps {
  city: string;
  lang: string;
  skin: string;
  liveBranches: LiveBranch[];
  activeMapPin: string;
  setActiveMapPin: (id: string) => void;
  preferredChainId?: string | null;
  comparison?: ComparisonResult[];
  userPosition?: { lat: number; lng: number } | null;
  youAreHereLabel?: string;
  t: Dictionary;
}

const COST_COLORS = { cheap: '#10b981', mid: '#f59e0b', expensive: '#ef4444' } as const;

// Rank each chain present in `comparison` by basket total: cheapest -> green,
// most expensive -> red, everything in between -> amber.
function buildCostRanking(comparison: ComparisonResult[] | undefined) {
  const colorByChain: Record<string, string> = {};
  const totalByChain: Record<string, number> = {};
  if (!comparison || comparison.length === 0) return { colorByChain, totalByChain };

  const sorted = comparison.slice().sort((a, b) => a.total - b.total);
  sorted.forEach((c, idx) => {
    totalByChain[c.chain_id] = c.total;
    if (idx === 0) colorByChain[c.chain_id] = COST_COLORS.cheap;
    else if (idx === sorted.length - 1) colorByChain[c.chain_id] = COST_COLORS.expensive;
    else colorByChain[c.chain_id] = COST_COLORS.mid;
  });
  return { colorByChain, totalByChain };
}

export function BranchMapContainer({ city, lang, liveBranches, activeMapPin, setActiveMapPin, preferredChainId, comparison, userPosition, youAreHereLabel, t }: BranchMapContainerProps) {
  const sortedBranches = preferredChainId
    ? liveBranches.slice().sort((a, b) => (a.chain_id === preferredChainId ? -1 : 0) - (b.chain_id === preferredChainId ? -1 : 0))
    : liveBranches;

  const { colorByChain, totalByChain } = buildCostRanking(comparison);

  return (
    <div className="flex-1 w-full flex flex-col lg:flex-row gap-6 text-start h-full mt-6">
      <div className="w-full lg:w-2/3 bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-3xl p-2 h-[70vh] lg:h-auto lg:min-h-[500px] relative overflow-hidden flex flex-col shadow-xl">
        <div className="absolute top-6 start-6 end-6 flex justify-between items-start pointer-events-none z-[400]">
          <div className="bg-slate-950/80 backdrop-blur-md px-4 py-2 rounded-xl border border-slate-700/50 text-sm font-bold text-slate-200 pointer-events-auto shadow-xl">
            {t.currentGpsLocation} - {city}
          </div>
        </div>

        <BranchLeafletMap
          branches={liveBranches}
          activeMapPin={activeMapPin}
          setActiveMapPin={setActiveMapPin}
          quickNavigateLabel={t.quickNavigate}
          costColorByChain={colorByChain}
          costTotalByChain={totalByChain}
          basketAtBranchLabel={t.basketAtBranch}
          userPosition={userPosition}
          youAreHereLabel={youAreHereLabel}
        />
      </div>

      <div className="w-full lg:w-1/3 flex flex-col gap-4 overflow-y-auto max-h-[500px] lg:max-h-full pe-2">
         {sortedBranches.map(b => (
           <div
             key={b.id}
             onClick={() => setActiveMapPin(b.id)}
             className={`bg-slate-900/60 backdrop-blur-xl border ${activeMapPin === b.id ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-800'} rounded-3xl p-5 flex flex-col gap-4 shadow-xl hover:bg-slate-900 transition-colors shrink-0 cursor-pointer`}
           >
             <div className="flex items-center gap-4">
               <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: colorByChain[b.chain_id] ?? b.color_hex }} />
               <div className="flex-1">
                 <h4 className="font-bold text-slate-200">{b.name}</h4>
                 <p className="text-xs text-slate-400 mt-0.5">{b.desc}</p>
               </div>
               {totalByChain[b.chain_id] !== undefined && (
                 <span className="text-xs font-mono text-slate-300 shrink-0">₪{totalByChain[b.chain_id].toFixed(2)}</span>
               )}
               {preferredChainId && b.chain_id === preferredChainId && (
                 <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-1 rounded-full shrink-0">
                   <Tag className="w-3 h-3" /> {lang === 'he' ? 'הכי זול' : 'Cheapest'}
                 </span>
               )}
             </div>

             <div className="flex items-center justify-between border-t border-slate-800/80 pt-4">
               <div className="flex items-center gap-1.5 text-slate-300">
                 <Navigation className="w-4 h-4 text-emerald-400" />
                 <span className="font-mono text-sm">{b.dist}</span>
               </div>

               <a
                href={b.mapsLink}
                target="_blank"
                rel="noreferrer"
                className="bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 px-4 py-2 rounded-xl text-sm font-semibold transition-colors border border-indigo-500/20 text-center min-h-[44px] flex items-center"
               >
                 {t.quickNavigate}
               </a>
             </div>
           </div>
         ))}
      </div>
    </div>
  );
}
