import { describe, expect, it } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { addAnnotations, COLORS, isDrawable, type Annotation } from '../src/core/annotate';
import { makePdf } from './helpers';

async function annotsOf(bytes: Uint8Array, page: number) {
  const doc = await getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  const list = await (await doc.getPage(page + 1)).getAnnotations();
  await doc.destroy();
  return list as { subtype: string; contentsObj?: { str: string }; rect: number[]; quadPoints?: unknown; inkLists?: unknown[]; hasAppearance?: boolean }[];
}

describe('annotations', () => {
  const highlight: Annotation = { kind: 'highlight', page: 0, x0: 10, y0: 90, x1: 80, y1: 110, color: COLORS.yellow };
  const ink: Annotation = { kind: 'ink', page: 1, paths: [[[10, 10], [30, 40], [50, 20]]], color: COLORS.blue, width: 2 };
  const note: Annotation = { kind: 'note', page: 0, x: 20, y: 180, text: 'हस्ताक्षर यहाँ · sign here', color: COLORS.yellow };

  it('writes highlights, ink and notes as real annotations with appearances', async () => {
    const out = await addAnnotations(await makePdf(2), [highlight, ink, note]);
    const p0 = await annotsOf(out, 0);
    expect(p0.map((a) => a.subtype).sort()).toEqual(['Highlight', 'Text']);
    const hl = p0.find((a) => a.subtype === 'Highlight')!;
    expect(hl.rect).toEqual([10, 90, 80, 110]);
    expect(hl.hasAppearance).toBe(true);
    expect(p0.find((a) => a.subtype === 'Text')!.contentsObj!.str).toBe('हस्ताक्षर यहाँ · sign here');
    const p1 = await annotsOf(out, 1);
    expect(p1.map((a) => a.subtype)).toEqual(['Ink']);
    expect(p1[0].inkLists).toHaveLength(1);
  });

  it('normalises a highlight dragged up-and-left', async () => {
    const out = await addAnnotations(await makePdf(1), [{ ...highlight, x0: 80, y0: 110, x1: 10, y1: 90 }]);
    expect((await annotsOf(out, 0))[0].rect).toEqual([10, 90, 80, 110]);
  });

  it('skips undrawable input and refuses when nothing is left', async () => {
    expect(isDrawable({ ...note, text: '   ' })).toBe(false);
    expect(isDrawable({ ...ink, paths: [[[1, 1]]] })).toBe(false);
    expect(isDrawable({ ...highlight, x1: 11, y1: 91 })).toBe(false);
    await expect(addAnnotations(await makePdf(1), [{ ...note, text: '' }])).rejects.toMatchObject({ code: 'no-input' });
    await expect(addAnnotations(await makePdf(1), [{ ...highlight, page: 5 }])).rejects.toMatchObject({ code: 'invalid-range' });
  });
});
