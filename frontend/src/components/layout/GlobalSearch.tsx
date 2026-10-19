import clsx from 'clsx';
import { format } from 'date-fns';
import { AlertTriangle, Router, Search, Wifi, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { searchApi } from '../../services/api';

type SearchDevice = {
  id: number;
  name: string;
  ip_address: string;
  model?: string;
  device_type: string;
  status: string;
};
type SearchClient = {
  mac_address: string;
  hostname?: string;
  ip_address?: string;
  device_id: number;
  device_name?: string;
  active: boolean;
};
type SearchEvent = {
  id: number;
  message: string;
  severity: string;
  event_time: string;
  topic?: string;
  device_name?: string;
};
type SearchResults = { devices: SearchDevice[]; clients: SearchClient[]; events: SearchEvent[] };

const SEVERITY_ICON_CLS: Record<string, string> = {
  error: 'bg-bad-bg text-bad',
  critical: 'bg-bad-bg text-bad',
  warning: 'bg-warn-bg dark:bg-warn-bg text-warn',
  info: 'bg-accent-soft dark:bg-accent-soft text-accent',
};

export default function GlobalSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce the query input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 280);
    return () => clearTimeout(t);
  }, [query]);

  // Fetch when debounced query is long enough
  useEffect(() => {
    if (debouncedQuery.length < 2) {
      // stale results on input change is the intended behaviour here; the
      // debounce above keeps this from cascading on every keystroke.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults(null);
      return;
    }
    setLoading(true);
    searchApi
      .search(debouncedQuery)
      .then((r) => {
        setResults(r.data);
        setHighlighted(0);
      })
      .catch(() => setResults(null))
      .finally(() => setLoading(false));
  }, [debouncedQuery]);

  // Ctrl+K / Cmd+K global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Flat list for keyboard navigation index tracking
  const deviceCount = results?.devices.length ?? 0;
  const clientCount = results?.clients.length ?? 0;
  const eventCount = results?.events.length ?? 0;
  const totalCount = deviceCount + clientCount + eventCount;

  const goToResult = useCallback(
    (kind: 'device' | 'client' | 'event', id: string | number) => {
      setOpen(false);
      setQuery('');
      setResults(null);
      if (kind === 'device') navigate(`/devices/${id}`);
      else if (kind === 'client') navigate(`/clients/${encodeURIComponent(String(id))}`);
      else navigate('/events');
    },
    [navigate],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || totalCount === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => (h + 1) % totalCount);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => (h - 1 + totalCount) % totalCount);
    } else if (e.key === 'Enter' && results) {
      e.preventDefault();
      if (highlighted < deviceCount) {
        goToResult('device', results.devices[highlighted].id);
      } else if (highlighted < deviceCount + clientCount) {
        goToResult('client', results.clients[highlighted - deviceCount].mac_address);
      } else {
        goToResult('event', results.events[highlighted - deviceCount - clientCount].id);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  };

  const hasResults = totalCount > 0;
  const showDropdown = open && query.length >= 2;

  return (
    <div ref={containerRef} className="relative flex-1 max-w-lg">
      {/* Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search devices, clients, events… (Ctrl+K)"
          className="w-full pl-9 pr-8 py-1.5 text-sm bg-surface-3/80 border border-transparent focus:border-accent focus:bg-white dark:focus:bg-surface-2 rounded-lg outline-none transition-colors text-ink placeholder-gray-400 dark:placeholder-slate-500"
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setResults(null);
              inputRef.current?.focus();
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink-2 dark:hover:text-ink-2"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-surface border border-line rounded-xl shadow-2xl z-50 overflow-hidden max-h-[500px] flex flex-col">
          <div className="overflow-y-auto flex-1">
            {loading && <div className="px-4 py-6 text-sm text-center text-ink-3">Searching…</div>}

            {!loading && !hasResults && (
              <div className="px-4 py-8 text-sm text-center text-ink-3">
                No results for <span className="font-medium text-ink-2">&quot;{query}&quot;</span>
              </div>
            )}

            {!loading && hasResults && results && (
              <>
                {/* ── Devices ── */}
                {results.devices.length > 0 && (
                  <div>
                    <div className="px-3 pt-3 pb-1.5 text-xs font-semibold text-ink-3 uppercase tracking-wider">
                      Devices
                    </div>
                    {results.devices.map((d, i) => (
                      <button
                        key={d.id}
                        className={clsx(
                          'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                          highlighted === i ? 'bg-accent-soft' : 'hover:bg-surface-2/50',
                        )}
                        onMouseEnter={() => setHighlighted(i)}
                        onClick={() => goToResult('device', d.id)}
                      >
                        <div
                          className={clsx(
                            'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0',
                            d.status === 'online' ? 'bg-good-bg' : 'bg-surface-3',
                          )}
                        >
                          <Router
                            className={clsx(
                              'w-3.5 h-3.5',
                              d.status === 'online' ? 'text-good' : 'text-ink-3',
                            )}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-ink truncate">{d.name}</div>
                          <div className="text-xs text-ink-3 font-mono">
                            {d.ip_address}
                            {d.model ? ` · ${d.model}` : ''}
                          </div>
                        </div>
                        <span
                          className={clsx(
                            'text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0',
                            d.status === 'online'
                              ? 'bg-good-bg text-good dark:bg-good-bg dark:text-good'
                              : 'bg-surface-3 text-ink-3 dark:bg-surface-3 dark:text-ink-3',
                          )}
                        >
                          {d.status}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* ── Clients ── */}
                {results.clients.length > 0 && (
                  <div>
                    <div className="px-3 pt-3 pb-1.5 text-xs font-semibold text-ink-3 uppercase tracking-wider">
                      Clients
                    </div>
                    {results.clients.map((c, i) => (
                      <button
                        key={c.mac_address}
                        className={clsx(
                          'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                          highlighted === deviceCount + i
                            ? 'bg-accent-soft'
                            : 'hover:bg-surface-2/50',
                        )}
                        onMouseEnter={() => setHighlighted(deviceCount + i)}
                        onClick={() => goToResult('client', c.mac_address)}
                      >
                        <div className="w-7 h-7 rounded-lg bg-accent-soft dark:bg-accent-soft flex items-center justify-center flex-shrink-0">
                          <Wifi className="w-3.5 h-3.5 text-accent" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-ink truncate">
                            {c.hostname || c.mac_address}
                          </div>
                          <div className="text-xs text-ink-3 font-mono">
                            {c.hostname ? `${c.mac_address} · ` : ''}
                            {c.ip_address ? `${c.ip_address} · ` : ''}
                            {c.device_name || ''}
                          </div>
                        </div>
                        {!c.active && (
                          <span className="text-xs text-ink-3 flex-shrink-0">inactive</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* ── Events ── */}
                {results.events.length > 0 && (
                  <div>
                    <div className="px-3 pt-3 pb-1.5 text-xs font-semibold text-ink-3 uppercase tracking-wider">
                      Events
                    </div>
                    {results.events.map((ev, i) => (
                      <button
                        key={ev.id}
                        className={clsx(
                          'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                          highlighted === deviceCount + clientCount + i
                            ? 'bg-accent-soft'
                            : 'hover:bg-surface-2/50',
                        )}
                        onMouseEnter={() => setHighlighted(deviceCount + clientCount + i)}
                        onClick={() => goToResult('event', ev.id)}
                      >
                        <div
                          className={clsx(
                            'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0',
                            SEVERITY_ICON_CLS[ev.severity] || SEVERITY_ICON_CLS.info,
                          )}
                        >
                          <AlertTriangle className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-ink truncate">{ev.message}</div>
                          <div className="text-xs text-ink-3">
                            {ev.device_name ? `${ev.device_name} · ` : ''}
                            {format(new Date(ev.event_time), 'MMM d, HH:mm')}
                          </div>
                        </div>
                        <span
                          className={clsx(
                            'text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0',
                            SEVERITY_ICON_CLS[ev.severity] || SEVERITY_ICON_CLS.info,
                          )}
                        >
                          {ev.severity}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer keyboard hints */}
          {hasResults && (
            <div className="flex-shrink-0 px-3 py-2 border-t border-line-soft flex items-center gap-4 text-xs text-ink-3">
              <span>
                <kbd className="px-1 py-0.5 bg-surface-3 rounded text-xs font-sans">↑↓</kbd>{' '}
                navigate
              </span>
              <span>
                <kbd className="px-1 py-0.5 bg-surface-3 rounded text-xs font-sans">↵</kbd> open
              </span>
              <span>
                <kbd className="px-1 py-0.5 bg-surface-3 rounded text-xs font-sans">Esc</kbd> close
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
