import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { HH, HW, mix, type CityLayout } from '../lib/city';
import type { DistrictId } from '../lib/types';
import { Building } from './Building';

interface Box { x: number; y: number; w: number; h: number }

interface Props {
  layout: CityLayout;
  selectedDistrict: DistrictId | null;
  selectedWord: string | null;
  focus: Box | null;
  onSelectDistrict: (id: DistrictId) => void;
  onSelectWord: (id: string) => void;
}

export function CityMap({ layout, selectedDistrict, selectedWord, focus, onSelectDistrict, onSelectWord }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [vb, setVb] = useState<Box>(layout.bounds);
  const [pxPerUnit, setPxPerUnit] = useState(1);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragged = useRef(false);

  useEffect(() => setVb(focus ?? layout.bounds), [focus, layout.bounds]);

  // Keep labels a constant on-screen size whatever the zoom.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setPxPerUnit(Math.min(r.width / vb.w, r.height / vb.h) || 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [vb]);

  const zoomAt = (factor: number, cx: number, cy: number) => {
    setVb((v) => {
      const w = Math.min(Math.max(v.w * factor, 120), layout.bounds.w * 2);
      const k = w / v.w;
      return { x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k, w, h: v.h * k };
    });
  };

  const toSvg = (clientX: number, clientY: number) => {
    const el = svgRef.current!;
    const p = el.createSVGPoint();
    p.x = clientX;
    p.y = clientY;
    const m = el.getScreenCTM();
    const q = m ? p.matrixTransform(m.inverse()) : p;
    return [q.x, q.y] as const;
  };

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const [x, y] = toSvg(e.clientX, e.clientY);
      zoomAt(Math.exp(e.deltaY * 0.0015), x, y);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragged.current = false;
  };
  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const all = [...pointers.current.entries()];
    if (all.length === 2) {
      const other = all.find(([id]) => id !== e.pointerId)![1];
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (before > 0 && after > 0) {
        const [x, y] = toSvg((e.clientX + other.x) / 2, (e.clientY + other.y) / 2);
        zoomAt(before / after, x, y);
      }
      dragged.current = true;
    } else {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      if (Math.abs(dx) + Math.abs(dy) > 3 || dragged.current) {
        if (!dragged.current) svgRef.current?.setPointerCapture(e.pointerId);
        dragged.current = true;
        setVb((v) => ({ ...v, x: v.x - dx / pxPerUnit, y: v.y - dy / pxPerUnit }));
      } else return;
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onPointerUp = (e: RPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
  };
  const clickIfNotDragged = (fn: () => void) => () => {
    if (!dragged.current) fn();
  };

  const zoomCenter = (factor: number) => zoomAt(factor, vb.x + vb.w / 2, vb.y + vb.h / 2);
  const u = 1 / pxPerUnit;
  const sel = layout.buildings.find((b) => b.word.id === selectedWord);

  return (
    <div className="map">
      <svg
        ref={svgRef}
        className="map-svg"
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="img"
        aria-label="單字城市地圖"
      >
        <polygon points={layout.island.left} fill="#B7C5AB" />
        <polygon points={layout.island.right} fill="#A2B296" />
        <polygon points={layout.island.top} fill="#EEF2EA" />
        <path d={layout.island.roads} fill="none" stroke="#FFFFFF" strokeWidth={2} strokeDasharray="6 6" />
        {layout.blocks.map((b) => (
          <polygon
            key={b.district.id}
            points={b.poly}
            fill={tint(b.district.color)}
            stroke={b.district.id === selectedDistrict ? '#17222D' : edge(b.district.color)}
            strokeWidth={b.district.id === selectedDistrict ? 2 : 1}
            onClick={clickIfNotDragged(() => onSelectDistrict(b.district.id))}
          />
        ))}
        {layout.buildings.map((b) => (
          <g key={b.word.id} className="bld" onClick={clickIfNotDragged(() => onSelectWord(b.word.id))}>
            <title>{`${b.word.word} ${b.word.zh}`}</title>
            <Building parts={b.parts} />
          </g>
        ))}
        {sel && (
          <polygon
            className="pulse"
            points={`${sel.cx},${sel.cy - HH * 0.95} ${sel.cx + HW * 0.95},${sel.cy} ${sel.cx},${sel.cy + HH * 0.95} ${sel.cx - HW * 0.95},${sel.cy}`}
            fill="none"
            stroke="#D9622B"
            strokeWidth={2}
            pointerEvents="none"
          />
        )}
        {layout.blocks.map((b) => {
          const label = b.district.name;
          const fs = 13 * u;
          const w = (label.length * 13 + 34) * u;
          const h = 28 * u;
          const x = b.center[0] - w / 2;
          const y = b.center[1] - h / 2;
          const active = b.district.id === selectedDistrict;
          return (
            <g key={`l-${b.district.id}`} className="pill" onClick={clickIfNotDragged(() => onSelectDistrict(b.district.id))}>
              <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={active ? '#17222D' : '#FFFFFF'} stroke="rgba(23,34,45,0.18)" strokeWidth={u} />
              <circle cx={x + 14 * u} cy={y + h / 2} r={4 * u} fill={b.district.color} />
              <text x={x + 24 * u} y={y + h / 2} dominantBaseline="central" fontSize={fs} fontWeight={500} fill={active ? '#FFFFFF' : '#17222D'}>
                {label}
              </text>
            </g>
          );
        })}
        {sel && <WordTag x={sel.cx} y={sel.cy - (ROOF[sel.word.srs?.level ?? 0] ?? 40)} u={u} word={sel.word.word} zh={sel.word.zh} />}
      </svg>
      <div className="map-tools">
        <button type="button" className="icon-btn" aria-label="縮小" onClick={() => zoomCenter(1.25)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg>
        </button>
        <button type="button" className="icon-btn" aria-label="放大" onClick={() => zoomCenter(0.8)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14M12 5v14" /></svg>
        </button>
        <button type="button" className="btn-ghost" onClick={() => setVb(layout.bounds)}>全島</button>
      </div>
    </div>
  );
}

function tint(c: string) {
  return mix(c, '#FFFFFF', 0.8);
}
function edge(c: string) {
  return mix(c, '#FFFFFF', 0.45);
}

/** Roughly how tall each level's building stands, so the tag floats just above its roof. */
const ROOF = [6, 18, 34, 48, 64, 70];

/** A callout naming the tapped building, kept a constant on-screen size like the district labels. */
function WordTag({ x, y, u, word, zh }: { x: number; y: number; u: number; word: string; zh: string }) {
  const sense = zh.length > 10 ? `${zh.slice(0, 10)}…` : zh;
  const w = (word.length * 8.6 + sense.length * 13 + 34) * u;
  const h = 30 * u;
  const tip = 7 * u;
  const top = y - tip - h;
  return (
    <g pointerEvents="none" className="word-tag">
      <path d={`M${x - tip},${top + h} L${x},${y} L${x + tip},${top + h} Z`} fill="#17222D" />
      <rect x={x - w / 2} y={top} width={w} height={h} rx={8 * u} fill="#17222D" />
      <text x={x - w / 2 + 12 * u} y={top + h / 2} dominantBaseline="central" fontSize={14 * u} fill="#FFFFFF">
        <tspan fontWeight={700} fontFamily="'Space Grotesk', sans-serif">{word}</tspan>
        <tspan dx={8 * u} fontSize={13 * u} fill="#D5DEEA">{sense}</tspan>
      </text>
    </g>
  );
}
