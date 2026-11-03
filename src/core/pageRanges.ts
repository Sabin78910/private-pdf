import { PdfError } from './errors';

/**
 * Parses a human page selection such as "1-3, 5, 8-" into zero-based page indices.
 * Order is preserved and duplicates are kept, so "3,1" extracts page 3 then page 1.
 */
export function parsePageRanges(input: string, pageCount: number): number[] {
  const text = input.trim();
  if (!text) throw new PdfError('invalid-range', 'empty selection');
  const out: number[] = [];
  for (const raw of text.split(/[,،\s]+/).filter(Boolean)) {
    const m = /^(\d+)?\s*-\s*(\d+)?$|^(\d+)$/.exec(raw);
    if (!m) throw new PdfError('invalid-range', raw);
    let start: number;
    let end: number;
    if (m[3] !== undefined) {
      start = end = Number(m[3]);
    } else {
      start = m[1] !== undefined ? Number(m[1]) : 1;
      end = m[2] !== undefined ? Number(m[2]) : pageCount;
    }
    if (start < 1 || end < 1 || start > pageCount || end > pageCount) {
      throw new PdfError('invalid-range', `${raw} is outside 1-${pageCount}`);
    }
    const step = start <= end ? 1 : -1;
    for (let p = start; p !== end + step; p += step) out.push(p - 1);
  }
  return out;
}
