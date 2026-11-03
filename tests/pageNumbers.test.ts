import { describe, expect, it } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
import { MARGIN, addPageNumbers, pageLabel, toPageSpace, visualAnchor } from '../src/core/pageNumbers';
import type { PdfError } from '../src/core/errors';
import { makePdf, pageWidths } from './helpers';

const base = { position: 'bottom-center', format: 'n', startAt: 1, skipFirst: false } as const;

describe('page numbers', () => {
  it('formats labels', () => {
    expect(pageLabel(3, 10, 'n')).toBe('3');
    expect(pageLabel(3, 10, 'n-of-total')).toBe('3 / 10');
    expect(pageLabel(3, 10, 'page-n-of-total')).toBe('Page 3 of 10');
  });

  it('anchors labels inside the margins for every position', () => {
    expect(visualAnchor('bottom-left', 600, 800, 20, 10)).toEqual({ vx: MARGIN, vy: MARGIN });
    expect(visualAnchor('bottom-center', 600, 800, 20, 10)).toEqual({ vx: 290, vy: MARGIN });
    expect(visualAnchor('top-right', 600, 800, 20, 10)).toEqual({ vx: 600 - MARGIN - 20, vy: 800 - MARGIN - 10 });
  });

  it('maps reader coordinates back to page space for rotated pages', () => {
    // A 600x800 page rotated 90 shows as 800x600: the reader's bottom-left corner is page (600, 0).
    expect(toPageSpace(0, 10, 20, 600, 800)).toEqual({ x: 10, y: 20, rotate: 0 });
    expect(toPageSpace(90, 0, 0, 600, 800)).toEqual({ x: 600, y: 0, rotate: 90 });
    expect(toPageSpace(180, 0, 0, 600, 800)).toEqual({ x: 600, y: 800, rotate: 180 });
    expect(toPageSpace(270, 0, 0, 600, 800)).toEqual({ x: 0, y: 800, rotate: 270 });
    expect(toPageSpace(-90, 0, 0, 600, 800)).toEqual({ x: 0, y: 800, rotate: 270 });
  });

  it('keeps every page, in order, and adds content to each', async () => {
    const input = await makePdf(4);
    const out = await addPageNumbers(input, base);
    expect(await pageWidths(out)).toEqual(await pageWidths(input));
    expect(out.length).toBeGreaterThan(input.length);
  });

  it('works on rotated pages and with a skipped cover', async () => {
    const doc = await PDFDocument.load(await makePdf(3));
    doc.getPage(1).setRotation(degrees(90));
    doc.getPage(2).setRotation(degrees(270));
    const out = await addPageNumbers(await doc.save(), { ...base, position: 'top-right', format: 'n-of-total', skipFirst: true, startAt: 5 });
    const res = await PDFDocument.load(out);
    expect(res.getPageCount()).toBe(3);
    expect(res.getPage(1).getRotation().angle).toBe(90);
  });

  it('refuses a nonsense first number', async () => {
    const input = await makePdf(1);
    const err = await addPageNumbers(input, { ...base, startAt: -1 }).catch((e: PdfError) => e.code);
    expect(err).toBe('invalid-range');
  });
});
