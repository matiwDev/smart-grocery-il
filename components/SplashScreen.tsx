'use client';

/**
 * Start-up splash (design refresh): the market-basket painting while the app
 * signs in and loads the household's list. Shown at least MIN_MS so it doesn't
 * flash, never longer than MAX_MS, then fades out. It may be rendered from more
 * than one screen (auth check, sign-in, app): timing counts from page load and
 * once it has faded it never comes back until the next page load.
 */
import React, { useEffect, useState } from 'react';

const MIN_MS = 900;
const MAX_MS = 5000;
const BOOT = typeof window !== 'undefined' ? Date.now() : 0;
let done = false;

export function SplashScreen({ ready, lang }: { ready: boolean; lang: 'he' | 'en' }) {
  const [phase, setPhase] = useState<'on' | 'fading' | 'gone'>(() => (done ? 'gone' : 'on'));

  useEffect(() => {
    if (done) return;
    const max = setTimeout(() => setPhase((p) => (p === 'on' ? 'fading' : p)), Math.max(0, MAX_MS - (Date.now() - BOOT)));
    return () => clearTimeout(max);
  }, []);
  useEffect(() => {
    if (!ready || phase !== 'on') return;
    const t = setTimeout(() => setPhase('fading'), Math.max(0, MIN_MS - (Date.now() - BOOT)));
    return () => clearTimeout(t);
  }, [ready, phase]);
  useEffect(() => {
    if (phase !== 'fading') return;
    done = true;
    const t = setTimeout(() => setPhase('gone'), 450);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === 'gone') return null;
  return (
    <div
      aria-hidden={phase === 'fading'}
      role="status"
      className={`fixed inset-0 z-[200] bg-[#FBF7F1] transition-opacity duration-[450ms] ${phase === 'fading' ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/splash.webp" alt="" className="absolute inset-0 w-full h-full object-cover object-bottom md:object-contain" />
      <div className="absolute inset-x-0 top-[12%] flex flex-col items-center text-center px-6 gap-2">
        <h1 className="text-4xl font-bold tracking-tight text-[#2B2420]" dir="ltr">Smart Grocery</h1>
        <p className="text-lg text-[#574A40]" dir="rtl">{lang === 'he' ? 'הקניות של הבית, במקום אחד' : "Your home's shopping, in one place"}</p>
        <span className="mt-4 flex gap-1.5" aria-label={lang === 'he' ? 'טוען' : 'Loading'}>
          {[0, 1, 2].map((i) => (
            <span key={i} className="w-2 h-2 rounded-full bg-[#B93E0B] animate-bounce" style={{ animationDelay: `${i * 140}ms` }} />
          ))}
        </span>
      </div>
    </div>
  );
}
