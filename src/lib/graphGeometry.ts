import type { GraphNode } from '$lib/types';

export type GraphPoint = { x: number; y: number };

/**
 * Where an edge should touch a node: the point on the node's rectangle
 * boundary closest to a straight line toward `towardX`/`towardY`, rather
 * than the node's raw center. This is what makes connectors clip to a
 * node's border like FigJam's do, instead of visibly running underneath it.
 */
export function edgeAnchor(node: Pick<GraphNode, 'x' | 'y' | 'width' | 'height'>, towardX: number, towardY: number): GraphPoint {
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  const dx = towardX - cx;
  const dy = towardY - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const halfW = node.width / 2;
  const halfH = node.height / 2;
  const scale = Math.min(dx !== 0 ? halfW / Math.abs(dx) : Infinity, dy !== 0 ? halfH / Math.abs(dy) : Infinity);
  return { x: cx + dx * scale, y: cy + dy * scale };
}
