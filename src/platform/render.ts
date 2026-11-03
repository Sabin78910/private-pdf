import * as pdfjs from 'pdfjs-dist';
import type { PageRasterizer } from '../core/compress';

// Bundled as a .js worker (not .mjs) so Android's WebView serves it with a JS MIME type.
pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url), {
  type: 'module',
});

export type PdfJsDoc = pdfjs.PDFDocumentProxy;

/** Opens a PDF with pdf.js. pdf.js takes ownership of the buffer, so we pass a copy. */
export async function openPdf(bytes: Uint8Array): Promise<PdfJsDoc> {
  return pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
}

/** Renders a page at `dpi`, capped so a huge page cannot exhaust phone memory. */
export async function renderPage(doc: PdfJsDoc, index: number, dpi: number, maxPixels = 16_000_000) {
  const page = await doc.getPage(index + 1);
  let scale = dpi / 72;
  const base = page.getViewport({ scale: 1 });
  const px = base.width * base.height * scale * scale;
  if (px > maxPixels) scale *= Math.sqrt(maxPixels / px);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d', { alpha: false })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  page.cleanup();
  return { canvas, widthPt: base.width, heightPt: base.height };
}

export function canvasToBytes(canvas: HTMLCanvasElement, type: 'image/jpeg' | 'image/png', quality = 0.85) {
  return new Promise<Uint8Array>((resolve, reject) =>
    canvas.toBlob(
      async (b) => (b ? resolve(new Uint8Array(await b.arrayBuffer())) : reject(new Error('memory'))),
      type,
      quality,
    ),
  );
}

export function rasterizerFor(doc: PdfJsDoc): PageRasterizer {
  return async (index, dpi, quality) => {
    const { canvas, widthPt, heightPt } = await renderPage(doc, index, dpi);
    const jpeg = await canvasToBytes(canvas, 'image/jpeg', quality);
    canvas.width = canvas.height = 0; // release memory early on phones
    return { jpeg, width: widthPt, height: heightPt };
  };
}

export async function thumbnail(doc: PdfJsDoc, index: number, cssWidth = 140): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(index + 1);
  const base = page.getViewport({ scale: 1 });
  const dpi = ((cssWidth * (window.devicePixelRatio || 1)) / base.width) * 72;
  const { canvas } = await renderPage(doc, index, dpi);
  canvas.style.width = `${cssWidth}px`;
  return canvas;
}
