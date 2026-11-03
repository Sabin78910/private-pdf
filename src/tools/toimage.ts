import { h, clear } from '../ui/dom';
import { t } from '../i18n';
import { Runner, filePicker, fileChip, isPdfFile, select } from '../ui/common';
import { bundle, readFile, type OutputFile } from '../platform/files';
import { canvasToBytes, openPdf, renderPage } from '../platform/render';
import { parsePageRanges } from '../core/pageRanges';
import { outputName } from '../core/history';
import { loadPdf } from '../core/load';
import { PdfError } from '../core/errors';

export function toImageTool(root: HTMLElement) {
  let file: File | null = null;
  let format: 'jpg' | 'png' = 'jpg';
  let dpi: '72' | '150' | '300' = '150';
  const range = h('input', { type: 'text', id: 'range', placeholder: '1-' });
  const runner = new Runner('toimage');
  const body = h('div');

  const draw = () => {
    if (!file) return clear(body);
    clear(
      body,
      h('ul', { class: 'list' }, fileChip(file.name, file.size)),
      h('div', { class: 'row wrap' },
        select('format', [['jpg', { text: 'JPG' }], ['png', { text: 'PNG' }]], format, (v) => (format = v)),
        select('resolution', [['72', { text: '72 dpi' }], ['150', { text: '150 dpi' }], ['300', { text: '300 dpi' }]], dpi, (v) => (dpi = v))),
      h('div', { class: 'field' }, h('label', { for: 'range' }, t('pageRange')), range),
      h('button', { class: 'btn primary run', id: 'run', onclick: () => start() }, t('action.toimage')),
    );
  };

  const start = () =>
    runner.run(
      async ({ setCancel, progress }) => {
        const bytes = await readFile(file!);
        await loadPdf(bytes);
        const doc = await openPdf(bytes);
        let stop = false;
        setCancel(() => ((stop = true), void doc.destroy()));
        const pages = range.value.trim() ? parsePageRanges(range.value, doc.numPages) : [...Array(doc.numPages).keys()];
        const out: OutputFile[] = [];
        for (const [k, i] of pages.entries()) {
          if (stop) throw new PdfError('cancelled');
          const { canvas } = await renderPage(doc, i, Number(dpi));
          const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
          out.push({ name: outputName(file!.name, `page${i + 1}`, format), bytes: await canvasToBytes(canvas, mime, 0.9), mime });
          canvas.width = canvas.height = 0;
          progress(k + 1, pages.length);
        }
        void doc.destroy();
        return out;
      },
      (out) => ({ files: [bundle(out, outputName(file!.name, 'images', 'zip'))], inputs: [file!.name] }),
      start,
    );

  clear(root, filePicker({ accept: 'application/pdf,.pdf', label: 'choosePdf', onFiles: (fs) => ((file = fs.filter(isPdfFile)[0] ?? null), runner.reset(), draw()) }), body, runner.el);
}
