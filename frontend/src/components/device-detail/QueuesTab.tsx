import { useState } from 'react';
import ReviewChangesButton from '../common/ReviewChangesButton';
import FastTrackNote from '../common/FastTrackNote';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, RefreshCw, Check, X, Gauge, AlertCircle } from 'lucide-react';
import { devicesApi } from '../../services/api';
import { useCanWrite } from '../../hooks/useCanWrite';
import clsx from 'clsx';

type Row = Record<string, string> & { '.id': string };

function errMsg(err: unknown) {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Operation failed';
}

// RouterOS simple-queue max-limit is "upload/download" (e.g. "10M/50M").
function splitLimit(v?: string): { up: string; down: string } {
  if (!v) return { up: '', down: '' };
  const [up, down] = v.split('/');
  return { up: up || '', down: down || '' };
}
function joinLimit(up: string, down: string): string {
  return `${up || '0'}/${down || '0'}`;
}

interface QForm { name: string; target: string; up: string; down: string; comment: string; disabled: boolean }
const EMPTY: QForm = { name: '', target: '', up: '10M', down: '50M', comment: '', disabled: false };

const RATE_PRESETS = ['1M', '5M', '10M', '25M', '50M', '100M'];

function QueueModal({ deviceId, title, form, setForm, onSave, onReview, onClose, isPending, error }: {
  deviceId: number; title: string; form: QForm; setForm: React.Dispatch<React.SetStateAction<QForm>>;
  onSave: () => void; onReview?: () => Promise<unknown>; onClose: () => void; isPending: boolean; error: string;
}) {
  const set = (k: keyof QForm, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="card w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-line">
          <h3 className="font-semibold text-ink">{title}</h3>
          <button onClick={onClose} className="text-ink-4 hover:text-ink-2"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div><label className="label">Name</label>
            <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. limit-guest-pc" /></div>
          <div><label className="label">Target (IP, subnet, or interface)</label>
            <input className="input font-mono" value={form.target} onChange={e => set('target', e.target.value)} placeholder="192.168.1.50 or 192.168.1.0/24" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Max Upload</label>
              <input className="input font-mono" value={form.up} onChange={e => set('up', e.target.value)} placeholder="10M" />
            </div>
            <div>
              <label className="label">Max Download</label>
              <input className="input font-mono" value={form.down} onChange={e => set('down', e.target.value)} placeholder="50M" />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {RATE_PRESETS.map(r => (
              <button key={r} type="button" onClick={() => set('down', r)}
                className="px-2 py-1 text-xs rounded-md border border-line text-ink-2 hover:border-accent">↓ {r}</button>
            ))}
          </div>
          <p className="text-xs text-ink-4">Use suffixes: <span className="font-mono">k</span>, <span className="font-mono">M</span>, <span className="font-mono">G</span> (bits/sec). Leave a field as <span className="font-mono">0</span> for unlimited.</p>
          <div><label className="label">Comment</label>
            <input className="input" value={form.comment} onChange={e => set('comment', e.target.value)} placeholder="Optional" /></div>
          <FastTrackNote deviceId={deviceId} />
          {error && (
            <div className="flex items-start gap-2 p-3 bg-bad-bg border border-bad dark:border-bad rounded-lg">
              <AlertCircle className="w-4 h-4 text-bad flex-shrink-0 mt-0.5" /><p className="text-sm text-bad">{error}</p>
            </div>
          )}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button onClick={onClose} className="btn-secondary">Cancel</button>
            {onReview && <ReviewChangesButton request={onReview} onApply={onSave} applyLabel="Save" disabled={isPending || !form.name || !form.target} />}
            <button onClick={onSave} disabled={isPending || !form.name || !form.target} className="btn-primary flex items-center gap-2">
              {isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function QueuesTab({ deviceId }: { deviceId: number }) {
  const qc = useQueryClient();
  const canWrite = useCanWrite();
  const [editing, setEditing] = useState<Row | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<QForm>(EMPTY);
  const [err, setErr] = useState('');

  const { data: queues = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['queues', deviceId], queryFn: () => devicesApi.getQueues(deviceId).then(r => r.data as Row[]),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['queues', deviceId] });

  // When editing, an emptied comment is sent as '' so it is cleared on the device.
  const payload = (f: QForm, forEdit = false) => ({ name: f.name, target: f.target, max_limit: joinLimit(f.up, f.down), comment: f.comment || (forEdit ? '' : undefined), disabled: f.disabled });

  const addMut = useMutation({ mutationFn: () => devicesApi.addQueue(deviceId, payload(form)),
    onSuccess: () => { invalidate(); setShowAdd(false); setErr(''); }, onError: e => setErr(errMsg(e)) });
  const updMut = useMutation({ mutationFn: (id: string) => devicesApi.updateQueue(deviceId, id, payload(form, true)),
    onSuccess: () => { invalidate(); setEditing(null); setErr(''); }, onError: e => setErr(errMsg(e)) });
  const delMut = useMutation({ mutationFn: (id: string) => devicesApi.removeQueue(deviceId, id), onSuccess: invalidate });

  const openEdit = (q: Row) => { const lim = splitLimit(q['max-limit']); setForm({ name: q.name ?? '', target: q.target ?? '', up: lim.up, down: lim.down, comment: q.comment ?? '', disabled: q.disabled === 'true' }); setErr(''); setEditing(q); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-good-bg rounded-lg flex items-center justify-center"><Gauge className="w-3.5 h-3.5 text-good" /></div>
          <h3 className="text-sm font-semibold text-ink">Bandwidth Queues <span className="text-ink-4 font-normal">({queues.length})</span></h3>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} disabled={isFetching} className="btn-secondary flex items-center gap-1.5 text-xs py-1.5"><RefreshCw className={clsx('w-3.5 h-3.5', isFetching && 'animate-spin')} /> Refresh</button>
          {canWrite && <button onClick={() => { setForm(EMPTY); setErr(''); setShowAdd(true); }} className="btn-primary flex items-center gap-1.5 text-xs py-1.5"><Plus className="w-3.5 h-3.5" /> Add Queue</button>}
        </div>
      </div>
      <p className="text-xs text-ink-4">Simple queues cap upload/download for a client IP, subnet, or interface. Limit a single client quickly from its detail page.</p>

      {isLoading ? <div className="text-center py-8 text-ink-4"><RefreshCw className="w-4 h-4 animate-spin inline mr-2" />Loading…</div>
        : queues.length === 0 ? <div className="card p-8 text-center text-ink-4">No bandwidth queues defined.</div>
        : (
          <div className="card overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2 dark:bg-surface-3">
                  <th className="table-header px-3 py-2.5 text-left">Name</th>
                  <th className="table-header px-3 py-2.5 text-left">Target</th>
                  <th className="table-header px-3 py-2.5 text-left">Max ↑/↓</th>
                  <th className="table-header px-3 py-2.5 text-left">Comment</th>
                  {canWrite && <th className="table-header px-3 py-2.5 w-20" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-line table-zebra">
                {queues.map((q, i) => {
                  const disabled = q.disabled === 'true';
                  const lim = splitLimit(q['max-limit']);
                  return (
                    <tr key={q['.id'] ?? i} className={clsx('hover:bg-surface-2/30', disabled && 'opacity-40')}>
                      <td className="px-3 py-2 text-xs font-medium text-ink">{q.name}</td>
                      <td className="px-3 py-2 font-mono text-xs text-ink-2">{q.target || '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs text-good">{lim.up || '0'} / {lim.down || '0'}</td>
                      <td className="px-3 py-2 text-xs text-ink-4 italic max-w-[160px] truncate">{q.comment || ''}</td>
                      {canWrite && (
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1 justify-end">
                            <button onClick={() => openEdit(q)} className="p-1 rounded text-ink-4 hover:text-accent"><Pencil className="w-3.5 h-3.5" /></button>
                            <button onClick={() => { if (confirm(`Delete queue "${q.name}"?`)) delMut.mutate(q['.id']); }} className="p-1 rounded text-ink-4 hover:text-bad"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      {showAdd && <QueueModal deviceId={deviceId} title="Add Bandwidth Queue" form={form} setForm={setForm} isPending={addMut.isPending} error={err} onClose={() => setShowAdd(false)} onSave={() => addMut.mutate()} onReview={() => devicesApi.addQueue(deviceId, payload(form))} />}
      {editing && <QueueModal deviceId={deviceId} title="Edit Bandwidth Queue" form={form} setForm={setForm} isPending={updMut.isPending} error={err} onClose={() => setEditing(null)} onSave={() => updMut.mutate(editing['.id'])} onReview={() => devicesApi.updateQueue(deviceId, editing['.id'], payload(form, true))} />}
    </div>
  );
}
