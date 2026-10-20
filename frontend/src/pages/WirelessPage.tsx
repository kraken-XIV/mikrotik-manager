import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Wifi, CheckCircle, XCircle, HelpCircle, Users, RefreshCw, ExternalLink,
} from 'lucide-react';
import { wirelessApi } from '../services/api';
import type { WirelessAP } from '../types';
import RfHealth from '../components/wireless/RfHealth';
import RogueApsCard from '../components/wireless/RogueApsCard';
import CapsmanPanel from '../components/wireless/CapsmanPanel';
import clsx from 'clsx';

function timeAgo(ts: string | undefined): string {
  if (!ts) return 'Never';
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
      status === 'online'  ? 'bg-good-bg text-good' :
      status === 'offline' ? 'bg-bad-bg text-bad dark:text-bad' :
                             'bg-surface-3 text-ink-2'
    )}>
      <span className={clsx('w-1.5 h-1.5 rounded-full',
        status === 'online' ? 'bg-good' : status === 'offline' ? 'bg-bad' : 'bg-surface-3'
      )} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default function WirelessPage() {
  const { data: aps = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['wireless-aps'],
    queryFn: () => wirelessApi.list().then(r => r.data as WirelessAP[]),
    refetchInterval: 30_000,
  });

  const online  = aps.filter(a => a.status === 'online').length;
  const offline = aps.filter(a => a.status === 'offline').length;
  const unknown = aps.filter(a => a.status !== 'online' && a.status !== 'offline').length;
  const totalClients = aps.reduce((s, a) => s + (Number(a.client_count) || 0), 0);

  const kpis = [
    { label: 'Total APs',       value: aps.length,    icon: Wifi,        color: 'text-accent',   bg: 'bg-accent-soft' },
    { label: 'Online',          value: online,         icon: CheckCircle, color: 'text-good', bg: 'bg-good-bg' },
    { label: 'Offline',         value: offline,        icon: XCircle,     color: 'text-bad',     bg: 'bg-bad-bg' },
    { label: 'Unknown',         value: unknown,        icon: HelpCircle,  color: 'text-warn', bg: 'bg-warn-bg' },
    { label: 'Wireless Clients', value: totalClients,  icon: Users,       color: 'text-violet dark:text-violet', bg: 'bg-violet-bg dark:bg-violet-bg' },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-ink-4">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />Loading wireless APs…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">Wireless</h1>
          <p className="text-sm text-ink-3 mt-0.5">
            Overview of all managed wireless access points
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <RefreshCw className={clsx('w-4 h-4', isFetching && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {kpis.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="card p-4">
            <div className="flex items-center gap-3">
              <div className={clsx('p-2 rounded-lg', bg)}>
                <Icon className={clsx('w-4 h-4', color)} />
              </div>
              <div>
                <div className="text-2xl font-bold text-ink">{value}</div>
                <div className="text-xs text-ink-3">{label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* RF Health — channel map, density, TX retries, connectivity */}
      {aps.length > 0 && <RfHealth />}

      {/* Rogue & neighbor AP detection (from stored AP scans) */}
      {aps.length > 0 && <RogueApsCard />}

      <CapsmanPanel />

      {/* AP table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-line">
          <h2 className="text-sm font-semibold text-ink">Access Points</h2>
        </div>

        {aps.length === 0 ? (
          <div className="p-10 text-center text-ink-3 text-sm">
            No wireless APs found — add a device with type <strong>Wireless AP</strong> in Devices.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2/50">
                  <th className="px-4 py-3 text-left font-medium text-ink-3">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-ink-3">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-ink-3">Model</th>
                  <th className="px-4 py-3 text-left font-medium text-ink-3">IP Address</th>
                  <th className="px-4 py-3 text-center font-medium text-ink-3">Radios</th>
                  <th className="px-4 py-3 text-center font-medium text-ink-3">Active SSIDs</th>
                  <th className="px-4 py-3 text-center font-medium text-ink-3">Clients</th>
                  <th className="px-4 py-3 text-left font-medium text-ink-3">ROS Version</th>
                  <th className="px-4 py-3 text-left font-medium text-ink-3">Last Seen</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line/50">
                {aps.map((ap) => (
                  <tr key={ap.id} className="hover:bg-surface-2/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        to={`/devices/${ap.id}`}
                        className="font-medium text-accent hover:underline"
                      >
                        {ap.name}
                      </Link>
                      {ap.rack_name && (
                        <div className="text-xs text-ink-3 mt-0.5">
                          {ap.rack_name}{ap.rack_slot ? ` / ${ap.rack_slot}` : ''}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={ap.status} />
                    </td>
                    <td className="px-4 py-3 text-ink-2">
                      {ap.model || <span className="text-ink-3">—</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-2">
                      {ap.ip_address}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-medium text-ink">
                        {Number(ap.radio_count) || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-medium text-ink">
                        {Number(ap.ssid_count) || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={clsx(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                        Number(ap.client_count) > 0
                          ? 'bg-accent-soft text-accent dark:text-accent'
                          : 'bg-surface-2 dark:bg-surface-3 text-ink-3'
                      )}>
                        <Users className="w-3 h-3" />
                        {Number(ap.client_count) || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-3 font-mono">
                      {ap.ros_version || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-3">
                      {timeAgo(ap.last_seen)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/devices/${ap.id}`}
                        className="p-1.5 rounded-lg text-ink-4 hover:text-accent hover:bg-accent-soft dark:hover:bg-accent-soft transition-colors"
                        title="Open device detail"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
