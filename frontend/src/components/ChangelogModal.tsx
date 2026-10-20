import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, RefreshCw, AlertCircle, ExternalLink, FileText } from 'lucide-react';
import { firmwareApi } from '../services/api';

/**
 * Shows MikroTik's official release notes for a RouterOS version, fetched
 * through the backend proxy (released changelogs are immutable, so results
 * are cached client- and server-side). Falls back to an external link when
 * the changelog can't be fetched.
 */
export default function ChangelogModal({ version, onClose }: { version: string; onClose: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['firmware-changelog', version],
    queryFn: () => firmwareApi.changelog(version).then(r => r.data),
    staleTime: Infinity,
    retry: 1,
  });

  const fallbackUrl = `https://download.mikrotik.com/routeros/${encodeURIComponent(version)}/CHANGELOG`;
  // Dark Site Mode answers 409 with disabled: true. That is a decision, not a
  // failure, so it gets its own wording instead of "couldn't load".
  const disabled = (error as { response?: { data?: { disabled?: boolean } } } | null)
    ?.response?.data?.disabled === true;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-surface rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-base font-semibold text-ink flex items-center gap-2">
            <FileText className="w-4 h-4 text-accent" />
            What&apos;s new in RouterOS {version}
          </h2>
          <button onClick={onClose} className="p-1 rounded text-ink-4 hover:text-ink-2 dark:hover:text-ink-2">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-ink-4 py-8 justify-center">
              <RefreshCw className="w-4 h-4 animate-spin" /> Fetching release notes from MikroTik…
            </div>
          ) : disabled ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <AlertCircle className="w-6 h-6 text-ink-4" />
              <p className="text-sm text-ink-2">
                Changelogs are turned off in Dark Site Mode.
              </p>
              <p className="text-xs text-ink-3">
                Settings → Dark Site Mode → RouterOS changelogs
              </p>
            </div>
          ) : error || !data ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <AlertCircle className="w-6 h-6 text-warn" />
              <p className="text-sm text-ink-2">
                Couldn&apos;t load the changelog for {version}.
              </p>
              <a
                href={fallbackUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-accent hover:underline flex items-center gap-1"
              >
                Open it on mikrotik.com <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          ) : (
            <pre className="text-xs leading-relaxed whitespace-pre-wrap font-mono text-ink-2">
              {data.text}
            </pre>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-line">
          <a
            href={data?.url ?? fallbackUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent hover:underline flex items-center gap-1"
          >
            Open on mikrotik.com <ExternalLink className="w-3 h-3" />
          </a>
          <button onClick={onClose} className="btn-secondary text-sm">Close</button>
        </div>
      </div>
    </div>
  );
}
