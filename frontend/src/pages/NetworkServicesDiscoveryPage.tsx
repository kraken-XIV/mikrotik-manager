import { useMutation, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  AlertCircle,
  Box,
  Check,
  CheckCircle,
  ChevronDown,
  Eye,
  EyeOff,
  HelpCircle,
  Layers,
  Radio,
  RefreshCw,
  Router as RouterIcon,
  Shield,
  Wifi,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';

import { useCanWrite } from '../hooks/useCanWrite';
import { networkServicesApi } from '../services/api';

type Scope = 'all' | 'routers' | 'switches' | 'aps';
type Kind = 'router' | 'switch' | 'wireless_ap' | 'other';

interface LldpRow {
  id: number;
  name: string;
  ip_address: string;
  enabled: boolean | null;
  protocol: string | null;
  error?: string;
  kind: Kind;
}

interface SnmpRow {
  id: number;
  name: string;
  ip_address: string;
  enabled: boolean | null;
  community_name?: string;
  version?: string;
  auth_protocol?: string;
  priv_protocol?: string;
  contact?: string;
  location?: string;
  trap_target?: string;
  error?: string;
  device_type: string;
  kind: Kind;
}

interface SnmpForm {
  enabled: boolean;
  community_name: string;
  version: 'v1' | 'v2c' | 'v3';
  contact: string;
  location: string;
  trap_target: string;
  auth_protocol: string;
  auth_password: string;
  priv_protocol: string;
  priv_password: string;
}

const DEFAULT_SNMP: SnmpForm = {
  enabled: true,
  community_name: '',
  version: 'v2c',
  contact: '',
  location: '',
  trap_target: '',
  auth_protocol: 'MD5',
  auth_password: '',
  priv_protocol: 'none',
  priv_password: '',
};

const SCOPES: { key: Scope; label: string }[] = [
  { key: 'all', label: 'All Devices' },
  { key: 'routers', label: 'Routers' },
  { key: 'switches', label: 'Switches' },
  { key: 'aps', label: 'Wireless APs' },
];

/** LLDP and SNMP both cover every RouterOS device, access points included. */
function scopeNoun(scope: Scope): string {
  return scope === 'routers'
    ? 'routers'
    : scope === 'switches'
      ? 'switches'
      : scope === 'aps'
        ? 'wireless APs'
        : 'devices';
}

const SCOPE_KIND: Record<Exclude<Scope, 'all'>, Kind> = {
  routers: 'router',
  switches: 'switch',
  aps: 'wireless_ap',
};

function toKind(t: string): Kind {
  return t === 'router' || t === 'switch' || t === 'wireless_ap' ? t : 'other';
}

function KindPill({ kind }: { kind: Kind }) {
  const look = {
    router: {
      cls: 'bg-violet-bg dark:bg-violet-bg text-violet dark:text-violet',
      icon: <RouterIcon className="w-3 h-3" />,
      label: 'Router',
    },
    switch: {
      cls: 'bg-good-bg dark:bg-good-bg text-good dark:text-good',
      icon: <Layers className="w-3 h-3" />,
      label: 'Switch',
    },
    wireless_ap: {
      cls: 'bg-info-bg dark:bg-sky-900/30 text-info dark:text-info',
      icon: <Wifi className="w-3 h-3" />,
      label: 'AP',
    },
    other: {
      cls: 'bg-surface-3 text-ink-2',
      icon: <Box className="w-3 h-3" />,
      label: 'Other',
    },
  }[kind];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
        look.cls,
      )}
    >
      {look.icon}
      {look.label}
    </span>
  );
}

function PasswordInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        className="input pr-9"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="new-password"
      />
      <button
        type="button"
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink-2 dark:hover:text-ink-2"
        onClick={() => setShow((s) => !s)}
        tabIndex={-1}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

export default function NetworkServicesDiscoveryPage() {
  const canWrite = useCanWrite();
  const [scope, setScope] = useState<Scope>('all');

  const inScope = <T extends { kind: Kind }>(rows: T[]) =>
    scope === 'all' ? rows : rows.filter((r) => r.kind === SCOPE_KIND[scope]);

  // ── LLDP state ──────────────────────────────────────────────────────────────
  const [lldpApplyResult, setLldpApplyResult] = useState<{ applied: number; total: number } | null>(
    null,
  );
  const [lldpApplyError, setLldpApplyError] = useState('');

  // Every device type in one call. Access points and "other" devices run
  // RouterOS too and have the same discovery settings; this used to list only
  // routers and switches.
  const lldpQuery = useQuery({
    queryKey: ['lldp-all'],
    queryFn: () => networkServicesApi.getLldp().then((r) => r.data),
  });

  const lldpLoading = lldpQuery.isLoading;
  const lldpFetching = lldpQuery.isFetching;
  const refetchLldp = () => {
    lldpQuery.refetch();
  };

  const kindOrder: Kind[] = ['router', 'switch', 'wireless_ap', 'other'];
  const lldpAll: LldpRow[] = (lldpQuery.data ?? [])
    .map((r) => ({ ...r, kind: toKind(r.device_type) }))
    .sort(
      (a, b) =>
        kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind) || a.name.localeCompare(b.name),
    );
  const lldpStatuses = inScope(lldpAll);

  const setLldpMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const types = scope === 'all' ? undefined : [SCOPE_KIND[scope]];
      const r = await networkServicesApi.setLldp(enabled, types);
      return { applied: r.data.applied, total: r.data.total };
    },
    onSuccess: (res) => {
      setLldpApplyResult(res);
      setLldpApplyError('');
      refetchLldp();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setLldpApplyError(msg || 'Failed to apply LLDP settings');
    },
  });

  const allEnabled = lldpStatuses.length > 0 && lldpStatuses.every((s) => s.enabled === true);
  const allDisabled = lldpStatuses.length > 0 && lldpStatuses.every((s) => s.enabled === false);

  // ── SNMP state ──────────────────────────────────────────────────────────────
  const [snmpForm, setSnmpForm] = useState<SnmpForm>(DEFAULT_SNMP);
  const [snmpApplyResult, setSnmpApplyResult] = useState<{ applied: number; total: number } | null>(
    null,
  );
  const [snmpApplyError, setSnmpApplyError] = useState('');
  // Only the fields the operator edited are sent. The form used to be
  // prefilled from one device with every field sent, so "apply to all" copied
  // that device's community, version and on/off state to the whole fleet
  // (P1-11). Devices differ, so the form can't show "their" value; instead it
  // remembers what was touched, highlights it, and Apply lists exactly that.
  type SnmpField = 'enabled' | 'version' | 'community' | 'contact' | 'location' | 'trap_target';
  const [edited, setEdited] = useState<Set<SnmpField>>(new Set());
  const FIELD_OF = new Map<keyof SnmpForm, SnmpField>([
    ['enabled', 'enabled'],
    ['version', 'version'],
    ['community_name', 'community'],
    ['contact', 'contact'],
    ['location', 'location'],
    ['trap_target', 'trap_target'],
    // SNMPv3 security travels with the version.
    ['auth_protocol', 'version'],
    ['auth_password', 'version'],
    ['priv_protocol', 'version'],
    ['priv_password', 'version'],
  ]);
  const sf = (patch: Partial<SnmpForm>) => {
    setSnmpForm((f) => ({ ...f, ...patch }));
    setEdited((prev) => {
      const next = new Set(prev);
      for (const k of Object.keys(patch) as (keyof SnmpForm)[]) {
        const f = FIELD_OF.get(k);
        if (f) next.add(f);
      }
      return next;
    });
  };
  const resetSnmpForm = () => {
    setSnmpForm(DEFAULT_SNMP);
    setEdited(new Set());
  };
  /** A light highlight on a field that Apply will send. */
  const editedRing = (f: SnmpField) =>
    edited.has(f) ? 'ring-2 ring-amber-300 dark:ring-amber-500/60 rounded-lg' : '';

  // Every device type, like LLDP above. This used to read routers and switches
  // only, so access points could not be configured here at all.
  const snmpQuery = useQuery({
    queryKey: ['snmp-all'],
    queryFn: () => networkServicesApi.getSnmp().then((r) => r.data),
  });

  const templatesQuery = useQuery({
    queryKey: ['snmp-templates'],
    queryFn: () => networkServicesApi.getSnmpTemplates().then((r) => r.data),
  });
  const templates = templatesQuery.data ?? {};

  const snmpLoading = snmpQuery.isLoading;
  const snmpFetching = snmpQuery.isFetching;
  const refetchSnmp = () => {
    snmpQuery.refetch();
    templatesQuery.refetch();
  };

  const snmpAll: SnmpRow[] = (snmpQuery.data ?? [])
    .map((r) => ({ ...r, kind: toKind(r.device_type) }))
    .sort(
      (a, b) =>
        kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind) || a.name.localeCompare(b.name),
    );
  const snmpStatuses = inScope(snmpAll);

  // Which devices a change goes to. Only devices shown under the current tab
  // that answered can be chosen; the table shows what each one has now.
  const snmpTargets = snmpStatuses.filter((r) => !r.error);
  const [snmpPicked, setSnmpPicked] = useState<Set<number>>(new Set());
  const pickedInScope = snmpTargets.filter((r) => snmpPicked.has(r.id));
  const togglePick = (id: number) =>
    setSnmpPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const [pickerOpen, setPickerOpen] = useState(false);

  /** Exactly what Apply will send: only the fields that were edited. */
  const snmpPayload = () => {
    const p: Partial<SnmpForm> = {};
    if (edited.has('enabled')) p.enabled = snmpForm.enabled;
    if (edited.has('community')) p.community_name = snmpForm.community_name.trim();
    if (edited.has('contact')) p.contact = snmpForm.contact;
    if (edited.has('location')) p.location = snmpForm.location;
    if (edited.has('trap_target')) p.trap_target = snmpForm.trap_target;
    if (edited.has('version')) {
      p.version = snmpForm.version;
      if (snmpForm.version === 'v3') {
        p.auth_protocol = snmpForm.auth_protocol;
        p.auth_password = snmpForm.auth_password;
        p.priv_protocol = snmpForm.priv_protocol;
        p.priv_password = snmpForm.priv_password;
      }
    }
    return p;
  };

  /** One line per change, for the confirmation. Blank text fields change nothing. */
  const snmpChangeLines = (): string[] => {
    const lines: string[] = [];
    if (edited.has('enabled')) lines.push(`SNMP: ${snmpForm.enabled ? 'on' : 'OFF'}`);
    if (edited.has('version')) lines.push(`Version: ${snmpForm.version}`);
    if (edited.has('community') && snmpForm.community_name.trim()) {
      lines.push(
        `${snmpForm.version === 'v3' ? 'User' : 'Community'}: ${snmpForm.community_name.trim()} (added if a device doesn't have it; existing ones are kept)`,
      );
    }
    if (edited.has('contact') && snmpForm.contact.trim())
      lines.push(`Contact: ${snmpForm.contact.trim()}`);
    if (edited.has('location') && snmpForm.location.trim())
      lines.push(`Location: ${snmpForm.location.trim()}`);
    if (edited.has('trap_target') && snmpForm.trap_target.trim())
      lines.push(`Trap destination: ${snmpForm.trap_target.trim()}`);
    return lines;
  };

  /** Confirm the exact change and the devices it goes to, then send it. */
  const applySnmpTo = (targets: SnmpRow[]) => {
    const lines = snmpChangeLines();
    const who =
      targets.length <= 6
        ? targets.map((t) => `  • ${t.name}`).join('\n')
        : `  ${targets.length} ${scopeNoun(scope)}`;
    if (
      !confirm(
        `Change SNMP on:\n${who}\n\n${lines.join('\n')}\n\nAnything not listed is left as it is on each device.`,
      )
    )
      return;
    setPickerOpen(false);
    setSnmpApplyResult(null);
    setSnmpApplyError('');
    setSnmpMutation.mutate(targets.map((t) => t.id));
  };

  const setSnmpMutation = useMutation({
    mutationFn: async (deviceIds: number[]) => {
      const r = await networkServicesApi.setSnmp(deviceIds, snmpPayload());
      return { applied: r.data.applied, total: r.data.total };
    },
    onSuccess: (res) => {
      setSnmpApplyResult(res);
      setSnmpApplyError('');
      resetSnmpForm();
      refetchSnmp();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setSnmpApplyError(msg || 'Failed to apply SNMP settings');
    },
  });

  // What the form shows: the chosen devices' real settings (or, with none
  // chosen, those of every device listed), with the operator's edits on top.
  // A setting the devices don't share shows as "differs" rather than a made-up
  // default. Before this the slider always showed "on" and V2C was always
  // selected, which looked like each device's state but wasn't, and wasn't sent.
  const basisRows = pickedInScope.length ? pickedInScope : snmpTargets;
  const common = <T,>(pick: (r: SnmpRow) => T): T | undefined => {
    if (!basisRows.length) return undefined;
    const first = pick(basisRows[0]);
    return basisRows.every((r) => pick(r) === first) ? first : undefined;
  };
  const basis = {
    enabled: common((r) => r.enabled ?? null) ?? undefined,
    version: common((r) => r.version ?? ''),
    community_name: common((r) => r.community_name ?? ''),
    // A saved template (#164) is shown as typed, e.g. {identity}@example.com,
    // rather than one device's filled-in result.
    contact: templates.contact ?? common((r) => r.contact ?? ''),
    location: templates.location ?? common((r) => r.location ?? ''),
    trap_target: templates.trap_target ?? common((r) => r.trap_target ?? ''),
  };
  type TemplField = 'contact' | 'location' | 'trap_target';
  const templateOf = (f: TemplField) =>
    f === 'contact'
      ? templates.contact
      : f === 'location'
        ? templates.location
        : templates.trap_target;
  const showsTemplate = (f: TemplField) => !edited.has(f) && !!templateOf(f);
  /** Under a field showing a saved template: it isn't sent unless chosen. */
  const templateNote = (f: TemplField) =>
    showsTemplate(f) ? (
      <p className="text-[11px] text-ink-3 mt-1">
        Last applied template; not sent unless you change it.{' '}
        <button
          type="button"
          className="text-accent hover:underline"
          onClick={() =>
            sf(
              f === 'contact'
                ? { contact: templateOf(f)! }
                : f === 'location'
                  ? { location: templateOf(f)! }
                  : { trap_target: templateOf(f)! },
            )
          }
        >
          Send it
        </button>
      </p>
    ) : null;
  const shown = {
    enabled: edited.has('enabled') ? snmpForm.enabled : (basis.enabled ?? undefined),
    version: edited.has('version') ? snmpForm.version : basis.version || undefined,
    community_name: edited.has('community')
      ? snmpForm.community_name
      : (basis.community_name ?? ''),
    contact: edited.has('contact') ? snmpForm.contact : (basis.contact ?? ''),
    location: edited.has('location') ? snmpForm.location : (basis.location ?? ''),
    trap_target: edited.has('trap_target') ? snmpForm.trap_target : (basis.trap_target ?? ''),
  };
  const differs = (f: 'version' | 'community_name' | 'contact' | 'location' | 'trap_target') =>
    basisRows.length > 1 &&
    (f === 'version'
      ? basis.version === undefined
      : f === 'community_name'
        ? basis.community_name === undefined
        : f === 'contact'
          ? basis.contact === undefined
          : f === 'location'
            ? basis.location === undefined
            : basis.trap_target === undefined);
  const onCount = basisRows.filter((r) => r.enabled === true).length;
  const isV3 = shown.version === 'v3';

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">Discovery &amp; SNMP</h1>
          <p className="text-sm text-ink-3 mt-0.5">
            Network-wide LLDP discovery and SNMP monitoring configuration
          </p>
        </div>
        {/* Scope selector */}
        <div className="flex rounded-lg border border-line overflow-hidden">
          {SCOPES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => {
                setScope(s.key);
                setLldpApplyResult(null);
                setSnmpApplyResult(null);
              }}
              className={clsx(
                'px-4 py-1.5 text-sm font-medium transition-colors',
                scope === s.key
                  ? 'bg-accent text-accent-fg'
                  : 'bg-surface text-ink-2 hover:bg-surface-2',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── LLDP Card ──────────────────────────────────────────────────────────── */}
      <div className="card p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 bg-accent-soft rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
            <Radio className="w-4 h-4 text-accent" />
          </div>
          <div>
            <h2 className="font-semibold text-ink">Link Layer Discovery Protocol (LLDP)</h2>
            <p className="text-sm text-ink-3 mt-1">
              LLDP lets your devices announce themselves to neighbors and collect neighbor
              information. Enabling LLDP improves the accuracy of the network topology map.
            </p>
          </div>
        </div>

        {!lldpLoading && lldpStatuses.length > 0 && (
          <div
            className={clsx(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
              allEnabled
                ? 'bg-good-bg text-good'
                : allDisabled
                  ? 'bg-bad-bg text-bad dark:text-bad'
                  : 'bg-warn-bg text-warn dark:text-warn',
            )}
          >
            {allEnabled ? (
              <CheckCircle className="w-4 h-4" />
            ) : allDisabled ? (
              <XCircle className="w-4 h-4" />
            ) : (
              <HelpCircle className="w-4 h-4" />
            )}
            {allEnabled
              ? `LLDP is enabled on all online ${scopeNoun(scope)}`
              : allDisabled
                ? `LLDP is disabled on all online ${scopeNoun(scope)}`
                : `LLDP state is mixed across ${scopeNoun(scope)}`}
          </div>
        )}

        {lldpLoading ? (
          <div className="flex items-center gap-2 text-sm text-ink-4">
            <RefreshCw className="w-4 h-4 animate-spin" /> Checking LLDP status on all{' '}
            {scopeNoun(scope)}…
          </div>
        ) : lldpStatuses.length === 0 ? (
          <p className="text-sm text-ink-3">
            No online {scopeNoun(scope)} found. Devices must be online to check or change LLDP
            settings.
          </p>
        ) : (
          <div className="rounded-lg border border-line overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-2 dark:bg-surface-3 border-b border-line">
                  <th className="table-header px-4 py-2.5 text-left">Device</th>
                  <th className="table-header px-4 py-2.5 text-left">Type</th>
                  <th className="table-header px-4 py-2.5 text-left">IP</th>
                  <th className="table-header px-4 py-2.5 text-left">LLDP</th>
                  <th className="table-header px-4 py-2.5 text-left">Protocols</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line table-zebra">
                {lldpStatuses.map((r) => (
                  <tr key={`${r.kind}-${r.id}`} className="hover:bg-surface-2/30">
                    <td className="px-4 py-2.5 cell-primary">{r.name}</td>
                    <td className="px-4 py-2.5">
                      <KindPill kind={r.kind} />
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-3">{r.ip_address}</td>
                    <td className="px-4 py-2.5">
                      {r.error ? (
                        <span className="text-xs text-bad flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" /> Error
                        </span>
                      ) : r.enabled === null ? (
                        <span className="text-xs text-ink-4">Unknown</span>
                      ) : r.enabled ? (
                        <span className="flex items-center gap-1 text-xs text-good">
                          <CheckCircle className="w-3.5 h-3.5" /> Enabled
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-bad">
                          <XCircle className="w-3.5 h-3.5" /> Disabled
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-3">
                      {r.protocol && r.protocol !== 'unknown' ? r.protocol : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {lldpApplyResult && (
          <div className="flex items-center gap-2 text-sm text-good">
            <Check className="w-4 h-4" /> Applied to {lldpApplyResult.applied} of{' '}
            {lldpApplyResult.total} {scopeNoun(scope)}
          </div>
        )}
        {lldpApplyError && (
          <div className="flex items-start gap-2 p-3 bg-bad-bg border border-bad dark:border-bad rounded-lg">
            <AlertCircle className="w-4 h-4 text-bad flex-shrink-0 mt-0.5" />
            <p className="text-sm text-bad">{lldpApplyError}</p>
          </div>
        )}

        {canWrite && (
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={() => refetchLldp()}
              disabled={lldpFetching}
              className="btn-secondary flex items-center gap-1.5 text-sm"
            >
              <RefreshCw className={clsx('w-3.5 h-3.5', lldpFetching && 'animate-spin')} /> Refresh
              Status
            </button>
            <button
              disabled={setLldpMutation.isPending || lldpLoading || lldpStatuses.length === 0}
              className="btn-primary flex items-center gap-1.5 text-sm"
              onClick={() => {
                if (!confirm(`Enable LLDP on all ${lldpStatuses.length} devices in view?`)) return;
                setLldpApplyResult(null);
                setLldpMutation.mutate(true);
              }}
            >
              {setLldpMutation.isPending ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle className="w-3.5 h-3.5" />
              )}
              Enable LLDP on All
            </button>
            <button
              disabled={setLldpMutation.isPending || lldpLoading || lldpStatuses.length === 0}
              className="btn-secondary flex items-center gap-1.5 text-sm text-bad border-bad dark:border-bad hover:bg-bad-bg dark:hover:bg-bad-bg"
              onClick={() => {
                if (
                  !confirm(
                    `Disable LLDP on all ${lldpStatuses.length} devices in view? Topology discovery relies on it.`,
                  )
                )
                  return;
                setLldpApplyResult(null);
                setLldpMutation.mutate(false);
              }}
            >
              {setLldpMutation.isPending ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <XCircle className="w-3.5 h-3.5" />
              )}
              Disable LLDP on All
            </button>
          </div>
        )}
      </div>

      {/* ── SNMP Card ───────────────────────────────────────────────────────────── */}
      {scope === 'aps' ? (
        <div className="card p-6 flex items-start gap-3">
          <div className="w-9 h-9 bg-violet-bg dark:bg-violet-bg rounded-lg flex items-center justify-center flex-shrink-0">
            <Shield className="w-4 h-4 text-violet dark:text-violet" />
          </div>
          <div>
            <h2 className="font-semibold text-ink">SNMP</h2>
            <p className="text-sm text-ink-3 mt-1">
              SNMP settings here cover routers and switches. Pick one of those tabs to configure it.
            </p>
          </div>
        </div>
      ) : (
        <div className="card p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-violet-bg dark:bg-violet-bg rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
              <Shield className="w-4 h-4 text-violet dark:text-violet" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-ink">Simple Network Management Protocol (SNMP)</h2>
              <p className="text-sm text-ink-3 mt-1">
                Configure SNMP on any of your {scopeNoun(scope)}: choose devices from the list, or
                apply to all. Only the fields you change are sent (they&apos;re highlighted);
                everything else stays as it is on each device. The table below shows what each
                device has now.
              </p>
            </div>
          </div>

          <fieldset disabled={!canWrite} className="space-y-4 disabled:opacity-60">
            {/* Enable toggle */}
            <div
              className={clsx(
                'flex items-center justify-between p-3 bg-surface-2 dark:bg-surface-3 rounded-lg',
                editedRing('enabled'),
              )}
            >
              <div>
                <p className="text-sm font-medium text-ink">Enable SNMP</p>
                <p className="text-xs text-ink-3 mt-0.5">
                  {shown.enabled === undefined && basisRows.length > 1
                    ? `Differs: on for ${onCount} of ${basisRows.length} devices. Click to set it for all of them.`
                    : 'Allow SNMP polling and trap generation'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => sf({ enabled: shown.enabled !== true })}
                aria-label={
                  shown.enabled === undefined
                    ? 'SNMP differs between devices; click to turn on'
                    : shown.enabled
                      ? 'SNMP is on; click to turn off'
                      : 'SNMP is off; click to turn on'
                }
                className={clsx(
                  'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                  shown.enabled === true
                    ? 'bg-accent'
                    : shown.enabled === false
                      ? 'bg-surface-3 dark:bg-surface-3'
                      : 'bg-surface-3 dark:bg-surface-3 border border-dashed border-line',
                )}
              >
                <span
                  className={clsx(
                    'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                    shown.enabled === true
                      ? 'translate-x-6'
                      : shown.enabled === false
                        ? 'translate-x-1'
                        : 'translate-x-3.5',
                  )}
                />
              </button>
            </div>

            {/* Version */}
            <div>
              <label className="label">SNMP Version</label>
              <div
                className={clsx(
                  'flex rounded-lg border border-line overflow-hidden w-fit',
                  editedRing('version'),
                )}
              >
                {(['v1', 'v2c', 'v3'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={shown.version === v}
                    onClick={() => sf({ version: v })}
                    className={clsx(
                      'px-5 py-2 text-sm font-medium transition-colors',
                      shown.version === v
                        ? 'bg-accent text-accent-fg'
                        : 'bg-surface text-ink-2 hover:bg-surface-2',
                    )}
                  >
                    {v.toUpperCase()}
                  </button>
                ))}
              </div>
              <p className="text-xs text-ink-3 mt-1.5">
                {shown.version === 'v1' &&
                  'SNMPv1 — community string, no encryption. Legacy use only.'}
                {shown.version === 'v2c' &&
                  'SNMPv2c — community string, supports 64-bit counters. Recommended for read-only monitoring.'}
                {shown.version === 'v3' &&
                  'SNMPv3 — username-based with authentication and optional encryption. Most secure.'}
                {shown.version === undefined &&
                  differs('version') &&
                  'The chosen devices use different versions. Pick one to set it on all of them.'}
              </p>
            </div>

            {/* Community / Username */}
            <div>
              <label className="label">{isV3 ? 'Username' : 'Community Name'}</label>
              <input
                className={clsx('input max-w-xs', editedRing('community'))}
                value={shown.community_name}
                onChange={(e) => sf({ community_name: e.target.value })}
                placeholder={
                  differs('community_name')
                    ? 'Differs between devices'
                    : isV3
                      ? 'snmpv3user'
                      : 'public'
                }
              />
            </div>

            {/* Global info */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Contact</label>
                <input
                  className={clsx('input', editedRing('contact'))}
                  value={shown.contact}
                  onChange={(e) => sf({ contact: e.target.value })}
                  placeholder={
                    differs('contact') ? 'Differs between devices' : '{identity}@example.com'
                  }
                />
                {templateNote('contact')}
              </div>
              <div>
                <label className="label">Location</label>
                <input
                  className={clsx('input', editedRing('location'))}
                  value={shown.location}
                  onChange={(e) => sf({ location: e.target.value })}
                  placeholder={
                    differs('location') ? 'Differs between devices' : '{site} / {location}'
                  }
                />
                {templateNote('location')}
              </div>
            </div>
            {/* Contact and location used to be written verbatim to every device,
              and blank fields erased what each device already had (#164). */}
            <p className="text-[11.5px] text-ink-3 -mt-1">
              Fields show what the chosen devices have now; only a field you change is sent, and a
              field you clear is left as it is on each device. Variables are filled in per device:{' '}
              <span className="mono">{'{identity}'}</span>, <span className="mono">{'{name}'}</span>
              , <span className="mono">{'{ip}'}</span>, <span className="mono">{'{model}'}</span>,{' '}
              <span className="mono">{'{serial}'}</span>, <span className="mono">{'{site}'}</span>,{' '}
              <span className="mono">{'{location}'}</span>.
            </p>

            <div>
              <label className="label">Trap Destination (optional)</label>
              <input
                className={clsx('input max-w-xs', editedRing('trap_target'))}
                value={shown.trap_target}
                onChange={(e) => sf({ trap_target: e.target.value })}
                placeholder={differs('trap_target') ? 'Differs between devices' : '192.168.1.100'}
              />
              {templateNote('trap_target')}
            </div>

            {/* SNMPv3 section */}
            {isV3 && (
              <div className="border border-violet dark:border-purple-800/50 rounded-lg p-4 space-y-4 bg-purple-50/30 dark:bg-purple-900/10">
                <p className="text-xs font-semibold text-violet dark:text-violet uppercase tracking-wide">
                  SNMPv3 Security
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Authentication Protocol</label>
                    <select
                      className="input"
                      value={snmpForm.auth_protocol}
                      onChange={(e) => sf({ auth_protocol: e.target.value })}
                    >
                      <option value="MD5">MD5</option>
                      <option value="SHA1">SHA1</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Authentication Password</label>
                    <PasswordInput
                      value={snmpForm.auth_password}
                      onChange={(v) => sf({ auth_password: v })}
                      placeholder="Leave blank to keep current"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Privacy (Encryption) Protocol</label>
                    <select
                      className="input"
                      value={snmpForm.priv_protocol}
                      onChange={(e) => sf({ priv_protocol: e.target.value })}
                    >
                      <option value="none">None (auth only)</option>
                      <option value="DES">DES</option>
                      <option value="AES">AES</option>
                    </select>
                  </div>
                  {snmpForm.priv_protocol !== 'none' && (
                    <div>
                      <label className="label">Privacy Password</label>
                      <PasswordInput
                        value={snmpForm.priv_password}
                        onChange={(v) => sf({ priv_password: v })}
                        placeholder="Leave blank to keep current"
                      />
                    </div>
                  )}
                </div>
                <p className="text-xs text-ink-3">
                  Security level:{' '}
                  <span className="font-medium text-violet dark:text-violet">
                    {snmpForm.priv_protocol !== 'none'
                      ? 'authPriv (auth + encryption)'
                      : 'authNoPriv (auth only)'}
                  </span>
                </p>
              </div>
            )}
          </fieldset>

          {/* Per-device SNMP status table */}
          {snmpLoading ? (
            <div className="flex items-center gap-2 text-sm text-ink-4">
              <RefreshCw className="w-4 h-4 animate-spin" /> Checking SNMP status on all{' '}
              {scopeNoun(scope)}…
            </div>
          ) : (
            snmpStatuses.length > 0 && (
              <div className="rounded-lg border border-line overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-2 dark:bg-surface-3 border-b border-line">
                      <th className="table-header px-4 py-2.5 text-left">Device</th>
                      <th className="table-header px-4 py-2.5 text-left">Type</th>
                      <th className="table-header px-4 py-2.5 text-left">IP</th>
                      <th className="table-header px-4 py-2.5 text-left">SNMP</th>
                      <th className="table-header px-4 py-2.5 text-left">Version</th>
                      <th className="table-header px-4 py-2.5 text-left">Community / User</th>
                      <th className="table-header px-4 py-2.5 text-left">Contact</th>
                      <th className="table-header px-4 py-2.5 text-left">Location</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line table-zebra">
                    {snmpStatuses.map((r) => (
                      <tr key={`${r.kind}-${r.id}`} className="hover:bg-surface-2/30">
                        <td className="px-4 py-2.5 cell-primary">{r.name}</td>
                        <td className="px-4 py-2.5">
                          <KindPill kind={r.kind} />
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-ink-3">{r.ip_address}</td>
                        <td className="px-4 py-2.5">
                          {r.error ? (
                            <span className="text-xs text-bad flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5" /> Error
                            </span>
                          ) : r.enabled === null ? (
                            <span className="text-xs text-ink-4">Unknown</span>
                          ) : r.enabled ? (
                            <span className="flex items-center gap-1 text-xs text-good">
                              <CheckCircle className="w-3.5 h-3.5" /> Enabled
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-bad">
                              <XCircle className="w-3.5 h-3.5" /> Disabled
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {r.version ? (
                            <span
                              className={clsx(
                                'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
                                r.version === 'v3'
                                  ? 'bg-violet-bg dark:bg-violet-bg text-violet dark:text-violet'
                                  : 'bg-surface-3 text-ink-2',
                              )}
                            >
                              {r.version.toUpperCase()}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-ink-3">
                          {r.community_name ?? '—'}
                        </td>
                        <td
                          className="px-4 py-2.5 text-xs text-ink-3 max-w-[12rem] truncate"
                          title={r.contact || ''}
                        >
                          {r.contact || '—'}
                        </td>
                        <td
                          className="px-4 py-2.5 text-xs text-ink-3 max-w-[12rem] truncate"
                          title={r.location || ''}
                        >
                          {r.location || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {snmpApplyResult && (
            <div className="flex items-center gap-2 text-sm text-good">
              <Check className="w-4 h-4" /> Applied to {snmpApplyResult.applied} of{' '}
              {snmpApplyResult.total} device{snmpApplyResult.total === 1 ? '' : 's'}
            </div>
          )}
          {snmpApplyError && (
            <div className="flex items-start gap-2 p-3 bg-bad-bg border border-bad dark:border-bad rounded-lg">
              <AlertCircle className="w-4 h-4 text-bad flex-shrink-0 mt-0.5" />
              <p className="text-sm text-bad">{snmpApplyError}</p>
            </div>
          )}

          {canWrite && (
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                onClick={() => {
                  setSnmpApplyResult(null);
                  refetchSnmp();
                }}
                disabled={snmpFetching}
                className="btn-secondary flex items-center gap-1.5 text-sm"
              >
                <RefreshCw className={clsx('w-3.5 h-3.5', snmpFetching && 'animate-spin')} />{' '}
                Refresh Status
              </button>

              {/* Device picker: one, several, or use Apply to all */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPickerOpen((o) => !o)}
                  disabled={snmpTargets.length === 0}
                  aria-haspopup="true"
                  aria-expanded={pickerOpen}
                  title="Choose the devices to change"
                  className="btn-secondary flex items-center gap-1.5 text-sm"
                >
                  {pickedInScope.length === 0
                    ? 'Choose devices'
                    : pickedInScope.length === 1
                      ? pickedInScope[0].name
                      : `${pickedInScope.length} devices`}
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                {pickerOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
                    <div className="absolute z-20 bottom-full mb-1 left-0 w-72 max-h-72 overflow-y-auto card p-2 shadow-lg">
                      <div className="flex items-center justify-between px-1 pb-1.5 mb-1 border-b border-line-soft text-xs">
                        <button
                          type="button"
                          className="text-accent"
                          onClick={() => setSnmpPicked(new Set(snmpTargets.map((r) => r.id)))}
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          className="text-ink-3"
                          onClick={() => setSnmpPicked(new Set())}
                        >
                          Clear
                        </button>
                      </div>
                      {snmpTargets.map((r) => (
                        <label
                          key={r.id}
                          className="flex items-center gap-2 px-1 py-1 rounded hover:bg-surface-2/50 text-sm text-ink cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={snmpPicked.has(r.id)}
                            onChange={() => togglePick(r.id)}
                          />
                          <span className="flex-1 truncate">{r.name}</span>
                          <KindPill kind={r.kind} />
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <button
                disabled={
                  setSnmpMutation.isPending ||
                  pickedInScope.length === 0 ||
                  snmpChangeLines().length === 0
                }
                className="btn-primary flex items-center gap-1.5 text-sm"
                onClick={() => applySnmpTo(pickedInScope)}
              >
                {setSnmpMutation.isPending ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Applying…
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" /> Apply to selected
                    {pickedInScope.length ? ` (${pickedInScope.length})` : ''}
                  </>
                )}
              </button>
              <button
                disabled={
                  setSnmpMutation.isPending ||
                  snmpTargets.length === 0 ||
                  snmpChangeLines().length === 0
                }
                className="btn-secondary flex items-center gap-1.5 text-sm"
                onClick={() => applySnmpTo(snmpTargets)}
              >
                Apply to all {snmpTargets.length} {scopeNoun(scope)}
              </button>
              {edited.size > 0 && (
                <button
                  type="button"
                  onClick={resetSnmpForm}
                  disabled={setSnmpMutation.isPending}
                  className="text-sm text-ink-3 hover:text-ink-2 dark:text-ink-3 dark:hover:text-ink"
                >
                  Reset
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
