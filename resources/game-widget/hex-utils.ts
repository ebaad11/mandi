import type { TileProps } from "./types";
import { IMPASSABLE } from "./constants";

export const HEX_SIZE = 28;

// Hex neighbor offsets (pointy-top)
export const HEX_DIRS: [number, number][] = [
  [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
];

export function hexToPixel(q: number, r: number, offsetX: number, offsetY: number) {
  const x = HEX_SIZE * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r) + offsetX;
  const y = HEX_SIZE * (1.5 * r) + offsetY;
  return { x, y };
}

export function pointyHexCorners(cx: number, cy: number, size: number) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    pts.push({ x: cx + size * Math.cos(angle), y: cy + size * Math.sin(angle) });
  }
  return pts;
}

export function cornersToPath(pts: { x: number; y: number }[]) {
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") + " Z";
}

export function wallPath(pts: { x: number; y: number }[], depth: number = 4) {
  const wallPts = [pts[2], pts[3], pts[4], pts[5]];
  const shifted = wallPts.map((p) => ({ x: p.x, y: p.y + depth }));
  return (
    `M${pts[2].x.toFixed(1)},${pts[2].y.toFixed(1)} ` +
    `L${pts[3].x.toFixed(1)},${pts[3].y.toFixed(1)} ` +
    `L${pts[4].x.toFixed(1)},${pts[4].y.toFixed(1)} ` +
    `L${pts[5].x.toFixed(1)},${pts[5].y.toFixed(1)} ` +
    `L${shifted[3].x.toFixed(1)},${shifted[3].y.toFixed(1)} ` +
    `L${shifted[2].x.toFixed(1)},${shifted[2].y.toFixed(1)} ` +
    `L${shifted[1].x.toFixed(1)},${shifted[1].y.toFixed(1)} ` +
    `L${shifted[0].x.toFixed(1)},${shifted[0].y.toFixed(1)} Z`
  );
}

// Hex distance for cube coordinates (axial)
export function hexDistance(q1: number, r1: number, q2: number, r2: number): number {
  const s1 = -q1 - r1;
  const s2 = -q2 - r2;
  return Math.max(Math.abs(q1 - q2), Math.abs(r1 - r2), Math.abs(s1 - s2));
}

// BFS to find reachable hexes within movement range, respecting terrain
export function getReachableHexes(
  startQ: number,
  startR: number,
  range: number,
  tiles: TileProps[],
): Set<string> {
  const tileMap = new Map<string, TileProps>();
  for (const t of tiles) tileMap.set(`${t.q},${t.r}`, t);

  const reachable = new Set<string>();
  const visited = new Set<string>();
  const queue: [number, number, number][] = [[startQ, startR, 0]];
  visited.add(`${startQ},${startR}`);

  while (queue.length > 0) {
    const [q, r, dist] = queue.shift()!;
    if (dist > 0) reachable.add(`${q},${r}`);
    if (dist >= range) continue;

    for (const [dq, dr] of HEX_DIRS) {
      const nq = q + dq;
      const nr = r + dr;
      const key = `${nq},${nr}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const tile = tileMap.get(key);
      if (!tile || !tile.isVisible || IMPASSABLE.has(tile.terrain)) continue;
      queue.push([nq, nr, dist + 1]);
    }
  }
  return reachable;
}

// Get adjacent hexes with enemy units (for attack targeting)
export function getAttackableHexes(
  startQ: number,
  startR: number,
  tiles: TileProps[],
): Set<string> {
  const tileMap = new Map<string, TileProps>();
  for (const t of tiles) tileMap.set(`${t.q},${t.r}`, t);

  const attackable = new Set<string>();
  for (const [dq, dr] of HEX_DIRS) {
    const nq = startQ + dq;
    const nr = startR + dr;
    const tile = tileMap.get(`${nq},${nr}`);
    if (tile && tile.isVisible && tile.units.some((u) => !u.isOwnUnit)) {
      attackable.add(`${nq},${nr}`);
    }
  }
  return attackable;
}
