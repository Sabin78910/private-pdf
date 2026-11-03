import { PDFDocument } from 'pdf-lib';
import { PdfError } from './errors';

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF

export function looksLikePdf(bytes: Uint8Array): boolean {
  // The header may be preceded by junk bytes; the spec allows it within the first 1 KB.
  const limit = Math.min(bytes.length - 4, 1024);
  for (let i = 0; i <= limit; i++) {
    if (PDF_MAGIC.every((b, j) => bytes[i + j] === b)) return true;
  }
  return false;
}

/** Loads a PDF and turns pdf-lib failures into actionable error codes. Never mutates input. */
export async function loadPdf(bytes: Uint8Array): Promise<PDFDocument> {
  if (bytes.length === 0) throw new PdfError('empty');
  if (!looksLikePdf(bytes)) throw new PdfError('corrupted', 'missing %PDF header');
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes.slice(), { updateMetadata: false });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (/encrypt/i.test(msg)) throw new PdfError('encrypted');
    throw new PdfError('corrupted', msg);
  }
  if (doc.isEncrypted) throw new PdfError('encrypted');
  if (doc.getPageCount() === 0) throw new PdfError('empty');
  return doc;
}
