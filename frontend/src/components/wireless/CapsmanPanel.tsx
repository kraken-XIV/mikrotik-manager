import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Server, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { wirelessApi, type CapsmanController } from '../../services/api';
import clsx from 'clsx';

/** One row of the unified radio/interface table. */
interface Row {
  key: string;
  deviceId: number | null;
  deviceName: string;
  local: boolean;
  interfaceName: string;
  ssid: string | null;
  channel: string | null;
  clients: number | null;
  running: boolean;
}

/**
 * Flatten a controller into one row per radio.
 *
 * Driven by the controller's radio list rather than by the CAPs' own interface rows.
 * A CAP holds no configuration — its rows report a generic name and null SSID, band
 * and frequency — whereas the controller knows the provisioned SSID, the operating
 * channel and the client count for every radio it manages.
 */
function toRows(c: CapsmanController): Row[] {
  const rows: Row[] = [];
  for (const ap of c.access_points) {
    for (const r of ap.radios) {
      rows.push({
        key: `${ap.device_id ?? ap.device_name}:${r.radio_mac}`,
        deviceId: ap.device_id,
        deviceName: ap.device_name,
        local: r.local,
        interfaceName: r.interface_name || r.radio_mac,
        ssid: r.ssid,
        channel: r.current_channel,
        clients: r.registered_peers,
        // Legacy CAPsMAN reports 'running-ap' (#250).
        running: (r.state ?? '').startsWith('running'),
      });
    }
  }
  return rows;
}

function Controller({ c }: { c: CapsmanController }) {
  const [open, setOpen] = useState(true);
  const unmanaged = c.access_points.filter((ap) => ap.device_id == null);
  const rows = toRows(c);

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-line"
      >
        {open ? <ChevronDown className="w-4 h-4 text-ink-4" /> : <ChevronRight className="w-4 h-4 text-ink-4" />}
        <Server className="w-4 h-4 text-accent" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to={`/devices/${c.id}`}
              onClick={(e) => e.stopPropagation()}
              className="text-sm font-semibold text-ink hover:text-accent dark:hover:text-accent"
            >
              {c.name}
            </Link>
            <span className="mono text-[11px] text-ink-4">{c.ip_address}</span>
            {c.wifi_role === 'controller_cap' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-soft dark:bg-accent-soft text-accent dark:text-accent font-medium">
                controller + local radios
              </span>
            )}
          </div>
          <div className="text-[11px] text-ink-3 mt-0.5">
            {c.access_points.length} access point{c.access_points.length !== 1 ? 's' : ''} ·{' '}
            {rows.length} radio{rows.length !== 1 ? 's' : ''} ·{' '}
            {c.client_count} client{c.client_count !== 1 ? 's' : ''}
          </div>
        </div>
      </button>

      {open && (
        <div className="p-4 space-y-4">
          {unmanaged.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-warn dark:border-warn bg-warn-bg p-3">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-warn" />
              <p className="text-sm text-warn dark:text-warn">
                {unmanaged.length} access point{unmanaged.length !== 1 ? 's are' : ' is'} provisioned by this
                controller but not added to the fleet. Add {unmanaged.length !== 1 ? 'them' : 'it'} to see
                clients, health and history.
              </p>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line">
                  {['Access point', 'Interface', 'SSID', 'Channel', 'Clients', 'Status'].map((h) => (
                    <th key={h} className="table-header px-3 py-2 text-left whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.key} className="hover:bg-surface-2/30">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {r.deviceId != null ? (
                          <Link to={`/devices/${r.deviceId}`} className="text-xs font-medium text-ink hover:text-accent dark:hover:text-accent">
                            {r.deviceName}
                          </Link>
                        ) : (
                          <span className="text-xs text-ink-3">{r.deviceName}</span>
                        )}
                        {r.local && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-surface-3 text-ink-2">local</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 mono text-xs text-ink-2 whitespace-nowrap">{r.interfaceName}</td>
                    <td className="px-3 py-2 text-xs font-medium text-ink">{r.ssid || <span className="text-ink-4">—</span>}</td>
                    <td className="px-3 py-2 mono text-xs text-ink-3 whitespace-nowrap">{r.channel || <span className="text-ink-4">—</span>}</td>
                    <td className="px-3 py-2 mono num-tab text-xs text-ink-2">
                      {r.clients ?? <span className="text-ink-4">—</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={clsx(
                        'text-[10px] px-1.5 py-0.5 rounded font-medium',
                        r.running ? 'bg-good-bg text-good'
                          : 'bg-warn-bg dark:bg-warn-bg text-warn dark:text-warn'
                      )}>
                        {r.running ? 'running' : 'idle'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {c.configurations.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-3 mb-2">
                Configurations
              </div>
              <div className="flex flex-wrap gap-2">
                {c.configurations.map((cfg) => (
                  <div key={cfg.name} className="rounded-lg border border-line px-3 py-2 max-w-sm">
                    <div className="text-xs font-medium text-ink">{cfg.name}</div>
                    <div className="text-[11px] text-ink-3 mt-0.5">
                      {[cfg.ssid && `SSID ${cfg.ssid}`, cfg.band, cfg.mode, cfg.security]
                        .filter(Boolean).join(' · ') || 'no details reported'}
                    </div>
                    {/* The rule and the configuration it applies are one idea. */}
                    {cfg.rules.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5 border-t border-line-soft pt-1.5">
                        {cfg.rules.map((p) => (
                          <li key={p.ros_id} className="text-[11px] text-ink-3">
                            <span className="mono text-ink-4">{p.action || 'rule'}</span>
                            {p.radio_mac && <span className="mono text-ink-4"> {p.radio_mac}</span>}
                            {p.disabled && <span className="text-ink-4"> · disabled</span>}
                            {p.comment && <span className="text-ink-4"> — {p.comment}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rules that reference no configuration we collected — worth surfacing
              rather than dropping, since that usually means a stale reference. */}
          {c.provisioning.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-3 mb-2">
                Unmatched provisioning rules
              </div>
              <ul className="space-y-1">
                {c.provisioning.map((p) => (
                  <li key={p.ros_id} className="text-[11px] text-ink-2">
                    <span className="mono text-ink-4">{p.action || 'rule'}</span>
                    {p.master_configuration && <> → <span className="font-medium">{p.master_configuration}</span></>}
                    {p.radio_mac && <span className="mono text-ink-4"> ({p.radio_mac})</span>}
                    {p.comment && <span className="text-ink-4"> — {p.comment}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CapsmanPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['capsman'],
    queryFn: () => wirelessApi.capsman().then((r) => r.data),
    refetchInterval: 60_000,
  });

  const controllers = data?.controllers ?? [];
  // Invisible on a fleet with no controller rather than an empty box to scroll past.
  if (isLoading || controllers.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 bg-accent-soft rounded-lg flex items-center justify-center">
          <Server className="w-3.5 h-3.5 text-accent" />
        </div>
        <h3 className="text-sm font-semibold text-ink">CAPsMAN</h3>
        <span className="text-[11px] text-ink-3">
          {controllers.length} controller{controllers.length !== 1 ? 's' : ''} · read-only
        </span>
      </div>
      <p className="text-xs text-ink-3">
        These access points are provisioned centrally, so their configuration lives on the controller
        rather than on the AP itself. Editing is intentionally not offered here yet: a CAPsMAN change
        applies to every bound AP at once.
      </p>
      {controllers.map((c) => <Controller key={c.id} c={c} />)}
    </div>
  );
}
