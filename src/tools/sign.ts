import { h, clear } from '../ui/dom';
import { t } from '../i18n';
import { Runner, filePicker, isPdfFile } from '../ui/common';
import { readFile } from '../platform/files';
import { canvasToBytes, openPdf, type PdfJsDoc } from '../platform/render';
import { runJob } from '../platform/jobs';
import { isWinAnsi, listFormFields, type FormFieldInfo, type Stamp } from '../core/fillSign';
import { outputName } from '../core/history';

interface Pending {
  kind: 'signature' | 'text';
  png?: Uint8Array;
  preview?: HTMLCanvasElement;
  text?: string;
  fontSize?: number;
  /** Size in PDF points. */
  width: number;
  height: number;
}
type Placed = Stamp & { preview?: HTMLCanvasElement };

/** Signature pad for finger, stylus or mouse. Returns a trimmed transparent PNG canvas. */
function signaturePad(onDone: (c: HTMLCanvasElement) => void) {
  const pad = h('canvas', { class: 'sigpad', width: 600, height: 220, 'aria-label': t('drawSignature') });
  const ctx = pad.getContext('2d')!;
  ctx.lineWidth = 4;
  ctx.lineCap = ctx.lineJoin = 'round';
  ctx.strokeStyle = '#0b1f5c';
  let drawing = false;
  let any = false;
  const pt = (e: PointerEvent) => {
    const r = pad.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * pad.width, ((e.clientY - r.top) / r.height) * pad.height];
  };
  pad.style.touchAction = 'none';
  pad.addEventListener('pointerdown', (e) => {
    drawing = any = true;
    pad.setPointerCapture(e.pointerId);
    ctx.beginPath();
    ctx.moveTo(...(pt(e) as [number, number]));
  });
  pad.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    ctx.lineTo(...(pt(e) as [number, number]));
    ctx.stroke();
  });
  pad.addEventListener('pointerup', () => (drawing = false));
  const trim = () => {
    const d = ctx.getImageData(0, 0, pad.width, pad.height).data;
    let x0 = pad.width, y0 = pad.height, x1 = 0, y1 = 0;
    for (let y = 0; y < pad.height; y++)
      for (let x = 0; x < pad.width; x++)
        if (d[(y * pad.width + x) * 4 + 3] > 0) ((x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y)));
    const c = document.createElement('canvas');
    c.width = x1 - x0 + 9;
    c.height = y1 - y0 + 9;
    c.getContext('2d')!.drawImage(pad, x0 - 4, y0 - 4, c.width, c.height, 0, 0, c.width, c.height);
    return c;
  };
  return h('div', { class: 'card' },
    h('strong', {}, t('drawSignature')), pad,
    h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: () => ((any = false), ctx.clearRect(0, 0, pad.width, pad.height)) }, t('clear')),
      h('button', { class: 'btn primary', onclick: () => any && onDone(trim()) }, t('addSignature'))));
}

/** Renders text with the browser's shaping engine, so Nepali conjuncts look right. */
function textToCanvas(text: string, px = 64) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  const font = `${px}px "Noto Sans Devanagari", "Mukta", system-ui, sans-serif`;
  ctx.font = font;
  c.width = Math.ceil(ctx.measureText(text).width) + 8;
  c.height = Math.ceil(px * 1.5);
  ctx.font = font;
  ctx.fillStyle = '#00005a';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 4, c.height / 2);
  return c;
}

export function signTool(root: HTMLElement) {
  let file: File | null = null;
  let bytes: Uint8Array | null = null;
  let doc: PdfJsDoc | null = null;
  let fields: FormFieldInfo[] = [];
  const values: Record<string, string | boolean> = {};
  let pageIndex = 0;
  let pending: Pending | null = null;
  const placed: Placed[] = [];
  let flatten = false;
  const runner = new Runner('sign');
  const body = h('div');
  const pageHost = h('div', { class: 'pagehost' });
  const hint = h('p', { class: 'hint', 'aria-live': 'polite' });

  async function renderCurrent() {
    const page = await doc!.getPage(pageIndex + 1);
    const cssW = Math.min(pageHost.clientWidth || 600, 800);
    const scale = (cssW * (window.devicePixelRatio || 1)) / page.getViewport({ scale: 1 }).width;
    const vp = page.getViewport({ scale });
    const canvas = h('canvas', { width: Math.ceil(vp.width), height: Math.ceil(vp.height), class: 'pdfpage' });
    canvas.style.width = `${cssW}px`;
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    for (const s of placed.filter((p) => p.page === pageIndex)) {
      const w = s.kind === 'image' ? s.width : 0;
      const ht = s.kind === 'image' ? s.height : s.size;
      const [ax, ay] = vp.convertToViewportPoint(s.x, s.y + ht);
      const [bx, by] = vp.convertToViewportPoint(s.x + (w || 1), s.y);
      if (s.preview) ctx.drawImage(s.preview, Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
      else if (s.kind === 'text') {
        ctx.font = `${s.size * scale}px Helvetica, Arial, sans-serif`;
        ctx.fillStyle = '#00005a';
        ctx.fillText(s.text, ax, by);
      }
    }
    canvas.addEventListener('click', (e) => {
      if (!pending) return;
      const r = canvas.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * canvas.width;
      const py = ((e.clientY - r.top) / r.height) * canvas.height;
      const [x, yTop] = vp.convertToPdfPoint(px, py) as [number, number];
      const y = yTop - pending.height;
      if (pending.kind === 'text' && pending.text && isWinAnsi(pending.text)) {
        placed.push({ kind: 'text', page: pageIndex, x, y: y + pending.height * 0.25, size: pending.fontSize ?? 12, text: pending.text });
      } else {
        placed.push({ kind: 'image', page: pageIndex, x, y, width: pending.width, height: pending.height, png: pending.png!, preview: pending.preview });
      }
      pending = null;
      hint.textContent = '';
      void renderCurrent();
      drawPlaced();
    });
    clear(pageHost, canvas);
  }

  const placedList = h('ul', { class: 'list' });
  const drawPlaced = () =>
    clear(placedList, placed.map((s, i) =>
      h('li', { class: 'chip' },
        h('span', { class: 'grow' }, `${t('page')} ${s.page + 1}: `, s.kind === 'text' ? s.text : '✍'),
        h('button', { class: 'icon', 'aria-label': t('remove'), onclick: () => (placed.splice(i, 1), drawPlaced(), void renderCurrent()) }, '✕'))));

  const textInput = h('input', { type: 'text', placeholder: t('addText'), 'aria-label': t('addText') });
  const sizeInput = h('input', { type: 'number', min: 6, max: 48, value: 12, 'aria-label': 'pt', class: 'narrow' });

  const draw = () => {
    const pageSel = h('select', { 'aria-label': t('page'), onchange: (e: Event) => ((pageIndex = Number((e.target as HTMLSelectElement).value)), void renderCurrent()) },
      Array.from({ length: doc!.numPages }, (_, i) => h('option', { value: i, selected: i === pageIndex }, `${t('page')} ${i + 1}`)));
    const sigHost = h('div');
    clear(
      body,
      fields.length
        ? h('fieldset', { class: 'card' }, h('legend', {}, t('formFields')),
            fields.map((f) => {
              const id = `f-${f.name}`;
              let input: HTMLElement;
              if (f.kind === 'checkbox') input = h('input', { id, type: 'checkbox', checked: !!(values[f.name] ?? f.value), onchange: (e: Event) => (values[f.name] = (e.target as HTMLInputElement).checked) });
              else if (f.options.length) input = h('select', { id, onchange: (e: Event) => (values[f.name] = (e.target as HTMLSelectElement).value) }, h('option', { value: '' }, '—'), f.options.map((o) => h('option', { value: o, selected: o === (values[f.name] ?? f.value) }, o)));
              else input = h('input', { id, type: 'text', value: String(values[f.name] ?? f.value), oninput: (e: Event) => (values[f.name] = (e.target as HTMLInputElement).value) });
              return h('div', { class: 'field' }, h('label', { for: id }, f.name), input);
            }),
            h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: flatten, onchange: (e: Event) => (flatten = (e.target as HTMLInputElement).checked) }), t('flatten')))
        : h('p', { class: 'muted' }, t('noFields')),
      h('div', { class: 'row wrap' },
        pageSel,
        textInput,
        sizeInput,
        h('button', { class: 'btn', onclick: async () => {
          const text = textInput.value.trim();
          if (!text) return;
          const size = Number(sizeInput.value) || 12;
          const preview = textToCanvas(text);
          const png = isWinAnsi(text) ? undefined : await canvasToBytes(preview, 'image/png');
          pending = { kind: 'text', text, fontSize: size, png, preview: png ? preview : undefined, height: size * 1.5, width: (preview.width / preview.height) * size * 1.5 };
          hint.textContent = t('place');
        } }, t('addText')),
        h('button', { class: 'btn', onclick: () => clear(sigHost, signaturePad(async (c) => {
          const width = 150;
          pending = { kind: 'signature', png: await canvasToBytes(c, 'image/png'), preview: c, width, height: (c.height / c.width) * width };
          clear(sigHost);
          hint.textContent = t('place');
        })) }, '✍ ', t('addSignature'))),
      sigHost,
      hint,
      pageHost,
      placedList,
      h('button', { class: 'btn primary', onclick: () => start() }, t('start')),
    );
    void renderCurrent();
  };

  const load = (f: File) =>
    runner.run(
      async () => {
        file = f;
        bytes = await readFile(f);
        fields = await listFormFields(bytes);
        void doc?.destroy();
        doc = await openPdf(bytes);
        placed.length = 0;
        pageIndex = 0;
        return true;
      },
      () => {
        queueMicrotask(() => runner.reset());
        draw();
        return { files: [], inputs: [] };
      },
      () => load(f),
    );

  const start = () =>
    runner.run(
      async ({ setCancel }) => {
        const stamps: Stamp[] = placed.map(({ preview: _p, ...s }) => s as Stamp);
        const job = runJob<Uint8Array>({ op: 'fillSign', bytes: bytes!, input: { fields: values, stamps, flatten } });
        setCancel(job.cancel);
        return job.promise;
      },
      (out) => ({ files: [{ name: outputName(file!.name, 'signed'), bytes: out, mime: 'application/pdf' }], inputs: [file!.name] }),
      start,
    );

  clear(root, filePicker({ accept: 'application/pdf,.pdf', label: 'choosePdf', onFiles: (fs) => fs.filter(isPdfFile)[0] && load(fs.filter(isPdfFile)[0]) }), body, runner.el);
}
