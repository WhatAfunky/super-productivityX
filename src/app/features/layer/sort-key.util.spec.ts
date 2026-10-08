import { sortKeyBetween, sortKeysFor } from './sort-key.util';

describe('sort-key.util', () => {
  it('creates keys strictly between neighbours, and at both open ends', () => {
    const mid = sortKeyBetween(null, null);
    const top = sortKeyBetween(null, mid);
    const bottom = sortKeyBetween(mid, null);
    expect(top < mid && mid < bottom).toBe(true);
    const between = sortKeyBetween(top, mid);
    expect(top < between && between < mid).toBe(true);
  });

  it('stays ordered under many random inserts (and keys stay short)', () => {
    let seed = 1;
    const rand = (n: number): number => {
      seed = (seed * 16807) % 2147483647;
      return seed % n;
    };
    const keys: string[] = [];
    for (let i = 0; i < 2000; i++) {
      const at = rand(keys.length + 1);
      const key = sortKeyBetween(keys[at - 1] ?? null, keys[at] ?? null);
      if (at > 0)
        expect(key > keys[at - 1])
          .withContext(`after ${keys[at - 1]}`)
          .toBe(true);
      if (at < keys.length)
        expect(key < keys[at])
          .withContext(`before ${keys[at]}`)
          .toBe(true);
      keys.splice(at, 0, key);
    }
    expect([...keys].sort()).toEqual(keys);
    expect(new Set(keys).size).toBe(keys.length);
    expect(Math.max(...keys.map((k) => k.length))).toBeLessThan(20);
  });

  it('keeps inserting at the top (new layers on top of a manual order)', () => {
    let first = sortKeyBetween(null, null);
    for (let i = 0; i < 500; i++) {
      const next = sortKeyBetween(null, first);
      expect(next < first).toBe(true);
      first = next;
    }
  });

  it('sortKeysFor returns ascending keys', () => {
    const keys = sortKeysFor(50);
    expect([...keys].sort()).toEqual(keys);
    expect(new Set(keys).size).toBe(50);
  });

  it('tolerates malformed or out-of-order input without throwing', () => {
    expect(() => sortKeyBetween('ZZ!', 'b')).not.toThrow();
    const k = sortKeyBetween('m', 'm');
    expect(k < 'm').toBe(true);
  });
});
