import { describe, expect, it } from 'vitest';
import { PDFDocument, PageSizes } from 'pdf-lib';
import { ID1_MM, ID1_PX, idCardLayout, idCardPdf } from '../src/core/idCard';
import { PNG_1x1 } from './helpers';

const mm = (pt: number) => (pt * 25.4) / 72;

describe('ID card scan', () => {
  it('places cards at true ID-1 size, centred on A4 and not overlapping', () => {
    const [a, b] = idCardLayout(2);
    expect(mm(a.width)).toBeCloseTo(ID1_MM.width, 2);
    expect(mm(a.height)).toBeCloseTo(ID1_MM.height, 2);
    expect(a.x + a.width / 2).toBeCloseTo(PageSizes.A4[0] / 2, 5);
    expect(a.y).toBeGreaterThan(b.y + b.height); // front above back
    expect((a.y + a.height + b.y) / 2).toBeCloseTo(PageSizes.A4[1] / 2, 5);
  });

  it('flattens to a 300 dpi card aspect', () => {
    expect(ID1_PX.width / ID1_PX.height).toBeCloseTo(ID1_MM.width / ID1_MM.height, 2);
  });

  it('makes one A4 page for front only or front and back', async () => {
    for (const n of [1, 2]) {
      const doc = await PDFDocument.load(await idCardPdf(Array(n).fill({ bytes: PNG_1x1, kind: 'png' })));
      expect(doc.getPageCount()).toBe(1);
      expect(Math.round(doc.getPage(0).getWidth())).toBe(Math.round(PageSizes.A4[0]));
    }
  });

  it('rejects no sides, three sides or a mislabelled image', async () => {
    await expect(idCardPdf([])).rejects.toMatchObject({ code: 'no-input' });
    await expect(idCardPdf(Array(3).fill({ bytes: PNG_1x1, kind: 'png' }))).rejects.toMatchObject({ code: 'no-input' });
    await expect(idCardPdf([{ bytes: PNG_1x1, kind: 'jpeg' }])).rejects.toMatchObject({ code: 'unsupported-image' });
  });
});
