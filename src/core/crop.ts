import { loadPdf } from './load';
import { PdfError } from './errors';

/** Margins to trim, in millimetres, as the reader sees the page. */
export interface CropMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
const PT = 72 / 25.4;
/** Smallest page side left after cropping, in points (about 1 cm). */
export const MIN_SIDE = 28;

/**
 * Maps on-screen margins to the page's own (unrotated) sides.
 * A page shown rotated 90° clockwise has its own left edge at the top.
 */
export function marginsForRotation(m: CropMargins, angle: number): CropMargins {
  switch (((angle % 360) + 360) % 360) {
    case 90:
      return { top: m.right, right: m.bottom, bottom: m.left, left: m.top };
    case 180:
      return { top: m.bottom, right: m.left, bottom: m.top, left: m.right };
    case 270:
      return { top: m.left, right: m.top, bottom: m.right, left: m.bottom };
    default:
      return m;
  }
}

/** Trims the same margins from every page by setting its crop box. Content outside stays in the file but is hidden. */
export async function cropPages(bytes: Uint8Array, margins: CropMargins): Promise<Uint8Array> {
  const vals = [margins.top, margins.right, margins.bottom, margins.left];
  if (vals.some((v) => !Number.isFinite(v) || v < 0)) throw new PdfError('invalid-range');
  if (vals.every((v) => v === 0)) throw new PdfError('no-input');
  const doc = await loadPdf(bytes);
  for (const page of doc.getPages()) {
    const m = marginsForRotation(margins, page.getRotation().angle);
    const box = page.getCropBox();
    const width = box.width - (m.left + m.right) * PT;
    const height = box.height - (m.top + m.bottom) * PT;
    if (width < MIN_SIDE || height < MIN_SIDE) throw new PdfError('invalid-range', 'crop too large');
    page.setCropBox(box.x + m.left * PT, box.y + m.bottom * PT, width, height);
  }
  return doc.save({ useObjectStreams: true });
}

/** Bakes form fields into the page so they can no longer be edited. */
export async function flattenForm(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  const form = doc.getForm();
  if (form.getFields().length === 0) throw new PdfError('no-form');
  form.flatten();
  return doc.save({ useObjectStreams: true });
}
