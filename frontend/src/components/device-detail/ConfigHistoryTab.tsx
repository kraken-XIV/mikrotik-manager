import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { format } from 'date-fns';
import {
  AlertCircle,
  Camera,
  CheckCircle,
  GitCompare,
  History,
  Loader2,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';

import { useCanWrite } from '../../hooks/useCanWrite';
import { configHistoryApi } from '../../services/api';
import { lineDiff } from '../../utils/lineDiff';

interface Props {
  deviceId: number;
}

export default function ConfigHistoryTab({ deviceId }: Props) {
  const queryClient = useQueryClient();
  const canWrite = useCanWrite();

  const [fromId, setFromId] = useState<number | null>(null);
  const [toId, setToId] = useState<number | null>(null);
  const [rollbackConfirm, setRollbackConfirm] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const { data: history = [], isLoading } = useQuery({
    queryKey: ['config-history', deviceId],
    queryFn: () => configHistoryApi.list(deviceId).then((r) => r.data),
    refetchInterval: 60_000,
  });

  // Default the comparison to "previous → latest" until the user picks otherwise.
  // Derived during render (no effect) so an unselected dropdown still shows a diff.
  const effectiveToId = toId ?? history[0]?.id ?? null;
  const effectiveFromId = fromId ?? history[1]?.id ?? null;

  const { data: diff } = useQuery({
    queryKey: ['config-diff', deviceId, effectiveFromId, effectiveToId],
    queryFn: () =>
      configHistoryApi.diff(deviceId, effectiveFromId!, effectiveToId!).then((r) => r.data),
    enabled:
      effectiveFromId !== null && effectiveToId !== null && effectiveFromId !== effectiveToId,
  });

  const flash = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 4000);
  };
  const fail = (err: unknown, fallback: string) => {
    const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
    setError(msg || fallback);
    setTimeout(() => setError(''), 20000);
  };

  const captureMutation = useMutation({
    mutationFn: () => configHistoryApi.capture(deviceId),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['config-history', deviceId] });
      flash(r.data.message || 'Snapshot captured');
    },
    onError: (err) => fail(err, 'Capture failed'),
  });

  const rollbackMutation = useMutation({
    mutationFn: (id: number) => configHistoryApi.rollback(deviceId, id),
    onSuccess: (r) => {
      setRollbackConfirm(null);
      flash(r.data.message || 'Rolled back.');
    },
    onError: (err) => {
      setRollbackConfirm(null);
      fail(err, 'Rollback failed');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => configHistoryApi.delete(deviceId, id),
    onSuccess: () => {
      setDeleteConfirm(null);
      queryClient.invalidateQueries({ queryKey: ['config-history', deviceId] });
    },
    onError: (err) => {
      setDeleteConfirm(null);
      fail(err, 'Delete failed');
    },
  });

  const diffRows = diff ? lineDiff(diff.from.text, diff.to.text) : [];
  const addCount = diffRows.filter((r) => r.type === 'add').length;
  const delCount = diffRows.filter((r) => r.type === 'del').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-accent" />
          <h2 className="text-lg font-semibold text-ink">Configuration History</h2>
        </div>
        {canWrite && (
          <button
            onClick={() => captureMutation.mutate()}
            disabled={captureMutation.isPending}
            className="btn-primary flex items-center gap-2"
          >
            {captureMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Camera className="w-4 h-4" />
            )}
            Capture snapshot
          </button>
        )}
      </div>

      <p className="text-sm text-ink-3">
        Snapshots are captured automatically when the device configuration changes. Each one links a
        restorable backup so you can roll back to it.
      </p>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-bad-bg border border-bad dark:border-bad rounded-lg">
          <AlertCircle className="w-4 h-4 text-bad flex-shrink-0 mt-0.5" />
          <p className="text-sm text-bad">{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-good-bg border border-good dark:border-good rounded-lg">
          <CheckCircle className="w-4 h-4 text-good" />
          <p className="text-sm text-good">{success}</p>
        </div>
      )}

      {/* History table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-ink-4">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : history.length === 0 ? (
        <div className="card p-12 flex flex-col items-center gap-4 text-center">
          <History className="w-14 h-14 text-ink-4" />
          <div>
            <p className="font-medium text-ink-2">No configuration snapshots yet</p>
            <p className="text-sm text-ink-3 mt-1">
              One will appear after the next config change, or capture one now.
            </p>
          </div>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="table-header px-4 py-2.5 text-left">Captured</th>
                <th className="table-header px-4 py-2.5 text-left">Change</th>
                <th className="table-header px-4 py-2.5 text-left">Rollback</th>
                <th className="table-header px-4 py-2.5 text-left w-40">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line table-zebra">
              {history.map((s) => (
                <tr key={s.id} className="hover:bg-surface-2/30">
                  <td className="px-4 py-2.5 text-ink whitespace-nowrap">
                    {format(new Date(s.collected_at), 'MMM d, yyyy HH:mm:ss')}
                  </td>
                  <td className="px-4 py-2.5 text-ink-2 text-xs">{s.change_summary || '—'}</td>
                  <td className="px-4 py-2.5">
                    {s.has_backup ? (
                      <span className="inline-flex text-xs font-medium px-2 py-0.5 rounded bg-good-bg text-good">
                        available
                      </span>
                    ) : (
                      <span className="inline-flex text-xs font-medium px-2 py-0.5 rounded bg-surface-3 text-ink-3">
                        no backup
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1">
                      {canWrite &&
                        (rollbackConfirm === s.id ? (
                          <span className="flex items-center gap-1 text-xs">
                            <button
                              onClick={() => rollbackMutation.mutate(s.id)}
                              disabled={rollbackMutation.isPending}
                              className="text-warn hover:text-warn font-medium"
                            >
                              {rollbackMutation.isPending ? 'Rolling back…' : 'Confirm rollback'}
                            </button>
                            <button
                              onClick={() => setRollbackConfirm(null)}
                              className="text-ink-4 hover:text-ink-2"
                            >
                              ✕
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setRollbackConfirm(s.id)}
                            disabled={!s.has_backup}
                            title={
                              s.has_backup
                                ? 'Roll back to this configuration'
                                : 'No backup linked to this snapshot'
                            }
                            className="p-1.5 rounded text-ink-4 hover:text-warn hover:bg-warn-bg dark:hover:bg-warn-bg transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-4 disabled:cursor-not-allowed"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        ))}
                      {canWrite &&
                        (deleteConfirm === s.id ? (
                          <span className="flex items-center gap-1 text-xs">
                            <button
                              onClick={() => deleteMutation.mutate(s.id)}
                              disabled={deleteMutation.isPending}
                              className="text-bad hover:text-bad font-medium"
                            >
                              {deleteMutation.isPending ? '…' : 'Delete?'}
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="text-ink-4 hover:text-ink-2"
                            >
                              ✕
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(s.id)}
                            title="Delete this snapshot"
                            className="p-1.5 rounded text-ink-4 hover:text-bad hover:bg-bad-bg dark:hover:bg-bad-bg transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Compare / diff */}
      {history.length >= 2 && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-accent" />
            <h3 className="font-semibold text-sm text-ink">Compare snapshots</h3>
          </div>
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <select
              className="input max-w-xs"
              value={effectiveFromId ?? ''}
              onChange={(e) => setFromId(e.target.value ? parseInt(e.target.value) : null)}
            >
              <option value="">Base (older)…</option>
              {history.map((s) => (
                <option key={s.id} value={s.id}>
                  {format(new Date(s.collected_at), 'MMM d HH:mm:ss')}
                </option>
              ))}
            </select>
            <span className="text-ink-4">→</span>
            <select
              className="input max-w-xs"
              value={effectiveToId ?? ''}
              onChange={(e) => setToId(e.target.value ? parseInt(e.target.value) : null)}
            >
              <option value="">Compare (newer)…</option>
              {history.map((s) => (
                <option key={s.id} value={s.id}>
                  {format(new Date(s.collected_at), 'MMM d HH:mm:ss')}
                </option>
              ))}
            </select>
            {diff && (
              <span className="text-xs ml-1">
                <span className="text-good">+{addCount}</span>{' '}
                <span className="text-bad">−{delCount}</span>
              </span>
            )}
          </div>

          {effectiveFromId === effectiveToId ? (
            <p className="text-sm text-ink-4">Select two different snapshots to compare.</p>
          ) : diff ? (
            addCount + delCount === 0 ? (
              <p className="text-sm text-ink-4">No differences between these snapshots.</p>
            ) : (
              <pre className="text-xs font-mono bg-surface-2/60 border border-line rounded-lg p-3 overflow-auto max-h-[28rem] leading-relaxed">
                {diffRows.map((row, idx) => (
                  <div
                    key={idx}
                    className={clsx(
                      'whitespace-pre-wrap',
                      row.type === 'add' &&
                        'bg-green-100/70 dark:bg-good-bg text-good dark:text-good',
                      row.type === 'del' && 'bg-red-100/70 dark:bg-bad-bg text-bad dark:text-bad',
                      row.type === 'ctx' && 'text-ink-3',
                    )}
                  >
                    {row.type === 'add' ? '+ ' : row.type === 'del' ? '- ' : '  '}
                    {row.text}
                  </div>
                ))}
              </pre>
            )
          ) : (
            <div className="flex items-center gap-2 text-sm text-ink-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading diff…
            </div>
          )}
        </div>
      )}
    </div>
  );
}
