import { describe, expect, it } from 'vitest';
import { decayed, parseUsage, rankTools, recordUse } from '../src/core/frecency';

const DAY = 24 * 60 * 60 * 1000;
const defaults = ['compress', 'merge', 'split', 'sign'];
const known = [...defaults, 'watermark', 'ocr'];

describe('quick tools frecency', () => {
  it('keeps the default order with no history', () => {
    expect(rankTools(defaults, {}, 0, known)).toEqual(defaults);
  });

  it('pulls a tool you use often to the front, even one not in the defaults', () => {
    let u = {};
    for (let i = 0; i < 3; i++) u = recordUse(u, 'watermark', i * 1000);
    u = recordUse(u, 'split', 5000);
    expect(rankTools(defaults, u, 6000, known)).toEqual(['watermark', 'split', 'compress', 'merge']);
  });

  it('old use fades: a score halves every 14 days', () => {
    expect(decayed({ score: 4, at: 0 }, 14 * DAY)).toBeCloseTo(2);
    const u = recordUse({}, 'ocr', 0);
    expect(rankTools(defaults, u, 60 * DAY, known)).toEqual(defaults);
  });

  it('ignores junk in storage', () => {
    expect(parseUsage('not json')).toEqual({});
    expect(parseUsage('{"merge":{"score":"x","at":1},"split":{"score":2,"at":5}}')).toEqual({ split: { score: 2, at: 5 } });
  });
});
