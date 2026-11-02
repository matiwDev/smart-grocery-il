'use client';

/**
 * A section that can be minimized: a header button (title, an optional summary
 * shown while closed, a chevron) and its content. Each section remembers
 * whether it was open per browser (localStorage `sg_open_<id>`), so a section
 * someone closed stays closed the next time they open any product.
 */
import React, { useEffect, useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';

const KEY = (id: string) => `sg_open_${id}`;

function readOpen(id: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(KEY(id));
    return v == null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

export function Collapsible({ id, title, summary, defaultOpen = true, children }: {
  /** Stable name for remembering the state, e.g. "item-prices". */
  id: string;
  title: React.ReactNode;
  /** Shown beside the title while the section is closed. */
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  // Read the remembered state after mount (localStorage isn't there on the server).
  useEffect(() => { setOpen(readOpen(id, defaultOpen)); }, [id, defaultOpen]);

  const toggle = () => {
    setOpen((o) => {
      try { localStorage.setItem(KEY(id), o ? '0' : '1'); } catch { /* private mode: not remembered */ }
      return !o;
    });
  };

  return (
    <div className="rounded-xl border border-[var(--color-border)]/70">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={contentId}
        className="w-full min-h-[44px] px-3 flex items-center gap-2 text-start"
      >
        <span className="text-xs font-semibold text-[var(--color-text-secondary)]">{title}</span>
        {!open && summary && <span className="min-w-0 flex-1 flex items-center gap-1.5 justify-end text-[11px] text-[var(--color-text-muted)] truncate">{summary}</span>}
        <ChevronDown className={`w-4 h-4 shrink-0 text-[var(--color-text-muted)] transition-transform ${open ? 'rotate-180' : ''} ${!open && summary ? '' : 'ms-auto'}`} />
      </button>
      <div id={contentId} hidden={!open} className="px-3 pb-3">
        {children}
      </div>
    </div>
  );
}
