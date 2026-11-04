import { h, clear } from '../ui/dom';
import { t } from '../i18n';
import { Runner, filePicker, fileChip, isPdfFile } from '../ui/common';
import { readFile } from '../platform/files';
import { canvasToBytes, openPdf, renderPage, type PdfJsDoc } from '../platform/render';
import { runJob } from '../platform/jobs';
import { normalizeBox, type FlatPage, type RedactBox } from '../core/redact';
import { outputName } from '../core/history';
import { PdfError } from '../core/errors';

const OUT_DPI = 200;

function paintBoxes(ctx: CanvasRenderingContext2D, boxes: RedactBox[], w: number, h: number) {
  ctx.fillStyle = '#000';
  for (const b of boxes) ctx.fillRect(b.x * w, b.y * h, b.w * w, b.h * h);
}

/** Black out text or images for real: redacted pages are rebuilt as flat images, so nothing can be copied back out. */
export function redactTool(root: HTMLElement) {
  let file: File | null = null;
  let bytes: Uint8Array | null = null;
  let doc: PdfJsDoc | null = null;
  let index = 0;
  const boxes = new Map<number, RedactBox[]>();
  const runner = new Runner('redact');
  const body = h('div');
  const stage = h('div', { class: 'redact-stage' });
  const count = () => [...boxes.values()].reduce((n, b) => n + b.length, 0);

  const showPage = async () => {
    const width = Math.min(stage.clientWidth || 360, 720);
    const page = await doc!.getPage(index + 1);
    const base = page.getViewport({ scale: 1 });
    const { canvas } = await renderPage(doc!, index, ((width * (devicePixelRatio || 1)) / base.width) * 72);
    const view = h('canvas', { class: 'editor', width: canvas.width, height: canvas.height });
    const ctx = view.getContext('2d')!;
    const list = boxes.get(index) ?? [];
    const paint = (extra?: RedactBox | null) => {
      ctx.drawImage(canvas, 0, 0);
      paintBoxes(ctx, extra ? [...list, extra] : list, view.width, view.height);
    };
    let start: { x: number; y: number } | null = null;
    const at = (e: PointerEvent) => {
      const r = view.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    };
    view.addEventListener('pointerdown', (e) => ((start = at(e)), view.setPointerCapture(e.pointerId)));
    view.addEventListener('pointermove', (e) => start && paint(normalizeBox(start.x, start.y, at(e).x, at(e).y)));
    view.addEventListener('pointerup', (e) => {
      if (!start) return;
      const p = at(e);
      const box = normalizeBox(start.x, start.y, p.x, p.y);
      start = null;
      if (box) list.push(box);
      else {
        // A tap on a box removes it.
        const hit = list.findIndex((b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h);
        if (hit >= 0) list.splice(hit, 1);
      }
      boxes.set(index, list);
      paint();
      draw();
    });
    view.style.touchAction = 'none';
    paint();
    clear(stage, view);
  };

  const draw = () => {
    if (!file || !doc) return clear(body);
    const n = doc.numPages;
    clear(
      body,
      h('ul', { class: 'list' }, fileChip(file.name, file.size)),
      h('p', { class: 'muted small', style: 'margin:12px 0' }, t('redact.hint')),
      h('div', { class: 'row' },
        h('button', { class: 'btn', disabled: index === 0, onclick: () => ((index -= 1), draw(), void showPage()) }, '←'),
        h('span', { class: 'grow', style: 'text-align:center' }, `${t('page')} ${index + 1} / ${n}`),
        h('button', { class: 'btn', disabled: index >= n - 1, onclick: () => ((index += 1), draw(), void showPage()) }, '→')),
      stage,
      h('button', { class: 'btn primary run', id: 'run', disabled: count() === 0, onclick: () => start() }, t('action.redact'), ` (${count()})`),
    );
  };

  const load = async (f: File) => {
    runner.reset();
    file = f;
    bytes = await readFile(f);
    try {
      doc = await openPdf(bytes);
    } catch {
      return runner.fail(new PdfError('corrupted'), () => runner.reset());
    }
    index = 0;
    boxes.clear();
    draw();
    await showPage();
  };

  const start = () =>
    runner.run(
      async ({ setCancel, progress }) => {
        let stop = false;
        setCancel(() => (stop = true));
        const pages = [...boxes.entries()].filter(([, b]) => b.length);
        const flat: FlatPage[] = [];
        for (let k = 0; k < pages.length; k++) {
          if (stop) throw new PdfError('cancelled');
          progress(k, pages.length + 1);
          const [i, list] = pages[k];
          const { canvas, widthPt, heightPt } = await renderPage(doc!, i, OUT_DPI);
          paintBoxes(canvas.getContext('2d')!, list, canvas.width, canvas.height);
          flat.push({ index: i, jpeg: await canvasToBytes(canvas, 'image/jpeg', 0.88), width: widthPt, height: heightPt });
          canvas.width = canvas.height = 0;
        }
        const job = runJob<Uint8Array>({ op: 'redact', bytes: bytes!, flat });
        setCancel(job.cancel);
        return job.promise;
      },
      (out) => ({ files: [{ name: outputName(file!.name, 'redacted'), bytes: out, mime: 'application/pdf' }], inputs: [file!.name] }),
      start,
    );

  clear(root, filePicker({ accept: 'application/pdf,.pdf', label: 'choosePdf', onFiles: (fs) => {
    const f = fs.find(isPdfFile);
    if (f) void load(f);
  } }), body, runner.el);
}
