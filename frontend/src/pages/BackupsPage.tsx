import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  HardDrive, Plus, Download, RotateCcw, Trash2, AlertCircle, AlertTriangle,
  Loader2, X, GitCompare, FileText, FilterX, Lock, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { backupsApi, devicesApi } from '../services/api';
import { useCanWrite } from '../hooks/useCanWrite';
import { useAuthStore } from '../store/authStore';
import type { Backup } from '../types';
import BackupViewerModal from '../components/backups/BackupViewerModal';
import { orderForDiff } from '../utils/backupCompare';
import { format } from 'date-fns';
import clsx from 'clsx';
import DeviceTypePill from '../components/devices/DeviceTypePill';
import TagChips from '../components/devices/TagChips';
import { FilterBar, FilterSearch, FilterSelect, FilterDivider } from '../components/common/FilterBar';
import DevicePicker from '../components/common/DevicePicker';

/** One home for backup-type wording, used by the filter and the table badge. */
const TYPE_LABEL: Record<string, string> = {
  'config-snapshot': 'Config Snapshot',
  scheduled: 'Scheduled',
  manual: 'Manual',
  'pre-upgrade': 'Pre-upgrade',
};

function formatBytes(bytes?: number): string {
  if (!bytes) return '—';
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export default function BackupsPage() {
  const queryClient = useQueryClient();
  const canWrite = useCanWrite();
  const isAdmin = useAuthStore((st) => st.user?.role === 'admin');
  const [selectedDevice, setSelectedDevice] = useState('');
  const [notes, setNotes] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [restoreConfirm, setRestoreConfirm] = useState<Backup | null>(null);
  const [restoreTyped, setRestoreTyped] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  // Config-snapshot backups are confirmed via a modal (deleting also removes the snapshot).
  const [snapshotDeleteTarget, setSnapshotDeleteTarget] = useState<Backup | null>(null);
  const [error, setError] = useState('');
  /** Outcome of the last restore, shown above the list (the form's error box is hidden when it's closed). */
  const [restoreResult, setRestoreResult] = useState<{ ok: boolean; text: string } | null>(null);

  // Filters (#134). Held together so the query key is a single object.
  const [filters, setFilters] = useState({ deviceId: '', type: '', from: '', to: '', search: '' });
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const clearFilters = () => setFilters({ deviceId: '', type: '', from: '', to: '', search: '' });

  const [selected, setSelected] = useState<number[]>([]);
  const [viewing, setViewing] = useState<number[] | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState(false);

  // A page at a time (#221): a fleet's backups run to thousands.
  const PAGE = 100;
  const [page, setPage] = useState(0);
  const filterKey = JSON.stringify(filters);
  const [pagedFor, setPagedFor] = useState(filterKey);
  if (pagedFor !== filterKey) { setPagedFor(filterKey); setPage(0); }
  const { data: pageData, isLoading } = useQuery({
    queryKey: ['backups', filters, page],
    queryFn: () => backupsApi.listPage(filters, PAGE, page * PAGE),
    placeholderData: keepPreviousData,
  });
  const backups = useMemo(() => pageData?.rows ?? [], [pageData]);
  const totalBackups = pageData?.total ?? 0;
  const pages = Math.max(1, Math.ceil(totalBackups / PAGE));

  const { data: types = [] } = useQuery({
    queryKey: ['backup-types'],
    queryFn: () => backupsApi.types().then((r) => r.data),
  });

  // What a bulk delete would actually remove, including the config snapshots
  // that go with it. Fetched before asking, so the confirmation can be specific
  // rather than "are you sure?".
  const { data: bulkPreview } = useQuery({
    queryKey: ['backup-bulk-preview', selected],
    queryFn: () => backupsApi.bulkDeletePreview(selected).then((r) => r.data),
    enabled: bulkConfirm && selected.length > 0,
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: () => backupsApi.bulkDelete(selected).then((r) => r.data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      queryClient.invalidateQueries({ queryKey: ['backup-types'] });
      setBulkConfirm(false);
      setSelected([]);
      if (res.failures.length > 0) {
        setError(`${res.deleted} deleted, ${res.failures.length} failed.`);
      }
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Bulk delete failed');
      setBulkConfirm(false);
    },
  });

  const toggle = (id: number) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const allShownSelected = backups.length > 0 && backups.every((b) => selected.includes(b.id));
  const toggleAll = () =>
    setSelected(allShownSelected ? [] : backups.map((b) => b.id));

  // Exactly two, oldest first, so the diff reads forwards in time (tested in
  // utils/backupCompare — a reversed diff shows additions as deletions and
  // looks perfectly normal while doing it).
  const comparePair = orderForDiff(selected, backups);

  const { data: devices = [] } = useQuery({
    queryKey: ['devices'],
    queryFn: () => devicesApi.list().then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: () => backupsApi.create(parseInt(selectedDevice), notes || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      setShowCreateForm(false);
      setSelectedDevice('');
      setNotes('');
      setError('');
    },
    onError: (err: unknown) => {
      const e = err as { response?: { status?: number; data?: { error?: string } }; code?: string };
      const msg = e?.response?.data?.error
        ?? (e?.code === 'ECONNABORTED' ? 'Backup failed: no answer from the manager in time. A very large configuration may still be exporting; check the list in a few minutes.'
          : e?.response?.status === 504 ? 'Backup failed: the request timed out on the way to the manager.'
          : undefined);
      setError(msg || 'Backup failed');
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (id: number) => backupsApi.restore(id),
    onSuccess: (r) => {
      setRestoreConfirm(null);
      setRestoreResult({ ok: true, text: r.data?.message || 'Restored.' });
    },
    onError: (err: unknown) => {
      setRestoreConfirm(null);
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setRestoreResult({ ok: false, text: msg || 'Restore failed' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => backupsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      setDeleteConfirm(null);
      setSnapshotDeleteTarget(null);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Delete failed');
      setSnapshotDeleteTarget(null);
    },
  });

  const downloadBackup = async (id: number, filename: string) => {
    const res = await backupsApi.download(id);
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-ink">
          Backups
          {totalBackups > 0 && (
            <span className="ml-2 text-sm font-normal text-ink-3">
              ({totalBackups} total)
            </span>
          )}
        </h1>
        {canWrite && (
          <button
            onClick={() => setShowCreateForm(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Backup
          </button>
        )}
      </div>

      {restoreResult && (
        <div className={clsx(
          'rounded-lg border p-3 text-sm flex items-start justify-between gap-3',
          restoreResult.ok
            ? 'border-good bg-good-bg text-good dark:bg-good-bg dark:border-good dark:text-good'
            : 'border-warn bg-warn-bg text-warn dark:bg-warn-bg dark:border-warn dark:text-warn'
        )}>
          <span>{restoreResult.text}</span>
          <button onClick={() => setRestoreResult(null)} className="text-xs opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}

      {/* Create backup form */}
      {showCreateForm && (
        <div className="card p-5 border-accent dark:border-accent">
          <h3 className="font-semibold text-ink mb-4">New Backup</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Device</label>
              <DevicePicker
                devices={devices}
                value={selectedDevice ? Number(selectedDevice) : null}
                onChange={(id) => setSelectedDevice(id == null ? '' : String(id))}
                placeholder="Select a device…"
                aria-label="Device"
              />
            </div>
            <div>
              <label className="label">Notes (optional)</label>
              <input
                className="input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Pre-upgrade backup..."
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 mt-3 p-3 bg-bad-bg border border-bad dark:border-bad rounded-lg">
              <AlertCircle className="w-4 h-4 text-bad flex-shrink-0" />
              <p className="text-sm text-bad">{error}</p>
            </div>
          )}

          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={() => { setShowCreateForm(false); setError(''); }}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={() => createMutation.mutate()}
              disabled={!selectedDevice || createMutation.isPending}
              className="btn-primary flex items-center gap-2"
            >
              {createMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <HardDrive className="w-4 h-4" />
              )}
              {createMutation.isPending ? 'Creating...' : 'Create Backup'}
            </button>
          </div>
          <p className="text-xs text-ink-3 mt-2">
            Backup uses SSH export. Make sure SSH credentials are configured for this device.
          </p>
        </div>
      )}

      {/* Filters (#134), in the same bar as Devices and Clients (#217). */}
      <FilterBar>
        <FilterSearch value={filters.search} onChange={(v) => setFilters((f) => ({ ...f, search: v }))} placeholder="Device, filename or note…" />
        <DevicePicker
          variant="filter" title="Device" emptyLabel="All devices" devices={devices}
          value={filters.deviceId ? Number(filters.deviceId) : null}
          onChange={(id) => setFilters((f) => ({ ...f, deviceId: id == null ? '' : String(id) }))}
        />
        <FilterSelect value={filters.type} onChange={(v) => setFilters((f) => ({ ...f, type: v }))} title="Type">
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t.type} value={t.type}>{TYPE_LABEL[t.type] ?? t.type} ({t.count})</option>
          ))}
        </FilterSelect>
        <FilterDivider />
        <label className="mono text-[11.5px] flex items-center gap-1" style={{ color: 'var(--ink-3)' }}>
          from
          <input type="date" aria-label="From date" className="bg-transparent outline-none px-[6px] py-[3px] rounded-[5px]"
            style={{ color: filters.from ? 'var(--ink)' : 'var(--ink-3)', border: '1px solid var(--line)' }}
            value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
        </label>
        <label className="mono text-[11.5px] flex items-center gap-1" style={{ color: 'var(--ink-3)' }}>
          to
          <input type="date" aria-label="To date" className="bg-transparent outline-none px-[6px] py-[3px] rounded-[5px]"
            style={{ color: filters.to ? 'var(--ink)' : 'var(--ink-3)', border: '1px solid var(--line)' }}
            value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
        </label>
        {activeFilterCount > 0 && (
          <button onClick={clearFilters} className="mono text-[11.5px] px-[8px] py-[4px] rounded-[5px] flex items-center gap-1" style={{ color: 'var(--ink-3)' }}>
            <FilterX className="w-3.5 h-3.5" /> clear
          </button>
        )}
      </FilterBar>

      {/* Selection actions */}
      {selected.length > 0 && (
        <div className="card px-4 py-2.5 flex flex-wrap items-center gap-3 border-accent dark:border-accent">
          <span className="text-sm font-medium text-ink">
            {selected.length} selected
          </span>
          <button onClick={() => setSelected([])} className="text-xs text-ink-4 hover:text-ink-2">
            Clear
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => comparePair && setViewing(comparePair)}
              disabled={!comparePair}
              title={comparePair ? 'Compare the two selected backups' : 'Select exactly two backups to compare'}
              className="btn-secondary flex items-center gap-1.5 text-xs disabled:opacity-40"
            >
              <GitCompare className="w-3.5 h-3.5" /> Compare
            </button>
            {canWrite && (
              <button
                onClick={() => setBulkConfirm(true)}
                className="btn-danger flex items-center gap-1.5 text-xs"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete {selected.length}
              </button>
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-ink-4">Loading...</div>
      ) : backups.length === 0 ? (
        <div className="card p-12 flex flex-col items-center gap-4 text-center">
          <HardDrive className="w-16 h-16 text-ink-4" />
          <div>
            <p className="font-medium text-ink-2">
              {activeFilterCount > 0 ? 'No backups match these filters' : 'No backups yet'}
            </p>
            <p className="text-sm text-ink-3 mt-1">
              {activeFilterCount > 0
                ? 'Try widening the date range or clearing a filter.'
                : 'Create a backup to save your device configurations'}
            </p>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="btn-secondary mt-3 text-xs">Clear filters</button>
            )}
          </div>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="table-header px-3 py-2.5 w-9">
                  <input
                    type="checkbox"
                    aria-label="Select all shown"
                    checked={allShownSelected}
                    onChange={toggleAll}
                    className="cursor-pointer"
                  />
                </th>
                <th className="table-header px-1 py-2.5 w-6" aria-label="Contains secrets" />
                <th className="table-header px-4 py-2.5 text-left">Device</th>
                <th className="table-header px-4 py-2.5 text-left">Type</th>
                <th className="table-header px-4 py-2.5 text-left">Size</th>
                <th className="table-header px-4 py-2.5 text-left">Created</th>
                <th className="table-header px-4 py-2.5 text-left">Notes</th>
                <th className="table-header px-4 py-2.5 text-left w-36">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line table-zebra">
              {backups.map((backup) => (
                <tr
                  key={backup.id}
                  onClick={() => setViewing([backup.id])}
                  title="Click to preview"
                  className={clsx(
                    'cursor-pointer hover:bg-surface-2/30',
                    selected.includes(backup.id) && 'bg-blue-50/60 dark:bg-accent-soft'
                  )}
                >
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${backup.filename}`}
                      checked={selected.includes(backup.id)}
                      onChange={() => toggle(backup.id)}
                      className="cursor-pointer"
                    />
                  </td>
                  {/* Secrets as a small lock, not a badge in Type: it isn't a type (#219). */}
                  <td className="px-1 py-2.5">
                    {backup.contains_secrets && (
                      <span title="Includes passwords and keys. Encrypted on disk; only admins can view or download it."
                        aria-label="Contains secrets" className="inline-flex text-good">
                        <Lock className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      {backup.device_type && <DeviceTypePill type={backup.device_type} />}
                      <span className="cell-primary">{backup.device_name || '—'}</span>
                      <TagChips tags={backup.device_tags} />
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={clsx(
                        'inline-flex text-xs font-medium px-2 py-0.5 rounded whitespace-nowrap',
                        backup.backup_type === 'config-snapshot' &&
                          'bg-violet-bg dark:bg-violet-bg text-violet dark:text-violet',
                        backup.backup_type === 'scheduled' &&
                          'bg-accent-soft dark:bg-accent-soft text-accent dark:text-accent',
                        backup.backup_type === 'manual' &&
                          'bg-surface-3 text-ink-2'
                      )}
                      title={
                        backup.backup_type === 'config-snapshot'
                          ? 'Auto-created by Config History — tied to a config snapshot'
                          : undefined
                      }
                    >
                      {TYPE_LABEL[backup.backup_type ?? ''] ?? backup.backup_type ?? 'Manual'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-ink-3">
                    {formatBytes(backup.size_bytes)}
                  </td>
                  <td className="px-4 py-2.5 text-ink-3">
                    {format(new Date(backup.created_at), 'MMM d, yyyy HH:mm')}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-ink-3 italic">
                    {backup.notes || ''}
                  </td>
                  <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setViewing([backup.id])}
                        disabled={backup.contains_secrets && !isAdmin}
                        className="p-1.5 rounded text-ink-4 hover:text-accent hover:bg-accent-soft dark:hover:bg-accent-soft transition-colors disabled:opacity-40 disabled:hover:text-ink-4 disabled:hover:bg-transparent"
                        title={backup.contains_secrets && !isAdmin ? 'Contains passwords and keys: admins only' : 'Preview'}
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => downloadBackup(backup.id, backup.filename)}
                        disabled={backup.contains_secrets && !isAdmin}
                        className="p-1.5 rounded text-ink-4 hover:text-accent hover:bg-accent-soft dark:hover:bg-accent-soft transition-colors disabled:opacity-40 disabled:hover:text-ink-4 disabled:hover:bg-transparent"
                        title={backup.contains_secrets && !isAdmin ? 'Contains passwords and keys: admins only' : 'Download'}
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>

                      {canWrite && (
                        <button
                          onClick={() => { setRestoreTyped(''); setRestoreConfirm(backup); }}
                          className="p-1.5 rounded text-ink-4 hover:text-warn hover:bg-warn-bg dark:hover:bg-warn-bg transition-colors"
                          title="Restore"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {canWrite && (deleteConfirm === backup.id ? (
                        <div className="flex gap-1 text-xs">
                          <button
                            onClick={() => deleteMutation.mutate(backup.id)}
                            className="text-bad hover:text-bad font-medium"
                          >
                            Delete?
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="text-ink-4 hover:text-ink-2"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() =>
                            backup.backup_type === 'config-snapshot'
                              ? setSnapshotDeleteTarget(backup)
                              : setDeleteConfirm(backup.id)
                          }
                          className="p-1.5 rounded text-ink-4 hover:text-bad hover:bg-bad-bg dark:hover:bg-bad-bg transition-colors"
                          title="Delete"
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
          {pages > 1 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-line text-xs text-ink-3">
              <span>{page * PAGE + 1}–{Math.min((page + 1) * PAGE, totalBackups)} of {totalBackups}</span>
              <div className="flex items-center gap-1">
                <button className="p-1 rounded disabled:opacity-40" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft className="w-4 h-4" /></button>
                <span>Page {page + 1} of {pages}</span>
                <button className="p-1 rounded disabled:opacity-40" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </div>
      )}

      {viewing && (
        <BackupViewerModal
          ids={viewing}
          onClose={() => setViewing(null)}
          onDownload={downloadBackup}
        />
      )}

      {/* Bulk delete confirmation.
          Backups and their config snapshots are deliberately one artifact, so a
          bulk delete can remove restore points the operator never looked at.
          The confirmation therefore names exactly what goes, per device, and
          says plainly that there is no undo. */}
      {bulkConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="card w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-line">
              <h3 className="text-lg font-semibold text-ink flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-warn" />
                Delete {selected.length} backup{selected.length === 1 ? '' : 's'}?
              </h3>
              <button
                onClick={() => setBulkConfirm(false)}
                disabled={bulkDeleteMutation.isPending}
                className="p-1 rounded text-ink-4 hover:text-ink-2 dark:hover:text-ink-2"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {!bulkPreview ? (
                <div className="flex items-center gap-2 text-sm text-ink-4 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Checking what this removes…
                </div>
              ) : (
                <>
                  <div className="text-sm text-ink-2">
                    <ul className="space-y-1">
                      {bulkPreview.devices.map((d) => (
                        <li key={d.name} className="flex justify-between gap-4">
                          <span className="text-ink">{d.name}</span>
                          <span className="text-ink-4">{d.count} backup{d.count === 1 ? '' : 's'}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {bulkPreview.snapshots > 0 && (
                    <div className="rounded-lg border border-warn bg-warn-bg dark:border-warn p-3">
                      <p className="text-sm text-warn dark:text-warn">
                        <span className="font-semibold">{bulkPreview.snapshots}</span> of these
                        {bulkPreview.snapshots === 1 ? ' is' : ' are'} tied to a{' '}
                        <span className="font-medium">Config History snapshot</span>. Deleting
                        {bulkPreview.snapshots === 1 ? ' it' : ' them'} also removes
                        {bulkPreview.snapshots === 1 ? ' that snapshot' : ' those snapshots'} and the
                        ability to roll back to {bulkPreview.snapshots === 1 ? 'it' : 'them'}.
                      </p>
                    </div>
                  )}

                  <p className="text-sm text-ink-3">
                    This cannot be undone.
                  </p>
                </>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  onClick={() => setBulkConfirm(false)}
                  disabled={bulkDeleteMutation.isPending}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={() => bulkDeleteMutation.mutate()}
                  disabled={bulkDeleteMutation.isPending || !bulkPreview}
                  className="btn-danger inline-flex items-center gap-2 disabled:opacity-50"
                >
                  {bulkDeleteMutation.isPending
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Trash2 className="w-4 h-4" />}
                  Delete {bulkPreview?.backups ?? selected.length}
                  {bulkPreview && bulkPreview.snapshots > 0 ? ' + snapshots' : ''}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Restore confirmation: runs the backup's commands on the device's running configuration */}
      {restoreConfirm && (() => {
        const target = (restoreConfirm.device_name ?? '').trim() || 'RESTORE';
        const ok = restoreTyped.trim() === target;
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="card w-full max-w-lg mx-4 border-2 border-bad">
              <div className="flex items-center justify-between p-5 border-b border-line">
                <h3 className="text-lg font-semibold text-bad flex items-center gap-2">
                  <AlertTriangle className="w-6 h-6" />
                  Restore this backup?
                </h3>
                <button
                  onClick={() => setRestoreConfirm(null)}
                  disabled={restoreMutation.isPending}
                  className="p-1 rounded text-ink-4 hover:text-ink-2 dark:hover:text-ink-2"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div className="rounded-md bg-bad-bg border border-bad dark:border-bad p-3 text-sm text-bad dark:text-bad space-y-1">
                  <p className="font-semibold">
                    Restore runs this backup&apos;s commands on the device&apos;s running configuration.
                  </p>
                  <p>
                    Settings in the backup are applied over the current ones; the device may drop your connection
                    while it runs.
                  </p>
                </div>
                <dl className="text-sm grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
                  <dt className="text-ink-3">Device</dt>
                  <dd className="font-medium text-ink">{restoreConfirm.device_name || '—'}</dd>
                  <dt className="text-ink-3">Backup</dt>
                  <dd className="font-mono text-xs break-all text-ink-2">{restoreConfirm.filename}</dd>
                  <dt className="text-ink-3">Taken</dt>
                  <dd className="text-ink-2">{format(new Date(restoreConfirm.created_at), 'MMM d, yyyy HH:mm')}</dd>
                </dl>
                <label className="block text-sm text-ink-2">
                  Type <span className="font-mono font-semibold">{target}</span> to confirm
                  <input
                    autoFocus
                    value={restoreTyped}
                    onChange={(e) => setRestoreTyped(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && ok && !restoreMutation.isPending) restoreMutation.mutate(restoreConfirm.id); }}
                    className="input mt-1 w-full font-mono"
                    placeholder={target}
                  />
                </label>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setRestoreConfirm(null)}
                    disabled={restoreMutation.isPending}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => restoreMutation.mutate(restoreConfirm.id)}
                    disabled={!ok || restoreMutation.isPending}
                    className="btn-danger inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {restoreMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                    Run restore
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Confirm deletion of a snapshot-linked backup (removes the config snapshot too) */}
      {snapshotDeleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="card w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-5 border-b border-line">
              <h3 className="text-lg font-semibold text-ink flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-warn" />
                Delete config snapshot backup?
              </h3>
              <button
                onClick={() => setSnapshotDeleteTarget(null)}
                disabled={deleteMutation.isPending}
                className="p-1 rounded text-ink-4 hover:text-ink-2 dark:hover:text-ink-2"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-ink-2">
                This backup is tied to a <span className="font-medium">Config History snapshot</span> for{' '}
                <span className="font-medium text-ink">{snapshotDeleteTarget.device_name || 'this device'}</span>.
              </p>
              <div className="rounded-lg border border-warn bg-warn-bg dark:border-warn p-3">
                <p className="text-sm text-warn dark:text-warn">
                  Deleting it will also <span className="font-semibold">permanently remove that snapshot from the
                  device&apos;s Config History</span>, and you will no longer be able to roll back to it.
                </p>
              </div>
              <p className="text-xs text-ink-3 font-mono break-all">
                {snapshotDeleteTarget.filename}
              </p>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setSnapshotDeleteTarget(null)}
                  disabled={deleteMutation.isPending}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(snapshotDeleteTarget.id)}
                  disabled={deleteMutation.isPending}
                  className="btn-danger inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Delete backup &amp; snapshot
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
