import { PDFDocument } from 'pdf-lib';
import { PdfError } from './errors';
import { loadPdf } from './load';

export type Progress = (done: number, total: number) => void;

/** Merges PDFs in the given order into a new document. Inputs are never modified. */
export async function mergePdfs(inputs: Uint8Array[], onProgress?: Progress): Promise<Uint8Array> {
  if (inputs.length === 0) throw new PdfError('no-input');
  const out = await PDFDocument.create();
  for (let i = 0; i < inputs.length; i++) {
    const src = await loadPdf(inputs[i]);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
    onProgress?.(i + 1, inputs.length);
  }
  return out.save({ useObjectStreams: true });
}
