/**
 * Shared PostgREST client helpers for standalone scripts. Talks to Supabase via
 * plain REST with the service-role key rather than @supabase/supabase-js: this
 * repo runs on Node 20, and realtime-js (a supabase-js dependency) requires a
 * native WebSocket only available from Node 22+, which crashes standalone
 * scripts. See scripts/ingest-prices.ts and scripts/seed-products-from-feed.ts.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

function loadEnvLocal(): Record<string, string> {
  const path = join(__dirname, '..', '.env.local');
  const env: Record<string, string> = {};
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return env;
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const fileEnv = loadEnvLocal();
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || fileEnv.NEXT_PUBLIC_SUPABASE_URL;
export const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;

export function requireEnv(): void {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (checked process.env and .env.local)');
    process.exit(1);
  }
}

export async function restFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

export async function fetchWithRetry(url: string, init: RequestInit = {}, retries = 3, delayMs = 2000): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.status === 429 || res.status === 503) {
        lastErr = new Error(`HTTP ${res.status} from ${url}`);
        if (attempt < retries) await sleep(delayMs);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(delayMs);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function refreshLatestPrices(): Promise<void> {
  const res = await restFetch('rpc/refresh_latest_prices', { method: 'POST', body: '{}' });
  if (!res.ok) {
    throw new Error(`refresh_latest_prices() failed: HTTP ${res.status} ${await res.text()}`);
  }
}
