export const LEVEL_NAMES = ['地基', '小屋', '連棟屋', '公寓', '塔樓', '地標'];

export function daysLabel(days: number): string {
  if (days <= 0) return '今天';
  if (days === 1) return '明天';
  return `${days} 天後`;
}
