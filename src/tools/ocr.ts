import { h, clear } from '../ui/dom';
import { t } from '../i18n';
import { Runner, filePicker, fileChip, isImageFile, isPdfFile, select } from '../ui/common';
import { readFile, type OutputFile } from '../platform/files';
import { openPdf, renderPage } from '../platform/render';
import { getOcrWorker, recognize, terminateOcr, type OcrLang } from '../platform/ocr';
import { runJob } from '../platform/jobs';
import { loadPdf } from '../core/load';
import { outputName } from '../core/history';
import { PdfError } from '../core/errors';

const OCR_DPI = 220; // good accuracy for Devanagari without exhausting phone memory

export function ocrTool(root: HTMLElement) {
  let files: File[] = [];
  let lang: OcrLang = 'nep+eng';
  let output: 'text' | 'pdf' = 'pdf';
  const runner = new Runner('ocr');
  const body = h('div');

  const draw = () => {
    if (!files.length) return clear(body);
    clear(
      body,
      h('ul', { class: 'list' }, files.map((f) => fileChip(f.name, f.size))),
      h('div', { class: 'row wrap' },
        select('ocrLangs', [['nep+eng', 'tool.ocr'], ['nep', 'tool.ocr'], ['eng', 'tool.ocr']], lang, (v) => (lang = v)),
        select('ocrOutput', [['pdf', 'ocr.pdf'], ['text', 'ocr.text']], output, (v) => (output = v))),
      h('button', { class: 'btn primary', onclick: () => start() }, t('start')),
    );
    const names: Record<string, string> = { 'nep+eng': 'नेपाली + English', nep: 'नेपाली', eng: 'English' };
    body.querySelectorAll('select')[0].querySelectorAll('option').forEach((o) => (o.textContent = names[o.value]));
  };

  /** Yields each page/image as a canvas so memory holds one page at a time. */
  async function* sources(): AsyncGenerator<{ canvas: HTMLCanvasElement; total: number }> {
    if (files.length === 1 && isPdfFile(files[0])) {
      const bytes = await readFile(files[0]);
      await loadPdf(bytes);
      const doc = await openPdf(bytes);
      try {
        for (let i = 0; i < doc.numPages; i++) yield { canvas: (await renderPage(doc, i, OCR_DPI, 9_000_000)).canvas, total: doc.numPages };
      } finally {
        void doc.destroy();
      }
      return;
    }
    for (const f of files) {
      const bmp = await createImageBitmap(f).catch(() => {
        throw new PdfError('unsupported-image');
      });
      const c = document.createElement('canvas');
      c.width = bmp.width;
      c.height = bmp.height;
      c.getContext('2d')!.drawImage(bmp, 0, 0);
      bmp.close();
      yield { canvas: c, total: files.length };
    }
  }

  const start = () =>
    runner.run(
      async ({ setCancel, progress }) => {
        let stop = false;
        setCancel(() => {
          stop = true;
          void terminateOcr();
        });
        progress(0, 0, t('ocrLoading'));
        const worker = await getOcrWorker(lang);
        await worker.setParameters({ user_defined_dpi: String(OCR_DPI), preserve_interword_spaces: '1' });
        const texts: string[] = [];
        const pdfs: Uint8Array[] = [];
        let n = 0;
        for await (const { canvas, total } of sources()) {
          if (stop) throw new PdfError('cancelled');
          progress(n, total);
          const r = await recognize(lang, canvas, output === 'pdf');
          canvas.width = canvas.height = 0;
          texts.push(r.text);
          if (r.pdf) pdfs.push(r.pdf);
          progress(++n, total);
        }
        let pdf: Uint8Array | null = null;
        if (output === 'pdf') {
          const job = runJob<Uint8Array>({ op: 'merge', inputs: pdfs });
          setCancel(job.cancel);
          pdf = await job.promise;
        }
        return { texts, pdf };
      },
      ({ texts, pdf }) => {
        const joined = texts.map((tx, i) => (texts.length > 1 ? `--- ${t('page')} ${i + 1} ---\n${tx}` : tx)).join('\n\n');
        const base = files[0].name;
        const out: OutputFile[] = pdf
          ? [{ name: outputName(base, 'searchable'), bytes: pdf, mime: 'application/pdf' }]
          : [{ name: outputName(base, 'text', 'txt'), bytes: new TextEncoder().encode(joined), mime: 'text/plain' }];
        const area = h('textarea', { class: 'ocr-text', readOnly: true, rows: 10, lang: 'ne', 'aria-label': t('ocr.text') }, joined);
        const copyBtn = h('button', { class: 'btn', onclick: async () => (await navigator.clipboard.writeText(joined), (copyBtn.textContent = t('copied'))) }, t('copy'));
        return { files: out, inputs: files.map((f) => f.name), extra: h('div', {}, area, copyBtn) };
      },
      start,
    );

  clear(
    root,
    filePicker({
      accept: 'application/pdf,.pdf,image/jpeg,image/png,image/webp',
      multiple: true,
      label: 'chooseImages',
      capture: true,
      onFiles: (fs) => {
        const pdf = fs.find(isPdfFile);
        files = pdf ? [pdf] : fs.filter(isImageFile);
        runner.reset();
        draw();
      },
    }),
    body,
    runner.el,
  );
}
