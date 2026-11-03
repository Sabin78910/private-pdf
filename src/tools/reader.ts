import { h, clear, announce } from '../ui/dom';
import { icon, type IconName } from '../ui/icons';
import { t, type Key } from '../i18n';
import { Runner, errorKey, filePicker, isPdfFile } from '../ui/common';
import { readFile } from '../platform/files';
import { runJob } from '../platform/jobs';
import { openPdf, renderPage, type PdfJsDoc } from '../platform/render';
import { getItem, readItem } from '../platform/libraryStore';
import { outputName } from '../core/history';
import { loadPdf } from '../core/load';
import { COLORS, MAX_NOTE_LENGTH, NOTE_SIZE, isDrawable, type Annotation, type Rgb } from '../core/annotate';

type Mode = 'read' | 'highlight' | 'note' | 'pen';
type ColorName = keyof typeof COLORS;
const SVG = 'http://www.w3.org/2000/svg';
const css = (c: Rgb) => `rgb(${c.map((v) => Math.round(v * 255)).join(' ')})`;

interface PageView {
  index: number;
  box: HTMLElement;
  svg: SVGSVGElement;
  /** pdf.js viewport at scale 1 (rotation applied): maps CSS units to PDF points and back. */
  vp: { width: number; height: number; convertToPdfPoint(x: number, y: number): number[]; convertToViewportPoint(x: number, y: number): number[] };
  rendered: boolean;
}

export function readerTool(root: HTMLElement) {
  let name = '';
  let bytes: Uint8Array | null = null;
  let doc: PdfJsDoc | null = null;
  let mode: Mode = 'read';
  let color: ColorName = 'yellow';
  const marks: Annotation[] = [];
  const views: PageView[] = [];
  const runner = new Runner('reader');
  const bar = h('div', { class: 'rbar', role: 'toolbar', 'aria-label': t('tool.reader') });
  const pagesEl = h('div', { class: 'rpages' });
  const sheet = h('div', { class: 'sheet', hidden: true });
  const status = h('p', { class: 'muted small', role: 'status' });
  const body = h('div');
  let observer: IntersectionObserver | null = null;

  const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    return el;
  };

  /** Draws this session's marks for one page on its overlay. */
  const paint = (v: PageView, live?: Annotation) => {
    v.svg.replaceChildren();
    for (const a of [...marks.filter((m) => m.page === v.index), ...(live ? [live] : [])]) {
      if (a.kind === 'highlight') {
        const [ax, ay] = v.vp.convertToViewportPoint(a.x0, a.y0);
        const [bx, by] = v.vp.convertToViewportPoint(a.x1, a.y1);
        v.svg.append(svgEl('rect', { x: Math.min(ax, bx), y: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay), fill: css(a.color), class: 'hl' }));
      } else if (a.kind === 'ink') {
        for (const p of a.paths) {
          const pts = p.map(([x, y]) => v.vp.convertToViewportPoint(x, y).map((n) => n.toFixed(1)).join(',')).join(' ');
          v.svg.append(svgEl('polyline', { points: pts, fill: 'none', stroke: css(a.color), 'stroke-width': a.width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
        }
      } else {
        const [x, y] = v.vp.convertToViewportPoint(a.x, a.y);
        v.svg.append(svgEl('rect', { x, y, width: NOTE_SIZE, height: NOTE_SIZE, rx: 3, fill: css(a.color), stroke: '#3f3209', class: 'nt' }));
      }
    }
  };

  const updateStatus = () => {
    status.textContent = marks.length ? t('annotCount', { n: marks.length }) : t('readerHint');
    bar.querySelector<HTMLButtonElement>('.undo')!.disabled = !marks.length;
    bar.querySelector<HTMLButtonElement>('.savecopy')!.disabled = !marks.length;
  };

  const add = (a: Annotation) => {
    if (!isDrawable(a)) return;
    marks.push(a);
    paint(views[a.page]);
    updateStatus();
    announce(t('annotCount', { n: marks.length }));
  };

  const askNote = (page: number, x: number, y: number) => {
    const text = h('textarea', { id: 'noteText', rows: 3, maxlength: MAX_NOTE_LENGTH, 'aria-label': t('noteText'), placeholder: t('noteText') });
    const close = () => ((sheet.hidden = true), clear(sheet));
    clear(sheet, h('div', { class: 'card' }, h('label', { for: 'noteText' }, h('strong', {}, t('noteText'))), text,
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: () => (add({ kind: 'note', page, x, y, text: text.value, color: COLORS[color] }), close()) }, t('addNote')),
        h('button', { class: 'btn ghost', onclick: close }, t('cancel')))));
    sheet.hidden = false;
    text.focus();
  };

  const attach = (v: PageView) => {
    let live: Annotation | null = null;
    const toPdf = (e: PointerEvent): [number, number] => {
      const r = v.svg.getBoundingClientRect();
      const [x, y] = v.vp.convertToPdfPoint(((e.clientX - r.left) / r.width) * v.vp.width, ((e.clientY - r.top) / r.height) * v.vp.height);
      return [x, y];
    };
    v.svg.addEventListener('pointerdown', (e) => {
      if (mode === 'read') return;
      e.preventDefault();
      const [x, y] = toPdf(e);
      if (mode === 'note') return askNote(v.index, x, y);
      v.svg.setPointerCapture(e.pointerId);
      live = mode === 'highlight'
        ? { kind: 'highlight', page: v.index, x0: x, y0: y, x1: x, y1: y, color: COLORS[color] }
        : { kind: 'ink', page: v.index, paths: [[[x, y]]], color: COLORS[color], width: 2.5 };
    });
    v.svg.addEventListener('pointermove', (e) => {
      if (!live) return;
      const [x, y] = toPdf(e);
      if (live.kind === 'highlight') (live.x1 = x), (live.y1 = y);
      else if (live.kind === 'ink') live.paths[0].push([x, y]);
      paint(v, live);
    });
    const end = () => {
      if (live) add(live);
      live = null;
      paint(v);
    };
    v.svg.addEventListener('pointerup', end);
    v.svg.addEventListener('pointercancel', () => ((live = null), paint(v)));
  };

  const renderVisible = async (v: PageView) => {
    if (v.rendered || !doc) return;
    v.rendered = true;
    const dpr = window.devicePixelRatio || 1;
    const dpi = ((v.box.clientWidth || 360) * dpr * 72) / v.vp.width;
    const { canvas } = await renderPage(doc, v.index, Math.min(dpi, 300));
    canvas.className = 'rcanvas';
    canvas.setAttribute('aria-hidden', 'true');
    v.box.prepend(canvas);
  };

  const drawBar = () => {
    const modeBtn = (m: Mode, ico: IconName) => h('button', { class: `chipbtn${mode === m ? ' on' : ''}`, 'aria-pressed': mode === m ? 'true' : 'false',
      onclick: () => ((mode = m), (pagesEl.dataset.mode = m), drawBar(), updateStatus()) }, icon(ico, 16), t(`mode.${m}` as Key));
    const swatch = (c: ColorName) => h('button', { class: `swatch${color === c ? ' on' : ''}`, style: `background:${css(COLORS[c])}`, 'aria-pressed': color === c ? 'true' : 'false',
      'aria-label': `${t('readerColor')}: ${t(`color.${c}` as Key)}`, onclick: () => ((color = c), drawBar(), updateStatus()) });
    clear(bar,
      h('div', { class: 'chips' }, modeBtn('read', 'reader'), modeBtn('highlight', 'highlight'), modeBtn('note', 'note'), modeBtn('pen', 'pen')),
      h('div', { class: 'row wrap' },
        (Object.keys(COLORS) as ColorName[]).map(swatch),
        h('button', { class: 'btn small undo', onclick: () => {
          const last = marks.pop();
          if (last) paint(views[last.page]);
          updateStatus();
        } }, t('undo')),
        h('button', { class: 'btn primary small savecopy', onclick: () => save() }, t('saveCopy'))));
  };

  const show = async (fileName: string, data: Uint8Array) => {
    name = fileName;
    bytes = data;
    marks.length = 0;
    views.length = 0;
    observer?.disconnect();
    void doc?.destroy();
    runner.reset();
    try {
      await loadPdf(data);
      doc = await openPdf(data);
    } catch (e) {
      clear(body, h('div', { class: 'card err', role: 'alert' }, t(errorKey(e))));
      return;
    }
    clear(pagesEl);
    pagesEl.dataset.mode = mode;
    observer = new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting) void renderVisible(views[Number((en.target as HTMLElement).dataset.i)]);
    }, { rootMargin: '800px 0px' });
    for (let i = 0; i < doc.numPages; i++) {
      const vp = (await doc.getPage(i + 1)).getViewport({ scale: 1 });
      const svg = document.createElementNS(SVG, 'svg');
      svg.setAttribute('viewBox', `0 0 ${vp.width} ${vp.height}`);
      svg.setAttribute('class', 'roverlay');
      svg.setAttribute('aria-label', `${t('page')} ${i + 1}`);
      const box = h('div', { class: 'rpage', style: `aspect-ratio:${vp.width}/${vp.height}`, 'data-i': i });
      box.append(svg);
      const v: PageView = { index: i, box, svg, vp, rendered: false };
      views.push(v);
      attach(v);
      pagesEl.append(box);
      observer.observe(box);
    }
    drawBar();
    clear(body, h('p', { class: 'muted small' }, name), bar, status, pagesEl, sheet);
    updateStatus();
  };

  const save = () =>
    runner.run(
      async ({ setCancel }) => {
        const job = runJob<Uint8Array>({ op: 'annotate', bytes: bytes!, annotations: marks.map((m) => structuredClone(m)) });
        setCancel(job.cancel);
        return job.promise;
      },
      (out) => {
        runner.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return { files: [{ name: outputName(name, 'annotated'), bytes: out, mime: 'application/pdf' }], inputs: [name] };
      },
      save,
    );

  clear(root, filePicker({ accept: 'application/pdf,.pdf', label: 'choosePdf', onFiles: async (fs) => {
    const f = fs.filter(isPdfFile)[0];
    if (f) await show(f.name, await readFile(f));
  } }), body, runner.el);

  // Opened from the Library: #/reader?lib=<id>
  const libId = new URLSearchParams(location.hash.split('?')[1] ?? '').get('lib');
  if (libId) void getItem(libId).then(async (it) => it && (async (f) => show(f.name, f.bytes))(await readItem(it)));
}
