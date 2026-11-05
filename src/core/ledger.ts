/**
 * Privacy ledger: lifetime totals of work done on this device. Counts only (jobs, files, bytes
 * saved), never names or content, so it is safe to keep forever in localStorage.
 */
import type { KeyValueStore } from './history';

export interface Ledger {
  jobs: number;
  files: number;
  saved: number; // bytes saved by compression
}

const KEY = 'pdfapp.ledger.v1';
/** Job counts that earn a milestone moment. */
export const MILESTONES = [1, 5, 10, 25, 50, 100, 250, 500, 1000] as const;

export const emptyLedger = (): Ledger => ({ jobs: 0, files: 0, saved: 0 });

const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

export function loadLedger(store: Pick<KeyValueStore, 'getItem'>): Ledger {
  try {
    const raw = JSON.parse(store.getItem(KEY) ?? 'null') as Partial<Ledger> | null;
    return raw ? { jobs: count(raw.jobs), files: count(raw.files), saved: count(raw.saved) } : emptyLedger();
  } catch {
    return emptyLedger();
  }
}

export function recordJob(l: Ledger, files: number, saved = 0): Ledger {
  return { jobs: l.jobs + 1, files: l.files + count(files), saved: l.saved + count(saved) };
}

export function saveLedger(store: Pick<KeyValueStore, 'setItem'>, l: Ledger): void {
  try {
    store.setItem(KEY, JSON.stringify(l));
  } catch {
    /* storage blocked: the ledger is a nicety, never fail a job for it */
  }
}

/** The next milestone above `jobs`, with progress towards it from the previous one (0..1). */
export function nextMilestone(jobs: number): { target: number; from: number; progress: number } | null {
  const target = MILESTONES.find((m) => m > jobs);
  if (target === undefined) return null;
  const from = [...MILESTONES].reverse().find((m) => m <= jobs) ?? 0;
  return { target, from, progress: (jobs - from) / (target - from) };
}

/** The milestone just reached when going from `before` to `after` jobs, if any. */
export function milestoneReached(before: number, after: number): number | null {
  return MILESTONES.find((m) => m > before && m <= after) ?? null;
}
