/**
 * Debug tools & cheats (client side). See components/DebugPanel.tsx.
 *
 * Who gets them:
 *   - everyone on `npm run dev` (NODE_ENV === 'development')
 *   - in production, only signed-in users whose email is listed in
 *     NEXT_PUBLIC_DEBUG_EMAILS (comma-separated, set in Vercel env vars)
 * The server route /api/debug/status re-checks the same list against the
 * caller's verified Supabase session, so the client gate is only cosmetic.
 */

export function debugEmails(): string[] {
  return (process.env.NEXT_PUBLIC_DEBUG_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isDebugAllowed(email: string | null | undefined): boolean {
  if (process.env.NODE_ENV === 'development') return true;
  return !!email && debugEmails().includes(email.toLowerCase());
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

// ─── Network cheats + API inspector ─────────────────────────────────────────

export interface NetworkCheats {
  delayMs: number; // added to every /api/* call
  failApi: boolean; // every /api/* call returns HTTP 500
}

const NETWORK_KEY = 'sg_debug_network';
export const getNetworkCheats = (): NetworkCheats => readJson<NetworkCheats>(NETWORK_KEY) ?? { delayMs: 0, failApi: false };
export const setNetworkCheats = (c: NetworkCheats) => writeJson(NETWORK_KEY, c);

export interface ApiCall {
  id: number;
  method: string;
  url: string;
  status: number | null;
  ms: number;
  bytes: number | null;
  at: number;
  body?: string; // truncated response text
  error?: string;
}

const MAX_CALLS = 40;
const calls: ApiCall[] = [];
const listeners = new Set<() => void>();
let nextId = 1;
let installed = false;

export const getApiCalls = () => calls;
export function subscribeApiCalls(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function clearApiCalls() {
  calls.length = 0;
  listeners.forEach((l) => l());
}

function record(call: ApiCall) {
  calls.unshift(call);
  if (calls.length > MAX_CALLS) calls.length = MAX_CALLS;
  listeners.forEach((l) => l());
}

/** Wraps window.fetch once: logs /api/* calls and applies network cheats. */
export function installFetchInspector() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const isApi = url.startsWith('/api/') || url.startsWith(`${window.location.origin}/api/`);
    if (!isApi || url.includes('/api/debug/')) return original(input, init);

    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const started = performance.now();
    const cheats = getNetworkCheats();
    if (cheats.delayMs > 0) await new Promise((r) => setTimeout(r, cheats.delayMs));

    if (cheats.failApi) {
      const body = JSON.stringify({ error: 'Forced failure (debug panel: "Fail all API calls")' });
      record({ id: nextId++, method, url, status: 500, ms: Math.round(performance.now() - started), bytes: body.length, at: Date.now(), body });
      return new Response(body, { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    try {
      const res = await original(input, init);
      const clone = res.clone();
      clone.text().then(
        (text) => record({ id: nextId++, method, url, status: res.status, ms: Math.round(performance.now() - started), bytes: text.length, at: Date.now(), body: text.slice(0, 20000) }),
        () => record({ id: nextId++, method, url, status: res.status, ms: Math.round(performance.now() - started), bytes: null, at: Date.now() })
      );
      return res;
    } catch (err) {
      record({ id: nextId++, method, url, status: null, ms: Math.round(performance.now() - started), bytes: null, at: Date.now(), error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  };
}

// ─── Misc ───────────────────────────────────────────────────────────────────

export const PANEL_HIDDEN_KEY = 'sg_debug_button_hidden';

/** Removes every app key from localStorage (all app keys start with sg_). */
export function clearAppStorage(): number {
  let n = 0;
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('sg_')) {
        localStorage.removeItem(key);
        n++;
      }
    }
  } catch {}
  return n;
}
