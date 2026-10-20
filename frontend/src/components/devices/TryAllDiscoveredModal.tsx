import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Loader2, CheckCircle, AlertCircle, KeyRound } from 'lucide-react';
import {
  devicesApi,
  type BulkAddDeviceItem,
  type DiscoveredDevice,
} from '../../services/api';
import type { DeviceType } from '../../types';
import { parsePort } from '../../utils/parsePort';
import { useSitePresets } from '../../hooks/useSitePresets';

interface Props {
  discoveredDevices: DiscoveredDevice[];
  onClose: () => void;
  onSuccess: () => void;
}

type ResultItem = { ip: string; identity: string; ok: boolean; message: string };

export default function TryAllDiscoveredModal({ discoveredDevices, onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<'preset' | 'manual'>('preset');
  const [presetId, setPresetId] = useState<number | null>(null);
  const [manual, setManual] = useState({
    api_username: 'admin',
    api_password: '',
    api_port: '8728',
    ssh_username: '',
    ssh_password: '',
    ssh_port: '22',
    device_type: 'router' as DeviceType,
  });
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ResultItem[] | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number; currentName: string }>({
    current: 0,
    total: 0,
    currentName: '',
  });
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Only presets that can apply in the site the device joins (#228).
  const { presets } = useSitePresets();

  const targets = useMemo(
    () => discoveredDevices.filter((d) => d.address && d.address.trim().length > 0),
    [discoveredDevices]
  );

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const buildItems = (): BulkAddDeviceItem[] => {
    return targets.map((d) => {
      const name = d.identity || d.address;
      if (mode === 'preset') {
        return {
          name,
          ip_address: d.address,
          credential_preset_id: presetId!,
        };
      }
      return {
        name,
        ip_address: d.address,
        api_username: manual.api_username,
        api_password: manual.api_password,
        api_port: parsePort(manual.api_port, 8728),
        ssh_username: manual.ssh_username || undefined,
        ssh_password: manual.ssh_password || undefined,
        ssh_port: parsePort(manual.ssh_port, 22),
        device_type: manual.device_type,
      };
    });
  };

  const pollOnce = async (id: string) => {
    try {
      const { data } = await devicesApi.bulkAddStatus(id);
      const total = typeof data.total === 'number' ? data.total : 0;
      const processed = typeof data.processed === 'number' ? data.processed : 0;
      const currentName = typeof data.current_name === 'string' ? data.current_name : '';
      setProgress({
        current: Math.min(processed, total || 1),
        total: total || targets.length,
        currentName,
      });
      if (Array.isArray(data.results)) {
        setResults(data.results as ResultItem[]);
      }
      const st = String(data.status || '');
      if (st === 'completed' || st === 'failed' || st === 'cancelled') {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        setRunning(false);
        setJobId(null);
        if (st === 'cancelled') setCancelled(true);
        if (st === 'failed' && data.error) {
          setError(String(data.error));
        }
        const ok = (data.results as ResultItem[] | undefined)?.filter((r) => r.ok).length ?? 0;
        if (ok > 0) onSuccess();
      }
    } catch {
      // keep polling unless job missing
    }
  };

  const handleRun = async () => {
    setError('');
    setCancelled(false);
    setResults(null);
    setJobId(null);
    if (!targets.length) {
      setError('No discovered devices with a usable IP address.');
      return;
    }
    if (mode === 'preset' && !presetId) {
      setError('Choose a credential preset or switch to manual.');
      return;
    }
    if (mode === 'manual' && (!manual.api_username || !manual.api_password)) {
      setError('Manual mode requires API username and password.');
      return;
    }

    setRunning(true);
    setProgress({ current: 0, total: targets.length, currentName: '' });

    try {
      const items = buildItems();
      const { data } = await devicesApi.bulkAddEnqueue(items);
      const id = data.job_id;
      setJobId(id);
      setProgress({ current: 0, total: data.total, currentName: '' });
      await pollOnce(id);
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => {
        void pollOnce(id);
      }, 1200);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to start bulk add job';
      setError(msg);
      setRunning(false);
    }
  };

  const handleCancel = async () => {
    if (jobId) {
      try {
        await devicesApi.bulkAddCancel(jobId);
      } catch {
        // ignore
      }
    }
    setCancelled(true);
  };

  const okCount = results?.filter((r) => r.ok).length ?? 0;
  const failCount = results?.filter((r) => !r.ok).length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="card w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-line">
          <h2 className="text-lg font-semibold text-ink">Try All Discovered Devices</h2>
          <button onClick={onClose} className="p-1 rounded text-ink-4 hover:text-ink-2 dark:hover:text-ink-2">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-ink-2">
            Attempt to add <strong>{targets.length}</strong> discovered device(s) in one run.
            Progress runs <strong>on the server</strong> — you can leave this page and reopen later (job id is shown while running).
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode('preset')}
              disabled={running}
              className={`px-3 py-1.5 rounded-lg text-sm border ${mode === 'preset' ? 'bg-accent text-accent-fg border-accent' : 'text-ink-2 border-line'}`}
            >
              Use Preset
            </button>
            <button
              type="button"
              onClick={() => setMode('manual')}
              disabled={running}
              className={`px-3 py-1.5 rounded-lg text-sm border ${mode === 'manual' ? 'bg-accent text-accent-fg border-accent' : 'text-ink-2 border-line'}`}
            >
              Enter Manually
            </button>
          </div>

          {mode === 'preset' ? (
            <div>
              <label className="label flex items-center gap-1.5"><KeyRound className="w-3.5 h-3.5" />Credential Preset</label>
              <select className="input" value={presetId ?? ''} onChange={(e) => setPresetId(e.target.value ? parseInt(e.target.value, 10) : null)} disabled={running}>
                <option value="">Select preset...</option>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.api_username}{p.ssh_username ? ` · SSH ${p.ssh_username}` : ''})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">API Username *</label>
                <input className="input" value={manual.api_username} disabled={running} onChange={(e) => setManual((m) => ({ ...m, api_username: e.target.value }))} />
              </div>
              <div>
                <label className="label">API Port</label>
                <input className="input" type="number" value={manual.api_port} disabled={running} onChange={(e) => setManual((m) => ({ ...m, api_port: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="label">API Password *</label>
                <input className="input" type="password" value={manual.api_password} disabled={running} onChange={(e) => setManual((m) => ({ ...m, api_password: e.target.value }))} />
              </div>
              <div>
                <label className="label">SSH Username</label>
                <input className="input" value={manual.ssh_username} disabled={running} onChange={(e) => setManual((m) => ({ ...m, ssh_username: e.target.value }))} />
              </div>
              <div>
                <label className="label">SSH Port</label>
                <input className="input" type="number" value={manual.ssh_port} disabled={running} onChange={(e) => setManual((m) => ({ ...m, ssh_port: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="label">SSH Password</label>
                <input className="input" type="password" value={manual.ssh_password} disabled={running} onChange={(e) => setManual((m) => ({ ...m, ssh_password: e.target.value }))} />
              </div>
            </div>
          )}

          {jobId && running && (
            <p className="text-xs text-ink-3 font-mono break-all">Job: {jobId}</p>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 bg-bad-bg border border-bad dark:border-bad rounded-lg">
              <AlertCircle className="w-4 h-4 text-bad flex-shrink-0 mt-0.5" />
              <p className="text-sm text-bad">{error}</p>
            </div>
          )}

          {running && (
            <div className="space-y-2">
              <div className="text-sm text-ink-2">
                Trying {progress.current}/{progress.total}
                {progress.currentName && (
                  <>
                    : <span className="font-medium">{progress.currentName}</span>
                  </>
                )}
              </div>
              <div className="w-full h-2 bg-surface-3 dark:bg-surface-3 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent transition-all"
                  style={{ width: `${progress.total ? Math.round((progress.current / progress.total) * 100) : 0}%` }}
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => void handleCancel()}
                  className="btn-secondary text-xs py-1 px-2"
                >
                  Stop / Cancel
                </button>
              </div>
            </div>
          )}

          {results && (
            <div className="space-y-2">
              <div className="text-sm text-ink-2">
                {running ? 'Live results:' : cancelled ? 'Cancelled:' : 'Done:'}{' '}
                <span className="text-good">{okCount} succeeded</span>,{' '}
                <span className="text-bad">{failCount} failed</span>
              </div>
              <div className="max-h-56 overflow-y-auto border border-line rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-surface-2 dark:bg-surface-3 sticky top-0">
                    <tr>
                      <th className="table-header px-3 py-2 text-left">Device</th>
                      <th className="table-header px-3 py-2 text-left">IP</th>
                      <th className="table-header px-3 py-2 text-left">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {results.map((r) => (
                      <tr key={`${r.ip}-${r.identity}`}>
                        <td className="px-3 py-2 text-ink-2">{r.identity}</td>
                        <td className="px-3 py-2 font-mono text-ink-3">{r.ip}</td>
                        <td className="px-3 py-2">
                          {r.ok ? (
                            <span className="inline-flex items-center gap-1 text-good">
                              <CheckCircle className="w-3.5 h-3.5" /> {r.message}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-bad">
                              <AlertCircle className="w-3.5 h-3.5" /> {r.message}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Close</button>
            <button
              type="button"
              onClick={() => void handleRun()}
              disabled={running}
              className="btn-primary flex items-center gap-2"
            >
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              {running ? 'Trying...' : `Try All (${targets.length})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
