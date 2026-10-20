import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cpu, AlertTriangle, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { devicesApi } from '../../services/api';
import { useCanWrite } from '../../hooks/useCanWrite';

/**
 * L3 hardware offloading on the switch chip (#254): whether routing between
 * this device's VLANs runs in hardware or on the CPU, and a guarded switch to
 * turn it on or off. Only shown on devices with a chip that supports it
 * (Marvell 98DX: CRS3xx, CRS5xx, CCR2116, CCR2216).
 */
export default function L3HwCard({ deviceId }: { deviceId: number }) {
  const qc = useQueryClient();
  const canWrite = useCanWrite();
  const { data: v, isLoading } = useQuery({
    queryKey: ['l3hw', deviceId],
    queryFn: () => devicesApi.getL3Hw(deviceId).then((r) => r.data),
    staleTime: 60_000,
  });
  const [ack, setAck] = useState<{ forward: number; nat: number } | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const toggle = useMutation({
    mutationFn: ({ enabled, acknowledge }: { enabled: boolean; acknowledge?: boolean }) =>
      devicesApi.setL3Hw(deviceId, enabled, acknowledge),
    onSuccess: (r) => {
      setAck(null);
      setNote({ ok: true, text: r.data.message });
      void qc.invalidateQueries({ queryKey: ['l3hw', deviceId] });
      void qc.invalidateQueries({ queryKey: ['config-health', deviceId] });
    },
    onError: (e: unknown) => {
      const d = (e as { response?: { data?: { error?: string; reason?: string; needs_acknowledgement?: boolean; forward_rules?: number; nat_rules?: number } } })?.response?.data;
      if (d?.needs_acknowledgement) { setAck({ forward: d.forward_rules ?? 0, nat: d.nat_rules ?? 0 }); return; }
      setNote({ ok: false, text: d?.error || d?.reason || 'That didn’t work' });
    },
  });

  if (isLoading || !v?.supported) return null;
  const busy = toggle.isPending;

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Cpu className="w-4 h-4 text-info" />
        <h3 className="text-sm font-semibold text-ink">L3 hardware offloading</h3>
        <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium',
          v.enabled ? 'bg-good-bg text-good dark:bg-good-bg dark:text-good' : 'bg-surface-3 text-ink-2 dark:bg-surface-3 dark:text-ink-2')}>
          {v.enabled ? 'On' : 'Off'}
        </span>
        <span className="text-xs text-ink-3 font-mono">{v.switch?.type}</span>
        {canWrite && (
          <button className={clsx('ml-auto text-xs py-1', v.enabled ? 'btn-secondary' : 'btn-primary')} disabled={busy}
            onClick={() => { setNote(null); setAck(null); toggle.mutate({ enabled: !v.enabled }); }}>
            {busy ? <RefreshCw className="w-3 h-3 animate-spin inline mr-1" /> : null}
            {v.enabled ? 'Turn off' : 'Turn on'}
          </button>
        )}
      </div>

      <p className="text-xs text-ink-2">
        {v.routedVlans.length >= 2
          ? <>This device routes between {v.routedVlans.join(', ')}. </>
          : v.routedVlans.length === 1
            ? <>Only {v.routedVlans[0]} has an address here, so this device doesn&apos;t route between VLANs. </>
            : <>No VLAN interface has an address here, so this device doesn&apos;t route between VLANs. </>}
        {v.enabled
          ? <>Routing between VLAN interfaces on a hardware-offloaded, VLAN-filtering bridge runs in the switch chip at wire speed.</>
          : <>With offloading off, every routed packet goes through the CPU, at a fraction of the ports&apos; speed.</>}
      </p>
      {v.notOffloadable.length > 0 && (
        <p className="text-xs text-warn">
          {v.notOffloadable.map((n) => n.vlan).join(', ')} {v.notOffloadable.length === 1 ? 'sits' : 'sit'} on
          {' '}{[...new Set(v.notOffloadable.map((n) => n.bridge || 'an interface'))].join(', ')}, which doesn&apos;t have VLAN filtering on,
          so {v.notOffloadable.length === 1 ? 'its routes stay' : 'their routes stay'} on the CPU{v.enabled ? '' : ' even with offloading on'}.
          Turn on VLAN filtering on the bridge (VLANs tab) for them to be routed in hardware.
        </p>
      )}

      {v.enabled && (v.routesHw !== null || v.routesCpu !== null) && (
        <p className="text-xs text-ink-3"
          title="From /interface/ethernet/switch/l3hw-settings/monitor. Entries sent to the CPU include the device's own addresses, which it always handles itself.">
          In the switch chip: <span className="font-mono">{v.hostsHw ?? '—'}</span> host{v.hostsHw === 1 ? '' : 's'} and{' '}
          <span className="font-mono">{v.routesHw ?? '—'}</span> route{v.routesHw === 1 ? '' : 's'} · handled by the CPU:{' '}
          <span className="font-mono">{v.routesCpu ?? '—'}</span> (including the device&apos;s own addresses)
          {v.ipv6 ? '' : ' · IPv6 stays on the CPU'}
        </p>
      )}
      {v.portsOff.length > 0 && (
        <p className="text-xs text-ink-3">Turned off on these ports: <span className="font-mono">{v.portsOff.join(', ')}</span></p>
      )}

      {(v.forwardRules > 0 || v.natRules > 0) && (
        <div className="flex gap-2 p-2.5 rounded-lg border border-warn dark:border-warn bg-warn-bg text-xs text-warn dark:text-warn">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>
            Offloaded traffic bypasses the CPU, so {v.forwardRules} forward-chain firewall rule{v.forwardRules === 1 ? '' : 's'} and {v.natRules} NAT
            rule{v.natRules === 1 ? '' : 's'} on this device {v.enabled ? 'don’t' : 'wouldn’t'} apply to routed traffic. FastTracked connections can
            still be offloaded where the chip supports it.
          </span>
        </div>
      )}

      {ack && (
        <div className="p-3 rounded-lg border border-bad dark:border-bad bg-bad-bg text-xs space-y-2">
          <p className="text-bad dark:text-bad">
            {ack.forward} forward-chain firewall rule{ack.forward === 1 ? '' : 's'} and {ack.nat} NAT rule{ack.nat === 1 ? '' : 's'} will stop
            applying to traffic routed between these VLANs. Turn offloading on only if nothing relies on them for that traffic.
          </p>
          <div className="flex items-center gap-3">
            <button className="btn-primary text-xs py-1 bg-bad hover:bg-bad" disabled={busy}
              onClick={() => toggle.mutate({ enabled: true, acknowledge: true })}>Turn on anyway</button>
            <button className="text-xs text-ink-3 hover:underline" onClick={() => setAck(null)}>Cancel</button>
          </div>
        </div>
      )}
      {note && <p className={clsx('text-xs', note.ok ? 'text-good' : 'text-bad')}>{note.text}</p>}
      <p className="text-[11px] text-ink-3">
        Turning it on or off reprograms the switch chip, which can interrupt forwarding briefly; it runs under Change Guard.
      </p>
    </div>
  );
}
