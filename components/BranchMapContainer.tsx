import React from 'react';
import dynamic from 'next/dynamic';
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
  theme: 'light' | 'dark';
  liveBranches: LiveBranch[];
  activeMapPin: string;
  setActiveMapPin: (id: string) => void;
  preferredChainId?: string | null;
  comparison?: ComparisonResult[];
  userPosition?: { lat: number; lng: number } | null;
  youAreHereLabel?: string;
  t: Dictionary;
}

const COST_COLORS = {
  cheap: 'var(--color-success)',
  mid: 'var(--color-warning)',
  expensive: 'var(--color-danger)',
} as const;

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

// Full-bleed map view — no side branch-list panel. Branch details are surfaced
// via the Leaflet popups (name, basket cost, Waze link) instead.
export function BranchMapContainer({ city, theme, liveBranches, activeMapPin, setActiveMapPin, comparison, userPosition, youAreHereLabel, t }: BranchMapContainerProps) {
  const { colorByChain, totalByChain } = buildCostRanking(comparison);

  return (
    // No h-full here: the parent (app/page.tsx's LOCATION map slot) is a flex
    // container specifically so this stretches to fill it — a percentage height
    // wouldn't resolve against a block-display flex-grown parent. See page.tsx.
    <div className="relative w-full flex-1 min-h-0">
      {/* Only shown once we actually have a GPS fix — avoids colliding with the
          city-search overlay (top-end), which only renders when GPS was denied. */}
      {userPosition && (
        <div className="absolute top-3 start-3 z-[400] pointer-events-none">
          <div className="bg-[var(--color-bg-subtle)]/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-[var(--color-border)]/50 text-xs font-bold text-[var(--color-text-primary)] pointer-events-auto shadow-xl">
            {t.currentGpsLocation} - {city}
          </div>
        </div>
      )}

      <BranchLeafletMap
        branches={liveBranches}
        activeMapPin={activeMapPin}
        setActiveMapPin={setActiveMapPin}
        theme={theme}
        quickNavigateLabel={t.quickNavigate}
        costColorByChain={colorByChain}
        costTotalByChain={totalByChain}
        basketAtBranchLabel={t.basketAtBranch}
        userPosition={userPosition}
        youAreHereLabel={youAreHereLabel}
      />
    </div>
  );
}
