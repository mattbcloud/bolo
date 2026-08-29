import { describe, it, expect } from 'vitest';

import { isNickTaken, normalizeNick } from './nick';

/** A game holding these names. Anything else in a tank is irrelevant to the rule. */
function holders(...names: Array<string | undefined>): Array<{ name?: string }> {
  return names.map((name) => ({ name }));
}

describe('normalizeNick', () => {
  it('drops surrounding whitespace so it is not part of the name', () => {
    expect(normalizeNick('  Bob  ')).toBe('Bob');
    expect(normalizeNick('Bob')).toBe('Bob');
  });

  it('leaves whitespace inside a name alone', () => {
    expect(normalizeNick(' Mad Dog ')).toBe('Mad Dog');
  });
});

describe('isNickTaken', () => {
  it('refuses the same name', () => {
    expect(isNickTaken(holders('Bob'), 'Bob')).toBe(true);
  });

  it('refuses a name that differs only in case', () => {
    expect(isNickTaken(holders('Bob'), 'bob')).toBe(true);
    expect(isNickTaken(holders('bob'), 'BOB')).toBe(true);
  });

  it('refuses a name that differs only in surrounding whitespace', () => {
    expect(isNickTaken(holders('Bob'), '  Bob  ')).toBe(true);
    expect(isNickTaken(holders('  Bob  '), 'Bob')).toBe(true);
  });

  it('allows a genuinely different name', () => {
    expect(isNickTaken(holders('Bob'), 'Bobby')).toBe(false);
    expect(isNickTaken(holders('Bob', 'nurpy'), 'beano')).toBe(false);
  });

  it('allows any name into an empty game', () => {
    expect(isNickTaken([], 'Bob')).toBe(false);
  });

  it('ignores tanks that hold no name yet', () => {
    // A tank exists between spawn and its nick arriving; it is holding nothing.
    expect(isNickTaken(holders(undefined, undefined), 'Bob')).toBe(false);
    expect(isNickTaken(holders(undefined, 'Bob'), 'Bob')).toBe(true);
  });

  it('treats a blank request as taking nothing', () => {
    // The caller rejects an empty name outright; this only makes sure a blank never matches a
    // real name, or another blank, and so can never be reported as a duplicate.
    expect(isNickTaken(holders('Bob'), '   ')).toBe(false);
    expect(isNickTaken(holders('   '), '   ')).toBe(false);
  });

  it('still holds the name of a tank left behind by a dropped connection', () => {
    // The ghost is an ordinary tank in the list until the reaper clears it, so this is really a
    // statement that the rule has no exemption: nothing here knows or cares whose tank it is.
    expect(isNickTaken(holders('nurpy'), 'nurpy')).toBe(true);
  });
});
