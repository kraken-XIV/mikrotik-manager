import type { HandLink, HandLinkEnd } from '../../types';
import { endId, type GraphOutput } from '../../utils/topologyGraph';

/** Every link drawn by hand, each removable, in case it's hard to click on the map (#147). */
export default function HandLinksTable({ links, graph, canWrite, onRemove }: {
  links: HandLink[];
  graph: GraphOutput | null;
  canWrite: boolean;
  onRemove: (id: number) => void;
}) {
  const name = (end: HandLinkEnd) => {
    const n = graph?.nodes.find((x) => x.id === endId(end));
    return String(n?.data.name ?? end.name ?? end.ref);
  };
  const kind = (end: HandLinkEnd) => (end.kind === 'device' ? 'device' : end.kind === 'node' ? 'your node' : 'neighbour');
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-line">
        <h3 className="text-sm font-semibold text-ink">Links drawn by hand ({links.length})</h3>
      </div>
      <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-line">
            {links.map((l) => (
              <tr key={l.id} className="hover:bg-surface-2/30">
                <td className="px-4 py-2 text-ink">{name(l.a)} <span className="text-xs text-ink-4">{kind(l.a)}</span></td>
                <td className="px-2 py-2 text-ink-4">↔</td>
                <td className="px-4 py-2 text-ink">{name(l.b)} <span className="text-xs text-ink-4">{kind(l.b)}</span></td>
                <td className="px-4 py-2 text-xs text-ink-3">{l.label}</td>
                <td className="px-4 py-2 text-right">
                  {canWrite && <button className="text-xs text-bad hover:underline" onClick={() => onRemove(l.id)}>Remove</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

