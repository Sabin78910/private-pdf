import { PDFDocument } from 'pdf-lib';
import { loadPdf } from './load';
import type { Progress } from './merge';

export type CompressLevel = 'low' | 'medium' | 'high';

/** Raster settings per level. 'low' is lossless (structure only), so text stays selectable. */
export const LEVEL_SETTINGS: Record<CompressLevel, { dpi: number; quality: number } | null> = {
  low: null,
  medium: { dpi: 120, quality: 0.6 },
  high: { dpi: 85, quality: 0.45 },
};

export interface RenderedPage {
  jpeg: Uint8Array;
  /** Page size in PDF points (unrotated as displayed). */
  width: number;
  height: number;
}

/** Renders page `index` to JPEG. Supplied by the platform layer (pdf.js + canvas). */
export type PageRasterizer = (index: number, dpi: number, quality: number) => Promise<RenderedPage>;

export interface CompressResult {
  bytes: Uint8Array;
  originalSize: number;
  compressedSize: number;
  /** Percent saved, negative when the output is larger. */
  savedPercent: number;
  /** True when compression did not help; the UI should warn and offer the original. */
  notSmaller: boolean;
}

export function summarize(originalSize: number, bytes: Uint8Array): CompressResult {
  const compressedSize = bytes.length;
  const savedPercent = originalSize === 0 ? 0 : Math.round((1 - compressedSize / originalSize) * 1000) / 10;
  return { bytes, originalSize, compressedSize, savedPercent, notSmaller: compressedSize >= originalSize };
}

/** Lossless: rewrite with object streams and drop unused objects and metadata bloat. */
export async function compressLossless(bytes: Uint8Array): Promise<CompressResult> {
  const doc = await loadPdf(bytes);
  const out = await PDFDocument.create();
  const pages = await out.copyPages(doc, doc.getPageIndices());
  pages.forEach((p) => out.addPage(p));
  out.setTitle(doc.getTitle() ?? '');
  return summarize(bytes.length, await out.save({ useObjectStreams: true }));
}

/**
 * Lossy: re-renders every page as a JPEG at reduced DPI. This is what shrinks scanned PDFs,
 * which are the common 10 MB+ case. Text becomes an image, so we recommend OCR afterwards.
 */
export async function compressRaster(
  bytes: Uint8Array,
  pageCount: number,
  rasterize: PageRasterizer,
  level: Exclude<CompressLevel, 'low'>,
  onProgress?: Progress,
): Promise<CompressResult> {
  const { dpi, quality } = LEVEL_SETTINGS[level]!;
  const out = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const r = await rasterize(i, dpi, quality);
    const img = await out.embedJpg(r.jpeg);
    const page = out.addPage([r.width, r.height]);
    page.drawImage(img, { x: 0, y: 0, width: r.width, height: r.height });
    onProgress?.(i + 1, pageCount);
  }
  return summarize(bytes.length, await out.save({ useObjectStreams: true }));
}
