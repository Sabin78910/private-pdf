import { h, clear } from '../ui/dom';
import { t } from '../i18n';
import { Runner, filePicker, isPdfFile } from '../ui/common';
import { readFile } from '../platform/files';
import { openPdf, thumbnail, type PdfJsDoc } from '../platform/render';
import { runJob } from '../platform/jobs';
import { identityPlan, rotateBy, type PagePlanItem } from '../core/organize';
import { loadPdf } from '../core/load';
import { outputName } from '../core/history';

export function organizeTool(root: HTMLElement) {
  let file: File | null = null;
  let bytes: Uint8Array | null = null;
  let doc: PdfJsDoc | null = null;
  let plan: PagePlanItem[] = [];
  const thumbs = new Map<number, Promise<HTMLCanvasElement>>();
  const grid = h('ol', { class: 'pages' });
  const toolbar = h('div', { class: 'row wrap' });
  const runner = new Runner('organize');

  const thumbFor = (source: number) => {
    if (!thumbs.has(source)) thumbs.set(source, thumbnail(doc!, source));
    return thumbs.get(source)!;
  };

  const update = (fn: (p: PagePlanItem[]) => PagePlanItem[]) => ((plan = fn([...plan])), draw());

  const draw = () => {
    clear(
      grid,
      plan.map((item, i) => {
        const frame = h('div', { class: 'frame', style: `transform: rotate(${item.rotate}deg)` });
        if (item.source === 'blank') frame.append(h('div', { class: 'blank' }));
        else void thumbFor(item.source).then((c) => frame.append(copyCanvas(c)));
        const li = h('li', { class: 'page', draggable: true },
          frame,
          h('div', { class: 'muted small' }, `${i + 1}`),
          h('div', { class: 'row wrap tools' },
            h('button', { class: 'icon', 'aria-label': t('moveUp'), disabled: i === 0, onclick: () => update((p) => (p.splice(i - 1, 0, ...p.splice(i, 1)), p)) }, '←'),
            h('button', { class: 'icon', 'aria-label': t('moveDown'), disabled: i === plan.length - 1, onclick: () => update((p) => (p.splice(i + 1, 0, ...p.splice(i, 1)), p)) }, '→'),
            h('button', { class: 'icon', 'aria-label': t('rotateLeft'), onclick: () => update((p) => ((p[i] = { ...p[i], rotate: rotateBy(p[i].rotate, -90) }), p)) }, '⟲'),
            h('button', { class: 'icon', 'aria-label': t('rotateRight'), onclick: () => update((p) => ((p[i] = { ...p[i], rotate: rotateBy(p[i].rotate, 90) }), p)) }, '⟳'),
            h('button', { class: 'icon', 'aria-label': t('duplicate'), onclick: () => update((p) => (p.splice(i + 1, 0, { ...p[i] }), p)) }, '⧉'),
            h('button', { class: 'icon', 'aria-label': t('insertBlank'), onclick: () => update((p) => (p.splice(i + 1, 0, { source: 'blank', rotate: 0 }), p)) }, '＋'),
            h('button', { class: 'icon', 'aria-label': t('delete'), disabled: plan.length === 1, onclick: () => update((p) => (p.splice(i, 1), p)) }, '🗑')));
        // Drag and drop reorder (desktop); buttons cover touch and keyboard.
        li.addEventListener('dragstart', (e) => e.dataTransfer?.setData('text/plain', String(i)));
        li.addEventListener('dragover', (e) => e.preventDefault());
        li.addEventListener('drop', (e) => {
          e.preventDefault();
          const from = Number(e.dataTransfer?.getData('text/plain'));
          if (Number.isInteger(from) && from !== i) update((p) => (p.splice(i, 0, ...p.splice(from, 1)), p));
        });
        return li;
      }),
    );
  };
  // A canvas can sit in one place only and cloneNode drops its pixels, so copy them.
  function copyCanvas(src: HTMLCanvasElement) {
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    c.style.width = src.style.width;
    c.getContext('2d')!.drawImage(src, 0, 0);
    return c;
  }

  const load = (f: File) =>
    runner.run(
      async () => {
        file = f;
        bytes = await readFile(f);
        const n = (await loadPdf(bytes)).getPageCount();
        void doc?.destroy();
        thumbs.clear();
        doc = await openPdf(bytes);
        return n;
      },
      (n) => {
        plan = identityPlan(n);
        clear(toolbar,
          h('button', { class: 'btn', onclick: () => ((plan = identityPlan(n)), draw()) }, t('reset')),
          h('button', { class: 'btn primary', onclick: () => start() }, t('start')));
        draw();
        queueMicrotask(() => runner.reset());
        return { files: [], inputs: [] };
      },
      () => load(f),
    );

  const start = () =>
    runner.run(
      async ({ setCancel }) => {
        const job = runJob<Uint8Array>({ op: 'organize', bytes: bytes!, plan });
        setCancel(job.cancel);
        return job.promise;
      },
      (out) => ({ files: [{ name: outputName(file!.name, 'organized'), bytes: out, mime: 'application/pdf' }], inputs: [file!.name] }),
      start,
    );

  clear(root, filePicker({ accept: 'application/pdf,.pdf', label: 'choosePdf', onFiles: (fs) => fs.filter(isPdfFile)[0] && load(fs.filter(isPdfFile)[0]) }), toolbar, grid, runner.el);
}
