import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/core/history';
import { emptyLedger, loadLedger, milestoneReached, nextMilestone, recordJob, saveLedger } from '../src/core/ledger';

describe('privacy ledger', () => {
  it('adds jobs, files and saved bytes and survives a round trip', () => {
    const store = new MemoryStore();
    let l = recordJob(emptyLedger(), 2, 1500);
    l = recordJob(l, 1);
    saveLedger(store, l);
    expect(loadLedger(store)).toEqual({ jobs: 2, files: 3, saved: 1500 });
  });
  it('ignores corrupt or negative values', () => {
    const store = new MemoryStore();
    store.setItem('pdfapp.ledger.v1', '{"jobs":-4,"files":"x","saved":12.7}');
    expect(loadLedger(store)).toEqual({ jobs: 0, files: 0, saved: 12 });
    store.setItem('pdfapp.ledger.v1', 'not json');
    expect(loadLedger(store)).toEqual(emptyLedger());
    expect(recordJob(emptyLedger(), -3, -9)).toEqual({ jobs: 1, files: 0, saved: 0 });
  });
  it('shows distance to the next milestone', () => {
    expect(nextMilestone(0)).toEqual({ target: 1, from: 0, progress: 0 });
    expect(nextMilestone(7)).toEqual({ target: 10, from: 5, progress: 0.4 });
    expect(nextMilestone(1000)).toBeNull();
  });
  it('reports a milestone only on the job that crosses it', () => {
    expect(milestoneReached(0, 1)).toBe(1);
    expect(milestoneReached(9, 10)).toBe(10);
    expect(milestoneReached(10, 11)).toBeNull();
  });
});
