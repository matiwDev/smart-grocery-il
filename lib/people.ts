/**
 * People in the household (Plan v2, phase 7, migration 027).
 *
 * Two kinds of "eater": signed-in members (food preferences in person_profiles,
 * body data in the PRIVATE person_body, targets shared via person_profiles.targets)
 * and people without an account, e.g. children (household_people: everything in
 * one row, managed by any member). Both have uuids, so both fit in
 * meal_plan_entries.eaters.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Avoid, Diet, FoodPrefs, Goal } from '@/lib/suggest';
import { Activity, Body, EMPTY_BODY, Sex, Targets, targetsFor } from '@/lib/nutrition';

export interface HouseholdPerson extends Body, FoodPrefs {
  id: string;
  household_id: string;
  name: string;
  targets: Targets | null;
}

const PERSON_COLS = 'id, household_id, name, birth_year, sex, activity, height_cm, weight_kg, diet, kosher, avoid, dislikes, goals, targets';

function num(v: unknown): number | null {
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
}

function rowToPerson(r: Record<string, unknown>): HouseholdPerson {
  return {
    id: String(r.id), household_id: String(r.household_id), name: String(r.name ?? ''),
    birth_year: num(r.birth_year), sex: (r.sex as Sex) ?? null, activity: (r.activity as Activity) ?? 'light',
    height_cm: num(r.height_cm), weight_kg: num(r.weight_kg),
    diet: (r.diet as Diet) ?? 'any', kosher: !!r.kosher, avoid: (r.avoid as Avoid[]) ?? [],
    dislikes: (r.dislikes as string[]) ?? [], goals: (r.goals as Goal[]) ?? [], targets: (r.targets as Targets) ?? null,
  };
}

export async function loadPeople(supabase: SupabaseClient, householdId: string): Promise<HouseholdPerson[]> {
  const { data, error } = await supabase.from('household_people').select(PERSON_COLS).eq('household_id', householdId).order('created_at');
  if (error) throw error;
  return (data ?? []).map(rowToPerson);
}

export async function savePerson(supabase: SupabaseClient, p: Omit<HouseholdPerson, 'id' | 'targets'> & { id?: string }): Promise<HouseholdPerson> {
  const row = {
    household_id: p.household_id, name: p.name.trim().slice(0, 40),
    birth_year: p.birth_year, sex: p.sex, activity: p.activity, height_cm: p.height_cm, weight_kg: p.weight_kg,
    diet: p.diet, kosher: p.kosher, avoid: p.avoid, dislikes: p.dislikes.slice(0, 30), goals: p.goals,
    targets: targetsFor(p), updated_at: new Date().toISOString(),
  };
  const q = p.id
    ? supabase.from('household_people').update(row).eq('id', p.id).select(PERSON_COLS).single()
    : supabase.from('household_people').insert(row).select(PERSON_COLS).single();
  const { data, error } = await q;
  if (error || !data) throw error ?? new Error('Could not save');
  return rowToPerson(data);
}

export async function deletePerson(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('household_people').delete().eq('id', id);
  if (error) throw error;
}

// ─── Your own body data (private) ───────────────────────────────────────────

export async function loadOwnBody(supabase: SupabaseClient, userId: string): Promise<Body> {
  const { data, error } = await supabase.from('person_body').select('birth_year, sex, activity, height_cm, weight_kg').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (!data) return EMPTY_BODY;
  return {
    birth_year: num(data.birth_year), sex: (data.sex as Sex) ?? null, activity: (data.activity as Activity) ?? 'light',
    height_cm: num(data.height_cm), weight_kg: num(data.weight_kg),
  };
}

/** Saves the private body data and shares only the resulting targets with the household. */
export async function saveOwnBody(supabase: SupabaseClient, userId: string, body: Body): Promise<Targets | null> {
  const { error } = await supabase.from('person_body').upsert({ user_id: userId, ...body, updated_at: new Date().toISOString() });
  if (error) throw error;
  const targets = targetsFor(body);
  const { error: tErr } = await supabase.from('person_profiles').upsert({ user_id: userId, targets });
  if (tErr) throw tErr;
  return targets;
}

/** Daily targets for any mix of member ids and household-people ids. */
export async function loadTargets(supabase: SupabaseClient, ids: string[]): Promise<Record<string, Targets | null>> {
  if (ids.length === 0) return {};
  const [a, b] = await Promise.all([
    supabase.from('person_profiles').select('user_id, targets').in('user_id', ids),
    supabase.from('household_people').select('id, targets').in('id', ids),
  ]);
  const out: Record<string, Targets | null> = {};
  for (const r of a.data ?? []) out[r.user_id as string] = (r.targets as Targets) ?? null;
  for (const r of b.data ?? []) out[r.id as string] = (r.targets as Targets) ?? null;
  return out;
}
