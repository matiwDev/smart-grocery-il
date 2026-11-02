'use client';

/**
 * A warm hello at the top of the list (design refresh): time-of-day greeting
 * with your nickname and what's planned to eat today. Tap the meal line to open
 * the Meals tab.
 */
import React, { useEffect, useState } from 'react';
import { ChefHat } from 'lucide-react';
import { supabase } from '@/utils/supabase';
import { isoDate, SLOTS, Slot } from '@/lib/recipes';
import { SLOT_LABEL } from '@/components/PlanMealSheet';

type Lang = 'he' | 'en';

function greeting(lang: Lang, h: number): string {
  if (lang === 'he') return h < 5 ? 'לילה טוב' : h < 12 ? 'בוקר טוב' : h < 17 ? 'צהריים טובים' : h < 21 ? 'ערב טוב' : 'לילה טוב';
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 21 ? 'Good evening' : 'Good night';
}

export function HomeGreeting({ nickname, householdId, lang, onOpenMeals }: { nickname: string | null; householdId: string | null; lang: Lang; onOpenMeals: () => void }) {
  const [meals, setMeals] = useState<Array<{ slot: Slot; title: string }>>([]);
  const [now] = useState(() => new Date());

  useEffect(() => {
    if (!householdId) return;
    supabase.from('meal_plan_entries').select('slot, recipes(title)').eq('household_id', householdId).eq('plan_date', isoDate(new Date()))
      .then(({ data }) => {
        const rows = ((data ?? []) as unknown as Array<{ slot: Slot; recipes: { title: string } | null }>)
          .filter((r) => r.recipes?.title).map((r) => ({ slot: r.slot, title: r.recipes!.title }));
        setMeals(rows.sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot)));
      });
  }, [householdId]);

  // The next meal still to come today (dinner in the evening, lunch at noon…).
  const h = now.getHours();
  const upcoming = meals.find((m) => SLOTS.indexOf(m.slot) >= (h < 11 ? 0 : h < 16 ? 1 : 2)) ?? null;
  const name = nickname && nickname !== 'User' ? nickname : null;

  return (
    <div className="flex flex-col gap-0.5">
      <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">
        {greeting(lang, h)}{name ? <>, <span dir="auto">{name}</span></> : null} {h >= 5 && h < 12 ? '☀️' : h >= 17 ? '🌙' : '👋'}
      </h2>
      {upcoming ? (
        <button type="button" onClick={onOpenMeals} className="self-start min-h-[32px] flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-accent)]">
          <ChefHat className="w-4 h-4 text-[var(--color-accent)]" />
          {SLOT_LABEL[lang][upcoming.slot]} {lang === 'he' ? 'היום:' : 'today:'} <b className="font-semibold" dir="auto">{upcoming.title}</b>
        </button>
      ) : (
        <p className="text-sm text-[var(--color-text-muted)]">{lang === 'he' ? 'מה קונים היום?' : 'What are we buying today?'}</p>
      )}
    </div>
  );
}
