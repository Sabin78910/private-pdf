import { StandardFonts, degrees, rgb } from 'pdf-lib';
import { PdfError } from './errors';
import { isWinAnsi } from './fillSign';
import { loadPdf } from './load';
import { toPageSpace } from './pageNumbers';

export type WatermarkLayout = 'diagonal' | 'center' | 'footer';

export interface WatermarkOptions {
  text: string;
  layout: WatermarkLayout;
  /** 0.05 (faint) .. 1 (solid). */
  opacity: number;
}

export const MAX_TEXT = 60;

/** Font size that makes the text span about 70% of the page's diagonal (or width), capped for short words. */
export function fitSize(textWidthAt1: number, span: number, max = 96): number {
  if (textWidthAt1 <= 0) return max;
  return Math.max(8, Math.min(max, (span * 0.7) / textWidthAt1));
}

/** Stamps a text watermark on every page, upright as the reader sees it. Returns a new PDF. */
export async function addWatermark(bytes: Uint8Array, opts: WatermarkOptions): Promise<Uint8Array> {
  const text = opts.text.trim().replace(/\s+/g, ' ');
  if (!text) throw new PdfError('no-input');
  if (text.length > MAX_TEXT || !isWinAnsi(text)) throw new PdfError('text-unsupported');
  const opacity = Math.min(1, Math.max(0.05, Number.isFinite(opts.opacity) ? opts.opacity : 0.2));
  const doc = await loadPdf(bytes);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const unit = font.widthOfTextAtSize(text, 1);
  for (const page of doc.getPages()) {
    const { width: w, height: h } = page.getSize();
    const rotation = page.getRotation().angle;
    const sideways = rotation % 180 !== 0;
    const vw = sideways ? h : w;
    const vh = sideways ? w : h;
    let angle = 0;
    let size: number;
    let vx: number;
    let vy: number;
    if (opts.layout === 'footer') {
      size = Math.min(12, fitSize(unit, vw));
      vx = (vw - unit * size) / 2;
      vy = 14;
    } else if (opts.layout === 'center') {
      size = fitSize(unit, vw);
      vx = (vw - unit * size) / 2;
      vy = (vh - size * 0.7) / 2;
    } else {
      angle = (Math.atan2(vh, vw) * 180) / Math.PI;
      size = fitSize(unit, Math.hypot(vw, vh));
      // Start the baseline so the rotated text is centred on the page.
      const rad = (angle * Math.PI) / 180;
      const len = unit * size;
      const lift = size * 0.35;
      vx = vw / 2 - (Math.cos(rad) * len) / 2 + Math.sin(rad) * lift;
      vy = vh / 2 - (Math.sin(rad) * len) / 2 - Math.cos(rad) * lift;
    }
    const p = toPageSpace(rotation, vx, vy, w, h);
    page.drawText(text, {
      x: p.x,
      y: p.y,
      size,
      font,
      color: rgb(0.55, 0.1, 0.1),
      opacity,
      rotate: degrees(p.rotate + angle),
    });
  }
  return doc.save({ useObjectStreams: true });
}
