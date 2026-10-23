/**
 * Finds the target word inside its example sentence, allowing for inflection (extol → extolled, belie →
 * belied, vacillate → vacillating), so the card can highlight it. Returns [start, end) or null.
 */
export function findInSentence(sentence: string, word: string): [number, number] | null {
  const w = word.toLowerCase();
  const stems = [w, w.replace(/e$/, ''), w.replace(/y$/, 'i'), w.replace(/([^aeiou])$/, '$1$1')].filter((s) => s.length >= 3);
  const lower = sentence.toLowerCase();
  for (const stem of [...new Set(stems)].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`\\b${stem.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}[a-z]*`, 'i');
    const m = re.exec(lower);
    if (m) return [m.index, m.index + m[0].length];
  }
  return null;
}
