/**
 * Fractional sort keys: strings that sort lexicographically, with a key
 * between any two keys always available. Moving one item is then a single
 * update of that item's key — no list of ids on the parent, no rewrite of
 * siblings (sync-safe: each move is one single-entity op).
 *
 * Digits are base 36. A key never ends in '0', which guarantees room below it.
 * Based on the midpoint construction used by the "fractional-indexing" family
 * of algorithms; kept in-repo (no new dependency).
 */
const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';
const BASE = DIGITS.length;

const midpoint = (a: string, b: string | null): string => {
  if (b !== null) {
    // Strip the shared prefix, treating a missing digit in `a` as '0'.
    let n = 0;
    while ((a[n] ?? '0') === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const digitA = a ? DIGITS.indexOf(a[0]) : 0;
  const digitB = b !== null ? DIGITS.indexOf(b[0]) : BASE;
  if (digitB - digitA > 1) {
    return DIGITS[Math.round((digitA + digitB) / 2)];
  }
  // Adjacent digits: go one level deeper.
  if (b !== null && b.length > 1) {
    return b.slice(0, 1);
  }
  return DIGITS[digitA] + midpoint(a.slice(1), null);
};

const isValidKey = (key: string): boolean =>
  key.length > 0 && !key.endsWith('0') && [...key].every((c) => DIGITS.includes(c));

/**
 * A key strictly between `before` and `after` (null = open end). `before` must
 * sort before `after`. Invalid inputs (e.g. from a malformed peer) are treated
 * as open ends rather than throwing.
 */
export const sortKeyBetween = (
  before: string | null | undefined,
  after: string | null | undefined,
): string => {
  const a = before && isValidKey(before) ? before : '';
  const b = after && isValidKey(after) ? after : null;
  if (b !== null && a >= b) {
    // Out of order (e.g. concurrent edits left equal keys): place just
    // before `after`; the order stays valid, merely not between both.
    return midpoint('', b);
  }
  return midpoint(a, b);
};

/** `count` keys in ascending order, evenly enough spread for later inserts. */
export const sortKeysFor = (count: number): string[] => {
  const keys: string[] = [];
  let prev: string | null = null;
  for (let i = 0; i < count; i++) {
    prev = sortKeyBetween(prev, null);
    keys.push(prev);
  }
  return keys;
};
