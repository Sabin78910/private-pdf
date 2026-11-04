/**
 * Small, pure helpers for satisfying feedback. Numbers count up instead of jumping; nothing here
 * touches the DOM so it can be unit tested.
 */

/** Value to show `elapsedMs` into a count-up of `durationMs` towards `target` (ease-out cubic). */
export function countUpValue(target: number, elapsedMs: number, durationMs = 700): number {
  if (target <= 0 || durationMs <= 0 || elapsedMs >= durationMs) return Math.max(0, target);
  const k = Math.max(0, elapsedMs) / durationMs;
  return Math.round(target * (1 - Math.pow(1 - k, 3)));
}

/** Bytes saved by a compression, or 0 when the result is not smaller. */
export function bytesSaved(originalSize: number, outputSize: number): number {
  return Math.max(0, originalSize - outputSize);
}

const DAY = 86_400_000;
/** Local calendar day number, so a streak follows the user's own midnight. */
export const dayNumber = (ms: number) => Math.floor((ms - new Date(ms).getTimezoneOffset() * 60_000) / DAY);

/** Finished jobs in the last 7 days, and the run of consecutive days with at least one (today or up to yesterday). */
export function activityStats(entries: { at: number; ok: boolean }[], now: number): { week: number; streak: number } {
  const ok = entries.filter((e) => e.ok && e.at <= now);
  const week = ok.filter((e) => now - e.at < 7 * DAY).length;
  const days = new Set(ok.map((e) => dayNumber(e.at)));
  let d = dayNumber(now);
  if (!days.has(d)) d -= 1; // a streak stays alive until the end of today
  let streak = 0;
  while (days.has(d)) (streak++, d--);
  return { week, streak };
}

/** Positions for a small celebratory burst: `n` particles evenly around a circle, with slight jitter from `seed`. */
export function burstVectors(n: number, radius: number, seed = 1): { x: number; y: number }[] {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.4;
    const r = radius * (0.75 + rnd() * 0.5);
    return { x: Math.round(Math.cos(a) * r), y: Math.round(Math.sin(a) * r) };
  });
}
