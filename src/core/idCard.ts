import { PDFDocument, PageSizes } from 'pdf-lib';
import { PdfError } from './errors';
import { sniffImageKind, type ImageInput } from './imagesToPdf';

/** ISO/IEC 7810 ID-1 (bank cards, citizenship and driving licences) in millimetres. */
export const ID1_MM = { width: 85.6, height: 53.98 };
const PT_PER_MM = 72 / 25.4;
/** Pixel size of a flattened card at 300 dpi, so prints stay sharp. */
export const ID1_PX = { width: Math.round((ID1_MM.width / 25.4) * 300), height: Math.round((ID1_MM.height / 25.4) * 300) };

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Card boxes on an A4 page at true size, centred and stacked with a gap. PDF origin is bottom-left. */
export function idCardLayout(count: number, gapMm = 12): Box[] {
  const [pw, ph] = PageSizes.A4;
  const w = ID1_MM.width * PT_PER_MM;
  const h = ID1_MM.height * PT_PER_MM;
  const gap = gapMm * PT_PER_MM;
  const total = count * h + (count - 1) * gap;
  const top = (ph + total) / 2;
  return Array.from({ length: count }, (_, i) => ({ x: (pw - w) / 2, y: top - h - i * (h + gap), width: w, height: h }));
}

/** One A4 page with the front (and back, if given) of an ID card at real size, ready to print. */
export async function idCardPdf(sides: ImageInput[]): Promise<Uint8Array> {
  if (sides.length < 1 || sides.length > 2) throw new PdfError('no-input');
  const doc = await PDFDocument.create();
  const page = doc.addPage(PageSizes.A4);
  const boxes = idCardLayout(sides.length);
  for (let i = 0; i < sides.length; i++) {
    const { bytes, kind } = sides[i];
    if (sniffImageKind(bytes) !== kind) throw new PdfError('unsupported-image', `image ${i + 1}`);
    const img = kind === 'jpeg' ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
    page.drawImage(img, boxes[i]);
  }
  return doc.save({ useObjectStreams: true });
}
