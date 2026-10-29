'use client';

/**
 * Debug tools & cheats. Mounted by app/page.tsx only when isDebugAllowed()
 * (dev server, or a signed-in email in NEXT_PUBLIC_DEBUG_EMAILS).
 * Open with the floating bug button or Ctrl/Cmd + Shift + D.
 */
import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Bug, X, RefreshCw, ShoppingBasket, Wifi, Database, Trash2, Copy, ChevronDown } from 'lucide-react';
import { supabase } from '@/utils/supabase';
import {
  getNetworkCheats,
  setNetworkCheats,
  NetworkCheats,
  installFetchInspector,
  getApiCalls,
  subscribeApiCalls,
  clearApiCalls,
  clearAppStorage,
  PANEL_HIDDEN_KEY,
} from '@/lib/debug';

const STAPLE_QUERIES = ['חלב', 'לחם', 'ביצים', 'עגבניות', 'קוטג', 'שמן', 'אורז', 'פסטה', 'קפה', 'סוכר', 'מלפפון', 'טונה'];
const VIEWS = ['HOME', 'SCAN', 'SAVED_LISTS', 'ANALYTICS', 'CHAT', 'PROFILE'] as const;

export interface DebugPanelProps {
  userId: string | null;
  userEmail: string | null;
  lang: 'he' | 'en';
  onToggleLang: () => void;
  onToggleTheme: () => void;
  basketCount: number;
  onAddProduct: (product: unknown) => Promise<void>;
  onClearBasket: () => Promise<void>;
  onAddFreeText: (name: string) => Promise<void>;
  /** The user's chain, so staples come from it. */
  chainId: string | null;
  onSetAllChecked: (checked: boolean) => Promise<void>;
  onGoTo: (view: string) => void;
  showToast: (msg: string) => void;
}

interface ChainStatus {
  id: string;
  status: string;
  prices: number;
  last_price_at: string | null;
  last_ingest: { started_at: string; fetched: number; matched: number; error: string | null } | null;
}

interface DbStatus {
  db_size_bytes: number;
  db_limit_bytes: number;
  chains: ChainStatus[];
  tracked_products: number;
  monthly_rows: number;
  trips: number;
  overrides: number;
  categories: Record<string, number> | null;
  months: string[] | null;
  server: { node_env: string; vercel_env: string | null; commit: string | null; region: string | null };
}

type Tab = 'cheats' | 'network' | 'status';

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(0)} MB`;
function ago(iso: string | null): string {
  if (!iso) return '—';
  const h = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (h < 1) return `${Math.round(h * 60)}m ago`;
  if (h < 48) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

async function authHeaders(): Promise<HeadersInit> {
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function Btn({ children, onClick, danger, disabled }: { children: React.ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-3 h-9 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-40 ${
        danger
          ? 'border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/10'
          : 'border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]'
      }`}
    >
      {children}
    </button>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">
        <Icon className="w-3.5 h-3.5" /> {title}
      </h3>
      {children}
    </section>
  );
}

export function DebugPanel(props: DebugPanelProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('cheats');
  const [buttonHidden, setButtonHidden] = useState(false);
  const [net, setNet] = useState<NetworkCheats>({ delayMs: 0, failApi: false });
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<DbStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [expandedCall, setExpandedCall] = useState<number | null>(null);

  const calls = useSyncExternalStore(subscribeApiCalls, getApiCalls, getApiCalls);
  // getApiCalls returns the same mutated array; force a re-render on change.
  const [, force] = useState(0);
  useEffect(() => subscribeApiCalls(() => force((n) => n + 1)), []);

  useEffect(() => {
    installFetchInspector();
    setNet(getNetworkCheats());
    try { setButtonHidden(localStorage.getItem(PANEL_HIDDEN_KEY) === '1'); } catch {}
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const loadStatus = useCallback(async () => {
    setStatusError(null);
    try {
      const res = await fetch('/api/debug/status', { headers: await authHeaders() });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setStatus(json);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    if (open && tab === 'status' && !status) loadStatus();
  }, [open, tab, status, loadStatus]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try { await fn(); } catch (err) { props.showToast(`${label} failed: ${err instanceof Error ? err.message : err}`); }
    setBusy(null);
  };

  const updateNet = (next: NetworkCheats) => {
    setNetworkCheats(next);
    setNet(next);
  };

  const fillBasket = (count: number) =>
    run(`Fill ${count}`, async () => {
      let added = 0;
      for (const q of STAPLE_QUERIES) {
        if (added >= count) break;
        const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}&limit=5${props.chainId ? `&chain=${props.chainId}` : ''}`);
        const json = await res.json();
        const product = (json.products ?? []).find((p: { prices?: Record<string, unknown> }) => p.prices && Object.keys(p.prices).length > 0);
        if (!product) continue;
        await props.onAddProduct(product);
        added++;
      }
      props.showToast(`🧺 Added ${added} products`);
    });

  const hideButton = () => {
    try { localStorage.setItem(PANEL_HIDDEN_KEY, '1'); } catch {}
    setButtonHidden(true);
    setOpen(false);
    props.showToast('Debug button hidden — Ctrl/Cmd+Shift+D to open');
  };

  const cheatsActive = net.delayMs > 0 || net.failApi;

  return (
    <>
      {!buttonHidden && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open debug panel"
          className={`fixed z-[60] bottom-24 start-3 w-11 h-11 rounded-full shadow-lg flex items-center justify-center border ${
            cheatsActive ? 'bg-amber-500 text-white border-amber-600' : 'bg-[var(--color-bg-panel)] text-[var(--color-text-secondary)] border-[var(--color-border)]'
          }`}
        >
          <Bug className="w-5 h-5" />
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[70] flex flex-col justify-end bg-black/40" onClick={() => setOpen(false)}>
          <div
            dir="ltr"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl mx-auto max-h-[85vh] flex flex-col rounded-t-2xl bg-[var(--color-bg-panel)] border border-[var(--color-border)] shadow-2xl text-[var(--color-text-primary)]"
          >
            <div className="shrink-0 flex items-center justify-between px-4 h-12 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-2 font-bold text-sm"><Bug className="w-4 h-4" /> Debug</div>
              <div className="flex gap-1">
                {(['cheats', 'network', 'status'] as Tab[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={`px-3 h-8 rounded-full text-xs font-semibold capitalize ${tab === t ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)]' : 'text-[var(--color-text-secondary)]'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5 text-sm">
              {tab === 'cheats' && (
                <>
                  <Section title={`Basket (${props.basketCount} items)`} icon={ShoppingBasket}>
                    <div className="flex flex-wrap gap-2">
                      <Btn onClick={() => fillBasket(5)} disabled={!!busy}>{busy === 'Fill 5' ? 'Adding…' : '+5 staples'}</Btn>
                      <Btn onClick={() => fillBasket(12)} disabled={!!busy}>{busy === 'Fill 12' ? 'Adding…' : '+12 staples'}</Btn>
                      <Btn onClick={() => run('Free text', async () => {
                        for (const n of ['עגבניות שרי', 'מלפפונים', 'כוסברה']) await props.onAddFreeText(n);
                        props.showToast('Added 3 free-text items');
                      })} disabled={!!busy}>+3 own items</Btn>
                      <Btn onClick={() => run('Check all', () => props.onSetAllChecked(true))} disabled={!!busy || props.basketCount === 0}>Check all</Btn>
                      <Btn onClick={() => run('Uncheck all', () => props.onSetAllChecked(false))} disabled={!!busy || props.basketCount === 0}>Uncheck all</Btn>
                      <Btn danger onClick={() => run('Clear basket', props.onClearBasket)} disabled={!!busy || props.basketCount === 0}>Clear basket</Btn>
                    </div>
                  </Section>

                  <Section title="App" icon={Bug}>
                    <div className="flex flex-wrap gap-2">
                      <Btn onClick={props.onToggleLang}>Lang: {props.lang.toUpperCase()}</Btn>
                      <Btn onClick={props.onToggleTheme}>Toggle theme</Btn>
                      <Btn onClick={() => props.showToast('This is a test toast ✨')}>Test toast</Btn>
                      {props.userId && (
                        <Btn onClick={() => { navigator.clipboard?.writeText(props.userId!); props.showToast('User id copied'); }}>
                          <span className="inline-flex items-center gap-1"><Copy className="w-3 h-3" /> User id</span>
                        </Btn>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {VIEWS.map((v) => <Btn key={v} onClick={() => { props.onGoTo(v); setOpen(false); }}>{v}</Btn>)}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Btn danger onClick={() => { const n = clearAppStorage(); props.showToast(`Cleared ${n} keys — reloading`); setTimeout(() => window.location.reload(), 600); }}>
                        <span className="inline-flex items-center gap-1"><Trash2 className="w-3 h-3" /> Reset local storage</span>
                      </Btn>
                      <Btn onClick={hideButton}>Hide bug button</Btn>
                    </div>
                    <p className="text-[11px] text-[var(--color-text-secondary)]">Signed in as {props.userEmail ?? '—'}</p>
                  </Section>
                </>
              )}

              {tab === 'network' && (
                <>
                  <Section title="Network cheats (/api/* only)" icon={Wifi}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-[var(--color-text-secondary)]">Delay:</span>
                      {[0, 500, 2000, 5000].map((ms) => (
                        <Btn key={ms} onClick={() => updateNet({ ...net, delayMs: ms })}>{net.delayMs === ms ? '✓ ' : ''}{ms === 0 ? 'none' : `${ms / 1000}s`}</Btn>
                      ))}
                    </div>
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={net.failApi} onChange={(e) => updateNet({ ...net, failApi: e.target.checked })} />
                      Fail all API calls (HTTP 500) — test error states
                    </label>
                  </Section>

                  <Section title={`API calls (${calls.length})`} icon={Database}>
                    <div className="flex gap-2"><Btn onClick={clearApiCalls}>Clear</Btn></div>
                    <ul className="divide-y divide-[var(--color-border)] border border-[var(--color-border)] rounded-lg overflow-hidden">
                      {calls.length === 0 && <li className="p-3 text-xs text-[var(--color-text-secondary)]">No API calls yet — use the app.</li>}
                      {calls.map((c) => {
                        const path = c.url.replace(window.location.origin, '');
                        const ok = c.status !== null && c.status < 400;
                        let pretty = c.body ?? c.error ?? '';
                        if (expandedCall === c.id && c.body) { try { pretty = JSON.stringify(JSON.parse(c.body), null, 2); } catch {} }
                        return (
                          <li key={c.id} className="text-xs">
                            <button type="button" onClick={() => setExpandedCall(expandedCall === c.id ? null : c.id)} className="w-full flex items-center gap-2 px-3 py-2 text-start hover:bg-[var(--color-bg-hover)]">
                              <span className={`font-mono font-bold ${ok ? 'text-green-600' : 'text-red-600'}`}>{c.status ?? 'ERR'}</span>
                              <span className="font-mono text-[var(--color-text-secondary)]">{c.method}</span>
                              <span className="flex-1 truncate font-mono" title={path}>{decodeURIComponent(path)}</span>
                              <span className="tabular-nums text-[var(--color-text-secondary)]">{c.ms}ms</span>
                              <ChevronDown className={`w-3 h-3 transition-transform ${expandedCall === c.id ? 'rotate-180' : ''}`} />
                            </button>
                            {expandedCall === c.id && (
                              <pre className="max-h-64 overflow-auto px-3 py-2 bg-[var(--color-bg-subtle)] font-mono text-[10px] whitespace-pre-wrap break-all">{pretty || '(empty)'}</pre>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </Section>
                </>
              )}

              {tab === 'status' && (
                <>
                  <div className="flex gap-2">
                    <Btn onClick={loadStatus}><span className="inline-flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Refresh</span></Btn>
                    <Btn onClick={() => run('Rollup', async () => {
                      const res = await fetch('/api/debug/status', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ action: 'rollup' }) });
                      const json = await res.json();
                      if (!res.ok) throw new Error(json.error);
                      props.showToast(`Monthly rollup: ${json.rows_updated} rows updated`);
                      loadStatus();
                    })} disabled={!!busy}>Run monthly rollup now</Btn>
                  </div>
                  {statusError && <p className="text-xs text-red-600">Status failed: {statusError}</p>}
                  {status && (
                    <>
                      <Section title="Database" icon={Database}>
                        <div className="h-2 rounded-full bg-[var(--color-bg-subtle)] overflow-hidden">
                          <div className={`h-full ${status.db_size_bytes / status.db_limit_bytes > 0.8 ? 'bg-red-500' : 'bg-[var(--color-accent)]'}`} style={{ width: `${Math.min(100, (status.db_size_bytes / status.db_limit_bytes) * 100)}%` }} />
                        </div>
                        <p className="text-xs">{mb(status.db_size_bytes)} of {mb(status.db_limit_bytes)} free-tier limit</p>
                        <p className="text-xs text-[var(--color-text-secondary)]">
                          Trips: {status.trips} · Household edits: {status.overrides} · Tracked products: {status.tracked_products} · Monthly rows: {status.monthly_rows} · Months: {(status.months ?? []).map((m) => m.slice(0, 7)).join(', ') || '—'}
                        </p>
                        <p className="text-[11px] text-[var(--color-text-secondary)]">
                          Categories: {Object.entries(status.categories ?? {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}
                        </p>
                      </Section>
                      <Section title="Chains" icon={ShoppingBasket}>
                        <div className="overflow-x-auto">
                          <table className="w-full text-[11px]">
                            <thead className="text-[var(--color-text-secondary)] text-start">
                              <tr><th className="text-start py-1">Chain</th><th>Prices</th><th>Updated</th><th>Last ingest</th></tr>
                            </thead>
                            <tbody>
                              {status.chains.map((c) => (
                                <tr key={c.id} className={`border-t border-[var(--color-border)] ${c.status !== 'active' ? 'opacity-60' : ''}`}>
                                  <td className="py-1.5 font-semibold">{c.id}{c.status !== 'active' && <span className="block font-normal">in dev</span>}</td>
                                  <td className="text-center tabular-nums">{c.prices.toLocaleString()}</td>
                                  <td className="text-center">{ago(c.last_price_at)}</td>
                                  <td className="text-center">{c.last_ingest ? (c.last_ingest.error ? <span className="text-red-600" title={c.last_ingest.error}>error</span> : `${c.last_ingest.matched.toLocaleString()} ok`) : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="text-[11px] text-[var(--color-text-secondary)]">Prices = products with an estimated price. Updated = newest price.</p>
                      </Section>
                      <p className="text-[11px] text-[var(--color-text-secondary)]">
                        Server: {status.server.vercel_env ?? status.server.node_env} · commit {status.server.commit ?? 'local'}{status.server.region ? ` · ${status.server.region}` : ''}
                      </p>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
