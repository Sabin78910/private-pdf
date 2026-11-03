import { StandardFonts, degrees, rgb } from 'pdf-lib';
import { PdfError } from './errors';
import { loadPdf } from './load';

export type NumberPosition = 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right' | 'top-left';
export type NumberFormat = 'n' | 'n-of-total' | 'page-n-of-total';

export interface PageNumberOptions {
  position: NumberPosition;
  format: NumberFormat;
  /** Number printed on the first numbered page (e.g. 3 when a cover and contents come first). */
  startAt: number;
  /** Leave the first page (a cover) without a number. Counting still starts at `startAt` on page 2. */
  skipFirst: boolean;
  fontSize?: number;
}

/** Distance from the page edge, in points (about 10 mm). */
export const MARGIN = 28;

export function pageLabel(n: number, total: number, format: NumberFormat): string {
  if (format === 'n-of-total') return `${n} / ${total}`;
  if (format === 'page-n-of-total') return `Page ${n} of ${total}`;
  return String(n);
}

/**
 * Where the label's baseline starts, in the page as the reader sees it (origin bottom-left),
 * for a visual page of size vw x vh and a label textWidth wide.
 */
export function visualAnchor(position: NumberPosition, vw: number, vh: number, textWidth: number, size: number) {
  const [vert, horiz] = position.split('-') as ['top' | 'bottom', 'left' | 'center' | 'right'];
  const vx = horiz === 'left' ? MARGIN : horiz === 'right' ? vw - MARGIN - textWidth : (vw - textWidth) / 2;
  const vy = vert === 'bottom' ? MARGIN : vh - MARGIN - size;
  return { vx, vy };
}

/** Maps a point from reader view back to page space for a page rotated by `rotation` degrees. */
export function toPageSpace(rotation: number, vx: number, vy: number, w: number, h: number) {
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      return { x: w - vy, y: vx, rotate: 90 };
    case 180:
      return { x: w - vx, y: h - vy, rotate: 180 };
    case 270:
      return { x: vy, y: h - vx, rotate: 270 };
    default:
      return { x: vx, y: vy, rotate: 0 };
  }
}

/** Stamps page numbers on every page (optionally skipping a cover). Returns a new PDF. */
export async function addPageNumbers(bytes: Uint8Array, opts: PageNumberOptions): Promise<Uint8Array> {
  if (!Number.isInteger(opts.startAt) || opts.startAt < 0 || opts.startAt > 99999) throw new PdfError('invalid-range');
  const doc = await loadPdf(bytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const size = opts.fontSize ?? 10;
  const pages = doc.getPages();
  const numbered = opts.skipFirst ? pages.slice(1) : pages;
  const total = opts.startAt + numbered.length - 1;
  numbered.forEach((page, i) => {
    const text = pageLabel(opts.startAt + i, total, opts.format);
    const width = font.widthOfTextAtSize(text, size);
    const { width: w, height: h } = page.getSize();
    const rotation = page.getRotation().angle;
    const sideways = rotation % 180 !== 0;
    const { vx, vy } = visualAnchor(opts.position, sideways ? h : w, sideways ? w : h, width, size);
    const p = toPageSpace(rotation, vx, vy, w, h);
    page.drawText(text, { x: p.x, y: p.y, size, font, color: rgb(0.2, 0.2, 0.2), rotate: degrees(p.rotate) });
  });
  return doc.save({ useObjectStreams: true });
}
