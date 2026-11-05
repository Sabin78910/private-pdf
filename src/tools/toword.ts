import { h, clear } from '../ui/dom';
import { t } from '../i18n';
import { Runner, filePicker, fileChip, isPdfFile, libraryFile } from '../ui/common';
import { readFile } from '../platform/files';
import { openPdf } from '../platform/render';
import { buildDocx, toParagraphs, type TextItem } from '../core/toWord';
import { PdfError } from '../core/errors';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** PDF text to an editable Word file. Runs on the device; scanned PDFs need OCR first. */
export function toWordTool(root: HTMLElement) {
  let file: File | null = null;
  const runner = new Runner('toword');
  const body = h('div');

  const draw = () => {
    if (!file) return clear(body);
    clear(body,
      h('ul', { class: 'list' }, fileChip(file.name, file.size)),
      h('p', { class: 'muted small', style: 'margin:12px 0' }, t('toword.hint')),
      h('button', { class: 'btn primary run', id: 'run', onclick: () => start() }, t('action.toword')));
  };

  const start = () =>
    runner.run(
      async ({ setCancel, progress }) => {
        let stop = false;
        setCancel(() => (stop = true));
        const doc = await openPdf(await readFile(file!));
        const pages: string[][] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          if (stop) throw new PdfError('cancelled');
          progress(i - 1, doc.numPages);
          const page = await doc.getPage(i);
          const content = await page.getTextContent();
          const items: TextItem[] = content.items.flatMap((it) =>
            'str' in it ? [{ str: it.str, x: it.transform[4], y: it.transform[5], h: it.height || Math.hypot(it.transform[2], it.transform[3]) }] : []);
          pages.push(toParagraphs(items));
          page.cleanup();
        }
        await doc.destroy();
        return buildDocx(pages);
      },
      (out) => ({ files: [{ name: file!.name.replace(/\.pdf$/i, '') + '.docx', bytes: out, mime: DOCX }], inputs: [file!.name] }),
      start,
    );

  clear(root, filePicker({ accept: 'application/pdf,.pdf', label: 'choosePdf', onFiles: (fs) => {
    const f = fs.find(isPdfFile);
    if (f) ((file = f), runner.reset(), draw());
  } }), body, runner.el);
  void libraryFile().then((f) => f && ((file = f), draw()));
}
