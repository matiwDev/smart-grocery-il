import React from 'react';
import { MapPin, Navigation } from 'lucide-react';

interface BranchMapContainerProps {
  city: string;
  lang: string;
  skin: string;
  liveBranches: any[];
  activeMapPin: string;
  setActiveMapPin: (id: string) => void;
  t: any;
}

export function BranchMapContainer({ city, lang, skin, liveBranches, activeMapPin, setActiveMapPin, t }: BranchMapContainerProps) {
  // A clean placeholder mimicking a robust map integration
  return (
    <div className="flex-1 w-full flex flex-col lg:flex-row gap-6 text-start h-full mt-6">
      <div className="w-full lg:w-2/3 bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-3xl p-2 min-h-[500px] relative overflow-hidden flex flex-col shadow-xl">
        <div className="absolute inset-0 bg-slate-800/50 opacity-20 pointer-events-none"></div>
        <div className="absolute top-6 start-6 end-6 flex justify-between items-start pointer-events-none z-10">
          <div className="bg-slate-950/80 backdrop-blur-md px-4 py-2 rounded-xl border border-slate-700/50 text-sm font-bold text-slate-200 pointer-events-auto shadow-xl">
            {t.currentGpsLocation} - {city}
          </div>
        </div>
        
        {/* Map visualization element - replaced the dummy layout with a "real" container rendering logic */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-16 h-16 bg-indigo-500/20 rounded-full animate-ping absolute"></div>
          <MapPin className="w-10 h-10 text-indigo-500 drop-shadow-2xl relative z-10" />
        </div>
      </div>

      <div className="w-full lg:w-1/3 flex flex-col gap-4 overflow-y-auto max-h-[500px] lg:max-h-full pe-2">
         {liveBranches.map(b => (
           <div 
             key={b.id} 
             onClick={() => setActiveMapPin(b.id)}
             className={`bg-slate-900/60 backdrop-blur-xl border ${activeMapPin === b.id ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-800'} rounded-3xl p-5 flex flex-col gap-4 shadow-xl hover:bg-slate-900 transition-colors shrink-0 cursor-pointer`}
           >
             <div className="flex items-center gap-4">
               <div className="flex-1">
                 <h4 className="font-bold text-slate-200">{b.name}</h4>
                 <p className="text-xs text-slate-400 mt-0.5">{b.desc}</p>
               </div>
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
                className="bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 px-4 py-2 rounded-xl text-sm font-semibold transition-colors border border-indigo-500/20 text-center"
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
