import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  AlertTriangle,
  Check,
  Eraser,
  Globe,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import DevicePicker from '../components/common/DevicePicker';
import ListInput from '../components/common/ListInput';
import ReviewChangesButton from '../components/common/ReviewChangesButton';
import { useCanWrite } from '../hooks/useCanWrite';
import { devicesApi, networkServicesApi } from '../services/api';
import { apiErrorMessage } from '../utils/apiError';
import { isValidIPv4, isValidIPv6 } from '../utils/deviceAddress';
import { shortList } from '../utils/deviceCards';
import { splitList } from '../utils/ipPrefix';
import { liveRefetch, type LiveRow } from '../utils/liveFreshness';

type NS = Record<string, string>;

// ─── DNS record types ─────────────────────────────────────────────────────────

// RouterOS's static record types (it has no PTR). Each keeps its target in
// its own property (outside review C7): MX in mx-exchange, NS in ns, SRV in
// srv-target, FWD in forward-to.
const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SRV', 'FWD'] as const;
type RecordType = (typeof RECORD_TYPES)[number];
const TARGET_PROP: Partial<Record<RecordType, string>> = {
  MX: 'mx-exchange',
  NS: 'ns',
  SRV: 'srv-target',
  FWD: 'forward-to',
};

// ─── Static record form modal ─────────────────────────────────────────────────

interface RecordFormProps {
  deviceId: number;
  existing?: NS;
  onClose: () => void;
}

function RecordForm({ deviceId, existing, onClose }: RecordFormProps) {
  const qc = useQueryClient();
  const [name, setName] = useState(existing?.['name'] || '');
  const initialType = (existing?.['type'] as RecordType) || 'A';
  const [address, setAddress] = useState(existing?.[TARGET_PROP[initialType] ?? 'address'] || '');
  const [mxPreference, setMxPreference] = useState(existing?.['mx-preference'] || '10');
  const [srvPort, setSrvPort] = useState(existing?.['srv-port'] || '');
  const [srvPriority, setSrvPriority] = useState(existing?.['srv-priority'] || '0');
  const [srvWeight, setSrvWeight] = useState(existing?.['srv-weight'] || '0');
  const [cname, setCname] = useState(existing?.['cname'] || '');
  const [type, setType] = useState<RecordType>(initialType);
  const [text, setText] = useState(existing?.['text'] || '');
  const [ttl, setTtl] = useState(existing?.['ttl'] || '');
  const [disabled, setDisabled] = useState(existing?.['disabled'] === 'true');

  const saveRequest = () => {
    const body: NS = { name, type };
    if (type === 'A' || type === 'AAAA') body['address'] = address;
    else if (type === 'CNAME') body['cname'] = cname;
    else if (type === 'TXT') body['text'] = text;
    else body[TARGET_PROP[type] ?? 'address'] = address;
    if (type === 'MX') body['mx-preference'] = mxPreference || '10';
    if (type === 'SRV') {
      body['srv-port'] = srvPort;
      body['srv-priority'] = srvPriority || '0';
      body['srv-weight'] = srvWeight || '0';
    }
    if (ttl) body['ttl'] = ttl;
    else if (existing) body['ttl'] = ''; // back to the default TTL on the device
    body['disabled'] = disabled ? 'yes' : 'no';

    return existing?.['.id']
      ? networkServicesApi.updateDnsStatic(deviceId, existing['.id'], body)
      : networkServicesApi.addDnsStatic(deviceId, body);
  };
  const save = useMutation({
    meta: { inlineError: true },
    mutationFn: saveRequest,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ns-dns', deviceId] });
      onClose();
    },
  });

  const valueLabel =
    type === 'CNAME'
      ? 'CNAME Target'
      : type === 'TXT'
        ? 'Text'
        : type === 'MX'
          ? 'Mail server'
          : type === 'NS'
            ? 'Name server'
            : type === 'SRV'
              ? 'Target host'
              : type === 'FWD'
                ? 'Forward to (DNS server)'
                : 'Address';
  const valuePlaceholder =
    type === 'A'
      ? '192.168.1.10'
      : type === 'AAAA'
        ? '2001:db8::1'
        : type === 'CNAME'
          ? 'alias.example.com'
          : type === 'TXT'
            ? '"v=spf1 include:example.com ~all"'
            : type === 'MX'
              ? 'mail.example.com'
              : type === 'NS'
                ? 'ns1.example.com'
                : type === 'FWD'
                  ? '10.0.0.53'
                  : 'sip.example.com';

  const valueField =
    type === 'TXT' ? (
      <textarea
        className="input w-full h-20 resize-y"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={valuePlaceholder}
      />
    ) : type === 'CNAME' ? (
      <input
        className="input w-full"
        value={cname}
        onChange={(e) => setCname(e.target.value)}
        placeholder={valuePlaceholder}
      />
    ) : (
      <input
        className="input w-full"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder={valuePlaceholder}
      />
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-surface rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h3 className="text-sm font-semibold text-ink">{existing ? 'Edit' : 'Add'} DNS Record</h3>
          <button
            onClick={onClose}
            className="p-1 rounded text-ink-4 hover:text-ink-2 dark:hover:text-ink-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1">Name *</label>
              <input
                className="input w-full"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="hostname.local"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1">Type</label>
              <select
                className="input w-full"
                value={type}
                onChange={(e) => setType(e.target.value as RecordType)}
              >
                {RECORD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1">{valueLabel} *</label>
            {valueField}
          </div>
          {type === 'MX' && (
            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1">Preference</label>
              <input
                className="input w-full"
                type="number"
                min={0}
                max={65535}
                value={mxPreference}
                onChange={(e) => setMxPreference(e.target.value)}
              />
            </div>
          )}
          {type === 'SRV' && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1">Port *</label>
                <input
                  className="input w-full"
                  type="number"
                  min={0}
                  max={65535}
                  value={srvPort}
                  onChange={(e) => setSrvPort(e.target.value)}
                  placeholder="5060"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1">Priority</label>
                <input
                  className="input w-full"
                  type="number"
                  min={0}
                  max={65535}
                  value={srvPriority}
                  onChange={(e) => setSrvPriority(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1">Weight</label>
                <input
                  className="input w-full"
                  type="number"
                  min={0}
                  max={65535}
                  value={srvWeight}
                  onChange={(e) => setSrvWeight(e.target.value)}
                />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1">TTL</label>
              <input
                className="input w-full"
                value={ttl}
                onChange={(e) => setTtl(e.target.value)}
                placeholder="e.g. 5m (blank = default)"
              />
            </div>
            <div className="flex items-end gap-2 pb-0.5">
              <button
                role="switch"
                aria-checked={disabled}
                onClick={() => setDisabled((v) => !v)}
                className={clsx(
                  'relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors mb-0.5',
                  disabled ? 'bg-surface-3 dark:bg-surface-3' : 'bg-accent',
                )}
              >
                <span
                  className={clsx(
                    'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform',
                    disabled ? 'translate-x-0' : 'translate-x-4',
                  )}
                />
              </button>
              <span className="text-xs text-ink-2">Enabled</span>
            </div>
          </div>
        </div>
        <div className="px-5 pb-4 flex items-center gap-3">
          <button
            onClick={() => save.mutate()}
            disabled={!name || (type === 'SRV' && !srvPort) || save.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-accent hover:bg-accent text-accent-fg text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
          <ReviewChangesButton
            request={saveRequest}
            onApply={() => save.mutate()}
            applyLabel="Save"
            disabled={!name || (type === 'SRV' && !srvPort) || save.isPending}
          />
          <button onClick={onClose} className="text-sm text-ink-3 hover:text-ink-2">
            Cancel
          </button>
          {save.isError && <span className="text-xs text-bad">{apiErrorMessage(save.error)}</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function NetworkServicesDNSPage() {
  const canWrite = useCanWrite();
  const qc = useQueryClient();
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | ''>('');

  // Settings form state
  const [serversInput, setServersInput] = useState('');
  const [allowRemote, setAllowRemote] = useState(false);
  const [maxUdpSize, setMaxUdpSize] = useState('');
  const [cacheSize, setCacheSize] = useState('');
  const [cacheMaxTtl, setCacheMaxTtl] = useState('');
  const [settingsDirty, setSettingsDirty] = useState(false);

  const [recordForm, setRecordForm] = useState<NS | null | 'new'>(null);
  const [flushMsg, setFlushMsg] = useState('');

  const { data: devices = [] } = useQuery({
    queryKey: ['devices'],
    queryFn: () => devicesApi.list().then((r) => r.data),
    staleTime: 60_000,
  });

  const deviceId = typeof selectedDeviceId === 'number' ? selectedDeviceId : 0;
  const selectedDevice = devices.find((d) => d.id === deviceId);

  const {
    data: dns,
    isLoading,
    refetch,
    isFetching,
    error,
  } = useQuery({
    queryKey: ['ns-dns', deviceId],
    queryFn: () => networkServicesApi.getDns(deviceId).then((r) => r.data),
    enabled: deviceId > 0,
  });

  // Sync settings form
  useEffect(() => {
    if (dns?.settings) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setServersInput(dns.settings['servers'] || '');
      setAllowRemote(dns.settings['allow-remote-requests'] === 'yes');
      setMaxUdpSize(dns.settings['max-udp-packet-size'] || '');
      setCacheSize(dns.settings['cache-size'] || '');
      setCacheMaxTtl(dns.settings['cache-max-ttl'] || '');
      setSettingsDirty(false);
    }
  }, [dns?.settings]);

  // Conflict detection
  const { data: overview = [] } = useQuery({
    queryKey: ['network-services-overview'],
    queryFn: () => networkServicesApi.overview().then((r) => r.data as NS[]),
    staleTime: 60_000,
    refetchInterval: (q) => liveRefetch(q.state.data as LiveRow[] | undefined),
  });
  const conflictDevices = overview.filter((d) => {
    if (parseInt(d['id']) === deviceId) return false;
    return (d['dns'] as unknown as { allow_remote: boolean } | null)?.allow_remote;
  });

  const saveSettingsRequest = () =>
    networkServicesApi.setDns(deviceId, {
      servers: serversInput,
      allow_remote_requests: allowRemote,
      max_udp_packet_size: maxUdpSize,
      cache_size: cacheSize,
      cache_max_ttl: cacheMaxTtl,
    });
  const saveSettings = useMutation({
    meta: { inlineError: true },
    mutationFn: saveSettingsRequest,
    onSuccess: () => {
      setSettingsDirty(false);
      qc.invalidateQueries({ queryKey: ['ns-dns', deviceId] });
      qc.invalidateQueries({ queryKey: ['network-services-overview'] });
    },
  });

  const flushCache = useMutation({
    mutationFn: () => networkServicesApi.flushDns(deviceId),
    onSuccess: () => {
      setFlushMsg('Cache flushed');
      setTimeout(() => setFlushMsg(''), 3000);
    },
  });

  const deleteRecord = useMutation({
    mutationFn: (id: string) => networkServicesApi.deleteDnsStatic(deviceId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ns-dns', deviceId] }),
  });

  const statics = dns?.statics || [];

  function mark() {
    setSettingsDirty(true);
  }

  return (
    <div className="space-y-6">
      {/* Record form modal */}
      {recordForm && (
        <RecordForm
          deviceId={deviceId}
          existing={recordForm === 'new' ? undefined : (recordForm as NS)}
          onClose={() => setRecordForm(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">DNS Server</h1>
          <p className="text-sm text-ink-3">DNS resolver settings and static records</p>
        </div>
        {deviceId > 0 && (
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line text-sm text-ink-2 hover:bg-surface-3 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={clsx('w-3.5 h-3.5', isFetching && 'animate-spin')} />
            Refresh
          </button>
        )}
      </div>

      {/* Device selector */}
      <div className="card p-4">
        <label className="block text-sm font-medium text-ink-2 dark:text-ink mb-2">
          Select Device
        </label>
        <DevicePicker
          className="max-w-xs"
          devices={devices}
          aria-label="Device"
          value={selectedDeviceId === '' ? null : selectedDeviceId}
          onChange={(id) => setSelectedDeviceId(id ?? '')}
        />
        {selectedDevice?.status !== 'online' && deviceId > 0 && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-warn">
            <AlertTriangle className="w-3.5 h-3.5" />
            This device is currently offline.
          </div>
        )}
      </div>

      {conflictDevices.length > 0 && deviceId > 0 && allowRemote && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-warn-bg border border-warn dark:border-warn text-sm text-warn dark:text-warn">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            DNS remote requests also enabled on:{' '}
            <strong>{shortList(conflictDevices.map((d) => String(d['name'])))}</strong>. Multiple
            DNS servers may cause resolution issues.
          </span>
        </div>
      )}

      {deviceId === 0 && (
        <div className="card p-8 text-center text-sm text-ink-3">Select a device above.</div>
      )}
      {deviceId > 0 && isLoading && (
        <div className="card p-8 text-center text-sm text-ink-3">Loading…</div>
      )}
      {deviceId > 0 && error && (
        <div className="card p-4 flex items-center gap-2 text-sm text-bad">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          Failed: {(error as Error).message}
        </div>
      )}

      {dns && (
        <>
          {/* ─── Settings ────────────────────────────────────────────────────── */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-line flex items-center gap-2">
              <Globe className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-semibold text-ink-2 dark:text-ink">DNS Settings</h2>
              <div className="ml-auto flex items-center gap-2">
                {canWrite && (
                  <button
                    onClick={() => flushCache.mutate()}
                    disabled={flushCache.isPending}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-ink-2 border border-line hover:bg-surface-3 transition-colors disabled:opacity-50"
                  >
                    <Eraser className="w-3 h-3" />
                    {flushCache.isPending ? 'Flushing…' : 'Flush Cache'}
                  </button>
                )}
                {flushMsg && <span className="text-xs text-good">{flushMsg}</span>}
              </div>
            </div>
            <div className="p-5 space-y-5">
              <div>
                <label className="block text-sm font-medium text-ink-2 dark:text-ink mb-1">
                  Upstream DNS Servers
                </label>
                {/* One entry at a time rather than a comma-separated box (#207). */}
                <div className="max-w-sm">
                  <ListInput
                    value={splitList(serversInput)}
                    onChange={(v) => {
                      setServersInput(v.join(','));
                      mark();
                    }}
                    ariaLabel="Upstream DNS servers"
                    placeholder="8.8.8.8"
                    disabled={!canWrite}
                    validate={(e) =>
                      isValidIPv4(e) || isValidIPv6(e) ? null : `${e} isn\u2019t an IP address`
                    }
                  />
                </div>
                <p className="mt-1 text-xs text-ink-3">
                  Upstream resolver addresses, in the order they&apos;re tried.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ink-2 dark:text-ink mb-1">
                    Max UDP Packet Size
                  </label>
                  <input
                    type="text"
                    className="input w-full"
                    value={maxUdpSize}
                    onChange={(e) => {
                      setMaxUdpSize(e.target.value);
                      mark();
                    }}
                    placeholder="4096"
                    disabled={!canWrite}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-2 dark:text-ink mb-1">
                    Cache Max TTL
                  </label>
                  <input
                    type="text"
                    className="input w-full"
                    value={cacheMaxTtl}
                    onChange={(e) => {
                      setCacheMaxTtl(e.target.value);
                      mark();
                    }}
                    placeholder="e.g. 1d"
                    disabled={!canWrite}
                  />
                </div>
              </div>

              <div className="flex items-start gap-3">
                <button
                  role="switch"
                  aria-checked={allowRemote}
                  onClick={() => {
                    if (canWrite) {
                      setAllowRemote((v) => !v);
                      mark();
                    }
                  }}
                  disabled={!canWrite}
                  className={clsx(
                    'relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors mt-0.5',
                    allowRemote ? 'bg-accent' : 'bg-surface-3 dark:bg-surface-3',
                    !canWrite && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  <span
                    className={clsx(
                      'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform',
                      allowRemote ? 'translate-x-4' : 'translate-x-0',
                    )}
                  />
                </button>
                <div>
                  <div className="text-sm font-medium text-ink-2 dark:text-ink">
                    Allow Remote Requests
                  </div>
                  <p className="text-xs text-ink-3 mt-0.5">
                    Allow other devices to use this router as a DNS resolver.
                  </p>
                </div>
              </div>

              {/* Read-only stats */}
              {(dns.settings['cache-used'] ||
                dns.settings['cache-size'] ||
                dns.settings['dynamic-servers']) && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-3 border-t border-line-soft dark:border-line-soft">
                  {dns.settings['cache-size'] && (
                    <div>
                      <div className="text-xs text-ink-4 mb-0.5">Cache Size</div>
                      <div className="text-sm font-medium text-ink">
                        {dns.settings['cache-size']} KiB
                      </div>
                    </div>
                  )}
                  {dns.settings['cache-used'] && (
                    <div>
                      <div className="text-xs text-ink-4 mb-0.5">Cache Used</div>
                      <div className="text-sm font-medium text-ink">
                        {dns.settings['cache-used']} KiB
                      </div>
                    </div>
                  )}
                  {dns.settings['dynamic-servers'] && (
                    <div>
                      <div className="text-xs text-ink-4 mb-0.5">Dynamic Servers</div>
                      <div className="text-sm font-medium text-ink">
                        {dns.settings['dynamic-servers']}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {canWrite && settingsDirty && (
                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={() => saveSettings.mutate()}
                    disabled={saveSettings.isPending}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-accent hover:bg-accent text-accent-fg text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {saveSettings.isPending ? 'Saving…' : 'Save Changes'}
                  </button>
                  <ReviewChangesButton
                    request={saveSettingsRequest}
                    onApply={() => saveSettings.mutate()}
                    applyLabel="Save"
                    disabled={saveSettings.isPending}
                  />
                  <button
                    onClick={() => {
                      const s = dns.settings;
                      setServersInput(s['servers'] || '');
                      setAllowRemote(s['allow-remote-requests'] === 'yes');
                      setMaxUdpSize(s['max-udp-packet-size'] || '');
                      setCacheSize(s['cache-size'] || '');
                      setCacheMaxTtl(s['cache-max-ttl'] || '');
                      setSettingsDirty(false);
                    }}
                    className="text-sm text-ink-3 hover:text-ink-2"
                  >
                    Discard
                  </button>
                  {saveSettings.isError && (
                    <span className="text-xs text-bad">{apiErrorMessage(saveSettings.error)}</span>
                  )}
                </div>
              )}
              {canWrite && saveSettings.isSuccess && !settingsDirty && (
                <span className="text-xs text-good">Saved</span>
              )}
            </div>
          </div>

          {/* ─── Static Records ───────────────────────────────────────────────── */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-line flex items-center gap-2">
              <Globe className="w-4 h-4 text-good" />
              <h2 className="text-sm font-semibold text-ink-2 dark:text-ink">Static DNS Records</h2>
              <span className="text-xs text-ink-3 ml-1">{statics.length}</span>
              {canWrite && (
                <button
                  onClick={() => setRecordForm('new')}
                  className="ml-auto flex items-center gap-1 px-2.5 py-1 bg-accent hover:bg-accent text-accent-fg text-xs font-medium rounded-lg transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Add Record
                </button>
              )}
            </div>
            {statics.length === 0 ? (
              <div className="px-5 py-6 text-sm text-ink-3 text-center">
                No static records configured.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line bg-surface-2/40">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide">
                        Name
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide">
                        Type
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide">
                        Value
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide">
                        TTL
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide">
                        Status
                      </th>
                      {canWrite && (
                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-ink-3 uppercase tracking-wide">
                          Actions
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {statics.map((r, i) => {
                      const isDisabled = r['disabled'] === 'true';
                      const value =
                        r['address'] ||
                        r['cname'] ||
                        r['text'] ||
                        r['mx-exchange'] ||
                        r['ns'] ||
                        r['srv-target'] ||
                        r['forward-to'] ||
                        '—';
                      return (
                        <tr
                          key={r['.id'] || i}
                          className={clsx(
                            'border-b border-line-soft dark:border-line-soft transition-colors hover:bg-accent-soft dark:hover:bg-surface-3',
                            i % 2 === 0 ? 'bg-white dark:bg-transparent' : 'bg-surface-2/40',
                          )}
                        >
                          <td className="px-4 py-3 font-medium text-ink">{r['name'] || '—'}</td>
                          <td className="px-4 py-3">
                            <span className="text-xs px-2 py-0.5 rounded bg-accent-soft dark:bg-accent-soft text-accent dark:text-accent font-mono font-medium">
                              {r['type'] || 'A'}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-ink-2 max-w-xs truncate">
                            {value}
                          </td>
                          <td className="px-4 py-3 text-ink-3 text-xs">{r['ttl'] || '—'}</td>
                          <td className="px-4 py-3">
                            <span
                              className={clsx(
                                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                                isDisabled ? 'bg-surface-3 text-ink-3' : 'bg-good-bg text-good',
                              )}
                            >
                              <span
                                className={clsx(
                                  'w-1.5 h-1.5 rounded-full',
                                  isDisabled ? 'bg-surface-3' : 'bg-good',
                                )}
                              />
                              {isDisabled ? 'Disabled' : 'Active'}
                            </span>
                          </td>
                          {canWrite && (
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => setRecordForm(r)}
                                  className="p-1.5 rounded-lg text-ink-4 hover:text-accent hover:bg-accent-soft dark:hover:bg-accent-soft transition-colors"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm(`Delete record "${r['name']}"?`))
                                      deleteRecord.mutate(r['.id']);
                                  }}
                                  className="p-1.5 rounded-lg text-ink-4 hover:text-bad hover:bg-bad-bg dark:hover:bg-bad-bg transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
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
          </div>
        </>
      )}
    </div>
  );
}
