import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { format } from 'date-fns';
import { AlertCircle, Download, FileText, GitCompare, Loader2, X } from 'lucide-react';

import { backupsApi } from '../../services/api';
import { lineDiff } from '../../utils/lineDiff';

/**
 * Reads a backup in place, or compares two (#134).
 *
 * Backups are `/export compact` output — plain RouterOS script, not the binary
 * `.backup` blob — so both are just text. The diff reuses the same lineDiff
 * that Config History already uses, rather than introducing a second one.
 */
interface Props {
  /** One id previews; two compare, oldest first. */
  ids: number[];
  onClose: () => void;
  onDownload: (id: number, filename: string) => void;
}

function errorText(e: unknown): string {
  const err = e as { response?: { data?: { error?: string } }; message?: string };
  return err.response?.data?.error ?? err.message ?? 'Could not read this backup.';
}

export default function BackupViewerModal({ ids, onClose, onDownload }: Props) {
  const comparing = ids.length === 2;

  const single = useQuery({
    queryKey: ['backup-content', ids[0]],
    queryFn: () => backupsApi.content(ids[0]).then((r) => r.data),
    enabled: !comparing && ids.length === 1,
    retry: false,
  });

  const pair = useQuery({
    queryKey: ['backup-diff', ids[0], ids[1]],
    queryFn: () => backupsApi.diff(ids[0], ids[1]).then((r) => r.data),
    enabled: comparing,
    retry: false,
  });

  const loading = comparing ? pair.isLoading : single.isLoading;
  const error = comparing ? pair.error : single.error;

  const rows = pair.data ? lineDiff(pair.data.from.text, pair.data.to.text) : [];
  const added = rows.filter((r) => r.type === 'add').length;
  const removed = rows.filter((r) => r.type === 'del').length;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-5xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 p-4 border-b border-line">
          {comparing ? (
            <GitCompare className="w-5 h-5 text-accent mt-0.5 flex-shrink-0" />
          ) : (
            <FileText className="w-5 h-5 text-accent mt-0.5 flex-shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            {comparing ? (
              <>
                <h3 className="text-sm font-semibold text-ink">Comparing backups</h3>
                {pair.data && (
                  // The filename lives here rather than in the table: it is how you
                  // would refer to this file to someone else, so it belongs where
                  // you are actually looking at the file.
                  <p className="text-xs font-mono text-ink-3 break-all mt-0.5">
                    {pair.data.from.filename} → {pair.data.to.filename}
                  </p>
                )}
              </>
            ) : (
              <>
                <h3 className="text-sm font-semibold text-ink">
                  {single.data?.device_name ?? 'Backup'}
                </h3>
                {single.data && (
                  <p className="text-xs font-mono text-ink-3 break-all mt-0.5">
                    {single.data.filename}
                  </p>
                )}
              </>
            )}
            {!comparing && single.data && (
              <p className="text-xs text-ink-3 mt-0.5">
                {format(new Date(single.data.created_at), 'MMM d, yyyy HH:mm')}
                {single.data.notes ? ` · ${single.data.notes}` : ''}
              </p>
            )}
            {comparing && pair.data && (
              <p className="text-xs mt-0.5">
                <span className="text-good">+{added}</span>{' '}
                <span className="text-bad">−{removed}</span>
                <span className="text-ink-3">
                  {' '}
                  · {format(new Date(pair.data.from.created_at), 'MMM d HH:mm')}
                  {' → '}
                  {format(new Date(pair.data.to.created_at), 'MMM d HH:mm')}
                </span>
              </p>
            )}
          </div>
          {!comparing && single.data && (
            <button
              onClick={() => onDownload(single.data!.id, single.data!.filename)}
              className="p-1.5 rounded text-ink-4 hover:text-accent hover:bg-accent-soft dark:hover:bg-accent-soft"
              title="Download"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded text-ink-4 hover:text-ink-2 dark:hover:text-ink-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-ink-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Reading…
            </div>
          )}

          {!loading && error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-bad-bg border border-bad dark:border-bad">
              <AlertCircle className="w-4 h-4 text-bad mt-0.5 flex-shrink-0" />
              <p className="text-sm text-bad">{errorText(error)}</p>
            </div>
          )}

          {!loading &&
            !error &&
            comparing &&
            (added + removed === 0 ? (
              <p className="text-sm text-ink-4 py-8 text-center">
                These two backups are identical.
              </p>
            ) : (
              <pre className="text-xs font-mono bg-surface-2/60 border border-line rounded-lg p-3 leading-relaxed">
                {rows.map((row, i) => (
                  <div
                    key={i}
                    className={clsx(
                      'whitespace-pre-wrap',
                      row.type === 'add' && 'bg-good-bg text-good',
                      row.type === 'del' && 'bg-bad-bg text-bad dark:text-bad',
                      row.type === 'ctx' && 'text-ink-3',
                    )}
                  >
                    {row.type === 'add' ? '+' : row.type === 'del' ? '−' : ' '} {row.text}
                  </div>
                ))}
              </pre>
            ))}

          {!loading && !error && !comparing && single.data && (
            <pre className="text-xs font-mono bg-surface-2/60 border border-line rounded-lg p-3 leading-relaxed whitespace-pre-wrap">
              {single.data.content}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
