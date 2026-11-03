import { PDFDocument, PageSizes } from 'pdf-lib';
import { PdfError } from './errors';
import type { Progress } from './merge';

export type ImageKind = 'jpeg' | 'png';
export interface ImageInput {
  bytes: Uint8Array;
  kind: ImageKind;
}
/** 'fit' = page matches the image; 'a4' = image centred on A4 with a margin. */
export type PageFit = 'fit' | 'a4';

export function sniffImageKind(bytes: Uint8Array): ImageKind | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  return null;
}

/** Scales (w,h) to fit inside (maxW,maxH) keeping aspect ratio. */
export function fitInside(w: number, h: number, maxW: number, maxH: number) {
  const s = Math.min(maxW / w, maxH / h);
  return { width: w * s, height: h * s };
}

export async function imagesToPdf(
  images: ImageInput[],
  fit: PageFit = 'a4',
  onProgress?: Progress,
): Promise<Uint8Array> {
  if (images.length === 0) throw new PdfError('no-input');
  const doc = await PDFDocument.create();
  for (let i = 0; i < images.length; i++) {
    const { bytes, kind } = images[i];
    if (sniffImageKind(bytes) !== kind) throw new PdfError('unsupported-image', `image ${i + 1}`);
    const img = kind === 'jpeg' ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
    if (fit === 'fit') {
      // 1 image pixel = 1 pt keeps phone photos at a sensible physical size after scaling to 96 dpi.
      const w = (img.width * 72) / 96;
      const h = (img.height * 72) / 96;
      const page = doc.addPage([w, h]);
      page.drawImage(img, { x: 0, y: 0, width: w, height: h });
    } else {
      const landscape = img.width > img.height;
      const [pw, ph] = landscape ? [PageSizes.A4[1], PageSizes.A4[0]] : PageSizes.A4;
      const margin = 24;
      const size = fitInside(img.width, img.height, pw - 2 * margin, ph - 2 * margin);
      const page = doc.addPage([pw, ph]);
      page.drawImage(img, { x: (pw - size.width) / 2, y: (ph - size.height) / 2, ...size });
    }
    onProgress?.(i + 1, images.length);
  }
  return doc.save({ useObjectStreams: true });
}
