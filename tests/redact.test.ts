import { describe, expect, it } from 'vitest';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { applyRedactions, normalizeBox } from '../src/core/redact';
import { makePdf, pageWidths } from './helpers';

const JPEG = Uint8Array.from(
  atob('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='),
  (c) => c.charCodeAt(0),
);

describe('redact', () => {
  it('normalises dragged boxes in any direction and clips them to the page', () => {
    expect(normalizeBox(0.5, 0.6, 0.1, 0.2)).toEqual({ x: 0.1, y: 0.2, w: 0.4, h: expect.closeTo(0.4, 9) });
    expect(normalizeBox(-0.2, 0.9, 0.3, 1.4)).toEqual({ x: 0, y: 0.9, w: 0.3, h: expect.closeTo(0.1, 9) });
    expect(normalizeBox(0.2, 0.2, 0.201, 0.5)).toBeNull();
  });

  it('replaces only redacted pages, keeps order and leaves no text behind', async () => {
    const out = await applyRedactions(await makePdf(3), [{ index: 1, jpeg: JPEG, width: 60, height: 80 }]);
    expect(await pageWidths(out)).toEqual([100, 60, 102]);
    const doc = await PDFDocument.load(out);
    const res = doc.getPage(1).node.Resources();
    const font = res?.lookupMaybe(PDFName.of('Font'), PDFDict);
    expect(font ? font.keys().length : 0).toBe(0);
    expect(res?.get(PDFName.of('XObject'))).toBeDefined();
    // The flattened page's original text stream is gone from the file entirely.
    const fonts = doc.context.enumerateIndirectObjects().filter(([, o]) => String(o).includes('/Type /Font'));
    expect(fonts.length).toBeLessThanOrEqual(1); // one shared font for the untouched pages
  });

  it('rejects nothing to redact and pages out of range', async () => {
    const pdf = await makePdf(1);
    await expect(applyRedactions(pdf, [])).rejects.toMatchObject({ code: 'no-input' });
    await expect(applyRedactions(pdf, [{ index: 3, jpeg: JPEG, width: 1, height: 1 }])).rejects.toMatchObject({ code: 'invalid-range' });
  });
});
