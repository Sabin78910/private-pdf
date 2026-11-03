import { describe, expect, it } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
import { addWatermark, fitSize } from '../src/core/watermark';
import type { PdfError } from '../src/core/errors';
import { makePdf, pageWidths } from './helpers';

const code = (p: Promise<unknown>) => p.then(() => 'no-error', (e: PdfError) => e.code);

describe('watermark', () => {
  it('sizes text to the span, within limits', () => {
    expect(fitSize(10, 1000)).toBe(70);
    expect(fitSize(1, 1000)).toBe(96);
    expect(fitSize(1000, 100)).toBe(8);
  });

  it('stamps every layout and keeps the pages', async () => {
    const input = await makePdf(3);
    for (const layout of ['diagonal', 'center', 'footer'] as const) {
      const out = await addWatermark(input, { text: 'COPY', layout, opacity: 0.25 });
      expect(await pageWidths(out)).toEqual(await pageWidths(input));
      expect(out.length).toBeGreaterThan(input.length);
    }
  });

  it('works on rotated pages', async () => {
    const doc = await PDFDocument.load(await makePdf(2));
    doc.getPage(1).setRotation(degrees(90));
    const out = await addWatermark(await doc.save(), { text: 'Draft', layout: 'diagonal', opacity: 2 });
    expect((await PDFDocument.load(out)).getPage(1).getRotation().angle).toBe(90);
  });

  it('refuses empty, too long or non-Latin text with a clear code', async () => {
    const input = await makePdf(1);
    expect(await code(addWatermark(input, { text: '   ', layout: 'center', opacity: 0.2 }))).toBe('no-input');
    expect(await code(addWatermark(input, { text: 'x'.repeat(61), layout: 'center', opacity: 0.2 }))).toBe('text-unsupported');
    expect(await code(addWatermark(input, { text: 'गोप्य', layout: 'center', opacity: 0.2 }))).toBe('text-unsupported');
  });
});
