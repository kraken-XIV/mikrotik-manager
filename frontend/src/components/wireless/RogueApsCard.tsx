import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert, Radio, ChevronDown, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { wirelessApi } from '../../services/api';
import { formatDistanceToNow } from 'date-fns';

function signalCls(dbm: number): string {
  if (dbm >= -55) return 'text-good';
  if (dbm >= -70) return 'text-warn';
  return 'text-ink-3';
}

export default function RogueApsCard() {
  const [showNeighbors, setShowNeighbors] = useState(false);
  const { data } = useQuery({
    queryKey: ['rogue-aps'],
    queryFn: () => wirelessApi.getRogueAps().then(r => r.data),
    refetchInterval: 5 * 60_000,
  });

  const rogues = data?.rogues ?? [];
  const neighbors = data?.neighbors ?? [];
  const hasScans = (data?.scannedDevices ?? 0) > 0;

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 border-b border-line flex items-center gap-2">
        <ShieldAlert className={clsx('w-4 h-4', rogues.length > 0 ? 'text-bad' : 'text-good')} />
        <h2 className="text-sm font-semibold text-ink-2 dark:text-ink">Rogue &amp; Neighbor APs</h2>
        <span className="ml-auto text-[11px] text-ink-3">
          {data?.lastScanAt
            ? `last scan ${formatDistanceToNow(new Date(data.lastScanAt))} ago · ${data.scannedDevices} AP${data.scannedDevices !== 1 ? 's' : ''}`
            : 'no scans yet'}
        </span>
      </div>

      {!hasScans ? (
        <div className="p-6 text-center text-sm text-ink-3">
          No AP scan data yet. Run a <strong>Nearby Access Points</strong> scan from a device&apos;s Radios tab
          (or enable scheduled scans in Wireless Settings) to detect evil twins and map neighboring networks.
        </div>
      ) : (
        <div>
          {/* Rogues */}
          {rogues.length === 0 ? (
            <div className="px-5 py-3 flex items-center gap-2 text-sm text-good">
              <span className="w-2 h-2 rounded-full bg-good" />
              No rogue APs — nothing is spoofing your SSIDs.
            </div>
          ) : (
            <div className="divide-y divide-red-100 dark:divide-red-900/30">
              {rogues.map(r => (
                <div key={r.bssid} className="px-5 py-3 bg-red-50/60 dark:bg-bad-bg flex items-start gap-3">
                  <ShieldAlert className="w-4 h-4 text-bad mt-0.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-bad dark:text-bad">
                      Foreign AP broadcasting &quot;{r.ssid}&quot; — possible evil twin
                    </div>
                    <div className="text-xs text-ink-3 mt-0.5 font-mono">
                      {r.bssid}{r.vendor ? ` (${r.vendor})` : ''} · {r.band} · seen by {r.seenBy}
                    </div>
                  </div>
                  <span className={clsx('font-mono text-xs flex-shrink-0', signalCls(r.signal))}>{r.signal} dBm</span>
                </div>
              ))}
            </div>
          )}

          {/* Neighbors (collapsed) */}
          <button onClick={() => setShowNeighbors(v => !v)}
            className="w-full px-5 py-2.5 flex items-center gap-2 text-xs text-ink-3 hover:bg-surface-2/40 transition-colors border-t border-line-soft/60">
            {showNeighbors ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <Radio className="w-3.5 h-3.5" />
            {neighbors.length} neighboring network{neighbors.length !== 1 ? 's' : ''} detected
          </button>
          {showNeighbors && neighbors.length > 0 && (
            <div className="overflow-x-auto border-t border-line-soft/60">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-2/40">
                    <th className="px-4 py-2 text-left text-xs font-semibold text-ink-3 uppercase">SSID</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-ink-3 uppercase">BSSID / Vendor</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-ink-3 uppercase">Band</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-ink-3 uppercase">Security</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-ink-3 uppercase">Signal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/50">
                  {neighbors.slice(0, 25).map((n, i) => (
                    <tr key={n.bssid} className={clsx(i % 2 === 0 ? 'bg-surface/20' : 'bg-surface-2/40')}>
                      <td className="px-4 py-2 text-ink">{n.ssid}</td>
                      <td className="px-4 py-2 font-mono text-xs text-ink-3">{n.bssid}{n.vendor ? ` (${n.vendor})` : ''}</td>
                      <td className="px-4 py-2 text-xs text-ink-3">{n.band}</td>
                      <td className="px-4 py-2 text-xs text-ink-3">{n.security || '—'}</td>
                      <td className={clsx('px-4 py-2 text-right font-mono text-xs', signalCls(n.signal))}>{n.signal} dBm</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
