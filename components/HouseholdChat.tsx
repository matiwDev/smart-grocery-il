'use client';

/**
 * Household chat (Plan v2, phase 3). Messages are saved per household
 * (messages.household_id, RLS: members only) and arrive live through Supabase
 * Realtime. A message can carry a photo: it is downsized in the browser and
 * stored in the PRIVATE chat-photos bucket at <household_id>/<file>.jpg, and
 * shown through short-lived signed URLs. Tap your own message to delete it.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Loader2, Search, Send, Trash2, X, Users } from 'lucide-react';
import { supabase } from '@/utils/supabase';
import { downscale } from '@/lib/list';

type Lang = 'he' | 'en';

export interface ChatMessageRow {
  id: string;
  household_id: string;
  user_id: string;
  nickname: string | null;
  message_text: string | null;
  image_path: string | null;
  created_at: string;
}

const PAGE = 200;
const SIGNED_URL_SECONDS = 60 * 60;

const TEXT = {
  he: {
    title: 'צ׳אט משק הבית', search: 'חפש בהודעות...', noResults: 'לא נמצאו הודעות תואמות', type: 'הקלד הודעה...',
    empty: 'עדיין אין הודעות. כתבו משהו לבני הבית 👋', alone: 'אתם לבד כאן כרגע. הזמינו את בני הבית מהפרופיל עם קוד ההזמנה.',
    members: (n: number) => `${n} בני בית`, photo: 'שלח תמונה', send: 'שלח', del: 'מחק', sending: 'שולח…',
    failed: 'השליחה נכשלה', photoFailed: 'העלאת התמונה נכשלה', loadFailed: 'לא הצלחנו לטעון את ההודעות', close: 'סגור',
    caption: 'הוסף כיתוב (לא חובה)', today: 'היום', yesterday: 'אתמול', you: 'אני',
  },
  en: {
    title: 'Household chat', search: 'Search messages...', noResults: 'No matching messages found', type: 'Type a message...',
    empty: 'No messages yet. Say hi to your household 👋', alone: "You're the only one here. Invite your household from Profile with the invite code.",
    members: (n: number) => `${n} members`, photo: 'Send a photo', send: 'Send', del: 'Delete', sending: 'Sending…',
    failed: 'Could not send', photoFailed: 'Photo upload failed', loadFailed: 'Could not load messages', close: 'Close',
    caption: 'Add a caption (optional)', today: 'Today', yesterday: 'Yesterday', you: 'Me',
  },
};

function formatTime(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleTimeString(lang === 'he' ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDay(iso: string, lang: Lang): string {
  const date = new Date(iso);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000);
  if (diff === 0) return TEXT[lang].today;
  if (diff === 1) return TEXT[lang].yesterday;
  return date.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase()
          ? <mark key={i} className="bg-[var(--color-accent)]/40 text-inherit rounded-sm">{part}</mark>
          : <React.Fragment key={i}>{part}</React.Fragment>
      )}
    </>
  );
}

const byTime = (a: ChatMessageRow, b: ChatMessageRow) => a.created_at.localeCompare(b.created_at);

export interface HouseholdChatProps {
  householdId: string;
  userId: string;
  nickname: string;
  memberCount: number;
  lang: Lang;
}

export function HouseholdChat({ householdId, userId, nickname, memberCount, lang }: HouseholdChatProps) {
  const tx = TEXT[lang];
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Follow new messages only while the reader is at the bottom.
  const stickRef = useRef(true);
  const toBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, []);
  const requested = useRef<Set<string>>(new Set());

  const merge = useCallback((rows: ChatMessageRow[]) => {
    setMessages((prev) => {
      const map = new Map(prev.map((m) => [m.id, m]));
      for (const r of rows) map.set(r.id, r);
      return [...map.values()].sort(byTime);
    });
  }, []);

  // Initial load + live updates for this household.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessages([]);
    (async () => {
      const { data, error: err } = await supabase
        .from('messages')
        .select('id, household_id, user_id, nickname, message_text, image_path, created_at')
        .eq('household_id', householdId)
        .order('created_at', { ascending: false })
        .limit(PAGE);
      if (cancelled) return;
      if (err) setError(tx.loadFailed);
      else merge((data ?? []) as ChatMessageRow[]);
      setLoading(false);
    })();

    const channel = supabase
      .channel(`chat:${householdId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `household_id=eq.${householdId}` },
        (payload) => merge([payload.new as ChatMessageRow]))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' },
        (payload) => {
          const id = (payload.old as { id?: string }).id;
          if (id) setMessages((prev) => prev.filter((m) => m.id !== id));
        })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId, merge]);

  // Signed URLs for photos we haven't resolved yet (private bucket).
  useEffect(() => {
    const missing = messages.map((m) => m.image_path).filter((p): p is string => !!p && !requested.current.has(p));
    if (missing.length === 0) return;
    missing.forEach((p) => requested.current.add(p));
    supabase.storage.from('chat-photos').createSignedUrls(missing, SIGNED_URL_SECONDS).then(({ data }) => {
      const next: Record<string, string> = {};
      for (const d of data ?? []) if (d.path && d.signedUrl) next[d.path] = d.signedUrl;
      setUrls((prev) => ({ ...prev, ...next }));
    });
  }, [messages]);

  // Keep the newest message in view.
  useEffect(() => {
    if (!query) toBottom();
  }, [messages.length, query, loading, toBottom]);

  const send = async (imagePath: string | null = null) => {
    const text = input.trim();
    if (!text && !imagePath) return;
    setSending(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('messages')
      .insert({ household_id: householdId, user_id: userId, nickname, message_text: text || null, image_path: imagePath })
      .select('id, household_id, user_id, nickname, message_text, image_path, created_at')
      .single();
    setSending(false);
    if (err || !data) { setError(tx.failed); return; }
    setInput('');
    stickRef.current = true;
    merge([data as ChatMessageRow]);
  };

  const sendPhoto = async (file: File | undefined) => {
    if (!file) return;
    setSending(true);
    setError(null);
    try {
      const blob = await downscale(file, 1280);
      const path = `${householdId}/${crypto.randomUUID()}.jpg`;
      const { error: err } = await supabase.storage.from('chat-photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
      if (err) throw err;
      await send(path);
    } catch {
      setSending(false);
      setError(tx.photoFailed);
    }
  };

  const remove = async (m: ChatMessageRow) => {
    setSelectedId(null);
    const { error: err } = await supabase.from('messages').delete().eq('id', m.id);
    if (err) { setError(tx.failed); return; }
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
    if (m.image_path) await supabase.storage.from('chat-photos').remove([m.image_path]);
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? messages.filter((m) => (m.message_text ?? '').toLowerCase().includes(q)) : messages;
  }, [messages, query]);

  const timeline = useMemo(() => {
    const out: Array<{ type: 'day'; key: string; label: string } | { type: 'msg'; key: string; m: ChatMessageRow }> = [];
    let last: string | null = null;
    for (const m of visible) {
      const day = new Date(m.created_at).toDateString();
      if (day !== last) { out.push({ type: 'day', key: `d-${day}`, label: formatDay(m.created_at, lang) }); last = day; }
      out.push({ type: 'msg', key: m.id, m });
    }
    return out;
  }, [visible, lang]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">{tx.title}</h2>
          <p className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]"><Users className="w-3.5 h-3.5" /> {tx.members(memberCount)}</p>
        </div>
        <button
          type="button"
          onClick={() => { setSearchOpen((v) => !v); setQuery(''); }}
          aria-label={tx.search}
          className="w-11 h-11 shrink-0 flex items-center justify-center rounded-xl text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
        >
          {searchOpen ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
        </button>
      </div>

      <div className="bg-[var(--color-bg-panel)]/60 border border-[var(--color-border)] rounded-3xl p-4 flex flex-col" style={{ height: '64vh' }}>
        {searchOpen && (
          <div className="relative mb-3">
            <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-[var(--color-text-muted)]" />
            <input
              type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tx.search} autoFocus dir="auto"
              className="w-full min-h-[44px] bg-[var(--color-bg-subtle)]/50 border border-[var(--color-border)] rounded-xl ps-9 pe-3 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
            />
          </div>
        )}

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto flex flex-col gap-2 pe-1"
          onClick={() => setSelectedId(null)}
          onScroll={(e) => { const el = e.currentTarget; stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; }}
        >
          {loading && <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" /></div>}
          {!loading && messages.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 px-6 text-sm text-[var(--color-text-muted)]">
              <p>{tx.empty}</p>
              {memberCount <= 1 && <p className="text-xs">{tx.alone}</p>}
            </div>
          )}
          {!loading && query.trim() && visible.length === 0 && messages.length > 0 && (
            <p className="text-center text-sm text-[var(--color-text-muted)] py-6">{tx.noResults}</p>
          )}
          {timeline.map((e) => {
            if (e.type === 'day') {
              return (
                <div key={e.key} className="flex justify-center py-1">
                  <span className="text-[11px] font-medium text-[var(--color-text-muted)] bg-[var(--color-bg-subtle)] rounded-full px-3 py-1">{e.label}</span>
                </div>
              );
            }
            const m = e.m;
            const mine = m.user_id === userId;
            const url = m.image_path ? urls[m.image_path] : null;
            return (
              <div key={e.key} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                {!mine && <span className="text-[11px] font-semibold text-[var(--color-text-secondary)] px-2 mb-0.5">{m.nickname || '—'}</span>}
                <div
                  onClick={(ev) => { ev.stopPropagation(); if (mine) setSelectedId((s) => (s === m.id ? null : m.id)); }}
                  className={`max-w-[80%] rounded-2xl text-sm overflow-hidden ${mine ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)]' : 'bg-[var(--color-bg-subtle)] text-[var(--color-text-primary)]'}`}
                >
                  {m.image_path && (
                    <button type="button" onClick={(ev) => { ev.stopPropagation(); if (url) setPreview(url); }} className="block">
                      {url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt="" onLoad={toBottom} className="block max-h-64 w-auto max-w-full object-cover" />
                      ) : (
                        <span className="w-48 h-36 flex items-center justify-center bg-black/10"><Loader2 className="w-5 h-5 animate-spin" /></span>
                      )}
                    </button>
                  )}
                  {m.message_text && (
                    <p className="px-4 py-2 whitespace-pre-wrap break-words" dir="auto"><Highlight text={m.message_text} query={query} /></p>
                  )}
                </div>
                <span className="text-[10px] text-[var(--color-text-muted)] mt-0.5 px-2">{formatTime(m.created_at, lang)}</span>
                {mine && selectedId === m.id && (
                  <button type="button" onClick={(ev) => { ev.stopPropagation(); remove(m); }}
                    className="mt-1 min-h-[36px] px-3 rounded-lg text-xs font-semibold text-[var(--color-danger)] border border-[var(--color-danger)]/30 flex items-center gap-1">
                    <Trash2 className="w-3.5 h-3.5" /> {tx.del}
                  </button>
                )}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {error && <p className="text-xs font-semibold text-[var(--color-danger)] mt-2">{error}</p>}
        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2 mt-3">
          <button type="button" onClick={() => fileRef.current?.click()} disabled={sending} aria-label={tx.photo}
            className="min-w-[44px] min-h-[44px] rounded-xl border border-[var(--color-border)] text-[var(--color-text-secondary)] flex items-center justify-center disabled:opacity-50">
            <Camera className="w-5 h-5" />
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { sendPhoto(e.target.files?.[0]); e.target.value = ''; }} />
          <input
            type="text" value={input} onChange={(e) => setInput(e.target.value)} dir="auto"
            placeholder={tx.type}
            className="flex-1 min-w-0 min-h-[44px] bg-[var(--color-bg-subtle)]/50 border border-[var(--color-border)] rounded-xl px-4 text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
          />
          <button type="submit" disabled={sending || !input.trim()} aria-label={tx.send}
            className="min-w-[44px] min-h-[44px] bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-[var(--color-accent-text)] rounded-xl flex items-center justify-center disabled:opacity-50">
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 rtl:-scale-x-100" />}
          </button>
        </form>
      </div>

      {preview && (
        <div role="dialog" aria-label={tx.photo} className="fixed inset-0 z-[70] bg-black/90 flex flex-col items-center justify-center gap-4 p-4" onClick={() => setPreview(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" className="max-w-full max-h-[80vh] rounded-2xl object-contain" />
          <button type="button" onClick={() => setPreview(null)} className="text-white/80 text-sm underline min-h-[44px]">{tx.close}</button>
        </div>
      )}
    </div>
  );
}
