import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw, ShieldCheck, ShieldAlert, Route, Loader2 } from 'lucide-react';
import { devicesApi } from '../services/api';

/**
 * Whether this device can arm auto-revert right now, checked when a risky-change
 * dialog opens. The dialogs used to promise protection unconditionally, while the
 * backend only found out afterwards, which on a device that could not arm it
 * meant the change ran with no way back.
 */
function useGuardReadiness(deviceId?: number) {
  return useQuery({
    queryKey: ['change-guard-check', deviceId],
    queryFn: () => devicesApi.changeGuardCheck(deviceId!).then((r) => r.data),
    enabled: !!deviceId,
    staleTime: 60_000,
    retry: false,
  });
}

type Readiness = ReturnType<typeof useGuardReadiness>;

function ReadinessNote({ readiness, blocking }: { readiness: Readiness; blocking: boolean }) {
  if (readiness.isLoading) {
    return (
      <div className="flex items-start gap-2 text-xs text-ink-3">
        <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" />
        <span>Checking that this device can undo the change by itself if it goes wrong…</span>
      </div>
    );
  }
  if (readiness.isError || !readiness.data) {
    return (
      <div className="flex items-start gap-2 text-xs text-warn">
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        <span>
          Couldn&apos;t check auto-revert on this device. If it can&apos;t be armed when you apply,
          a change that risks cutting off management is refused rather than applied unprotected.
        </span>
      </div>
    );
  }
  if (readiness.data.ready) {
    return (
      <div className="flex items-start gap-2 text-xs text-ink-3">
        <ShieldCheck className="w-4 h-4 flex-shrink-0 text-good" />
        <span>
          Auto-revert is ready: the device saves a restore point first. If it stops responding
          after this change, it restores itself automatically and comes back.
        </span>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-bad bg-bad-bg dark:border-bad p-3 text-xs text-bad dark:text-bad flex items-start gap-2">
      <ShieldAlert className="w-4 h-4 flex-shrink-0" />
      <span>
        This device can&apos;t undo a change by itself right now
        {readiness.data.reason ? ` (${readiness.data.reason})` : ''}.{' '}
        {blocking
          ? 'A change predicted to cut off management won\u2019t be applied without it.'
          : 'If the change risks cutting off management, it won\u2019t be applied.'}
      </span>
    </div>
  );
}

/**
 * Confirmation for a change that could sever the manager's path to a device.
 *
 * Follows the existing LockoutDialog/ScanWarningModal pattern (amber = dangerous
 * but intentional; red is reserved for delete), and explains the protection that
 * will be applied so the user knows what happens if it goes wrong.
 */
export interface ChangeGuardDialogProps {
  title: string;
  /** What the user is about to do, in plain language. */
  description: string;
  /** Optional extra risk detail (e.g. why this object matters to reachability). */
  reason?: string;
  confirmLabel: string;
  /** When false, the safety net is unavailable and the change is unprotected. */
  protectedByGuard?: boolean;
  /** When given, the device's real auto-revert readiness is checked and shown. */
  deviceId?: number;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ChangeGuardDialog({
  title, description, reason, confirmLabel,
  protectedByGuard = true, deviceId, pending = false, onConfirm, onCancel,
}: ChangeGuardDialogProps) {
  const readiness = useGuardReadiness(deviceId);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="card w-full max-w-md mx-4 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-warn flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-ink">{title}</h3>
            <p className="mt-1 text-sm text-ink-2">{description}</p>
          </div>
        </div>

        {reason && (
          <div className="rounded-lg border border-warn bg-warn-bg dark:border-warn p-3">
            <p className="text-sm text-warn dark:text-warn">{reason}</p>
          </div>
        )}

        {deviceId ? (
          <ReadinessNote readiness={readiness} blocking={false} />
        ) : protectedByGuard ? (
          <div className="flex items-start gap-2 text-xs text-ink-3">
            <ShieldCheck className="w-4 h-4 flex-shrink-0 text-good" />
            <span>
              Protected: the device saves a restore point first. If it stops responding after
              this change, it restores itself automatically and comes back.
            </span>
          </div>
        ) : (
          <div className="flex items-start gap-2 text-xs text-warn">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>
              Auto-revert is not available for this device, so this change cannot be undone
              automatically if it goes wrong.
            </span>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onCancel} className="btn-secondary" disabled={pending}>Cancel</button>
          <button
            onClick={onConfirm}
            disabled={pending}
            className="px-4 py-1.5 bg-warn hover:bg-warn disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center gap-2"
          >
            {pending && <RefreshCw className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Predicted-lockout verdict ────────────────────────────────────────────────

export interface VerdictViolation {
  id: string;
  title: string;
  detail: string;
  severity: 'critical' | 'warning';
}

export interface VerdictPath {
  mgmt_interface: string | null;
  bridge: string | null;
  mgmt_vlan_id: number | null;
  tagged_management: boolean;
  ingress_port: string | null;
  ingress_port_source: string;
  hops: Array<{ kind: string; name: string; reason: string }>;
}

export interface LockoutVerdict {
  severity: 'safe' | 'warning' | 'critical';
  headline: string;
  violations: VerdictViolation[];
  warnings: string[];
  path: VerdictPath;
}

/** Pull a 409 lockout verdict off a failed mutation, if the backend sent one. */
export function lockoutVerdictOf(err: unknown): LockoutVerdict | null {
  const r = (err as { response?: { status?: number; data?: { lockout?: boolean; verdict?: LockoutVerdict } } })?.response;
  if (r?.status === 409 && r.data?.lockout && r.data.verdict) return r.data.verdict;
  return null;
}

export interface LockoutVerdictDialogProps {
  verdict: LockoutVerdict;
  /** Typed into the confirm box for a critical verdict — normally the device name. */
  confirmPhrase: string;
  /** The device the change targets; its auto-revert readiness is checked before confirming. */
  deviceId?: number;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Explains a predicted lockout and, for a critical verdict, makes the user type the
 * device name before overriding. The reason chain is the point: a warning the user
 * can verify is one they'll act on, rather than click past.
 */
export function LockoutVerdictDialog({
  verdict, confirmPhrase, deviceId, pending = false, onConfirm, onCancel,
}: LockoutVerdictDialogProps) {
  const [typed, setTyped] = useState('');
  const readiness = useGuardReadiness(deviceId);
  const critical = verdict.severity === 'critical';
  // Overriding a warning is only offered when the device can undo the change by
  // itself; the server refuses it otherwise, so the button says so up front.
  const guardBlocked = !!deviceId && readiness.data?.ready === false;
  const guardChecking = !!deviceId && readiness.isLoading;
  const canConfirm = (!critical || typed.trim() === confirmPhrase) && !guardBlocked && !guardChecking;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="card w-full max-w-lg mx-4 p-6 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-start gap-3">
          {critical
            ? <ShieldAlert className="w-6 h-6 text-bad flex-shrink-0" />
            : <AlertTriangle className="w-6 h-6 text-warn flex-shrink-0" />}
          <div>
            <h3 className="font-semibold text-ink">
              {critical ? 'This will disconnect the device' : 'This leaves management fragile'}
            </h3>
            <p className="mt-1 text-sm text-ink-2">{verdict.headline}</p>
          </div>
        </div>

        {verdict.violations.map((v) => (
          <div
            key={v.id}
            className={
              v.severity === 'critical'
                ? 'rounded-lg border border-bad bg-bad-bg dark:border-bad p-3'
                : 'rounded-lg border border-warn bg-warn-bg dark:border-warn p-3'
            }
          >
            <p className={`text-xs font-semibold uppercase tracking-wide ${
              v.severity === 'critical'
                ? 'text-bad dark:text-bad'
                : 'text-warn'
            }`}>{v.title}</p>
            <p className={`mt-1 text-sm ${
              v.severity === 'critical'
                ? 'text-bad dark:text-bad'
                : 'text-warn dark:text-warn'
            }`}>{v.detail}</p>
          </div>
        ))}

        {verdict.path.hops.length > 0 && (
          <div className="rounded-lg border border-line p-3">
            <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-ink-3">
              <Route className="w-3.5 h-3.5" />
              How the manager reaches this device
            </div>
            <ul className="space-y-1.5">
              {verdict.path.hops.map((h, i) => (
                <li key={i} className="text-xs text-ink-2">
                  <span className="mono text-[11px] text-ink-3">{h.kind}</span>{' '}
                  <span className="font-medium">{h.name}</span>
                  <div className="text-ink-3">{h.reason}</div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {verdict.warnings.length > 0 && (
          <ul className="space-y-1">
            {verdict.warnings.map((w, i) => (
              <li key={i} className="text-xs text-ink-3">• {w}</li>
            ))}
          </ul>
        )}

        {critical && (
          <div>
            <label className="label">
              Type <span className="mono font-semibold">{confirmPhrase}</span> to apply anyway
            </label>
            <input
              className="input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={confirmPhrase}
              autoComplete="off"
            />
          </div>
        )}

        {deviceId ? (
          <ReadinessNote readiness={readiness} blocking />
        ) : (
          <p className="text-xs text-ink-3">
            This change requires auto-revert: if the device can&apos;t arm it, the change is
            refused rather than applied without a way back.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onCancel} className="btn-secondary" disabled={pending}>Cancel</button>
          <button
            onClick={onConfirm}
            disabled={pending || !canConfirm}
            className={`px-4 py-1.5 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center gap-2 ${
              critical ? 'bg-bad hover:bg-bad' : 'bg-warn hover:bg-warn'
            }`}
          >
            {pending && <RefreshCw className="w-4 h-4 animate-spin" />}
            Apply anyway
          </button>
        </div>
      </div>
    </div>
  );
}

/** Shape returned by guarded endpoints so callers can report the outcome. */
export interface GuardResult {
  protected: boolean;
  confirmed: boolean;
  auto_reverting: boolean;
  unprotected_reason: string | null;
  /** Set when the change was kept but its revert could not be proven removed. */
  revert_may_fire_at?: string | null;
  /** The revert's scheduler was gone before the commit could disable it. */
  revert_may_have_fired?: boolean;
}

/** Human-readable outcome for a guarded change, or null when nothing to say. */
export function guardOutcomeMessage(guard?: GuardResult): { tone: 'ok' | 'warn'; text: string } | null {
  if (!guard) return null;
  if (guard.revert_may_have_fired) {
    return {
      tone: 'warn',
      text: 'The change was applied and the device stayed reachable, but its auto-revert was gone '
        + 'before it could be cancelled, so the revert may already have run. The device may have '
        + 'restored its previous configuration (in binary mode, with a restart). Check whether the '
        + 'change is still there.',
    };
  }
  if (guard.auto_reverting) {
    return {
      tone: 'warn',
      text: 'The device stopped responding after this change, so it is restoring itself to the '
        + 'previous configuration. It should come back shortly — the change was not kept.',
    };
  }
  if (guard.revert_may_fire_at) {
    return {
      tone: 'warn',
      text: 'Applied and the device is reachable, but the auto-revert could not be confirmed as '
        + 'removed. The device may restore its previous configuration (and restart) at about '
        + `${new Date(guard.revert_may_fire_at).toLocaleTimeString()}. Check its scheduler for an `
        + 'entry starting "mtm-revert-".',
    };
  }
  if (guard.confirmed) {
    return { tone: 'ok', text: 'Applied — device confirmed still reachable.' };
  }
  if (guard.unprotected_reason) {
    return { tone: 'warn', text: `Applied without auto-revert protection: ${guard.unprotected_reason}` };
  }
  return null;
}

// ─── Shared handling for guarded writes ───────────────────────────────────────

export interface PendingLockout {
  verdict: LockoutVerdict;
  /** Re-sends the same change with the lockout warning confirmed. */
  retry: () => void;
}

/**
 * State and callbacks for a screen whose writes run under Change Guard: a
 * predicted lockout opens the verdict dialog with a retry, and an outcome
 * worth knowing about (auto-reverting, unprotected) becomes a notice.
 * Pair with <GuardedWriteUi>.
 */
export function useGuardedWrite() {
  const [lockout, setLockout] = useState<PendingLockout | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** onError for a mutation: a lockout opens the dialog, anything else goes to `fallback`. */
  const onError = (retry: () => void, fallback: (e: unknown) => void) => (e: unknown) => {
    const verdict = lockoutVerdictOf(e);
    if (verdict) setLockout({ verdict, retry });
    else fallback(e);
  };

  /** onSuccess for a mutation: shows the guard outcome when it needs attention. */
  const onSuccess = (res: unknown) => {
    setLockout(null);
    const msg = guardOutcomeMessage((res as { data?: { guard?: GuardResult } } | undefined)?.data?.guard);
    setNotice(msg?.tone === 'warn' ? msg.text : null);
  };

  return { lockout, setLockout, notice, setNotice, onError, onSuccess };
}

export function GuardedWriteUi({
  state, deviceId, deviceName, pending,
}: {
  state: ReturnType<typeof useGuardedWrite>;
  deviceId: number;
  deviceName?: string;
  pending?: boolean;
}) {
  return (
    <>
      {state.notice && (
        <div className="p-3 bg-warn-bg border border-warn dark:border-warn rounded-lg text-sm text-warn dark:text-warn flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span className="flex-1">{state.notice}</span>
          <button onClick={() => state.setNotice(null)} className="text-xs underline">Dismiss</button>
        </div>
      )}
      {state.lockout && (
        <LockoutVerdictDialog
          verdict={state.lockout.verdict}
          confirmPhrase={deviceName || 'confirm'}
          deviceId={deviceId}
          pending={pending}
          onConfirm={state.lockout.retry}
          onCancel={() => state.setLockout(null)}
        />
      )}
    </>
  );
}
