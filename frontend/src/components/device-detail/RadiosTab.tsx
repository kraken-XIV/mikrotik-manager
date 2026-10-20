import { useState, useEffect, useRef } from 'react';
import { useRememberedRange } from '../../hooks/useRememberedRange';
import ReviewChangesButton from '../common/ReviewChangesButton';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Wifi, Activity, Users, Radio, RefreshCw, Pencil, ChevronDown, ChevronRight,
  Signal, Zap, Globe, Cpu, ScanLine, Lock, Unlock, AlertTriangle,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts';
import { chartTooltip } from '../common/chartTooltip';
import { wirelessApi } from '../../services/api';
import { useCanWrite } from '../../hooks/useCanWrite';
import RfHealth from '../wireless/RfHealth';
import type { WirelessInterface, WirelessMetricPoint } from '../../types';
import clsx from 'clsx';
import { format } from 'date-fns';
import { changedFields } from '../../utils/formDiff';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bandLabel(band: string | undefined): string {
  if (!band) return '—';
  if (band.startsWith('5ghz')) return '5 GHz';
  if (band.startsWith('2ghz')) return '2.4 GHz';
  return band;
}

function statusDot(iface: WirelessInterface) {
  if (iface.disabled) return <span className="w-2 h-2 rounded-full bg-surface-3 flex-shrink-0" />;
  if (iface.running)  return <span className="w-2 h-2 rounded-full bg-good flex-shrink-0 animate-pulse" />;
  return                     <span className="w-2 h-2 rounded-full bg-warn flex-shrink-0" />;
}

function SignalBar({ dbm }: { dbm: number | undefined }) {
  if (dbm == null) return <span className="text-ink-4">—</span>;
  const quality = Math.max(0, Math.min(100, 2 * (dbm + 100)));
  const color = quality > 60 ? 'text-good' : quality > 30 ? 'text-warn' : 'text-bad';
  return (
    <span className={clsx('font-mono text-xs', color)}>
      {dbm} dBm
    </span>
  );
}

// ─── Radio edit modal ─────────────────────────────────────────────────────────

const BANDS_EDIT = [
  { value: '2ghz-b/g/n',  label: '2.4 GHz (b/g/n)' },
  { value: '2ghz-onlyn',  label: '2.4 GHz (n only)' },
  { value: '5ghz-a/n/ac', label: '5 GHz (a/n/ac)' },
  { value: '5ghz-onlyac', label: '5 GHz (ac only)' },
];
const WIDTHS = ['20mhz', '40mhz', '80mhz', '20/40mhz-XX', '20/40mhz-Ce', '20/40/80mhz'];

function RadioEditModal({
  deviceId, iface, onClose,
}: {
  deviceId: number;
  iface: WirelessInterface;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const loaded = {
    ssid:          iface.ssid || '',
    band:          iface.band || '2ghz-b/g/n',
    frequency:     String(iface.frequency || ''),
    channel_width: iface.channel_width || '20mhz',
    tx_power:      String(iface.tx_power || ''),
    tx_power_mode: iface.tx_power_mode || 'default',
    antenna_gain:  String(iface.antenna_gain ?? 0),
    country:       iface.country || 'united states',
    installation:  iface.installation || 'indoor',
    disabled:      iface.disabled,
  };
  const [form, setForm] = useState(loaded);
  const set = (k: keyof typeof form) => (v: string | boolean) =>
    setForm(f => ({ ...f, [k]: v }));

  const [advOpen, setAdvOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      wirelessApi.updateInterface(deviceId, iface.name, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['device-wireless', deviceId] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Only what changed. The frequency shown is the one the radio is running
    // on now; re-sending it on every save pinned a radio set to choose its
    // channel automatically to that frequency.
    const changes = changedFields(loaded, form);
    if (!Object.keys(changes).length) { onClose(); return; }
    // Taking a radio off the air asks first (#294).
    if (changes.disabled === true && !confirm(
      `Disable ${iface.name}${iface.ssid ? ` ("${iface.ssid}")` : ''}? Clients connected to it will be disconnected, `
      + 'and if this device is managed over that wireless link, the manager may lose contact.')) return;
    mutation.mutate(changes);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-surface rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-line">
          <h3 className="font-semibold text-ink">
            Configure Radio — {iface.name}
          </h3>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {/* Basic */}
          <div>
            <label className="label">SSID</label>
            <input className="input" value={form.ssid} onChange={e => set('ssid')(e.target.value)} />
          </div>
          <div>
            <label className="label">Band</label>
            <select className="input" value={form.band} onChange={e => set('band')(e.target.value)}>
              {BANDS_EDIT.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Channel Width</label>
            <select className="input" value={form.channel_width} onChange={e => set('channel_width')(e.target.value)}>
              {WIDTHS.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 rounded"
              checked={form.disabled} onChange={e => set('disabled')(e.target.checked)} />
            <span className="text-sm text-ink-2">Disabled</span>
          </label>

          {/* Advanced */}
          <div className="border border-line rounded-lg overflow-hidden">
            <button type="button" onClick={() => setAdvOpen(o => !o)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-surface-2/60 text-sm font-medium text-ink-2 hover:bg-surface-3/50">
              <span>Advanced</span>
              {advOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            {advOpen && (
              <div className="p-4 space-y-3 bg-surface/20">
                <div>
                  <label className="label">Frequency (MHz)</label>
                  <input className="input" type="number" value={form.frequency}
                    onChange={e => set('frequency')(e.target.value)} placeholder="auto" />
                </div>
                <div>
                  <label className="label">TX Power (dBm)</label>
                  <input className="input" type="number" value={form.tx_power}
                    onChange={e => set('tx_power')(e.target.value)} placeholder="default" />
                </div>
                <div>
                  <label className="label">TX Power Mode</label>
                  <select className="input" value={form.tx_power_mode} onChange={e => set('tx_power_mode')(e.target.value)}>
                    <option value="default">Default</option>
                    <option value="card-rates">Card Rates</option>
                    <option value="all-rates-once">All Rates Once</option>
                    <option value="manual-table">Manual Table</option>
                  </select>
                </div>
                <div>
                  <label className="label">Antenna Gain (dBi)</label>
                  <input className="input" type="number" value={form.antenna_gain}
                    onChange={e => set('antenna_gain')(e.target.value)} />
                </div>
                <div>
                  <label className="label">Country</label>
                  <input className="input" value={form.country}
                    onChange={e => set('country')(e.target.value)} placeholder="united states" />
                </div>
                <div>
                  <label className="label">Installation</label>
                  <select className="input" value={form.installation} onChange={e => set('installation')(e.target.value)}>
                    <option value="indoor">Indoor</option>
                    <option value="outdoor">Outdoor</option>
                    <option value="any">Any</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {mutation.error && (
            <p className="text-sm text-bad">
              {(mutation.error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to save'}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <ReviewChangesButton applyLabel="Save" disabled={mutation.isPending}
              request={() => wirelessApi.updateInterface(deviceId, iface.name, changedFields(loaded, form))}
              onApply={() => mutation.mutate(changedFields(loaded, form))} />
            <button type="submit" className="btn-primary" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Performance charts ───────────────────────────────────────────────────────

const RANGES = ['1h', '3h', '6h', '12h', '24h', '7d'] as const;

function WirelessCharts({ deviceId, ifaces }: { deviceId: number; ifaces: WirelessInterface[] }) {
  const [selectedIface, setSelectedIface] = useState(ifaces[0]?.name || '');
  const [range, setRange] = useRememberedRange<string>('radios', '6h');

  const { data: raw = [] } = useQuery({
    queryKey: ['wireless-metrics', deviceId, selectedIface, range],
    queryFn: () =>
      wirelessApi.getMetrics(deviceId, selectedIface || undefined, range)
        .then(r => r.data as WirelessMetricPoint[]),
    refetchInterval: 60_000,
    enabled: ifaces.length > 0,
  });

  const chartData = raw.map(p => ({
    time: format(new Date(p.time), range === '7d' ? 'MMM d HH:mm' : 'HH:mm'),
    clients:     p.registered_clients ?? null,
    noise_floor: p.noise_floor ?? null,
  }));

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {ifaces.length > 1 && (
          <select
            className="input w-auto text-sm"
            value={selectedIface}
            onChange={e => setSelectedIface(e.target.value)}
          >
            {ifaces.map(i => <option key={i.name} value={i.name}>{i.name} ({i.ssid || 'no SSID'})</option>)}
          </select>
        )}
        <div className="flex items-center gap-1 border border-line rounded-lg p-0.5">
          {RANGES.map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={clsx(
                'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                range === r
                  ? 'bg-accent text-accent-fg'
                  : 'text-ink-2 hover:bg-surface-3'
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Connected Clients chart */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-semibold text-ink">Connected Clients</h3>
        </div>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="time" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', fontSize: '12px' }}
                formatter={(v: number) => [v, 'Clients']}
              />
              <Line type="monotone" dataKey="clients" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[180px] flex items-center justify-center text-ink-4 text-sm">
            No data yet — metrics appear after the first polling cycle
          </div>
        )}
      </div>

      {/* Noise Floor chart (only if data exists) */}
      {chartData.some(p => p.noise_floor != null) && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Signal className="w-4 h-4 text-warn" />
            <h3 className="text-sm font-semibold text-ink">Noise Floor (dBm)</h3>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="time" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} reversed />
              <Tooltip
                contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', fontSize: '12px' }}
                formatter={(v: number) => [`${v} dBm`, 'Noise Floor']}
              />
              <Line type="monotone" dataKey="noise_floor" stroke="#f59e0b" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─── Scan warning modal ───────────────────────────────────────────────────────

function ScanWarningModal({
  scanType,
  onConfirm,
  onCancel,
}: {
  scanType: 'spectral' | 'ap';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isSpectral = scanType === 'spectral';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-surface rounded-xl shadow-2xl w-full max-w-sm">
        <div className="px-5 py-4 border-b border-line flex items-center gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-warn-bg dark:bg-warn-bg flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-warn" />
          </div>
          <h3 className="font-semibold text-ink">
            {isSpectral ? 'Spectral Scan' : 'AP Scan'} Warning
          </h3>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-ink-2">
            Running a {isSpectral ? 'spectral scan' : 'nearby AP scan'} requires the radio to
            temporarily leave its operating channel.
          </p>
          <p className="text-sm font-medium text-warn">
            All wireless clients connected to this AP will be briefly disconnected during the scan.
          </p>
          {/* Seen on a legacy-package radio in station mode (#295): the scan dropped its own uplink. */}
          <p className="text-sm text-ink-2">
            If this radio is itself connected to another access point (a wireless link or a client of
            another AP), that connection drops too, so avoid it on a link the manager reaches the device through.
          </p>
          <p className="text-xs text-ink-3">
            The scan takes approximately {isSpectral ? '10' : '20'} seconds. Clients will
            reconnect automatically once the radio returns to its channel.
          </p>
        </div>
        <div className="px-5 py-4 border-t border-line flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn-primary bg-warn hover:bg-warn border-warn hover:border-warn" onClick={onConfirm}>
            Run Scan Anyway
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Spectrum Analyzer ───────────────────────────────────────────────────────

const SPECTRAL_BASELINE = -110;

function powerColor(dbm: number): string {
  if (dbm >= -50) return '#ef4444';
  if (dbm >= -70) return '#f97316';
  if (dbm >= -85) return '#eab308';
  return '#22c55e';
}

interface SpectralPoint { frequency: number; power: number; barValue: number }
interface SpectralScanRecord {
  id: number;
  scanned_at: string;
  scan_type: string;
  data: Record<string, string>[];
}

// Handles both raw RouterOS rows (freq/magn fields) and already-aggregated rows
// (same fields, but averaged) saved by the backend.
function parseSpectralRows(rows: Record<string, string | number>[]): SpectralPoint[] {
  return rows
    .map(row => {
      const freq  = parseFloat(String(row['freq']  || row['frequency'] || '0'));
      const power = parseInt(  String(row['magn']  || row['spectral-power'] || row['power'] || '-120'), 10);
      return { frequency: freq, power, barValue: Math.max(0, power - SPECTRAL_BASELINE) };
    })
    .filter(p => p.frequency > 0)
    .sort((a, b) => a.frequency - b.frequency);
}

function SpectrumAnalyzer({ deviceId, ifaces }: { deviceId: number; ifaces: WirelessInterface[] }) {
  const [selectedIface, setSelectedIface] = useState(ifaces[0]?.name || '');
  const [scanning, setScanning]           = useState(false);
  const [scanError, setScanError]         = useState<string | null>(null);
  const [chartData, setChartData]         = useState<SpectralPoint[]>([]);
  const [scanTime, setScanTime]           = useState<string | null>(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState<number | null>(null);
  const [showWarning, setShowWarning]     = useState(false);
  // The chart belongs to one radio (outside review U14): switching radios
  // clears it, and a scan that finishes after a switch isn't shown under the
  // radio that is selected now.
  const ifaceRef = useRef(selectedIface);
  useEffect(() => {
    ifaceRef.current = selectedIface;
    setChartData([]); setScanTime(null); setSelectedHistoryId(null); setScanError(null);
  }, [selectedIface]);

  const { data: history = [], refetch: refetchHistory } = useQuery({
    queryKey: ['spectral-history', deviceId, selectedIface],
    queryFn: () =>
      wirelessApi.getSpectralHistory(deviceId, selectedIface, 5)
        .then(r => r.data as SpectralScanRecord[]),
    enabled: !!selectedIface,
  });

  // Auto-load most recent history entry
  useEffect(() => {
    if (history.length > 0 && chartData.length === 0 && selectedHistoryId === null) {
      loadScanRecord(history[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history]);

  function loadScanRecord(scan: SpectralScanRecord) {
    setChartData(parseSpectralRows(scan.data));
    setScanTime(scan.scanned_at);
    setSelectedHistoryId(scan.id);
    setScanError(null);
  }

  async function handleScanNow() {
    const iface = selectedIface;
    setScanning(true);
    setScanError(null);
    try {
      const result = await wirelessApi.runSpectralScan(deviceId, iface);
      const scan = result.data as { id: number; scanned_at: string; data: Record<string, string>[] };
      if (ifaceRef.current !== iface) return; // the user moved to another radio meanwhile
      setChartData(parseSpectralRows(scan.data));
      setScanTime(scan.scanned_at);
      setSelectedHistoryId(scan.id);
      await refetchHistory();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        || 'Scan failed';
      setScanError(msg);
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-line flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <ScanLine className="w-4 h-4 text-info" />
          <h2 className="text-sm font-semibold text-ink">Spectrum Analyzer</h2>
          {scanTime && (
            <span className="text-xs text-ink-3">
              {format(new Date(scanTime), 'MMM d HH:mm')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {ifaces.length > 1 && (
            <select
              className="input w-auto text-xs"
              value={selectedIface}
              onChange={e => {
                setSelectedIface(e.target.value);
                setChartData([]);
                setScanTime(null);
                setSelectedHistoryId(null);
              }}
            >
              {ifaces.map(i => (
                <option key={i.name} value={i.name}>
                  {i.name}{i.band ? ` (${bandLabel(i.band)})` : ''}
                </option>
              ))}
            </select>
          )}
          {history.length > 1 && (
            <select
              className="input w-auto text-xs"
              value={selectedHistoryId ?? ''}
              onChange={e => {
                const id = Number(e.target.value);
                const scan = history.find(s => s.id === id);
                if (scan) loadScanRecord(scan);
              }}
            >
              {history.map(s => (
                <option key={s.id} value={s.id}>
                  {format(new Date(s.scanned_at), 'MMM d HH:mm')} ({s.scan_type})
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => setShowWarning(true)}
            disabled={scanning}
            className="btn-primary text-xs flex items-center gap-1.5"
          >
            <ScanLine className={clsx('w-3.5 h-3.5', scanning && 'animate-pulse')} />
            {scanning ? 'Scanning…' : 'Scan Now'}
          </button>
        </div>
      </div>

      {showWarning && (
        <ScanWarningModal
          scanType="spectral"
          onConfirm={() => { setShowWarning(false); handleScanNow(); }}
          onCancel={() => setShowWarning(false)}
        />
      )}

      {scanError && (
        <div className="px-5 py-3 text-sm text-bad bg-bad-bg">
          {scanError}
        </div>
      )}

      {scanning ? (
        <div className="p-8 text-center text-ink-3 text-sm">
          <RefreshCw className="w-5 h-5 animate-spin inline mr-2" />
          Running spectral scan (~10 s)…
        </div>
      ) : chartData.length === 0 ? (
        <div className="p-8 text-center text-ink-3 text-sm">
          No spectrum data. Press <strong>Scan Now</strong> to run a live scan.
        </div>
      ) : (
        <div className="p-4">
          <div className="mb-3 flex flex-wrap gap-3 text-xs text-ink-3">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-good inline-block" /> Quiet (&lt; −85 dBm)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-warn inline-block" /> Light (−85 to −70)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-orange-400 inline-block" /> Moderate (−70 to −50)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-bad inline-block" /> Busy (&gt; −50 dBm)
            </span>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={chartData}
              margin={{ top: 4, right: 12, bottom: 28, left: 12 }}
              barCategoryGap={1}
            >
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
              <XAxis
                dataKey="frequency"
                type="category"
                tick={{ fontSize: 9 }}
                interval="preserveStartEnd"
                label={{ value: 'Frequency (MHz)', position: 'insideBottomRight', offset: -4, style: { fontSize: 10, fill: '#94a3b8' } }}
              />
              <YAxis
                tickFormatter={v => String(v + SPECTRAL_BASELINE)}
                tick={{ fontSize: 9 }}
                domain={[0, 90]}
                label={{ value: 'dBm', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#94a3b8' } }}
              />
              <Tooltip
                formatter={(value: number) => [`${value + SPECTRAL_BASELINE} dBm`, 'Power']}
                labelFormatter={(label: number) => `${label} MHz`}
                {...chartTooltip}
              />
              <Bar dataKey="barValue" maxBarSize={8} isAnimationActive={false}>
                {chartData.map((entry, index) => (
                  <Cell key={index} fill={powerColor(entry.power)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─── AP Scanner ───────────────────────────────────────────────────────────────

interface APBandEntry {
  bssid: string;
  vendor: string;
  signal: number;
  freq: number;
  band: string;
  channel_width: string;
}

interface APNetworkEntry {
  ssid: string;
  security: string;
  hidden: boolean;
  entries: APBandEntry[];
}

interface APScanRecord {
  id: number;
  scanned_at: string;
  scan_type: string;
  data: APNetworkEntry[];
}

/**
 * Kept as Tailwind classes rather than the hex from rssiColor, but the
 * thresholds now match RSSI_ZONES exactly. They used to differ from it, so a
 * client at −58 dBm was "Good" here and "Fair" on the RF Health page (#154).
 */
function signalColor(dbm: number): string {
  if (dbm >= -45) return 'text-good';
  if (dbm >= -55) return 'text-good dark:text-good';
  if (dbm >= -70) return 'text-warn';
  return 'text-bad';
}

function BandPill({ band }: { band: string }) {
  const color = band === '5 GHz'
    ? 'bg-accent-soft dark:bg-accent-soft text-accent dark:text-accent'
    : band === '6 GHz'
    ? 'bg-violet-bg dark:bg-violet-bg text-violet dark:text-violet'
    : 'bg-good-bg text-good dark:text-good';
  return (
    <span className={clsx('inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium', color)}>
      {band}
    </span>
  );
}

function APScanner({ deviceId }: { deviceId: number }) {
  const [scanning, setScanning]                   = useState(false);
  const [scanError, setScanError]                 = useState<string | null>(null);
  const [networks, setNetworks]                   = useState<APNetworkEntry[] | null>(null);
  const [scanTime, setScanTime]                   = useState<string | null>(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState<number | null>(null);
  const [showWarning, setShowWarning]             = useState(false);

  const { data: history = [], refetch: refetchHistory } = useQuery({
    queryKey: ['ap-scan-history', deviceId],
    queryFn: () => wirelessApi.getAPScanHistory(deviceId, 5).then(r => r.data as APScanRecord[]),
  });

  // Auto-load most recent history entry
  useEffect(() => {
    if (history.length > 0 && networks === null && selectedHistoryId === null) {
      loadRecord(history[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history]);

  function loadRecord(record: APScanRecord) {
    setNetworks(record.data);
    setScanTime(record.scanned_at);
    setSelectedHistoryId(record.id);
    setScanError(null);
  }

  async function handleScanNow() {
    setScanning(true);
    setScanError(null);
    try {
      const result = await wirelessApi.runAPScan(deviceId);
      const scan = result.data as { id: number; scanned_at: string; data: APNetworkEntry[] };
      setNetworks(scan.data);
      setScanTime(scan.scanned_at);
      setSelectedHistoryId(scan.id);
      await refetchHistory();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        || 'Scan failed';
      setScanError(msg);
    } finally {
      setScanning(false);
    }
  }

  const totalNets = networks?.length ?? 0;

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-line flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-semibold text-ink">Nearby Access Points</h2>
          {networks !== null && (
            <span className="text-xs text-ink-3">
              {totalNets} network{totalNets !== 1 ? 's' : ''}
              {scanTime ? ` · ${format(new Date(scanTime), 'MMM d HH:mm')}` : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {history.length > 1 && (
            <select
              className="input w-auto text-xs"
              value={selectedHistoryId ?? ''}
              onChange={e => {
                const id = Number(e.target.value);
                const rec = history.find(s => s.id === id);
                if (rec) loadRecord(rec);
              }}
            >
              {history.map(s => (
                <option key={s.id} value={s.id}>
                  {format(new Date(s.scanned_at), 'MMM d HH:mm')} ({s.scan_type})
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => setShowWarning(true)}
            disabled={scanning}
            className="btn-primary text-xs flex items-center gap-1.5"
          >
            <Radio className={clsx('w-3.5 h-3.5', scanning && 'animate-pulse')} />
            {scanning ? 'Scanning…' : 'Scan Now'}
          </button>
        </div>
      </div>

      {showWarning && (
        <ScanWarningModal
          scanType="ap"
          onConfirm={() => { setShowWarning(false); handleScanNow(); }}
          onCancel={() => setShowWarning(false)}
        />
      )}

      {scanError && (
        <div className="px-5 py-3 text-sm text-bad bg-bad-bg">
          {scanError}
        </div>
      )}

      {scanning ? (
        <div className="p-8 text-center text-ink-3 text-sm">
          <RefreshCw className="w-5 h-5 animate-spin inline mr-2" />
          Scanning all radios (~20 s)…
        </div>
      ) : networks === null ? (
        <div className="p-8 text-center text-ink-3 text-sm">
          No scan data. Press <strong>Scan Now</strong> to discover nearby access points.
        </div>
      ) : networks.length === 0 ? (
        <div className="p-8 text-center text-ink-3 text-sm">
          No access points found nearby.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2/50">
                <th className="px-4 py-3 text-left text-xs font-medium text-ink-3">SSID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-ink-3">Bands</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-ink-3">Best Signal</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-ink-3">Freq (MHz)</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-ink-3">BSSID / Vendor</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-ink-3">Security</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/50">
              {networks.map((net, i) => {
                const bestSignal = Math.max(...net.entries.map(e => e.signal));
                const bands = [...new Set(net.entries.map(e => e.band))];
                return (
                  <tr key={i} className={clsx(
                    'transition-colors hover:bg-accent-soft dark:hover:bg-surface-3',
                    i % 2 === 0 ? 'bg-surface/20' : 'bg-surface-2/40',
                  )}>
                    {/* SSID */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {net.security === 'open'
                          ? <Unlock className="w-3 h-3 text-warn flex-shrink-0" />
                          : net.security === 'unknown'
                            ? null
                            : <Lock className="w-3 h-3 text-ink-4 flex-shrink-0" />}
                        {net.hidden
                          ? <span className="text-ink-4 italic text-xs">Hidden network</span>
                          : <span className="font-medium text-ink">{net.ssid}</span>}
                      </div>
                    </td>
                    {/* Bands */}
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {bands.map(b => <BandPill key={b} band={b} />)}
                      </div>
                    </td>
                    {/* Best signal */}
                    <td className="px-4 py-3">
                      <span className={clsx('font-mono text-xs font-medium', signalColor(bestSignal))}>
                        {bestSignal} dBm
                      </span>
                    </td>
                    {/* Frequencies */}
                    <td className="px-4 py-3 text-xs text-ink-2">
                      {net.entries.map((e, j) => (
                        <div key={j} className="font-mono">
                          {e.freq > 0 ? `${e.freq}` : '—'}
                          {e.channel_width ? <span className="text-ink-4 ml-1">/{e.channel_width}</span> : ''}
                        </div>
                      ))}
                    </td>
                    {/* BSSID + vendor */}
                    <td className="px-4 py-3 text-xs">
                      {net.entries.map((e, j) => (
                        <div key={j}>
                          <span className="font-mono text-ink">{e.bssid}</span>
                          {e.vendor && (
                            <span className="ml-1 text-ink-3">({e.vendor})</span>
                          )}
                        </div>
                      ))}
                    </td>
                    {/* Security */}
                    <td className="px-4 py-3 text-xs text-ink-2">
                      {net.security || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Registration table ───────────────────────────────────────────────────────

/** Parse a RouterOS rate value to a human-readable Mbps/Gbps string.
 *  RouterOS returns rates as raw bps integers (e.g. 57800000 = 57.8 Mbps).
 *  Also handles legacy "54Mbps" / "6.5Mbps" string formats just in case.
 */
function parseRateMbps(raw: string | undefined): string {
  if (!raw || raw === '0') return '—';
  // Legacy formatted strings: "54Mbps", "866.7Mbps"
  const mbpsMatch = raw.match(/^([\d.]+)\s*[Mm]bps?$/);
  if (mbpsMatch) {
    const val = parseFloat(mbpsMatch[1]);
    return val >= 1000 ? `${(val / 1000).toFixed(2)} Gbps` : `${val.toFixed(1)} Mbps`;
  }
  // Raw bps integer (RouterOS 7 wifi package)
  const bps = parseFloat(raw);
  if (!isNaN(bps) && bps > 0) {
    const mbps = bps / 1_000_000;
    return mbps >= 1000
      ? `${(mbps / 1000).toFixed(2)} Gbps`
      : `${mbps.toFixed(1)} Mbps`;
  }
  return raw;
}

function ClientsTable({ deviceId, ifaces }: { deviceId: number; ifaces: WirelessInterface[] }) {
  const { data: regTable = [], isLoading } = useQuery({
    queryKey: ['wireless-reg-table', deviceId],
    queryFn: () => wirelessApi.getRegistrationTable(deviceId).then(r => r.data as Record<string, string>[]),
    refetchInterval: 30_000,
  });

  if (isLoading) return <div className="p-4 text-center text-ink-4 text-sm"><RefreshCw className="w-4 h-4 animate-spin inline mr-1" />Loading…</div>;
  if (regTable.length === 0) return <div className="p-6 text-center text-ink-3 text-sm">No wireless clients currently connected.</div>;

  // Build interface → SSID lookup from cached interface data
  const ssidByIface = Object.fromEntries(ifaces.map(i => [i.name, i.ssid || '']));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-surface-2/50">
            <th className="px-4 py-2.5 text-left font-medium text-ink-3">MAC Address</th>
            <th className="px-4 py-2.5 text-left font-medium text-ink-3">Interface</th>
            <th className="px-4 py-2.5 text-left font-medium text-ink-3">SSID</th>
            <th className="px-4 py-2.5 text-right font-medium text-ink-3">Signal</th>
            <th className="px-4 py-2.5 text-right font-medium text-ink-3">TX Rate</th>
            <th className="px-4 py-2.5 text-right font-medium text-ink-3">RX Rate</th>
            <th className="px-4 py-2.5 text-right font-medium text-ink-3">Uptime</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line/50">
          {regTable.map((r, i) => {
            const signalRaw = r['signal-strength'] || r['signal'] || '';
            const signalDbm = parseInt(signalRaw, 10);
            const ifaceName = r['interface'] || '';
            const ssid = ssidByIface[ifaceName] || r['ssid'] || '';
            return (
              <tr key={i} className={clsx(
                'transition-colors hover:bg-accent-soft dark:hover:bg-surface-3',
                i % 2 === 0 ? 'bg-surface/20' : 'bg-surface-2/40',
              )}>
                <td className="px-4 py-2.5 font-mono text-xs text-ink-2">
                  {r['mac-address'] || '—'}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-ink-2">
                  {ifaceName || '—'}
                </td>
                <td className="px-4 py-2.5 text-xs text-ink-2">
                  {ssid || <span className="text-ink-4">—</span>}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <SignalBar dbm={isNaN(signalDbm) ? undefined : signalDbm} />
                </td>
                <td className="px-4 py-2.5 text-right text-xs font-mono text-ink-2">
                  {parseRateMbps(r['tx-rate'])}
                </td>
                <td className="px-4 py-2.5 text-right text-xs font-mono text-ink-2">
                  {parseRateMbps(r['rx-rate'])}
                </td>
                <td className="px-4 py-2.5 text-right text-xs text-ink-3">
                  {r['uptime'] || '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

interface Props {
  deviceId: number;
  deviceStatus: string;
}

export default function RadiosTab({ deviceId, deviceStatus }: Props) {
  const canWrite = useCanWrite();
  const [editIface, setEditIface] = useState<WirelessInterface | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  const toggleCard = (name: string) =>
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(name)) { next.delete(name); } else { next.add(name); }
      return next;
    });

  const { data: ifaces = [], isLoading, refetch } = useQuery({
    queryKey: ['device-wireless', deviceId],
    queryFn: () => wirelessApi.getCachedInterfaces(deviceId).then(r => r.data as WirelessInterface[]),
    refetchInterval: 30_000,
  });

  const isOffline = deviceStatus !== 'online';

  const infoItems = (iface: WirelessInterface) => [
    { icon: Radio,  label: 'Band',          value: bandLabel(iface.band) },
    { icon: Zap,    label: 'Frequency',      value: iface.frequency ? `${iface.frequency} MHz` : 'Auto' },
    { icon: Activity, label: 'Channel Width', value: iface.channel_width || '—' },
    { icon: Cpu,    label: 'TX Power',       value: iface.tx_power ? `${iface.tx_power} dBm` : 'Default' },
    { icon: Globe,  label: 'Country',        value: iface.country || '—' },
    { icon: Signal, label: 'Noise Floor',    value: iface.noise_floor ? `${iface.noise_floor} dBm` : '—' },
    { icon: Users,  label: 'Clients',        value: String(iface.registered_clients) },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40 text-ink-4">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />Loading radio data…
      </div>
    );
  }

  if (ifaces.length === 0) {
    return (
      <div className="card p-10 text-center text-ink-3 text-sm space-y-2">
        <Wifi className="w-8 h-8 mx-auto opacity-40" />
        <p>No wireless interfaces found for this device.</p>
        <p className="text-xs">They will appear here after the first slow poll cycle (up to 5 minutes).</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Radio hardware cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
            <Radio className="w-4 h-4 text-accent" />
            Radio Hardware
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (expandedCards.size === ifaces.length) {
                  setExpandedCards(new Set());
                } else {
                  setExpandedCards(new Set(ifaces.map(i => i.name)));
                }
              }}
              className="text-xs text-ink-4 hover:text-ink-2 dark:hover:text-ink-2 transition-colors px-2 py-1 rounded"
            >
              {expandedCards.size === ifaces.length ? 'Collapse all' : 'Expand all'}
            </button>
            <button
              onClick={() => refetch()}
              className="p-1.5 rounded-lg text-ink-4 hover:text-ink-2 hover:bg-surface-3 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={clsx('w-4 h-4', isLoading && 'animate-spin')} />
            </button>
          </div>
        </div>

        <div className="card overflow-hidden divide-y divide-line/60">
          {ifaces.map((iface, idx) => {
            const isExpanded = expandedCards.has(iface.name);
            const isVirtual = !!iface.config_json?.['master-interface'];
            const isEven = idx % 2 === 0;
            return (
              <div key={iface.name} className={isEven ? 'bg-surface/20' : 'bg-surface-2/40'}>
                {/* Clickable header */}
                <button
                  type="button"
                  onClick={() => toggleCard(iface.name)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent-soft dark:hover:bg-surface-3 transition-colors text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {statusDot(iface)}
                    <span className="font-medium text-ink font-mono text-sm">
                      {iface.name}
                    </span>
                    {isVirtual ? (
                      <span className="px-1.5 py-0.5 bg-violet-bg dark:bg-violet-bg text-violet dark:text-violet border border-violet dark:border-purple-700/50 rounded text-xs font-medium">
                        Virtual
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 bg-good-bg text-good border border-good dark:border-green-700/50 rounded text-xs font-medium">
                        Physical
                      </span>
                    )}
                    {iface.ssid && (
                      <span className="px-2 py-0.5 bg-accent-soft text-accent dark:text-accent rounded text-xs font-medium truncate max-w-[140px]">
                        {iface.ssid}
                      </span>
                    )}
                    {iface.managed_by_capsman && (
                      <span
                        className="px-1.5 py-0.5 bg-warn-bg text-warn border border-warn dark:border-warn rounded text-xs font-medium"
                        title="Configuration is held by a CAPsMAN controller, not on this device"
                      >
                        CAPsMAN
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={clsx(
                      'text-xs font-medium px-2 py-0.5 rounded-full',
                      iface.disabled
                        ? 'bg-surface-3 text-ink-3'
                        : iface.running
                          ? 'bg-good-bg text-good'
                          : 'bg-warn-bg dark:bg-warn-bg text-warn dark:text-warn'
                    )}>
                      {iface.disabled ? 'Disabled' : iface.running ? 'Running' : 'Enabled'}
                    </span>
                    {isExpanded
                      ? <ChevronDown className="w-4 h-4 text-ink-4" />
                      : <ChevronRight className="w-4 h-4 text-ink-4" />}
                  </div>
                </button>

                {/* Expandable body */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-line-soft/60">
                    {iface.managed_by_capsman && (
                      <div className="mb-3 rounded-lg border border-warn dark:border-warn bg-warn-bg px-3 py-2">
                        <p className="text-xs text-warn dark:text-warn">
                          Provisioned by CAPsMAN
                          {iface.capsman_controller_mac && (
                            <> from controller <span className="font-mono font-medium">{iface.capsman_controller_mac}</span></>
                          )}
                          . This access point holds no local configuration for the interface, so any
                          blank fields below live on the controller — edit them there.
                        </p>
                      </div>
                    )}
                    {isVirtual && iface.config_json?.['master-interface'] && (
                      <p className="text-xs text-violet dark:text-violet mb-3">
                        Virtual AP — shares radio with <span className="font-mono font-medium">{iface.config_json['master-interface']}</span>
                      </p>
                    )}

                    {/* Info grid */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      {infoItems(iface).map(({ icon: Icon, label, value }) => (
                        <div key={label} className="flex items-center gap-2">
                          <Icon className="w-3.5 h-3.5 text-ink-4 flex-shrink-0" />
                          <span className="text-xs text-ink-3">{label}:</span>
                          <span className="text-xs font-medium text-ink-2 truncate">{value}</span>
                        </div>
                      ))}
                    </div>

                    {iface.security_profile && (
                      <div className="mt-3 pt-3 border-t border-line-soft flex items-center gap-2 text-xs text-ink-3">
                        <Wifi className="w-3.5 h-3.5 text-accent" />
                        Security: <span className="font-medium text-ink-2">{iface.security_profile}</span>
                      </div>
                    )}

                    {iface.mac_address && (
                      <div className="mt-1 text-xs font-mono text-ink-3">
                        MAC: {iface.mac_address}
                      </div>
                    )}

                    {canWrite && !isOffline && (
                      <div className="mt-3 pt-3 border-t border-line-soft">
                        <button
                          onClick={() => setEditIface(iface)}
                          className="flex items-center gap-1.5 text-xs text-accent hover:text-accent dark:hover:text-accent transition-colors"
                        >
                          <Pencil className="w-3 h-3" />
                          Configure
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* RF Health — channel map, client density, TX retries, connectivity */}
      <div>
        <h2 className="text-sm font-semibold text-ink flex items-center gap-2 mb-3">
          <Signal className="w-4 h-4 text-accent" />
          RF Health
        </h2>
        <RfHealth deviceId={deviceId} />
      </div>

      {/* Performance Charts */}
      <div>
        <h2 className="text-sm font-semibold text-ink flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-accent" />
          Performance
        </h2>
        <WirelessCharts deviceId={deviceId} ifaces={ifaces} />
      </div>

      {/* Spectrum Analyzer */}
      <SpectrumAnalyzer deviceId={deviceId} ifaces={ifaces} />

      {/* Nearby Access Points */}
      <APScanner deviceId={deviceId} />

      {/* Connected Clients */}
      {!isOffline && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-line flex items-center gap-2">
            <Users className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold text-ink">Connected Wireless Clients</h2>
          </div>
          <ClientsTable deviceId={deviceId} ifaces={ifaces} />
        </div>
      )}

      {/* Edit modal */}
      {editIface && (
        <RadioEditModal
          deviceId={deviceId}
          iface={editIface}
          onClose={() => setEditIface(null)}
        />
      )}
    </div>
  );
}
