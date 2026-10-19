import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';

import { devicesApi } from '../../services/api';

export default function InterfacesTab({ deviceId }: { deviceId: number }) {
  const { data: interfaces = [], isLoading } = useQuery({
    queryKey: ['interfaces', deviceId],
    queryFn: () => devicesApi.getInterfaces(deviceId).then((r) => r.data),
    refetchInterval: 30_000,
  });

  if (isLoading) return <div className="text-center py-8 text-ink-4">Loading...</div>;
  if (!interfaces.length)
    return (
      <div className="text-center py-8 text-ink-3">
        No interfaces found. Sync the device to collect data.
      </div>
    );

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-surface-2 dark:bg-surface-3">
            <th className="table-header px-4 py-2.5 text-left">Name</th>
            <th className="table-header px-4 py-2.5 text-left">Type</th>
            <th className="table-header px-4 py-2.5 text-left">Status</th>
            <th className="table-header px-4 py-2.5 text-left">MAC Address</th>
            <th className="table-header px-4 py-2.5 text-left">MTU</th>
            <th className="table-header px-4 py-2.5 text-left">Speed</th>
            <th className="table-header px-4 py-2.5 text-left">Comment</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line table-zebra">
          {interfaces.map((iface) => (
            <tr key={iface.id} className="hover:bg-surface-2/30">
              <td className="px-4 py-2.5 font-mono font-semibold text-ink">{iface.name}</td>
              <td className="px-4 py-2.5 text-ink-3 capitalize">{iface.type || '—'}</td>
              <td className="px-4 py-2.5">
                <span
                  className={clsx(
                    'inline-flex items-center gap-1.5 text-xs font-medium',
                    iface.disabled ? 'text-ink-4' : iface.running ? 'text-good' : 'text-bad',
                  )}
                >
                  <span
                    className={clsx(
                      'w-1.5 h-1.5 rounded-full',
                      iface.disabled ? 'bg-surface-3' : iface.running ? 'bg-good' : 'bg-bad',
                    )}
                  />
                  {iface.disabled ? 'Disabled' : iface.running ? 'Running' : 'Down'}
                </span>
              </td>
              <td className="px-4 py-2.5 font-mono text-xs text-ink-3">
                {iface.mac_address || '—'}
              </td>
              <td className="px-4 py-2.5 text-ink-3">{iface.mtu || '—'}</td>
              <td className="px-4 py-2.5 text-ink-3">{iface.speed || '—'}</td>
              <td className="px-4 py-2.5 text-ink-3 italic">{iface.comment || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
