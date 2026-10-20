import { useState } from 'react';
import { useRememberedRange } from '../hooks/useRememberedRange';
import { Link } from 'react-router-dom';
import LoadError from '../components/common/LoadError';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { chartTooltip, pieTooltip } from '../components/common/chartTooltip';
import { Activity, ArrowDown, ArrowUp, BarChart3, Router as RouterIcon, Settings2, AlertTriangle } from 'lucide-react';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import { trafficApi } from '../services/api';

type Range = '1h' | '24h' | '7d' | '30d';
const RANGES: Range[] = ['1h', '24h', '7d', '30d'];

const APP_COLORS = [
  '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4',
  '#ec4899', '#84cc16', '#f97316', '#6366f1', '#14b8a6', '#a855f7',
  '#64748b', '#0ea5e9', '#d946ef', '#22c55e',
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes < 1024 ** 4) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  return `${(bytes / 1024 ** 4).toFixed(2)} TB`;
}

function formatCount(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return `${(n / 1_000_000_000).toFixed(2)}B`;
}

function timeFormatter(range: Range) {
  return (t: string) => {
    try {
      const d = parseISO(t);
      return range === '7d' || range === '30d' ? format(d, 'MMM d') : format(d, 'HH:mm');
    } catch {
      return t;
    }
  };
}

function clientLabel(c: { mac: string; custom_name: string | null; hostname: string | null; vendor: string | null }): string {
  if (c.mac === 'unknown') return 'Unattributed (local)';
  if (c.mac === 'other') return 'Other clients';
  return c.custom_name || c.hostname || c.vendor || c.mac;
}

export default function TrafficAnalyticsPage() {
  const [range, setRange] = useRememberedRange<Range>('traffic-analytics', '24h', RANGES);
  // Top Talkers was a fixed list of ten with no way to look anything up, which
  // is unusable on a network of any size — you could see the loudest ten and
  // nothing else. Filtering happens client-side because the rows are already
  // here; asking the server again per keystroke would be slower and no more
  // accurate.
  const [clientQuery, setClientQuery] = useState('');
  const [topLimit, setTopLimit] = useState(10);
  const navigate = useNavigate();

  const { data: series = [], isLoading: seriesLoading, isError: seriesError, error: seriesErr } = useQuery({
    queryKey: ['traffic-timeseries', range],
    queryFn: () => trafficApi.timeseries(range).then(r => r.data),
    refetchInterval: 60_000,
  });

  const { data: topClients = [], isLoading: clientsLoading, isError: clientsError } = useQuery({
    queryKey: ['traffic-top-clients', range, topLimit],
    queryFn: () => trafficApi.topClients(range, topLimit).then(r => r.data),
    refetchInterval: 60_000,
  });

  const { data: apps = [], isLoading: appsLoading, isError: appsError } = useQuery({
    queryKey: ['traffic-apps', range],
    queryFn: () => trafficApi.apps(range).then(r => r.data),
    refetchInterval: 60_000,
  });

  const { data: status } = useQuery({
    queryKey: ['traffic-status'],
    queryFn: () => trafficApi.status().then(r => r.data),
    refetchInterval: 30_000,
  });

  const isLoading = seriesLoading || clientsLoading || appsLoading;
  const hasData = series.length > 0 || topClients.length > 0 || apps.length > 0;

  const totalUpload = series.reduce((s, p) => s + p.upload, 0);
  const totalDownload = series.reduce((s, p) => s + p.download, 0);
  const totalAppBytes = apps.reduce((s, a) => s + a.bytes, 0);
  const maxClientBytes = topClients[0]?.total_bytes || 1;

  // Match on anything the row actually shows — name, IP, MAC or vendor — so a
  // search for "192.168.1." or "apple" both behave the way people expect.
  const visibleClients = (() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return topClients;
    return topClients.filter((c) =>
      [clientLabel(c), c.ip_address, c.mac, c.vendor]
        .some((v) => v && String(v).toLowerCase().includes(q))
    );
  })();

  // Collector data-health: how much of the received traffic we could attribute
  const exporters = [...(status?.exporters || [])].sort((a, b) => b.flows - a.flows);
  const pktReceived = status?.packetsReceived || 0;
  const pktUnattributed = status?.packetsFromUnknownExporter || 0;
  const attributionRate = pktReceived > 0 ? ((pktReceived - pktUnattributed) / pktReceived) * 100 : 0;

  // Donut: top 8 categories, rest folded into "Other"
  const donutData = (() => {
    const top = apps.slice(0, 8);
    const rest = apps.slice(8).reduce((s, a) => s + a.bytes, 0);
    return rest > 0 ? [...top, { app: 'Other', bytes: rest }] : top;
  })();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">Traffic</h1>
          <p className="text-sm text-ink-3">Per-client traffic analytics from NetFlow/IPFIX</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="card p-1 flex rounded-lg gap-1">
            {RANGES.map(r => (
              <button key={r} onClick={() => setRange(r)}
                className={clsx('px-3 py-1 rounded-md text-sm font-medium transition-colors',
                  range === r
                    ? 'bg-accent text-accent-fg shadow-sm'
                    : 'text-ink-2 hover:bg-surface-3')}>
                {r}
              </button>
            ))}
          </div>
          <Link to="/network-services/netflow"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line text-sm text-ink-2 hover:bg-surface-3 transition-colors">
            <Settings2 className="w-3.5 h-3.5" />Configure
          </Link>
        </div>
      </div>

      {/* Empty state */}
      {/* A failed read is an error, not "set up NetFlow" (outside review J3). */}
      {(seriesError || clientsError || appsError) && (
        <div className="card"><LoadError what="traffic data" error={seriesErr} /></div>
      )}

      {!isLoading && !hasData && !(seriesError || clientsError || appsError) && (
        <div className="card p-12 text-center space-y-3">
          <Activity className="w-10 h-10 mx-auto text-ink-4" />
          <h2 className="text-sm font-semibold text-ink-2 dark:text-ink">No traffic data yet</h2>
          <p className="text-sm text-ink-3 max-w-md mx-auto">
            Enable the NetFlow collector and turn on traffic export for your routers to start
            collecting per-client usage and protocol analytics.
          </p>
          <Link to="/network-services/netflow"
            className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-accent hover:bg-accent text-accent-fg text-sm font-medium rounded-lg transition-colors">
            <Settings2 className="w-3.5 h-3.5" />Set up NetFlow
          </Link>
        </div>
      )}

      {hasData && (
        <>
          {/* Totals */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="card p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-accent-soft dark:bg-accent-soft">
                <ArrowDown className="w-5 h-5 text-accent" />
              </div>
              <div>
                <div className="text-xs text-ink-3">Download ({range})</div>
                <div className="text-lg font-bold text-ink">{formatBytes(totalDownload)}</div>
              </div>
            </div>
            <div className="card p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-violet-bg dark:bg-violet-bg">
                <ArrowUp className="w-5 h-5 text-violet dark:text-violet" />
              </div>
              <div>
                <div className="text-xs text-ink-3">Upload ({range})</div>
                <div className="text-lg font-bold text-ink">{formatBytes(totalUpload)}</div>
              </div>
            </div>
          </div>

          {/* Throughput chart */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-ink-2 dark:text-ink mb-4">Network Traffic</h2>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={series}>
                <defs>
                  <linearGradient id="dl" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="ul" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-slate-700" />
                <XAxis dataKey="time" tickFormatter={timeFormatter(range)} tick={{ fontSize: 11 }} stroke="currentColor" />
                <YAxis tickFormatter={v => formatBytes(v)} tick={{ fontSize: 11 }} width={70} stroke="currentColor" />
                <Tooltip
                  labelFormatter={t => { try { return format(parseISO(String(t)), 'MMM d, HH:mm'); } catch { return String(t); } }}
                  formatter={(value: number, name: string) => [formatBytes(value), name === 'download' ? 'Download' : 'Upload']}
                  {...chartTooltip}
                />
                <Legend formatter={(v: string) => (v === 'download' ? 'Download' : 'Upload')} />
                <Area type="monotone" dataKey="download" stroke="#3b82f6" fill="url(#dl)" strokeWidth={2} />
                <Area type="monotone" dataKey="upload" stroke="#8b5cf6" fill="url(#ul)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Inbound packets chart */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-ink-2 dark:text-ink mb-4">Inbound Packets</h2>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={series}>
                <defs>
                  <linearGradient id="pktIn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-slate-700" />
                <XAxis dataKey="time" tickFormatter={timeFormatter(range)} tick={{ fontSize: 11 }} stroke="currentColor" />
                <YAxis tickFormatter={v => formatCount(v)} tick={{ fontSize: 11 }} width={55} stroke="currentColor" />
                <Tooltip
                  labelFormatter={t => { try { return format(parseISO(String(t)), 'MMM d, HH:mm'); } catch { return String(t); } }}
                  formatter={(value: number) => [`${formatCount(value)} pkts`, 'Inbound']}
                  {...chartTooltip}
                />
                <Area type="monotone" dataKey="downloadPackets" stroke="#10b981" fill="url(#pktIn)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Top talkers */}
            <div className="card overflow-hidden">
              <div className="px-5 py-3 border-b border-line space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <BarChart3 className="w-4 h-4 text-accent" />
                  <h2 className="text-sm font-semibold text-ink-2 dark:text-ink">Top Talkers</h2>
                  <span className="text-xs text-ink-3 ml-auto">
                    {clientQuery.trim()
                      ? `${visibleClients.length} of ${topClients.length}`
                      : `top ${topClients.length}`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={clientQuery}
                    onChange={(e) => setClientQuery(e.target.value)}
                    placeholder="Filter by IP, name, MAC or vendor…"
                    className="input text-xs py-1 flex-1 min-w-0"
                  />
                  <select
                    value={topLimit}
                    onChange={(e) => setTopLimit(Number(e.target.value))}
                    className="input text-xs py-1 w-auto"
                    title="How many clients to rank"
                  >
                    {[10, 25, 50].map((n) => <option key={n} value={n}>Top {n}</option>)}
                  </select>
                </div>
              </div>
              {topClients.length === 0
                ? <div className="p-6 text-center text-sm text-ink-3">No client traffic recorded.</div>
                : visibleClients.length === 0
                ? <div className="p-6 text-center text-sm text-ink-3">
                    No client in the top {topClients.length} matches “{clientQuery.trim()}”.
                  </div>
                : (
                  <div className="divide-y divide-line-soft dark:divide-line-soft">
                    {visibleClients.map(c => {
                      const isReal = c.mac !== 'unknown' && c.mac !== 'other';
                      return (
                        <div key={c.mac}
                          onClick={() => isReal && navigate(`/clients/${encodeURIComponent(c.mac)}`)}
                          className={clsx('px-5 py-2', isReal && 'cursor-pointer hover:bg-accent-soft dark:hover:bg-surface-3 transition-colors')}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="min-w-0">
                              <span className="text-sm font-medium text-ink truncate">{clientLabel(c)}</span>
                              {isReal && (
                                <span className="ml-2 font-mono text-xs text-ink-3">{c.ip_address || c.mac}</span>
                              )}
                            </div>
                            <span className="text-sm font-semibold text-ink-2 dark:text-ink flex-shrink-0">{formatBytes(c.total_bytes)}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
                            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, (c.total_bytes / maxClientBytes) * 100)}%` }} />
                          </div>
                          <div className="mt-0.5 flex gap-3 text-xs text-ink-3">
                            <span className="inline-flex items-center gap-0.5"><ArrowDown className="w-3 h-3" />{formatBytes(c.download_bytes)}</span>
                            <span className="inline-flex items-center gap-0.5"><ArrowUp className="w-3 h-3" />{formatBytes(c.upload_bytes)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
            </div>

            {/* Right column: protocol breakdown + data health, stacked to align with Top Talkers */}
            <div className="space-y-6">
            {/* App categories */}
            <div className="card overflow-hidden">
              <div className="px-5 py-3 border-b border-line flex items-center gap-2">
                <Activity className="w-4 h-4 text-info" />
                <h2 className="text-sm font-semibold text-ink-2 dark:text-ink">Traffic by Application</h2>
              </div>
              {apps.length === 0
                ? <div className="p-6 text-center text-sm text-ink-3">No application data recorded.</div>
                : (
                  <div className="p-5 flex flex-col sm:flex-row sm:items-center gap-5">
                    {/* Donut — grows to fill the available space */}
                    <div className="relative w-full sm:w-1/2 flex-shrink-0">
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                          <Pie data={donutData} dataKey="bytes" nameKey="app" innerRadius="58%" outerRadius="92%" paddingAngle={1.5} stroke="none">
                            {donutData.map((entry, i) => (
                              <Cell key={entry.app} fill={APP_COLORS[i % APP_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value: number, name: string) => [
                              `${formatBytes(value)}${totalAppBytes > 0 ? ` · ${((value / totalAppBytes) * 100).toFixed(1)}%` : ''}`,
                              name,
                            ]}
                            {...pieTooltip}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      {/* Center label */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-[11px] uppercase tracking-wide text-ink-3">Total</span>
                        <span className="text-base font-bold text-ink">{formatBytes(totalAppBytes)}</span>
                      </div>
                    </div>
                    {/* Legend — uses the vertical space beside the donut */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      {apps.slice(0, 12).map((a, i) => (
                        <div key={a.app} className="flex items-center gap-2 text-sm">
                          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: APP_COLORS[i % APP_COLORS.length] }} />
                          <span className="text-ink-2 flex-1 truncate">{a.app}</span>
                          <span className="text-ink-3 text-xs w-12 text-right">
                            {totalAppBytes > 0 ? `${((a.bytes / totalAppBytes) * 100).toFixed(1)}%` : ''}
                          </span>
                          <span className="font-medium text-ink w-20 text-right">{formatBytes(a.bytes)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </div>

            {/* Flow sources & data health */}
            <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-line flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <RouterIcon className="w-4 h-4 text-info" />
                <h2 className="text-sm font-semibold text-ink-2 dark:text-ink">Flow Sources &amp; Data Health</h2>
              </div>
              <span className={clsx('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium',
                status?.listening
                  ? 'bg-good-bg text-good dark:bg-good-bg dark:text-good'
                  : 'bg-surface-3 text-ink-3 dark:bg-surface-3 dark:text-ink-3')}>
                <span className={clsx('w-1.5 h-1.5 rounded-full', status?.listening ? 'bg-good' : 'bg-surface-3')} />
                {status?.listening ? `Listening :${status.port}` : 'Collector stopped'}
              </span>
            </div>
            <div className="p-5 space-y-4">
              {/* The charts and the sources below follow the site selector; the
                  collector's own counters cover everything it receives (#236). */}
              {status?.site_filtered && (
                <p className="text-xs text-ink-3">
                  Showing this site&apos;s flow sources. Packet and attribution counts cover the whole collector.
                </p>
              )}
              {/* Health summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <div className="text-xs text-ink-3">Packets received{status?.site_filtered ? ' (all sites)' : ''}</div>
                  <div className="text-base font-bold text-ink">{formatCount(pktReceived)}</div>
                </div>
                <div>
                  <div className="text-xs text-ink-3">Flows attributed{status?.site_filtered ? ' (all sites)' : ''}</div>
                  <div className="text-base font-bold text-ink">{formatCount(status?.flowsAttributed || 0)}</div>
                </div>
                <div>
                  <div className="text-xs text-ink-3">Attribution rate{status?.site_filtered ? ' (all sites)' : ''}</div>
                  <div className={clsx('text-base font-bold',
                    attributionRate >= 90 ? 'text-good'
                      : attributionRate >= 60 ? 'text-warn'
                        : 'text-bad')}>
                    {pktReceived > 0 ? `${attributionRate.toFixed(0)}%` : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-ink-3">{status?.site_filtered ? 'Exporting devices here' : 'Exporting devices'}</div>
                  <div className="text-base font-bold text-ink">{exporters.length}</div>
                </div>
              </div>

              {/* Low-attribution hint */}
              {pktReceived > 0 && attributionRate < 90 && (
                <div className="flex items-start gap-2 text-xs text-warn bg-warn-bg rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>
                    {formatCount(pktUnattributed)} packets came from an unrecognized exporter (often NAT in the path).
                    Their traffic is still counted but may not map to the right device.
                  </span>
                </div>
              )}

              {/* Per-exporter rows */}
              {exporters.length === 0
                ? <div className="text-sm text-ink-3">{status?.site_filtered ? 'No routers in this site have exported flows yet.' : 'No routers have exported flows yet.'} <Link to="/network-services/netflow" className="text-accent hover:underline">Configure NetFlow export →</Link></div>
                : (
                  <div className="divide-y divide-line-soft dark:divide-line-soft -mb-1">
                    {exporters.map(e => (
                      <div key={e.deviceId} className="flex items-center justify-between py-2 gap-3">
                        <div className="min-w-0 flex items-center gap-2">
                          <RouterIcon className="w-3.5 h-3.5 text-ink-3 flex-shrink-0" />
                          <span className="text-sm text-ink-2 dark:text-ink truncate">{e.deviceName}</span>
                        </div>
                        <div className="flex items-center gap-4 flex-shrink-0 text-xs text-ink-3">
                          <span>{formatCount(e.flows)} flows</span>
                          <span>{formatCount(e.packets)} pkts</span>
                          <span className="w-24 text-right text-ink-3">
                            {e.lastSeen ? `${formatDistanceToNow(parseISO(e.lastSeen))} ago` : 'never'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </div>
            </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
