import { h, clear } from '../ui/dom';
import { t, type Key } from '../i18n';
import { Runner, filePicker, isImageFile, select } from '../ui/common';
import { runJob } from '../platform/jobs';
import { canvasToBytes } from '../platform/render';
import { cornerEditor, pageFromSource, processPage, type ScanPage } from './scan';
import { ID1_PX } from '../core/idCard';
import { PdfError } from '../core/errors';

const SIDES: Key[] = ['idcard.front', 'idcard.back'];

/** Front and back of an ID card, flattened to real card size on one A4 page. */
export function idCardTool(root: HTMLElement) {
  const sides: (ScanPage | null)[] = [null, null];
  let active = 0;
  const runner = new Runner('idcard');
  const body = h('div');

  const setSide = async (i: number, files: File[]) => {
    runner.reset();
    const f = files.find(isImageFile);
    if (!f) return runner.fail(new PdfError('unsupported-image'), () => runner.reset());
    try {
      const bmp = await createImageBitmap(f);
      const page = await pageFromSource(f.name, bmp);
      bmp.close();
      sides[i] = page;
      active = i === 0 && !sides[1] ? 1 : i;
    } catch {
      runner.fail(new PdfError('unsupported-image'), () => runner.reset());
    }
    draw();
  };

  const draw = () => {
    const page = sides[active];
    const ready = sides.filter(Boolean) as ScanPage[];
    clear(
      body,
      h('div', { class: 'opts seg', role: 'radiogroup', 'aria-label': t('tool.idcard') }, SIDES.map((key, i) => h('label', { class: 'opt' },
        h('input', { type: 'radio', name: 'idside', checked: i === active, onchange: () => ((active = i), draw()) }),
        h('span', { class: 'o-t' }, sides[i] ? '✓ ' : '', t(key))))),
      h('p', { class: 'muted small', style: 'margin:12px 0' }, t(active === 0 ? 'idcard.frontHint' : 'idcard.backHint')),
      page
        ? h('div', {},
            h('p', { class: 'muted small' }, t('autoDetect')),
            cornerEditor(page, () => {}),
            h('div', { class: 'row wrap' },
              select('filter', [['original', 'filter.original'], ['enhance', 'filter.enhance'], ['grayscale', 'filter.grayscale'], ['bw', 'filter.bw']], page.filter, (v) => (page.filter = v)),
              h('button', { class: 'btn ghost', onclick: () => ((sides[active] = null), draw()) }, t('idcard.retake'))))
        : filePicker({ accept: 'image/jpeg,image/png,image/webp', label: SIDES[active], capture: true, onFiles: (fs) => void setSide(active, fs) }),
      ready.length
        ? h('button', { class: 'btn primary run', id: 'run', onclick: () => start() }, t('action.idcard'), ` (${ready.length}/2)`)
        : null,
    );
  };

  const start = () =>
    runner.run(
      async ({ setCancel, progress }) => {
        const ready = sides.filter(Boolean) as ScanPage[];
        const images = [];
        for (let i = 0; i < ready.length; i++) {
          progress(i, ready.length + 1);
          await new Promise((r) => setTimeout(r));
          const c = processPage(ready[i], ID1_PX);
          images.push({ bytes: await canvasToBytes(c, 'image/jpeg', 0.9), kind: 'jpeg' as const });
          c.width = c.height = 0;
        }
        const job = runJob<Uint8Array>({ op: 'idcard', images });
        setCancel(job.cancel);
        return job.promise;
      },
      (bytes) => ({ files: [{ name: `id-card-${new Date().toISOString().slice(0, 10)}.pdf`, bytes, mime: 'application/pdf' }], inputs: (sides.filter(Boolean) as ScanPage[]).map((p) => p.name) }),
      start,
    );

  draw();
  clear(root, body, runner.el);
}
