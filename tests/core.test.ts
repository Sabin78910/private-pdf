import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { PdfError } from '../src/core/errors';
import { loadPdf, looksLikePdf } from '../src/core/load';
import { parsePageRanges } from '../src/core/pageRanges';
import { mergePdfs } from '../src/core/merge';
import { extractPages, splitEvery } from '../src/core/split';
import { applyPagePlan, identityPlan, rotateBy } from '../src/core/organize';
import { imagesToPdf, sniffImageKind, fitInside } from '../src/core/imagesToPdf';
import { compressLossless, compressRaster, summarize } from '../src/core/compress';
import { fillAndSign, isWinAnsi, listFormFields } from '../src/core/fillSign';
import { History, MemoryStore, MAX_ENTRIES, formatBytes, outputName } from '../src/core/history';
import { makePdf, pageWidths, PNG_1x1 } from './helpers';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return (e as PdfError).code;
  }
  return 'no-error';
};

describe('load', () => {
  it('rejects non-PDF, empty and truncated input with actionable codes', async () => {
    expect(await code(loadPdf(new Uint8Array()))).toBe('empty');
    expect(await code(loadPdf(new TextEncoder().encode('hello')))).toBe('corrupted');
    const good = await makePdf(2);
    expect(looksLikePdf(good)).toBe(true);
    expect(await code(loadPdf(good.slice(0, 40)))).toBe('corrupted');
  });
  it('does not modify the input buffer', async () => {
    const good = await makePdf(2);
    const copy = good.slice();
    await loadPdf(good);
    expect(good).toEqual(copy);
  });
});

describe('parsePageRanges', () => {
  it('parses lists, ranges, open ranges and reverse ranges', () => {
    expect(parsePageRanges('1-3, 5', 8)).toEqual([0, 1, 2, 4]);
    expect(parsePageRanges('7-', 8)).toEqual([6, 7]);
    expect(parsePageRanges('-2', 8)).toEqual([0, 1]);
    expect(parsePageRanges('3-1', 8)).toEqual([2, 1, 0]);
  });
  it('rejects out of range and garbage', () => {
    expect(() => parsePageRanges('9', 8)).toThrow(PdfError);
    expect(() => parsePageRanges('0', 8)).toThrow(PdfError);
    expect(() => parsePageRanges('a-b', 8)).toThrow(PdfError);
    expect(() => parsePageRanges('  ', 8)).toThrow(PdfError);
  });
});

describe('merge', () => {
  it('merges in order and reports progress', async () => {
    const a = await makePdf(2);
    const b = await makePdf(3);
    const seen: number[] = [];
    const out = await mergePdfs([a, b], (d) => seen.push(d));
    expect(await pageWidths(out)).toEqual([100, 101, 100, 101, 102]);
    expect(seen).toEqual([1, 2]);
  });
  it('fails clearly on no input or a bad file', async () => {
    expect(await code(mergePdfs([]))).toBe('no-input');
    expect(await code(mergePdfs([await makePdf(1), new Uint8Array([1, 2, 3])]))).toBe('corrupted');
  });
});

describe('split', () => {
  it('extracts selected pages in the requested order', async () => {
    const out = await extractPages(await makePdf(5), [4, 0]);
    expect(await pageWidths(out)).toEqual([104, 100]);
  });
  it('splits into chunks with a short last chunk', async () => {
    const parts = await splitEvery(await makePdf(5), 2);
    expect(await Promise.all(parts.map(pageWidths))).toEqual([[100, 101], [102, 103], [104]]);
  });
});

describe('organize', () => {
  it('reorders, deletes, duplicates, rotates and inserts blanks', async () => {
    const src = await makePdf(3);
    const out = await applyPagePlan(src, [
      { source: 2, rotate: 90 },
      { source: 0, rotate: 0 },
      { source: 'blank', rotate: 0 },
      { source: 0, rotate: 270 },
    ]);
    const doc = await PDFDocument.load(out);
    expect(doc.getPages().map((p) => Math.round(p.getWidth()))).toEqual([102, 100, 100, 100]);
    expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual([90, 0, 0, 270]);
  });
  it('identity plan round-trips and rotation wraps', async () => {
    expect(await pageWidths(await applyPagePlan(await makePdf(2), identityPlan(2)))).toEqual([100, 101]);
    expect(rotateBy(270, 90)).toBe(0);
    expect(rotateBy(0, -90)).toBe(270);
  });
  it('refuses an empty result', async () => {
    expect(await code(applyPagePlan(await makePdf(1), []))).toBe('invalid-range');
  });
});

describe('images to PDF', () => {
  it('sniffs types and makes one page per image', async () => {
    expect(sniffImageKind(PNG_1x1)).toBe('png');
    expect(sniffImageKind(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    const out = await imagesToPdf([{ bytes: PNG_1x1, kind: 'png' }, { bytes: PNG_1x1, kind: 'png' }]);
    expect((await PDFDocument.load(out)).getPageCount()).toBe(2);
  });
  it('rejects a mislabelled image', async () => {
    expect(await code(imagesToPdf([{ bytes: PNG_1x1, kind: 'jpeg' }]))).toBe('unsupported-image');
  });
  it('fits keeping aspect ratio', () => {
    expect(fitInside(200, 100, 100, 100)).toEqual({ width: 100, height: 50 });
  });
});

describe('compress', () => {
  it('lossless keeps every page and reports sizes', async () => {
    const src = await makePdf(4);
    const r = await compressLossless(src);
    expect(r.originalSize).toBe(src.length);
    expect(await pageWidths(r.bytes)).toEqual([100, 101, 102, 103]);
  });
  it('flags results that are not smaller', () => {
    expect(summarize(100, new Uint8Array(120)).notSmaller).toBe(true);
    expect(summarize(100, new Uint8Array(40)).savedPercent).toBe(60);
  });
  it('raster mode builds one image page per source page', async () => {
    // A tiny real JPEG stands in for the browser renderer.
    const jpeg = Uint8Array.from(
      atob(
        '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
      ),
      (c) => c.charCodeAt(0),
    );
    const src = await makePdf(3);
    const r = await compressRaster(src, 3, async () => ({ jpeg, width: 50, height: 70 }), 'medium');
    expect(await pageWidths(r.bytes)).toEqual([50, 50, 50]);
  });
});

describe('fill and sign', () => {
  it('lists and fills fields, stamps a signature and flattens', async () => {
    const src = await makePdf(1, { form: true });
    const fields = await listFormFields(src);
    expect(fields.map((f) => [f.name, f.kind])).toEqual([
      ['name', 'text'],
      ['agree', 'checkbox'],
    ]);
    const out = await fillAndSign(src, {
      fields: { name: 'Sita Sharma', agree: true },
      stamps: [
        { kind: 'image', page: 0, x: 10, y: 10, width: 40, height: 20, png: PNG_1x1 },
        { kind: 'text', page: 0, x: 10, y: 60, size: 10, text: '2026-11-03' },
      ],
    });
    const after = await listFormFields(out);
    expect(after.find((f) => f.name === 'name')?.value).toBe('Sita Sharma');
    expect(after.find((f) => f.name === 'agree')?.value).toBe(true);
    const flat = await fillAndSign(src, { fields: { name: 'x' }, flatten: true });
    expect(await listFormFields(flat)).toEqual([]);
  });
  it('asks for image stamping when text is not WinAnsi (e.g. Nepali)', async () => {
    expect(isWinAnsi('Hello')).toBe(true);
    expect(isWinAnsi('नमस्ते')).toBe(false);
    const src = await makePdf(1, { form: true });
    expect(await code(fillAndSign(src, { fields: { name: 'नमस्ते' } }))).toBe('font-unsupported');
  });
});

describe('history', () => {
  it('keeps newest first, caps size and stores no content', () => {
    const h = new History(new MemoryStore());
    for (let i = 0; i < MAX_ENTRIES + 5; i++) {
      h.add({ tool: 'merge', inputs: [`a${i}.pdf`], output: 'o.pdf', outputSize: 10, ok: true }, i);
    }
    const list = h.list();
    expect(list.length).toBe(MAX_ENTRIES);
    expect(list[0].inputs).toEqual([`a${MAX_ENTRIES + 4}.pdf`]);
    expect(Object.keys(list[0]).sort()).toEqual(['at', 'id', 'inputs', 'ok', 'output', 'outputSize', 'tool']);
    h.clear();
    expect(h.list()).toEqual([]);
  });
  it('survives corrupt storage and names outputs beside the original', () => {
    const s = new MemoryStore();
    s.setItem('pdfapp.history.v1', '{nope');
    expect(new History(s).list()).toEqual([]);
    expect(outputName('scan.final.pdf', 'compressed')).toBe('scan.final-compressed.pdf');
    expect(formatBytes(10 * 1024 * 1024)).toBe('10.0 MB');
  });
});

describe('compress estimate', async () => {
  const { estimateRasterSize, RASTER_PAGE_OVERHEAD } = await import('../src/core/compress');
  it('scales the sampled page size by the page count', () => {
    expect(estimateRasterSize([], 3)).toBeNull();
    expect(estimateRasterSize([1000], 0)).toBeNull();
    expect(estimateRasterSize([1000, 3000], 10)).toBe((2000 + RASTER_PAGE_OVERHEAD) * 10 + 1024);
  });
});
