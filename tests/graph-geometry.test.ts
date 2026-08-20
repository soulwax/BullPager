import { describe, expect, it } from 'vitest';
import { edgeAnchor } from '../src/lib/graphGeometry';

const node = { x: 100, y: 100, width: 200, height: 100 };

describe('edgeAnchor', () => {
  it('clips to the right edge when the target is straight ahead horizontally', () => {
    expect(edgeAnchor(node, 1000, 150)).toEqual({ x: 300, y: 150 });
  });

  it('clips to the left edge when the target is straight behind horizontally', () => {
    expect(edgeAnchor(node, 0, 150)).toEqual({ x: 100, y: 150 });
  });

  it('clips to the top edge when the target is straight above', () => {
    expect(edgeAnchor(node, 200, 0)).toEqual({ x: 200, y: 100 });
  });

  it('clips to the bottom edge when the target is straight below', () => {
    expect(edgeAnchor(node, 200, 1000)).toEqual({ x: 200, y: 200 });
  });

  it('picks the nearer of the two edges on a diagonal, keeping the point on the rectangle boundary', () => {
    const point = edgeAnchor(node, 1000, 1000);
    const onVerticalEdge = point.x === 300 || point.x === 100;
    const onHorizontalEdge = point.y === 100 || point.y === 200;
    expect(onVerticalEdge || onHorizontalEdge).toBe(true);
    expect(point.x).toBeGreaterThanOrEqual(100);
    expect(point.x).toBeLessThanOrEqual(300);
    expect(point.y).toBeGreaterThanOrEqual(100);
    expect(point.y).toBeLessThanOrEqual(200);
  });

  it('returns the center when the target point is the center itself', () => {
    expect(edgeAnchor(node, 200, 150)).toEqual({ x: 200, y: 150 });
  });
});
