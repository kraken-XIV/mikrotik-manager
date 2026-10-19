import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, AlertTriangle, CheckCircle2, Clock, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { useIsFleetAdmin } from '../../hooks/useCanWrite';
import { pollerApi, type PollerHealth, type PollerPhases, settingsApi } from '../../services/api';

/**
 * The poller's own health, in the UI rather than buried in an API response.
 *
 * A fleet that outruns its workers presents as stale data everywhere, which
 * reads as a device problem rather than a capacity one. Making queue depth and
 * headroom visible is what turns "polling frequency is set by guesswork" into an
 * arithmetic question (#114).
 */

const STATUS: Record<
  PollerHealth['status'],
  { label: string; tone: string; icon: typeof Activity; blurb: string }
> = {
  ok: {
    label: 'Keeping up',
    tone: 'text-good bg-good-bg dark:text-good dark:bg-good-bg',
    icon: CheckCircle2,
    blurb: 'Workers are clearing polls faster than the schedule creates them.',
  },
  draining: {
    label: 'Working through a backlog',
    tone: 'text-warn bg-warn-bg dark:text-warn dark:bg-warn-bg',
    icon: Clock,
    blurb:
      'Capacity is sufficient, but queued work from earlier is still clearing. Devices poll late until it does.',
  },
  saturated: {
    label: 'Cannot keep up',
    tone: 'text-bad bg-bad-bg dark:text-bad dark:bg-bad-bg',
    icon: AlertTriangle,
    blurb:
      'Polls are being created faster than they can run, so the backlog grows every cycle and devices will go stale.',
  },
};

const fmtDuration = (sec: number | null): string => {
  if (sec == null) return 'not shrinking';
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)} min`;
  return `${(sec / 3600).toFixed(1)} h`;
};

function Stat({
  label,
  value,
  hint,
  alarm,
}: {
  label: string;
  value: string;
  hint?: string;
  alarm?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="text-xs text-ink-3">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${alarm ? 'text-bad' : 'text-ink'}`}>
        {value}
      </div>
      {hint && <div className="text-[11px] text-ink-3 mt-0.5">{hint}</div>}
    </div>
  );
}

/** Fallback capacity, so a partial or unexpected payload cannot blank the page. */
const EMPTY_CAPACITY: PollerHealth['capacity'] = {
  devices: 0,
  avg_fast_poll_ms: null,
  p90_fast_poll_ms: null,
  arrival_per_sec: 0,
  service_per_sec: null,
  headroom: null,
  backlog: 0,
  drain_eta_sec: 0,
};

export default function PollerHealthCard() {
  const queryClient = useQueryClient();
  const [drainResult, setDrainResult] = useState('');
  const [confirmDrain, setConfirmDrain] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['poller-health'],
    queryFn: () => pollerApi.health().then((r) => r.data),
    refetchInterval: 15_000,
  });

  const drain = useMutation({
    mutationFn: () => pollerApi.drain(),
    onSuccess: (res) => {
      setDrainResult(res.data.message);
      setConfirmDrain(false);
      queryClient.invalidateQueries({ queryKey: ['poller-health'] });
    },
  });

  if (isLoading) {
    return <div className="text-sm text-ink-3">Loading poller health…</div>;
  }

  /**
   * Failure has to be visible here of all places.
   *
   * This panel previously rendered "Loading…" forever on an error and threw
   * outright on an unexpected payload, blanking the whole page — the worst
   * possible behaviour for the one screen you open when monitoring looks broken.
   * Whatever comes back, say something useful about it.
   */
  if (isError || !data || typeof data !== 'object') {
    const msg = error as { response?: { data?: { error?: string } }; message?: string } | null;
    return (
      <div className="rounded-lg border border-bad bg-bad-bg p-4 text-sm dark:border-red-700/60 dark:bg-bad-bg">
        <div className="flex items-center gap-2 font-medium text-bad dark:text-bad">
          <AlertTriangle className="h-4 w-4" /> Could not read poller health
        </div>
        <p className="mt-1 text-bad dark:text-bad">
          {msg?.response?.data?.error ||
            msg?.message ||
            'The server returned an unexpected response.'}
        </p>
        <p className="mt-1 text-xs text-bad">
          Polling itself may still be running — this panel only reports on it. Check the backend
          logs if this persists.
        </p>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['poller-health'] })}
          className="btn-secondary mt-3 flex items-center gap-2 text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>
      </div>
    );
  }

  // Every field below is defaulted. A backend a version behind, or one that
  // answered partially, degrades the panel rather than destroying the page.
  const s = STATUS[data.status] ?? STATUS.ok;
  const Icon = s.icon;
  const cap = data.capacity ?? EMPTY_CAPACITY;
  const backlog = cap.backlog ?? 0;
  const queues = Array.isArray(data.queues) ? data.queues : [];
  const staleDevices = Array.isArray(data.stale_devices) ? data.stale_devices : [];
  const workers = data.workers ?? { concurrency: 0, job_timeout_ms: 0, poll_interval_ms: 0 };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <Icon className="w-5 h-5 mt-0.5 text-ink-3" />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-ink">Polling</h3>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${s.tone}`}>{s.label}</span>
            </div>
            <p className="text-sm text-ink-2 mt-0.5 max-w-2xl">{s.blurb}</p>
          </div>
        </div>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['poller-health'] })}
          className="btn-secondary flex items-center gap-2 text-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Capacity. headroom and backlog are shown together deliberately: headroom
          alone once reported "healthy" to an operator with 752k jobs queued. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat label="Devices" value={String(cap.devices ?? 0)} />
        <Stat
          label="Headroom"
          value={cap.headroom == null ? '—' : `${cap.headroom}×`}
          hint="capacity ÷ demand"
          alarm={cap.headroom != null && cap.headroom < 1}
        />
        <Stat
          label="Queued"
          value={backlog.toLocaleString()}
          hint={backlog > 0 ? `clears in ${fmtDuration(cap.drain_eta_sec)}` : 'nothing waiting'}
          alarm={backlog > cap.devices * 3}
        />
        <Stat
          label="Avg poll"
          value={cap.avg_fast_poll_ms == null ? '—' : `${cap.avg_fast_poll_ms} ms`}
        />
        <Stat
          label="Slowest (p90)"
          value={cap.p90_fast_poll_ms == null ? '—' : `${cap.p90_fast_poll_ms} ms`}
        />
        <Stat
          label="Workers"
          value={String(workers.concurrency)}
          hint={
            (workers.processes?.length ?? 0) > 1
              ? `in ${workers.processes!.length} processes · fast poll every ${workers.fast_interval_sec ?? '?'}s`
              : workers.fast_interval_sec
                ? `fast poll every ${workers.fast_interval_sec}s`
                : `${(workers.poll_interval_ms || 0) / 1000}s interval`
          }
        />
      </div>

      {data.phases && (
        <PhasesPanel
          phases={data.phases}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['poller-health'] })}
        />
      )}

      {cap.headroom != null && cap.headroom < 1.5 && (
        <div className="rounded-lg border border-warn bg-warn-bg p-3 text-xs dark:border-warn dark:bg-warn-bg">
          <div className="font-medium text-warn dark:text-warn">Little margin left</div>
          <p className="mt-0.5 text-warn dark:text-warn">
            Demand is {cap.arrival_per_sec}/s against {cap.service_per_sec ?? '—'}/s of capacity.
            Slow devices push individual polls well past the average, so bursts will fall behind
            even while the average looks fine. Raise <code>POLLER_CONCURRENCY</code> or lengthen the
            interval.
          </p>
        </div>
      )}

      {/* Queues */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-3 border-b border-line">
              <th className="py-2 pr-4 font-medium">Queue</th>
              <th className="py-2 pr-4 font-medium text-right">Waiting</th>
              <th className="py-2 pr-4 font-medium text-right">Active</th>
              <th className="py-2 pr-4 font-medium text-right">Failed</th>
            </tr>
          </thead>
          <tbody>
            {queues.map((q) => (
              <tr
                key={q.name}
                className="border-b border-line-soft dark:border-line-soft last:border-0"
              >
                <td className="py-2 pr-4 font-mono text-xs text-ink">{q.name}</td>
                <td
                  className={`py-2 pr-4 text-right tabular-nums ${
                    (q.waiting || 0) > 0 ? 'text-warn font-medium' : 'text-ink-2'
                  }`}
                >
                  {(q.waiting ?? 0).toLocaleString()}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums text-ink-2">{q.active ?? 0}</td>
                <td className="py-2 pr-4 text-right tabular-nums text-ink-2">{q.failed ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Clearing the queue */}
      <div className="rounded-lg border border-line p-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="text-xs text-ink-2 max-w-2xl">
            <span className="font-medium text-ink">Clear the queue.</span> Discards everything
            currently queued. Nothing is lost — the scheduler re-enqueues whatever is still due on
            its next cycle, so the cost is at most one interval of freshness. Stale polls are also
            dropped automatically once they are older than their own cadence.
          </div>
          {confirmDrain ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => drain.mutate()}
                disabled={drain.isPending}
                className="btn-danger text-xs flex items-center gap-1.5"
              >
                {drain.isPending ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Confirm clear
              </button>
              <button onClick={() => setConfirmDrain(false)} className="btn-secondary text-xs">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDrain(true)}
              disabled={backlog === 0}
              className="btn-secondary text-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear {backlog > 0 ? backlog.toLocaleString() : ''}{' '}
              queued
            </button>
          )}
        </div>
        {drainResult && <p className="mt-2 text-xs text-good">{drainResult}</p>}
      </div>

      {/* Which devices are actually being missed */}
      <div>
        <h4 className="text-sm font-medium text-ink mb-2">
          Devices not polled recently {staleDevices.length > 0 && `(${staleDevices.length})`}
        </h4>
        {staleDevices.length === 0 ? (
          <p className="text-xs text-ink-3">
            Every device has been polled successfully in the last few minutes.
          </p>
        ) : (
          <ul className="space-y-1.5 max-h-64 overflow-y-auto">
            {staleDevices.map((d) => (
              <li key={`${d.id}-${d.kind}`} className="text-xs flex flex-wrap gap-x-2 gap-y-0.5">
                <span className="font-medium text-ink">{d.name}</span>
                <span className="text-ink-3">
                  {d.last_success_at
                    ? `last success ${fmtDuration(d.seconds_since_success)} ago`
                    : 'never polled successfully'}
                </span>
                {/* Attempt vs success is the distinction that says whether we
                    missed it or it did not answer. */}
                {d.last_error ? (
                  <span className="text-bad">responded with: {d.last_error}</span>
                ) : (
                  <span className="text-warn">not attempted recently</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Where a fast poll's time goes (#301): opening a session (TCP, TLS, login)
 * against reusing one, and the work itself, with the switch for keeping
 * sessions open between polls.
 */
function PhasesPanel({ phases, onSaved }: { phases: PollerPhases; onSaved: () => void }) {
  const isFleetAdmin = useIsFleetAdmin();
  const save = useMutation({
    mutationFn: (v: {
      key: 'poller_persistent_sessions' | 'poller_pipelined_reads';
      on: boolean;
    }) => settingsApi.update({ [v.key]: v.on }),
    onSuccess: onSaved,
  });
  const ms = (v: number | null | undefined) => (v == null ? '—' : `${v} ms`);
  const other =
    phases.avg_collect_ms != null && phases.avg_device_ms != null
      ? Math.max(0, phases.avg_collect_ms - phases.avg_device_ms)
      : null;
  const slowest = phases.slowest ?? [];
  const widest = Math.max(1, ...slowest.map((r) => r.total_ms));
  return (
    <div className="rounded-lg border border-line p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-xs font-medium text-ink-2 dark:text-ink">
          Where a fast poll’s time goes
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <label
            className="flex items-center gap-1.5 text-xs text-ink-2"
            title="Off by default: each poll opens its own connection. On: one API session per device is kept open and reused, which saves the handshake and login on every poll"
          >
            <input
              type="checkbox"
              checked={phases.persistent_sessions}
              disabled={!isFleetAdmin || save.isPending}
              onChange={(e) =>
                save.mutate({ key: 'poller_persistent_sessions', on: e.target.checked })
              }
            />
            Keep sessions open between polls
          </label>
          <label
            className="flex items-center gap-1.5 text-xs text-ink-2"
            title="Send a fast poll’s reads together, in one round trip, instead of one after another"
          >
            <input
              type="checkbox"
              checked={phases.pipelined_reads}
              disabled={!isFleetAdmin || save.isPending}
              onChange={(e) => save.mutate({ key: 'poller_pipelined_reads', on: e.target.checked })}
            />
            Send reads together
          </label>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div>
          <div className="text-ink-3">Connecting</div>
          <div className="font-medium tabular-nums">{ms(phases.avg_connect_new_ms)}</div>
        </div>
        <div>
          <div className="text-ink-3">Waiting on the device</div>
          <div className="font-medium tabular-nums">{ms(phases.avg_device_ms)}</div>
        </div>
        <div>
          <div className="text-ink-3">Database and processing</div>
          <div className="font-medium tabular-nums">{ms(other)}</div>
        </div>
        <div>
          <div className="text-ink-3">Sessions kept open</div>
          <div className="font-medium tabular-nums">
            {phases.persistent_sessions ? (
              <>
                {phases.reused_pct == null ? '—' : `${phases.reused_pct}% reused`} ·{' '}
                {phases.open_sessions} open
                {phases.avg_connect_reused_ms != null
                  ? ` · ${phases.avg_connect_reused_ms} ms`
                  : ''}
              </>
            ) : (
              'Off'
            )}
          </div>
        </div>
      </div>
      <p className="text-[11px] text-ink-4">
        Connecting is a TCP and TLS handshake and a login: a few round trips, plus work on the
        router’s CPU. Waiting on the device is the round trips and the router answering; the rest is
        this server. Averages over the last fast poll of{' '}
        {phases.devices_measured === 1 ? 'one device' : `${phases.devices_measured} devices`}.
      </p>

      {slowest.length > 0 && (
        <div>
          <div className="flex items-center gap-3 text-[11px] text-ink-3 mb-1.5 flex-wrap">
            <span className="font-medium text-ink-2 dark:text-ink">Slowest fast polls</span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-warn" />
              connecting
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-accent" />
              waiting on the device
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-surface-3" />
              database and processing
            </span>
          </div>
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="text-ink-3 sticky top-0 bg-surface">
                <tr>
                  <th className="text-left font-medium py-1">Device</th>
                  <th className="text-right font-medium px-2">Total</th>
                  <th className="text-right font-medium px-2">Connect</th>
                  <th className="text-right font-medium px-2">Device</th>
                  <th className="text-right font-medium px-2">Other</th>
                  <th className="font-medium w-40" />
                </tr>
              </thead>
              <tbody>
                {slowest.map((r) => {
                  const w = (v: number | null) => `${((v ?? 0) / widest) * 100}%`;
                  return (
                    <tr
                      key={r.id}
                      className="border-t border-line-soft/50"
                      title={r.error ?? undefined}
                    >
                      <td className="py-1 pr-2 min-w-0">
                        <Link to={`/devices/${r.id}`} className="hover:underline text-ink">
                          {r.name}
                        </Link>
                        {r.site && <span className="text-ink-4"> · {r.site}</span>}
                        {r.reused && <span className="text-ink-4"> · reused session</span>}
                        {r.error && <span className="text-bad"> · failed</span>}
                      </td>
                      <td className="text-right px-2 tabular-nums font-medium">{r.total_ms} ms</td>
                      <td className="text-right px-2 tabular-nums">{ms(r.connect_ms)}</td>
                      <td className="text-right px-2 tabular-nums">{ms(r.device_ms)}</td>
                      <td className="text-right px-2 tabular-nums">{ms(r.other_ms)}</td>
                      <td className="pl-2">
                        <div
                          className="flex h-2 rounded-sm overflow-hidden bg-surface-3"
                          style={{ width: w(r.total_ms) }}
                        >
                          {r.connect_ms != null && r.device_ms != null ? (
                            <>
                              <div
                                className="bg-warn"
                                style={{
                                  width: `${(r.connect_ms / Math.max(1, r.total_ms)) * 100}%`,
                                }}
                              />
                              <div
                                className="bg-accent"
                                style={{
                                  width: `${(r.device_ms / Math.max(1, r.total_ms)) * 100}%`,
                                }}
                              />
                              <div className="bg-surface-3 flex-1" />
                            </>
                          ) : (
                            <div className="bg-surface-3 flex-1" />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
