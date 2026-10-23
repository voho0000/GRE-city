import type { DistrictId } from '../lib/types';

export interface District {
  id: DistrictId;
  name: string;
  root: string;
  note: string;
  color: string;
  /** Word stems that place an imported word in this district. */
  roots: RegExp[];
  /** Chinese keywords matched against the meaning when no root matches. */
  zh: string[];
}

/** Order is the 3×3 placement on the island, row by row. */
export const DISTRICTS: District[] = [
  { id: 'speech', name: '言談', root: 'loqu · dict', note: '說話多寡與方式', color: '#D9822B',
    roots: [/loqu/, /locu/, /dict/, /^voc|voci|vok/, /verb/, /lingu/, /orat/, /garrul/, /tacit/, /retic/, /rhetor/],
    zh: ['說', '話', '言', '語', '談', '辭', '詞', '演講'] },
  { id: 'truth', name: '真偽', root: 'ver · cred', note: '真實、可信與欺騙', color: '#3B7DD8',
    roots: [/^ver[aiy]/, /cred/, /fid/, /fall[ai]/, /mendac/, /spuri/, /^sham/, /feign/, /dissembl/],
    zh: ['真', '假', '偽', '信', '騙', '誠', '謊', '證實'] },
  { id: 'praise', name: '褒貶', root: 'laud · mal', note: '稱讚與詆毀', color: '#C0504D',
    roots: [/laud/, /extol/, /eulog/, /encomi/, /^mal(ign|edic)/, /deri[ds]/, /vilif/, /pejor/, /censur/, /castig/],
    zh: ['讚', '頌', '貶', '詆', '誹', '嘲', '斥', '責', '譴'] },
  { id: 'change', name: '流變', root: 'flu · mut', note: '變動與恆常', color: '#2F9C95',
    roots: [/flu[cx]/, /mut[ab]/, /volat/, /vacill/, /prote/, /capric/, /mercur/, /ephem/, /transi/],
    zh: ['變', '波動', '搖擺', '短暫', '停滯', '衰退'] },
  { id: 'caution', name: '謹慎', root: 'cau · prud', note: '小心與魯莽', color: '#7A6CC4',
    roots: [/caut/, /prud/, /circumspec/, /wary/, /temer/, /heed/, /impetu/, /meticul/, /scrupul/],
    zh: ['謹慎', '小心', '魯莽', '輕率', '冒失', '草率', '疏忽'] },
  { id: 'pride', name: '傲謙', root: 'super · hum', note: '傲慢與謙卑', color: '#B8862F',
    roots: [/arrog/, /haught/, /supercil/, /imperi/, /humil|humbl/, /defer/, /obsequ/, /servil/, /sycoph/],
    zh: ['傲', '謙', '恭', '諂', '卑', '奉承', '無禮'] },
  { id: 'plenty', name: '繁簡', root: 'pro · aust', note: '奢華與簡樸', color: '#5E8C3A',
    roots: [/profus/, /lavish/, /auster/, /frugal/, /parsimon/, /prodig/, /ascet/, /pleth/, /copi/, /penur/],
    zh: ['奢', '儉', '吝', '揮霍', '豐富', '缺乏', '多餘', '慷慨'] },
  { id: 'conflict', name: '爭和', root: 'bell · pac', note: '好鬥與安撫', color: '#C2577F',
    roots: [/bell[ie]/, /^pac/, /placa/, /pugna/, /concili/, /mollif/, /appeas/, /trucul/, /rancor/, /irasc/],
    zh: ['戰', '鬥', '爭', '敵', '怒', '安撫', '平息', '和解'] },
  { id: 'dock', name: '散字碼頭', root: '未分區', note: '還沒歸類的字，先停在碼頭', color: '#7D8792', roots: [], zh: [] },
];

export const DISTRICT_BY_ID = Object.fromEntries(DISTRICTS.map((d) => [d.id, d])) as Record<DistrictId, District>;

export function districtFromLabel(label: string): DistrictId | null {
  const s = label.trim().toLowerCase();
  if (!s) return null;
  const hit = DISTRICTS.find((d) => d.id === s || d.name === label.trim() || d.name.startsWith(label.trim()));
  return hit ? hit.id : null;
}
