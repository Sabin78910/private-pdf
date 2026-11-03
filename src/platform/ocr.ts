import { createWorker, OEM, type Worker } from 'tesseract.js';

/**
 * Tesseract runs in a Web Worker with the engine and Nepali + English models served from
 * this app (public/ocr). No CDN, no upload: OCR works fully offline.
 */
export type OcrLang = 'eng' | 'nep' | 'nep+eng';

let cached: { lang: OcrLang; worker: Promise<Worker> } | null = null;

export function getOcrWorker(lang: OcrLang, onProgress?: (p: number) => void): Promise<Worker> {
  progressSink = onProgress;
  if (cached?.lang === lang) return cached.worker;
  void cached?.worker.then((w) => w.terminate());
  const base = new URL('ocr/', document.baseURI).href;
  const worker = createWorker(lang, OEM.LSTM_ONLY, {
    workerPath: `${base}worker.min.js`,
    corePath: `${base}core`,
    langPath: `${base}lang`,
    gzip: true,
    workerBlobURL: false,
    cacheMethod: 'none',
    logger: (m) => {
      if (m.status === 'recognizing text') progressSink?.(m.progress);
    },
  });
  cached = { lang, worker };
  worker.catch(() => (cached = null));
  return worker;
}
let progressSink: ((p: number) => void) | undefined;

export async function terminateOcr() {
  if (!cached) return;
  const w = cached.worker;
  cached = null;
  await (await w).terminate();
}

/** Recognises one image. Returns plain text and a single-page searchable PDF. */
export async function recognize(lang: OcrLang, image: HTMLCanvasElement, wantPdf: boolean) {
  const worker = await getOcrWorker(lang);
  const { data } = await worker.recognize(image, { pdfTitle: 'OCR' }, { text: true, pdf: wantPdf });
  return { text: data.text, pdf: data.pdf ? Uint8Array.from(data.pdf) : null };
}
