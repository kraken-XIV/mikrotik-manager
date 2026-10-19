import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  ExternalLink,
  RefreshCw,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import { useState } from 'react';

import { useCanWrite } from '../../hooks/useCanWrite';
import { type ConfigFinding, devicesApi } from '../../services/api';
import { apiErrorMessage } from '../../utils/apiError';
import { GuardedWriteUi, useGuardedWrite } from '../ChangeGuardDialog';
import LoadError from '../common/LoadError';

const SEV: Record<ConfigFinding['severity'], { chip: string; card: string; label: string }> = {
  critical: {
    chip: 'bg-bad-bg text-bad dark:text-bad',
    card: 'border-bad dark:border-bad',
    label: 'Broken',
  },
  warning: {
    chip: 'bg-warn-bg dark:bg-warn-bg text-warn',
    card: 'border-warn dark:border-warn',
    label: 'Fragile',
  },
  info: {
    chip: 'bg-accent-soft dark:bg-accent-soft text-accent dark:text-accent',
    card: 'border-accent dark:border-accent',
    label: 'Note',
  },
};

function since(iso: string | null): string {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return 'first seen today';
  if (days === 1) return 'present for 1 day';
  return `present for ${days} days`;
}

function Finding({
  f,
  deviceId,
  deviceName,
}: {
  f: ConfigFinding;
  deviceId: number;
  deviceName?: string;
}) {
  const [open, setOpen] = useState(f.severity === 'critical');
  const style = SEV[f.severity];
  const canWrite = useCanWrite();
  const qc = useQueryClient();
  // One-click fix (#239): confirmed first with the exact command, then run
  // under Change Guard, which may still ask about a predicted lockout.
  const guard = useGuardedWrite();
  const [confirming, setConfirming] = useState(false);
  const [fixError, setFixError] = useState('');
  const fix = useMutation({
    mutationFn: (confirm: boolean) =>
      devicesApi.fixConfigHealth(deviceId, f.rule, f.objects, confirm),
    onSuccess: (res) => {
      setConfirming(false);
      setFixError('');
      guard.onSuccess(res);
      void qc.invalidateQueries({ queryKey: ['config-health', deviceId] });
    },
  });
  const runFix = () =>
    fix.mutate(false, {
      onError: guard.onError(
        () =>
          fix.mutate(true, { onError: (e) => setFixError(apiErrorMessage(e, 'The fix failed')) }),
        (e) => setFixError(apiErrorMessage(e, 'The fix failed')),
      ),
    });

  return (
    <div className={clsx('rounded-lg border', style.card)}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-start gap-2.5 p-3 text-left"
      >
        {open ? (
          <ChevronDown className="w-4 h-4 mt-0.5 flex-shrink-0 text-ink-4" />
        ) : (
          <ChevronRight className="w-4 h-4 mt-0.5 flex-shrink-0 text-ink-4" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={clsx(
                'text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded',
                style.chip,
              )}
            >
              {style.label}
            </span>
            <span className="text-sm font-medium text-ink">{f.title}</span>
          </div>
          {!open && f.first_seen && (
            <div className="mt-0.5 text-xs text-ink-4">{since(f.first_seen)}</div>
          )}
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3 pl-9 space-y-2.5">
          <p className="text-sm text-ink-2">{f.detail}</p>

          {f.remediation && (
            <div className="flex items-start gap-2 rounded-md bg-surface-2/60 p-2.5">
              <Wrench className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-ink-4" />
              <p className="text-sm text-ink-2 dark:text-ink flex-1">{f.remediation}</p>
              {f.fix && canWrite && !confirming && (
                <button
                  onClick={() => setConfirming(true)}
                  className="btn-primary text-xs py-1 flex-shrink-0"
                >
                  Fix it
                </button>
              )}
            </div>
          )}
          {f.fix && confirming && (
            <div className="rounded-md border border-accent dark:border-accent bg-accent-soft p-2.5 space-y-2">
              <p className="text-sm text-blue-900 dark:text-blue-200">
                {f.fix.summary}. This runs on the device:
              </p>
              <code className="block text-xs font-mono text-blue-900 dark:text-blue-100 break-all">
                {f.fix.command}
              </code>
              <p className="text-xs text-blue-800/80 dark:text-blue-300/80">
                It runs under Change Guard, so if it cuts the manager off the device undoes it by
                itself.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={runFix}
                  disabled={fix.isPending}
                  className="btn-primary text-xs py-1"
                >
                  {fix.isPending ? 'Applying…' : 'Apply fix'}
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  disabled={fix.isPending}
                  className="btn-secondary text-xs py-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {fixError && <p className="text-xs text-bad">{fixError}</p>}
          <GuardedWriteUi
            state={guard}
            deviceId={deviceId}
            deviceName={deviceName}
            pending={fix.isPending}
          />
          {!f.fix && f.no_fix_reason && (
            <p className="text-xs text-ink-3">No one-click fix: {f.no_fix_reason}</p>
          )}

          <div className="flex items-center gap-3 flex-wrap text-xs text-ink-4">
            {f.objects.length > 0 && <span className="mono">{f.objects.join(' · ')}</span>}
            {f.first_seen && <span>{since(f.first_seen)}</span>}
            {f.doc_url && (
              <a
                href={f.doc_url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-accent hover:underline"
              >
                MikroTik docs <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Standing audit for configurations RouterOS accepted but that do not work.
 *
 * Distinct from the hardening score above it: nothing here is a security setting.
 * These are contradictions the device will never report — an address on a slave
 * port, a PVID that a frame-type makes inert — so this panel is the only place
 * they become visible.
 */
export default function ConfigHealthCard({
  deviceId,
  deviceName,
}: {
  deviceId: number;
  deviceName?: string;
}) {
  const qc = useQueryClient();
  const canWrite = useCanWrite();
  const [scanError, setScanError] = useState('');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['config-health', deviceId],
    queryFn: () => devicesApi.getConfigHealth(deviceId).then((r) => r.data),
  });

  const scan = useMutation({
    mutationFn: () => devicesApi.scanConfigHealth(deviceId).then((r) => r.data),
    onSuccess: (fresh) => {
      qc.setQueryData(['config-health', deviceId], fresh);
      setScanError('');
    },
    onError: (err: unknown) => {
      const r = (err as { response?: { data?: { error?: string } } })?.response?.data;
      setScanError(r?.error || 'Could not audit the device');
    },
  });

  const findings = data?.findings ?? [];
  const critical = findings.filter((f) => f.severity === 'critical').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-accent-soft rounded-lg flex items-center justify-center">
            <Activity className="w-3.5 h-3.5 text-accent" />
          </div>
          <h3 className="text-sm font-semibold text-ink">Config Health</h3>
          {critical > 0 && (
            <span
              className={clsx(
                'text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded',
                SEV.critical.chip,
              )}
            >
              {critical} broken
            </span>
          )}
          {warnings > 0 && (
            <span
              className={clsx(
                'text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded',
                SEV.warning.chip,
              )}
            >
              {warnings} fragile
            </span>
          )}
        </div>
        {canWrite && (
          <button
            onClick={() => scan.mutate()}
            disabled={scan.isPending}
            className="btn-secondary flex items-center gap-1.5 text-xs py-1.5"
          >
            <RefreshCw className={clsx('w-3.5 h-3.5', scan.isPending && 'animate-spin')} /> Re-audit
          </button>
        )}
      </div>

      <p className="text-xs text-ink-3">
        RouterOS applies each command on its own, with no check that the result is coherent — so a
        configuration can be accepted, saved, and still not work. This audit looks for those cases.
      </p>

      {scanError && (
        <div className="flex items-start gap-2 rounded-lg border border-bad dark:border-bad bg-bad-bg p-3">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-bad" />
          <p className="text-sm text-bad dark:text-bad">{scanError}</p>
        </div>
      )}

      {isError ? (
        <LoadError what="configuration findings" error={error} />
      ) : isLoading ? (
        <div className="text-center py-6 text-ink-4 text-sm">
          <RefreshCw className="w-4 h-4 animate-spin inline mr-2" />
          Loading findings…
        </div>
      ) : findings.length === 0 ? (
        <div className="card p-4 flex items-start gap-2.5">
          <CircleCheck className="w-4 h-4 mt-0.5 flex-shrink-0 text-good" />
          <div>
            <div className="text-sm font-medium text-good">No configuration conflicts found</div>
            <div className="text-xs text-ink-4 mt-0.5">
              {data?.checked_at
                ? `Last audited ${new Date(data.checked_at).toLocaleString()}.`
                : 'This device has not been audited yet — run one with Re-audit.'}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {findings.map((f) => (
              <Finding
                key={`${f.rule}:${f.objects.join(',')}`}
                f={f}
                deviceId={deviceId}
                deviceName={deviceName}
              />
            ))}
          </div>
          {data?.checked_at && (
            <div className="flex items-center gap-1.5 text-xs text-ink-4">
              <ShieldAlert className="w-3 h-3" />
              Last audited {new Date(data.checked_at).toLocaleString()}
            </div>
          )}
        </>
      )}
    </div>
  );
}
