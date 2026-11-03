import { describe, expect, it } from 'vitest';
import { bytesSaved, countUpValue } from '../src/core/feel';

describe('feel', () => {
  it('counts up from zero, eases out, and lands exactly on the target', () => {
    expect(countUpValue(1000, 0)).toBe(0);
    const mid = countUpValue(1000, 350, 700);
    expect(mid).toBeGreaterThan(500); // ease-out: more than halfway at half time
    expect(mid).toBeLessThan(1000);
    expect(countUpValue(1000, 700, 700)).toBe(1000);
    expect(countUpValue(1000, 5000, 700)).toBe(1000);
  });
  it('never counts negative or past the target', () => {
    expect(countUpValue(0, 100)).toBe(0);
    expect(countUpValue(-5, 100)).toBe(0);
    for (let ms = 0; ms <= 800; ms += 50) expect(countUpValue(777, ms)).toBeLessThanOrEqual(777);
  });
  it('reports bytes saved, never negative', () => {
    expect(bytesSaved(5_000_000, 1_200_000)).toBe(3_800_000);
    expect(bytesSaved(1000, 1400)).toBe(0);
  });
});
