import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getSmoothStepPath,
  type InternalNode,
  Position,
  useInternalNode,
} from '@xyflow/react';
import { X } from 'lucide-react';

import { linkEnds, type Rect, type Side, sideOf } from '../../utils/topologyGeometry';

/** What a link on the map carries; see toFlowEdge in the page. */
export interface TopoEdgeData extends Record<string, unknown> {
  label?: string;
  /** Drawn by hand: shown with a pill and a remove button. */
  hand?: boolean;
  onDelete?: () => void;
  /** Sides an end is pinned to, when someone chose one. */
  sourceSide?: Side | null;
  targetSide?: Side | null;
  /** Second and later cables between the same two cards are shifted aside. */
  parallel?: number;
}

const POSITION: Record<Side, Position> = {
  t: Position.Top,
  b: Position.Bottom,
  l: Position.Left,
  r: Position.Right,
};

const rectOf = (n: InternalNode): Rect => ({
  x: n.internals.positionAbsolute.x,
  y: n.internals.positionAbsolute.y,
  w: n.measured?.width ?? n.width ?? 150,
  h: n.measured?.height ?? n.height ?? 60,
});

/**
 * Every link on the topology map (#147): a straight line from card edge to
 * card edge that follows the cards as they move, or from a side chosen by hand.
 */
export default function TopoEdge({ id, source, target, data, style, markerEnd }: EdgeProps) {
  const s = useInternalNode(source);
  const t = useInternalNode(target);
  if (!s || !t) return null;
  const d = (data ?? {}) as TopoEdgeData;
  const rs = rectOf(s);
  const rt = rectOf(t);
  const ends = linkEnds(rs, rt, d.sourceSide, d.targetSide, d.parallel ?? 0);
  let path: string;
  let mid: { x: number; y: number };
  if (d.sourceSide || d.targetSide) {
    // A side chosen by hand: leave and enter it at a right angle and route
    // around, as a wiring diagram does. A straight line from a side would just
    // run back across the card.
    const [p, lx, ly] = getSmoothStepPath({
      sourceX: ends.s.x,
      sourceY: ends.s.y,
      sourcePosition: POSITION[d.sourceSide ?? sideOf(rs, ends.s)],
      targetX: ends.t.x,
      targetY: ends.t.y,
      targetPosition: POSITION[d.targetSide ?? sideOf(rt, ends.t)],
      borderRadius: 8,
      offset: 24,
    });
    path = p;
    mid = { x: lx, y: ly };
  } else {
    path = `M ${ends.s.x},${ends.s.y} L ${ends.t.x},${ends.t.y}`;
    mid = { x: (ends.s.x + ends.t.x) / 2, y: (ends.s.y + ends.t.y) / 2 };
  }
  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} interactionWidth={18} />
      {(d.label || d.hand) && (
        <EdgeLabelRenderer>
          {/* Labels ignore the pointer unless told otherwise; nodrag/nopan stop a
              click on the button panning the map. */}
          <div
            className="absolute flex items-center gap-1 nodrag nopan"
            style={{
              transform: `translate(-50%,-50%) translate(${mid.x}px,${mid.y}px)`,
              pointerEvents: 'all',
              opacity: style?.opacity,
            }}
          >
            {d.hand ? (
              <>
                <span className="text-[9px] bg-violet-bg dark:bg-violet-bg text-violet dark:text-violet px-1 rounded">
                  {d.label || 'drawn by hand'}
                </span>
                {d.onDelete && (
                  <button
                    className="w-4 h-4 rounded-full bg-bad text-white flex items-center justify-center hover:bg-bad"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      d.onDelete?.();
                    }}
                    title="Remove this hand-drawn link"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </>
            ) : (
              <span className="text-[10px] px-1 rounded bg-slate-50/90 dark:bg-slate-800/90 text-ink-3 dark:text-ink-3 whitespace-nowrap">
                {d.label}
              </span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
