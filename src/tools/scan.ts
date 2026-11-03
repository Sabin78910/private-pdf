import { h, clear } from '../ui/dom';
import { t } from '../i18n';
import { Runner, filePicker, isImageFile, select } from '../ui/common';
import { runJob } from '../platform/jobs';
import { isNative } from '../platform/files';
import { canvasToBytes } from '../platform/render';
import { applyFilter, detectDocument, warpPerspective, type Pixels, type Quad, type ScanFilter } from '../core/scan';
import type { PageFit } from '../core/imagesToPdf';
import { PdfError } from '../core/errors';

const MAX_SIDE = 2200; // enough for A4 at ~200 dpi, small enough for phones
const DETECT_SIDE = 320;

interface ScanPage {
  name: string;
  source: HTMLCanvasElement;
  quad: Quad;
  filter: ScanFilter;
}

function toCanvas(img: CanvasImageSource & { width: number; height: number }, maxSide: number) {
  const s = Math.min(1, maxSide / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * s);
  c.height = Math.round(img.height * s);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c;
}
const pixels = (c: HTMLCanvasElement): Pixels => {
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
  return { width: d.width, height: d.height, data: d.data };
};

async function pageFromSource(name: string, src: CanvasImageSource & { width: number; height: number }): Promise<ScanPage> {
  const source = toCanvas(src, MAX_SIDE);
  const small = toCanvas(source, DETECT_SIDE);
  const k = source.width / small.width;
  const quad = detectDocument(pixels(small)).map((p) => ({ x: p.x * k, y: p.y * k })) as Quad;
  return { name, source, quad, filter: 'enhance' };
}

/** Canvas with the photo and four draggable corner handles. */
function cornerEditor(page: ScanPage, onChange: () => void) {
  const view = toCanvas(page.source, 900);
  const k = page.source.width / view.width;
  const ctx = view.getContext('2d')!;
  const base = ctx.getImageData(0, 0, view.width, view.height);
  const paint = () => {
    ctx.putImageData(base, 0, 0);
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 3;
    ctx.beginPath();
    page.quad.forEach((p, i) => (i ? ctx.lineTo(p.x / k, p.y / k) : ctx.moveTo(p.x / k, p.y / k)));
    ctx.closePath();
    ctx.stroke();
    for (const p of page.quad) {
      ctx.fillStyle = 'rgba(37,99,235,.85)';
      ctx.beginPath();
      ctx.arc(p.x / k, p.y / k, 12, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  let drag = -1;
  const toLocal = (e: PointerEvent) => {
    const r = view.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * view.width * k, y: ((e.clientY - r.top) / r.height) * view.height * k };
  };
  view.addEventListener('pointerdown', (e) => {
    const p = toLocal(e);
    let best = Infinity;
    page.quad.forEach((q, i) => {
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < best) ((best = d), (drag = i));
    });
    view.setPointerCapture(e.pointerId);
  });
  view.addEventListener('pointermove', (e) => {
    if (drag < 0) return;
    const p = toLocal(e);
    page.quad[drag] = { x: Math.min(Math.max(p.x, 0), page.source.width - 1), y: Math.min(Math.max(p.y, 0), page.source.height - 1) };
    paint();
  });
  view.addEventListener('pointerup', () => ((drag = -1), onChange()));
  view.style.touchAction = 'none';
  view.className = 'editor';
  paint();
  return view;
}

function processPage(p: ScanPage): HTMLCanvasElement {
  const flat = applyFilter(warpPerspective(pixels(p.source), p.quad), p.filter);
  const c = document.createElement('canvas');
  c.width = flat.width;
  c.height = flat.height;
  c.getContext('2d')!.putImageData(new ImageData(flat.data, flat.width, flat.height), 0, 0);
  return c;
}

async function startWebcam(onShot: (c: HTMLCanvasElement) => void, host: HTMLElement) {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } } });
  const video = h('video', { autoplay: true, playsInline: true, muted: true, class: 'webcam' });
  video.srcObject = stream;
  const stop = () => stream.getTracks().forEach((tr) => tr.stop());
  clear(
    host,
    video,
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', onclick: () => onShot(videoFrame(video)) }, t('capture')),
      h('button', { class: 'btn', onclick: () => (stop(), clear(host)) }, t('cancel'))),
  );
}

function videoFrame(video: HTMLVideoElement) {
  const c = document.createElement('canvas');
  c.width = video.videoWidth;
  c.height = video.videoHeight;
  c.getContext('2d')!.drawImage(video, 0, 0);
  return toCanvas(c, MAX_SIDE);
}

export function scanTool(root: HTMLElement) {
  const pages: ScanPage[] = [];
  let fit: PageFit = 'a4';
  let selected = 0;
  const runner = new Runner('scan');
  const strip = h('div', { class: 'strip' });
  const editorHost = h('div');
  const camHost = h('div');
  const opts = h('div');

  const draw = () => {
    clear(
      strip,
      pages.map((p, i) => {
        const thumb = toCanvas(p.source, 120);
        return h('div', { class: `thumb ${i === selected ? 'sel' : ''}` },
          h('button', { class: 'plain', 'aria-label': `${t('page')} ${i + 1}`, onclick: () => ((selected = i), draw()) }, thumb),
          h('div', { class: 'row' },
            h('button', { class: 'icon', 'aria-label': t('moveUp'), disabled: i === 0, onclick: () => (pages.splice(i - 1, 0, ...pages.splice(i, 1)), (selected = i - 1), draw()) }, '←'),
            h('button', { class: 'icon', 'aria-label': t('remove'), onclick: () => (pages.splice(i, 1), (selected = Math.max(0, Math.min(selected, pages.length - 1))), draw()) }, '✕')));
      }),
    );
    const p = pages[selected];
    if (!p) return (clear(editorHost), clear(opts));
    clear(editorHost, h('p', { class: 'muted small' }, t('autoDetect')), cornerEditor(p, () => {}));
    clear(
      opts,
      h('div', { class: 'row wrap' },
        select('filter', [['original', 'filter.original'], ['enhance', 'filter.enhance'], ['grayscale', 'filter.grayscale'], ['bw', 'filter.bw']], p.filter, (v) => (p.filter = v)),
        select('pageFit', [['a4', 'fit.a4'], ['fit', 'fit.fit']], fit, (v) => (fit = v))),
      h('button', { class: 'btn primary', onclick: () => start() }, t('start'), ` (${pages.length})`),
    );
  };

  const addFiles = async (files: File[]) => {
    runner.reset();
    for (const f of files.filter(isImageFile)) {
      try {
        const bmp = await createImageBitmap(f);
        pages.push(await pageFromSource(f.name, bmp));
        bmp.close();
      } catch {
        runner.fail(new PdfError('unsupported-image'), () => runner.reset());
      }
    }
    selected = Math.max(0, pages.length - 1);
    draw();
  };

  const start = () =>
    runner.run(
      async ({ setCancel, progress }) => {
        let stop = false;
        setCancel(() => (stop = true));
        const images = [];
        for (let i = 0; i < pages.length; i++) {
          if (stop) throw new PdfError('cancelled');
          progress(i, pages.length + 1);
          await new Promise((r) => setTimeout(r)); // let the progress bar paint
          const c = processPage(pages[i]);
          images.push({ bytes: await canvasToBytes(c, 'image/jpeg', 0.82), kind: 'jpeg' as const });
          c.width = c.height = 0;
        }
        const job = runJob<Uint8Array>({ op: 'images', images, fit });
        setCancel(job.cancel);
        return job.promise;
      },
      (bytes) => ({ files: [{ name: `scan-${new Date().toISOString().slice(0, 10)}.pdf`, bytes, mime: 'application/pdf' }], inputs: pages.map((p) => p.name) }),
      start,
    );

  // Android uses the system camera via "Take photo"; the webcam option is for the web.
  const webcamBtn =
    !isNative() && typeof navigator.mediaDevices?.getUserMedia === 'function'
      ? h('button', { class: 'btn', onclick: () => startWebcam(async (c) => (pages.push(await pageFromSource(`webcam-${pages.length + 1}.jpg`, c)), (selected = pages.length - 1), draw()), camHost).catch(() => clear(camHost)) }, '🎥 ', t('useWebcam'))
      : null;

  clear(root, h('div', { class: 'row wrap' }, filePicker({ accept: 'image/jpeg,image/png,image/webp', multiple: true, label: 'chooseImages', capture: true, onFiles: addFiles }), webcamBtn), camHost, strip, editorHost, opts, runner.el);
}
