import { describe, expect, it } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
import { cropPages, flattenForm, marginsForRotation } from '../src/core/crop';
import { makePdf } from './helpers';

const PT = 72 / 25.4;

describe('crop', () => {
  it('trims every page by the given margins', async () => {
    const out = await PDFDocument.load(await cropPages(await makePdf(2), { top: 10, right: 5, bottom: 10, left: 5 }));
    const box = out.getPage(0).getCropBox();
    expect(box.x).toBeCloseTo(5 * PT, 3);
    expect(box.y).toBeCloseTo(10 * PT, 3);
    expect(box.width).toBeCloseTo(100 - 10 * PT, 3);
    expect(box.height).toBeCloseTo(200 - 20 * PT, 3);
    expect(out.getPage(1).getCropBox().width).toBeCloseTo(101 - 10 * PT, 3);
  });

  it('maps on-screen margins onto rotated pages', () => {
    const m = { top: 1, right: 2, bottom: 3, left: 4 };
    expect(marginsForRotation(m, 0)).toEqual(m);
    expect(marginsForRotation(m, 90)).toEqual({ top: 2, right: 3, bottom: 4, left: 1 });
    expect(marginsForRotation(m, 180)).toEqual({ top: 3, right: 4, bottom: 1, left: 2 });
    expect(marginsForRotation(m, -90)).toEqual({ top: 4, right: 1, bottom: 2, left: 3 });
  });

  it('crops a rotated page from the side the reader sees', async () => {
    const doc = await PDFDocument.load(await makePdf(1));
    doc.getPage(0).setRotation(degrees(90));
    const out = await PDFDocument.load(await cropPages(await doc.save(), { top: 10, right: 0, bottom: 0, left: 0 }));
    expect(out.getPage(0).getCropBox().x).toBeCloseTo(10 * PT, 3); // top on screen is the page's own left
  });

  it('rejects negative, empty or page-swallowing margins', async () => {
    const pdf = await makePdf(1);
    await expect(cropPages(pdf, { top: -1, right: 0, bottom: 0, left: 0 })).rejects.toMatchObject({ code: 'invalid-range' });
    await expect(cropPages(pdf, { top: 0, right: 0, bottom: 0, left: 0 })).rejects.toMatchObject({ code: 'no-input' });
    await expect(cropPages(pdf, { top: 0, right: 20, bottom: 0, left: 20 })).rejects.toMatchObject({ code: 'invalid-range' });
  });
});

describe('flatten', () => {
  it('removes editable fields and keeps the pages', async () => {
    const out = await PDFDocument.load(await flattenForm(await makePdf(2, { form: true })));
    expect(out.getForm().getFields()).toHaveLength(0);
    expect(out.getPageCount()).toBe(2);
  });

  it('says so when there is no form', async () => {
    await expect(flattenForm(await makePdf(1))).rejects.toMatchObject({ code: 'no-form' });
  });
});
