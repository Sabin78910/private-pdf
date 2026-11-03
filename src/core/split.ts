import { PDFDocument } from 'pdf-lib';
import { PdfError } from './errors';
import { loadPdf } from './load';
import type { Progress } from './merge';

async function copyInto(src: PDFDocument, indices: number[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, indices);
  pages.forEach((p) => out.addPage(p));
  return out.save({ useObjectStreams: true });
}

/** Extracts the given zero-based pages, in order, into one new PDF. */
export async function extractPages(bytes: Uint8Array, indices: number[]): Promise<Uint8Array> {
  const src = await loadPdf(bytes);
  if (indices.length === 0) throw new PdfError('invalid-range', 'no pages selected');
  const n = src.getPageCount();
  if (indices.some((i) => i < 0 || i >= n)) throw new PdfError('invalid-range');
  return copyInto(src, indices);
}

/** Splits into chunks of `every` pages (every=1 gives one PDF per page). */
export async function splitEvery(
  bytes: Uint8Array,
  every: number,
  onProgress?: Progress,
): Promise<Uint8Array[]> {
  if (!Number.isInteger(every) || every < 1) throw new PdfError('invalid-range', 'chunk size');
  const src = await loadPdf(bytes);
  const n = src.getPageCount();
  const parts: Uint8Array[] = [];
  const total = Math.ceil(n / every);
  for (let start = 0; start < n; start += every) {
    const idx = Array.from({ length: Math.min(every, n - start) }, (_, k) => start + k);
    parts.push(await copyInto(src, idx));
    onProgress?.(parts.length, total);
  }
  return parts;
}
