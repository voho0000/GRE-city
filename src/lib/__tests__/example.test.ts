import { describe, expect, it } from 'vitest';
import { findInSentence } from '../example';

const pick = (s: string, w: string) => {
  const at = findInSentence(s, w);
  return at ? s.slice(at[0], at[1]) : null;
};

describe('findInSentence', () => {
  it('finds the word as written and when inflected', () => {
    expect(pick('The loquacious guide never stopped talking.', 'loquacious')).toBe('loquacious');
    expect(pick('Critics extolled the novel for its restraint.', 'extol')).toBe('extolled');
    expect(pick('Her calm smile belied the panic she felt.', 'belie')).toBe('belied');
    expect(pick('He kept vacillating between the two offers.', 'vacillate')).toBe('vacillating');
    expect(pick('The rumors were quickly debunked.', 'debunk')).toBe('debunked');
    expect(pick('Officials tried to pacify the angry crowd; the protesters were pacified.', 'pacify')).toBe('pacify');
    expect(pick('Two candidates were vilified in the press.', 'vilify')).toBe('vilified');
    expect(pick('Although provoked, the diplomat forbore from responding.', 'forbear')).toBe('forbore');
  });

  it('is case-insensitive and returns null when absent', () => {
    expect(pick('Laconic answers frustrated the reporters.', 'laconic')).toBe('Laconic');
    expect(pick('Nothing relevant here.', 'loquacious')).toBeNull();
  });
});
