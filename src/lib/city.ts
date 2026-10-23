import { DISTRICTS, type District } from '../data/districts';
import { decayOf, type Decay } from './srs';
import type { Word } from './types';

export const HW = 28;
export const HH = 14;
const ROAD = 1;
const MIN_BLOCK = 4;

export type Pt = [number, number];

export function iso(gx: number, gy: number): Pt {
  return [(gx - gy) * HW, (gx + gy) * HH];
}

export function pts(a: Pt[]): string {
  return a.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
}

export function mix(a: string, b: string, t: number): string {
  const hx = (n: number) => n.toString(16).padStart(2, '0');
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t);
  return `#${hx(ch(16))}${hx(ch(8))}${hx(ch(0))}`;
}

export interface Part {
  d: string;
  fill: string;
  stroke?: string;
  sw?: number;
  dash?: string;
}

const EDGE = 'rgba(34,48,61,0.45)';
const GLASS = '#3A4B5C';

const f1 = (n: number) => n.toFixed(1);
const pt = (p: Pt) => `${f1(p[0])} ${f1(p[1])}`;
const poly = (a: Pt[]) => `M${a.map(pt).join(' L')} Z`;

/**
 * Each level is a different kind of building, drawn on the tile centred at (cx, cy):
 * 0 site with scaffolding, 1 cottage, 2 townhouse, 3 apartment, 4 tower, 5 domed landmark.
 * Painted in order, back to front; `scale` sizes the whole building.
 */
export function buildingParts(cx: number, cy: number, level: number, decay: Decay, accent: string, scale = 1): Part[] {
  const s = scale;
  const SW = 0.6 + 0.2 * s;
  const parts: Part[] = [];
  const col = (c: string) => (decay !== 'none' ? mix(c, '#BDB8AC', 0.6) : c);
  const add = (d: string, fill: string, stroke?: string, sw?: number, dash?: string) =>
    parts.push({ d, fill: fill === 'none' ? 'none' : col(fill), stroke, sw, dash });
  // Points on the visible left and right walls of a footprint f: u runs along the wall, z is height.
  const fL = (f: number, u: number, z: number): Pt => [cx - HW * f * s + u * HW * f * s, cy + u * HH * f * s - z * s];
  const fR = (f: number, u: number, z: number): Pt => [cx + u * HW * f * s, cy + HH * f * s - u * HH * f * s - z * s];

  const box = (f: number, z0: number, z1: number, top: string, left: string, right: string, o: { ox?: number; oy?: number; stroke?: string; dash?: string } = {}) => {
    const x = cx + (o.ox ?? 0) * s;
    const y = cy + (o.oy ?? 0) * s;
    const hw = HW * f * s;
    const hh = HH * f * s;
    const a = z0 * s;
    const b = z1 * s;
    const st = o.stroke ?? EDGE;
    add(poly([[x - hw, y - b], [x, y + hh - b], [x, y + hh - a], [x - hw, y - a]]), left, st, SW, o.dash);
    add(poly([[x, y + hh - b], [x + hw, y - b], [x + hw, y - a], [x, y + hh - a]]), right, st, SW, o.dash);
    add(poly([[x, y - hh - b], [x + hw, y - b], [x, y + hh - b], [x - hw, y - b]]), top, st, SW, o.dash);
  };
  const windows = (f: number, z0: number, z1: number, rows: number, cols: number, sides: 'both' | 'left' = 'both') => {
    let d = '';
    const rowH = (z1 - z0) / rows;
    for (let r = 0; r < rows; r++) {
      const za = z0 + r * rowH + rowH * 0.28;
      const zb = z0 + r * rowH + rowH * 0.78;
      for (let c = 0; c < cols; c++) {
        const u0 = (c + 0.26) / cols;
        const u1 = (c + 0.74) / cols;
        d += `${poly([fL(f, u0, zb), fL(f, u1, zb), fL(f, u1, za), fL(f, u0, za)])} `;
        if (sides === 'both') d += `${poly([fR(f, u0, zb), fR(f, u1, zb), fR(f, u1, za), fR(f, u0, za)])} `;
      }
    }
    add(d, GLASS);
  };
  const hipRoof = (f: number, z: number, rh: number, left: string, right: string) => {
    const hw = HW * f * s;
    const hh = HH * f * s;
    const b = z * s;
    const ap: Pt = [cx, cy - b - rh * s];
    add(poly([[cx - hw, cy - b], [cx, cy - hh - b], ap]), mix(left, '#FFFFFF', 0.25), EDGE, SW);
    add(poly([[cx, cy - hh - b], [cx + hw, cy - b], ap]), mix(right, '#FFFFFF', 0.15), EDGE, SW);
    add(poly([[cx - hw, cy - b], [cx, cy + hh - b], ap]), left, EDGE, SW);
    add(poly([[cx, cy + hh - b], [cx + hw, cy - b], ap]), right, EDGE, SW);
  };
  const dark = (c: string, t: number) => mix(c, '#000000', t);
  const light = (c: string, t: number) => mix(c, '#FFFFFF', t);

  if (level === 0) {
    box(0.8, 0, 3, '#FFFFFF', '#FFFFFF', '#E9EEF2', { stroke: accent, dash: '3 2' });
    const f = 0.62;
    const [a0, b0, c0] = [fL(f, 0, 3), fL(f, 1, 3), fR(f, 1, 3)];
    const [a1, b1, c1] = [fL(f, 0, 18), fL(f, 1, 18), fR(f, 1, 18)];
    add(`M${pt(a0)} L${pt(a1)} M${pt(b0)} L${pt(b1)} M${pt(c0)} L${pt(c1)} M${pt(a1)} L${pt(b1)} L${pt(c1)} M${pt(a0)} L${pt(b1)} L${pt(c0)}`, 'none', accent, SW * 1.4);
  } else if (level === 1) {
    box(0.56, 0, 10, '#FFFFFF', '#FFFFFF', '#D3DBE2');
    add(poly([fR(0.56, 0.36, 7), fR(0.56, 0.6, 7), fR(0.56, 0.6, 0), fR(0.56, 0.36, 0)]), dark(accent, 0.3));
    windows(0.56, 1, 10, 1, 1, 'left');
    hipRoof(0.72, 10, 13, accent, dark(accent, 0.2));
  } else if (level === 2) {
    box(0.64, 0, 24, accent, '#FFFFFF', '#D3DBE2');
    windows(0.64, 0, 24, 2, 2);
    box(0.13, 24, 32, dark(accent, 0.3), '#E6EBEF', '#C5CED6', { ox: 6, oy: -1 });
  } else if (level === 3) {
    box(0.68, 0, 38, '#E6EBEF', light(accent, 0.72), light(accent, 0.5));
    windows(0.68, 2, 37, 4, 3);
    box(0.2, 38, 46, accent, '#FFFFFF', '#D3DBE2', { ox: -5, oy: -2 });
  } else if (level === 4) {
    box(0.8, 0, 12, light(accent, 0.55), '#FFFFFF', '#D3DBE2');
    windows(0.8, 0, 12, 1, 4);
    box(0.46, 12, 56, accent, '#C4D6E6', '#8EA8C1');
    add([20, 28, 36, 44, 52].map((z) => `M${pt(fL(0.46, 0, z))} L${pt(fL(0.46, 1, z))} L${pt(fR(0.46, 1, z))}`).join(' '), 'none', 'rgba(255,255,255,0.85)', SW);
    add(`M${f1(cx)} ${f1(cy - 56 * s)} L${f1(cx)} ${f1(cy - 69 * s)}`, 'none', '#22303D', SW * 1.3);
  } else {
    box(0.82, 0, 12, '#EFE6D6', '#F7F1E6', '#DCCFB8');
    add([0.14, 0.38, 0.62, 0.86].map((u) => `M${pt(fL(0.82, u, 1))} L${pt(fL(0.82, u, 11))} M${pt(fR(0.82, u, 1))} L${pt(fR(0.82, u, 11))}`).join(' '), 'none', '#BFAE8C', SW * 1.6);
    box(0.5, 12, 34, '#F7F1E6', '#FFFFFF', '#E3E8EC');
    windows(0.5, 13, 33, 1, 2);
    const yc = cy - 34 * s;
    const r = HW * 0.44 * s;
    add(`M${f1(cx - r)} ${f1(yc)} A ${f1(r)} ${f1(r * 1.1)} 0 0 1 ${f1(cx + r)} ${f1(yc)} A ${f1(r)} ${f1(r * 0.5)} 0 0 1 ${f1(cx - r)} ${f1(yc)} Z`, '#E8B23A', EDGE, SW);
    add(`M${f1(cx)} ${f1(yc - r * 1.1)} A ${f1(r)} ${f1(r * 1.1)} 0 0 1 ${f1(cx + r)} ${f1(yc)} A ${f1(r)} ${f1(r * 0.5)} 0 0 1 ${f1(cx)} ${f1(yc + r * 0.5)} Z`, '#C9962A');
    const tip = yc - r * 1.1;
    add(`M${f1(cx)} ${f1(tip)} L${f1(cx)} ${f1(tip - 7 * s)} M${f1(cx - 2 * s)} ${f1(tip - 7 * s)} L${f1(cx)} ${f1(tip - 10 * s)} L${f1(cx + 2 * s)} ${f1(tip - 7 * s)} Z`, '#E8B23A', '#C9962A', SW);
  }

  if (decay === 'weeds') {
    const tufts = [
      ...[[0.08, -2], [0.2, 1], [0.32, -2]].map(([u, dx]) => `M${pt(fL(0.8, u, 0))} l${f1(dx * s)} ${f1(-7 * s)}`),
      ...[[0.7, -1], [0.85, 2]].map(([u, dx]) => `M${pt(fR(0.8, u, 0))} l${f1(dx * s)} ${f1(-6 * s)}`),
    ];
    add(tufts.join(' '), 'none', '#6E8B4E', SW * 1.8);
    add(`M${pt(fL(0.6, 0.55, 9))} L${pt(fL(0.6, 0.62, 6))} L${pt(fL(0.6, 0.5, 3))}`, 'none', '#6F685C', SW);
  }
  return parts;
}

export interface Block {
  district: District;
  gx0: number;
  gy0: number;
  size: number;
  poly: string;
  center: Pt;
  bounds: { x: number; y: number; w: number; h: number };
  count: number;
}

export interface PlacedBuilding {
  word: Word;
  cx: number;
  cy: number;
  depth: number;
  decay: Decay;
  parts: Part[];
}

export interface CityLayout {
  blocks: Block[];
  buildings: PlacedBuilding[];
  island: { top: string; left: string; right: string; roads: string };
  bounds: { x: number; y: number; w: number; h: number };
}

/**
 * Lays the island out as a square grid of blocks (4×4 for 16 districts), one per district. Every block grows to fit the
 * busiest district so the island stays square; buildings fill a block row by row in the order learned.
 */
export function layoutCity(words: Word[], now: number): CityLayout {
  const byDistrict = new Map(DISTRICTS.map((d) => [d.id, [] as Word[]]));
  for (const w of words) if (w.srs) byDistrict.get(w.district)?.push(w);
  for (const list of byDistrict.values()) list.sort((a, b) => a.srs!.introducedAt - b.srs!.introducedAt || a.order - b.order);

  const maxCount = Math.max(0, ...[...byDistrict.values()].map((l) => l.length));
  const size = Math.max(MIN_BLOCK, Math.ceil(Math.sqrt(maxCount)));
  const cols = Math.ceil(Math.sqrt(DISTRICTS.length));
  const step = size + ROAD;
  const side = size * cols + ROAD * (cols - 1);

  const blocks: Block[] = [];
  const buildings: PlacedBuilding[] = [];
  DISTRICTS.forEach((d, i) => {
    const gx0 = (i % cols) * step;
    const gy0 = Math.floor(i / cols) * step;
    const corners = [iso(gx0, gy0), iso(gx0 + size, gy0), iso(gx0 + size, gy0 + size), iso(gx0, gy0 + size)];
    const list = byDistrict.get(d.id)!;
    blocks.push({
      district: d,
      gx0,
      gy0,
      size,
      poly: pts(corners),
      center: iso(gx0 + size / 2, gy0 + size / 2),
      bounds: { x: corners[3][0], y: corners[0][1] - 80, w: corners[1][0] - corners[3][0], h: corners[2][1] - corners[0][1] + 100 },
      count: list.length,
    });
    list.forEach((w, k) => {
      const gx = gx0 + (k % size);
      const gy = gy0 + Math.floor(k / size);
      const [cx, cy] = iso(gx + 0.5, gy + 0.5);
      const decay = decayOf(w.srs, now);
      buildings.push({
        word: w,
        cx,
        cy,
        depth: gx + gy + gx * 1e-4,
        decay,
        parts: buildingParts(cx, cy, w.srs!.level, decay, d.color),
      });
    });
  });
  buildings.sort((a, b) => a.depth - b.depth);

  const m = 0.5;
  const T = iso(-m, -m);
  const R = iso(side + m, -m);
  const B = iso(side + m, side + m);
  const L = iso(-m, side + m);
  const E = 16;
  let roads = '';
  for (let r = 1; r < cols; r++) {
    const v = r * step - ROAD / 2;
    const a = iso(v, -m);
    const b = iso(v, side + m);
    const c = iso(-m, v);
    const e = iso(side + m, v);
    roads += `M${a[0]} ${a[1]} L${b[0]} ${b[1]} M${c[0]} ${c[1]} L${e[0]} ${e[1]} `;
  }
  const pad = 40;
  return {
    blocks,
    buildings,
    island: {
      top: pts([T, R, B, L]),
      left: pts([L, B, [B[0], B[1] + E], [L[0], L[1] + E]]),
      right: pts([B, R, [R[0], R[1] + E], [B[0], B[1] + E]]),
      roads,
    },
    bounds: { x: L[0] - pad, y: T[1] - 90 - pad, w: R[0] - L[0] + pad * 2, h: B[1] + E - T[1] + 90 + pad * 2 },
  };
}
