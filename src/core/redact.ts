import { PDFDocument } from 'pdf-lib';
import { loadPdf } from './load';
import { PdfError } from './errors';

/** A box to black out, as fractions (0..1) of the page as the reader sees it, from the top-left. */
export interface RedactBox {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface FlatPage {
  index: number;
  jpeg: Uint8Array;
  /** Page size in points, as shown (rotation applied). */
  width: number;
  height: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Normalises a dragged box (any corner order), clips it to the page and drops slivers. */
export function normalizeBox(x0: number, y0: number, x1: number, y1: number, min = 0.005): RedactBox | null {
  const x = clamp01(Math.min(x0, x1));
  const y = clamp01(Math.min(y0, y1));
  const w = clamp01(Math.max(x0, x1)) - x;
  const h = clamp01(Math.max(y0, y1)) - y;
  return w >= min && h >= min ? { x, y, w, h } : null;
}

/**
 * Builds a new PDF where every redacted page is replaced by a flat image of itself with the boxes
 * burned in. Other pages are copied as they are. A fresh document is used so no text, fonts or
 * objects from the redacted pages survive anywhere in the file.
 */
export async function applyRedactions(bytes: Uint8Array, flat: FlatPage[]): Promise<Uint8Array> {
  if (flat.length === 0) throw new PdfError('no-input');
  const src = await loadPdf(bytes);
  const n = src.getPageCount();
  const byIndex = new Map(flat.map((p) => [p.index, p]));
  if ([...byIndex.keys()].some((i) => i < 0 || i >= n)) throw new PdfError('invalid-range');
  const out = await PDFDocument.create();
  const keep = [...Array(n).keys()].filter((i) => !byIndex.has(i));
  const copied = new Map((await out.copyPages(src, keep)).map((p, k) => [keep[k], p]));
  for (let i = 0; i < n; i++) {
    const f = byIndex.get(i);
    if (!f) {
      out.addPage(copied.get(i)!);
      continue;
    }
    const img = await out.embedJpg(f.jpeg);
    const page = out.addPage([f.width, f.height]);
    page.drawImage(img, { x: 0, y: 0, width: f.width, height: f.height });
  }
  return out.save({ useObjectStreams: true });
}
