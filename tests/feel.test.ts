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

describe('activity stats and burst', async () => {
  const { activityStats, burstVectors, dayNumber } = await import('../src/core/feel');
  const H = 3_600_000;
  const now = new Date(2026, 10, 4, 15).getTime();
  const at = (daysAgo: number, ok = true) => ({ at: now - daysAgo * 24 * H, ok });

  it('counts this week and the day streak, ignoring failures', () => {
    expect(activityStats([at(0), at(0), at(1), at(2), at(4), at(8), at(3, false)], now)).toEqual({ week: 5, streak: 3 });
  });

  it('keeps yesterday’s streak alive until today ends, and breaks on a gap', () => {
    expect(activityStats([at(1), at(2)], now).streak).toBe(2);
    expect(activityStats([at(2), at(3)], now).streak).toBe(0);
    expect(activityStats([], now)).toEqual({ week: 0, streak: 0 });
  });

  it('uses local days', () => {
    expect(dayNumber(new Date(2026, 10, 4, 0, 5).getTime())).toBe(dayNumber(new Date(2026, 10, 4, 23, 55).getTime()));
  });

  it('spreads burst particles around the centre, deterministically', () => {
    const v = burstVectors(8, 40, 7);
    expect(v).toHaveLength(8);
    expect(v).toEqual(burstVectors(8, 40, 7));
    for (const p of v) expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(61);
    expect(Math.abs(v.reduce((s, p) => s + p.x, 0))).toBeLessThan(80); // roughly balanced
  });
});
