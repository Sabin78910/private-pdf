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
