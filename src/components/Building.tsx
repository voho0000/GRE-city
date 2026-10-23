import type { Part } from '../lib/city';

export function Building({ parts }: { parts: Part[] }) {
  return (
    <>
      {parts.map((p, i) => (
        <path key={i} d={p.d} fill={p.fill} stroke={p.stroke ?? 'none'} strokeWidth={p.sw} strokeDasharray={p.dash} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </>
  );
}
