// Full-screen camera scanner: live page outline, Single/Batch, mode strip, then a document
// view with Add, Edit, Share, To Word and Sign. Everything runs on this device.
import { h, clear, announce } from '../ui/dom';
import { icon } from '../ui/icons';
import { t, type Key } from '../i18n';
import { toast } from '../ui/common';
import { celebrate, feedbackOn } from '../ui/celebrate';
import { canShare, saveFile, shareFile, type OutputFile } from '../platform/files';
import { canvasToBytes } from '../platform/render';
import { runJob } from '../platform/jobs';
import { recognize } from '../platform/ocr';
import { addFile, removeItem } from '../platform/libraryStore';
import { detectDocument, type Quad, type ScanFilter } from '../core/scan';
import { CAM_MODES, coverMap, modeInfo, pageFound, scanDocName, smoothQuad, textToParagraphs, type CamMode } from '../core/camScan';
import { ID1_PX } from '../core/idCard';
import { buildDocx } from '../core/toWord';
import { cornerEditor, pageFromSource, processPage, toCanvas, type ScanPage } from './scan';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DETECT_SIDE = 240;
const FILTERS: [ScanFilter, Key][] = [['original', 'filter.original'], ['enhance', 'filter.enhance'], ['grayscale', 'filter.grayscale'], ['bw', 'filter.bw']];

interface Shot { page: ScanPage; flat: HTMLCanvasElement; jpeg?: Uint8Array }
interface Session { mode: CamMode; batch: boolean; shots: Shot[]; name: string; itemId?: string }

let session: Session = fresh('scan', false);
let stopCam: (() => void) | null = null;

function fresh(mode: CamMode, batch: boolean): Session {
  return { mode, batch, shots: [], name: scanDocName(new Date()) };
}

/** Called on every route change so the camera never stays on in the background. */
export function stopCamera() {
  stopCam?.();
  stopCam = null;
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const outSize = (mode: CamMode) => (mode === 'idcard' ? ID1_PX : undefined);

function makeShot(page: ScanPage, mode: CamMode): Shot {
  page.filter = modeInfo(mode).filter;
  return { page, flat: processPage(page, outSize(mode)) };
}

async function jpegOf(s: Shot) {
  return (s.jpeg ??= await canvasToBytes(s.flat, 'image/jpeg', 0.85));
}

async function buildPdf(): Promise<OutputFile> {
  const images = [];
  for (const s of session.shots) images.push({ bytes: await jpegOf(s), kind: 'jpeg' as const });
  const job = session.mode === 'idcard' ? runJob<Uint8Array>({ op: 'idcard', images }) : runJob<Uint8Array>({ op: 'images', images, fit: 'a4' });
  return { name: session.name, bytes: await job.promise, mime: 'application/pdf' };
}

/** Saves (or replaces) the document in the Library so it shows in Recents. */
async function persist(): Promise<OutputFile> {
  const file = await buildPdf();
  try {
    if (session.itemId) await removeItem(session.itemId);
    session.itemId = (await addFile(file, session.mode === 'idcard' ? 'idcard' : 'scan')).id;
  } catch {
    /* Library unavailable: the file can still be shared or saved */
  }
  return file;
}

const send = (f: OutputFile) => (canShare() ? shareFile(f) : saveFile(f)).catch(() => {});

export function cameraTool(root: HTMLElement) {
  stopCamera();
  // #/camera?new starts over; plain #/camera returns to the open document (e.g. back from Sign).
  if (/[?&]new\b/.test(location.hash)) session = fresh(session.mode, false);
  if (session.shots.length && session.itemId) docView(root);
  else cameraView(root);
}

function cameraView(root: HTMLElement) {
  const adding = session.shots.length > 0;
  let mode = session.mode;
  let batch = adding || session.batch;
  let stream: MediaStream | null = null;
  let live: Quad | null = null;
  let timer = 0;
  let torch = false;

  const video = h('video', { class: 'cam-video', autoplay: true, playsInline: true, muted: true });
  const overlay = h('canvas', { class: 'cam-overlay', 'aria-hidden': 'true' });
  const hint = h('div', { class: 'cam-hint', role: 'status' }, t('cam.looking'));
  const tray = h('div', { class: 'cam-tray' });
  const toggle = h('div', { class: 'cam-toggle', role: 'radiogroup', 'aria-label': t('cam.single') + ' / ' + t('cam.batch') });
  const strip = h('div', { class: 'cam-modes', role: 'tablist' });
  const left = h('div', { class: 'cam-side' });
  const right = h('div', { class: 'cam-side' });
  const view = h('div', { class: 'cam-view' }, video, overlay, hint, tray, toggle);
  const det = document.createElement('canvas');
  const gallery = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true, hidden: true, onchange: () => void importFiles([...(gallery.files ?? [])]) });

  const stop = () => {
    clearTimeout(timer);
    stream?.getTracks().forEach((tr) => tr.stop());
    stream = null;
  };
  stopCam = stop;

  const close = () => {
    stop();
    if (adding) return docView(root);
    session = fresh(mode, batch);
    location.hash = '#/';
  };

  const setMode = (m: CamMode) => {
    if (session.shots.length && m !== mode) return;
    mode = session.mode = m;
    if (!modeInfo(m).batch) batch = false;
    draw();
    strip.querySelector<HTMLElement>(`[data-mode="${m}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
  };

  const draw = () => {
    const info = modeInfo(mode);
    const n = session.shots.length;
    clear(toggle, !info.batch || n ? null : (['single', 'batch'] as const).map((k) =>
      h('button', { class: 'seg', role: 'radio', 'aria-checked': String((k === 'batch') === batch), onclick: () => ((batch = session.batch = k === 'batch'), draw()) }, t(`cam.${k}`))));
    clear(strip, CAM_MODES.map((m) =>
      h('button', { class: 'cam-mode', role: 'tab', 'data-mode': m.id, 'aria-selected': String(m.id === mode), disabled: n > 0 && m.id !== mode, onclick: () => setMode(m.id) }, t(`mode.${m.id}`))));
    const multi = batch || mode === 'idcard';
    const last = session.shots[n - 1];
    clear(tray, last && multi
      ? h('div', { class: 'cam-thumbwrap' },
          h('button', { class: 'cam-thumb', 'aria-label': t('cam.modify'), onclick: () => modifySheet(n - 1, draw) },
            toCanvas(last.flat, 160), h('span', { class: 'cam-count pop' }, String(n))),
          h('button', { class: 'cam-modify', onclick: () => modifySheet(n - 1, draw) }, t('cam.modify')))
      : null);
    clear(left, n && multi
      ? h('button', { class: 'cam-icon', 'aria-label': t('cam.undo'), onclick: () => (session.shots.pop(), draw()) }, icon('undo', 26))
      : h('a', { class: 'cam-icon', href: '#/tools', 'aria-label': t('cam.tools') }, icon('organize', 26)));
    clear(right, n && multi
      ? h('button', { class: 'cam-done', onclick: () => finish() }, t('done'))
      : h('button', { class: 'cam-icon', 'aria-label': t('cam.gallery'), onclick: () => gallery.click() }, icon('toimage', 26)));
    if (mode === 'idcard') hint.textContent = t(n ? 'cam.idBack' : 'cam.idFront');
  };

  const finish = async () => {
    if (!session.shots.length) return;
    stop();
    session.batch = batch;
    clear(root, h('div', { class: 'cam-busy', role: 'status' }, t('doc.working')));
    await persist();
    docView(root, !adding);
  };

  const flyIn = (c: HTMLCanvasElement) => {
    if (reduced()) return;
    const img = toCanvas(c, 900);
    img.className = 'cam-fly';
    view.append(img);
    setTimeout(() => img.remove(), 700);
  };

  const addShot = (page: ScanPage) => {
    const shot = makeShot(page, mode);
    session.shots.push(shot);
    flyIn(shot.flat);
    announce(t('cam.pages', { n: session.shots.length }));
    const max = modeInfo(mode).maxPages;
    if (!batch && mode !== 'idcard') return void setTimeout(finish, reduced() ? 0 : 650);
    if (session.shots.length >= max) return void setTimeout(finish, reduced() ? 0 : 650);
    draw();
  };

  const shoot = async () => {
    if (!video.videoWidth) return;
    if (feedbackOn()) navigator.vibrate?.(15);
    if (!reduced()) {
      const flash = h('div', { class: 'cam-flash', 'aria-hidden': 'true' });
      view.append(flash);
      setTimeout(() => flash.remove(), 300);
    }
    const c = document.createElement('canvas');
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    c.getContext('2d')!.drawImage(video, 0, 0);
    addShot(await pageFromSource(`camera-${session.shots.length + 1}.jpg`, c));
  };

  const importFiles = async (files: File[]) => {
    for (const f of files) {
      try {
        const bmp = await createImageBitmap(f);
        session.shots.push(makeShot(await pageFromSource(f.name, bmp), mode));
        bmp.close();
      } catch {
        toast(t('err.unsupported-image'));
      }
    }
    gallery.value = '';
    if (session.shots.length) void finish();
  };

  /** Live outline: detect on a small copy of the frame a few times a second. */
  const tick = () => {
    if (!stream) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const cw = overlay.clientWidth;
    const ch = overlay.clientHeight;
    if (vw && cw) {
      const s = DETECT_SIDE / Math.max(vw, vh);
      det.width = Math.round(vw * s);
      det.height = Math.round(vh * s);
      const dctx = det.getContext('2d', { willReadFrequently: true })!;
      dctx.drawImage(video, 0, 0, det.width, det.height);
      const d = dctx.getImageData(0, 0, det.width, det.height);
      const q = detectDocument({ width: d.width, height: d.height, data: d.data });
      const found = pageFound(q, det.width, det.height);
      if (found && !live && feedbackOn()) navigator.vibrate?.(6); // a light tick when the page locks on
      live = found ? smoothQuad(live, q.map((p) => ({ x: p.x / s, y: p.y / s })) as Quad) : null;
      const dpr = devicePixelRatio || 1;
      overlay.width = Math.round(cw * dpr);
      overlay.height = Math.round(ch * dpr);
      const ctx = overlay.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      if (live) {
        const map = coverMap(vw, vh, cw, ch);
        ctx.beginPath();
        live.map(map).forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
        ctx.fillStyle = 'rgba(45, 212, 191, 0.26)';
        ctx.strokeStyle = '#2dd4bf';
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.fill();
        ctx.stroke();
      }
      if (mode !== 'idcard') hint.textContent = t(found ? 'cam.found' : 'cam.looking');
      hint.classList.toggle('ok', found);
    }
    timer = window.setTimeout(() => requestAnimationFrame(tick), 120);
  };

  const torchBtn = h('button', { class: 'cam-icon', hidden: true, 'aria-label': t('cam.torch'), 'aria-pressed': 'false', onclick: () => {
    torch = !torch;
    torchBtn.setAttribute('aria-pressed', String(torch));
    void stream?.getVideoTracks()[0]?.applyConstraints({ advanced: [{ torch } as MediaTrackConstraintSet] }).catch(() => {});
  } }, icon('flash', 24));

  const fallback = () => clear(view,
    h('div', { class: 'cam-fallback' },
      h('p', {}, t('cam.noCamera')),
      h('label', { class: 'btn primary' }, icon('scan', 20), t('cam.useSystem'),
        h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: (e: Event) => void importFiles([...((e.target as HTMLInputElement).files ?? [])]) }))));

  // Swipe across the viewfinder to change mode, like turning a dial.
  let sx = 0;
  view.addEventListener('pointerdown', (e) => (sx = e.clientX));
  view.addEventListener('pointerup', (e) => {
    const dx = e.clientX - sx;
    if (Math.abs(dx) < 60 || session.shots.length) return;
    const i = CAM_MODES.findIndex((m) => m.id === mode) + (dx < 0 ? 1 : -1);
    if (CAM_MODES[i]) setMode(CAM_MODES[i].id);
  });

  clear(root, h('div', { class: 'cam' },
    h('div', { class: 'cam-top' },
      h('button', { class: 'cam-icon', 'aria-label': t('cam.close'), onclick: close }, icon('close', 26)),
      h('span', { class: 'grow' }), torchBtn),
    view,
    strip,
    h('div', { class: 'cam-bottom' }, left,
      h('button', { class: 'cam-shutter', 'aria-label': t('cam.shutter'), onclick: () => void shoot() }),
      right),
    gallery));
  draw();
  setMode(mode);

  if (!navigator.mediaDevices?.getUserMedia) return fallback();
  navigator.mediaDevices
    .getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false })
    .then((s) => {
      if (stopCam !== stop) return s.getTracks().forEach((tr) => tr.stop()); // left the screen meanwhile
      stream = s;
      video.srcObject = s;
      const caps = s.getVideoTracks()[0]?.getCapabilities?.() as { torch?: boolean } | undefined;
      torchBtn.hidden = !caps?.torch;
      tick();
    })
    .catch(fallback);
}

/** Bottom sheet to fix one page: drag corners, pick a filter, or delete it. */
function modifySheet(index: number, onDone: () => void) {
  const shot = session.shots[index];
  if (!shot) return;
  const scrim = h('div', { class: 'scrim', onclick: () => close(false) });
  const filters = h('div', { class: 'row wrap cam-filters' });
  const drawFilters = () => clear(filters, FILTERS.map(([f, k]) =>
    h('button', { class: `chipbtn${shot.page.filter === f ? ' on' : ''}`, 'aria-pressed': String(shot.page.filter === f), onclick: () => ((shot.page.filter = f), drawFilters()) }, t(k))));
  const before = { quad: shot.page.quad.map((p) => ({ ...p })) as Quad, filter: shot.page.filter };
  const close = (save: boolean) => {
    if (save) {
      shot.flat = processPage(shot.page, outSize(session.mode));
      shot.jpeg = undefined;
    } else {
      shot.page.quad = before.quad;
      shot.page.filter = before.filter;
    }
    sheet.remove();
    scrim.remove();
    onDone();
  };
  const sheet = h('div', { class: 'sheet cam-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('modify.title') },
    h('h3', {}, t('modify.title'), ` · ${t('page')} ${index + 1}`),
    h('p', { class: 'muted small' }, t('autoDetect')),
    cornerEditor(shot.page, () => {}),
    filters,
    h('div', { class: 'row' },
      h('button', { class: 'btn ghost danger', onclick: () => (session.shots.splice(index, 1), sheet.remove(), scrim.remove(), onDone()) }, icon('trash', 18), t('delete')),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn primary', onclick: () => close(true) }, t('save'))));
  drawFilters();
  document.body.append(scrim, sheet);
  sheet.querySelector<HTMLElement>('button')?.focus();
}

function docView(root: HTMLElement, autoAction = false) {
  const status = h('p', { class: 'doc-status', role: 'status' });
  const pages = h('div', { class: 'doc-pages' });
  let busy = false;

  const work = async (label: Key, fn: () => Promise<void>) => {
    if (busy) return;
    busy = true;
    status.textContent = t(label);
    try {
      await fn();
      status.textContent = '';
    } catch {
      status.textContent = t('err.unknown');
    } finally {
      busy = false;
    }
  };

  const changed = () => {
    if (!session.shots.length) {
      if (session.itemId) void removeItem(session.itemId).catch(() => {});
      session = fresh(session.mode, session.batch);
      location.hash = '#/';
      return;
    }
    draw();
    void work('doc.saving', async () => void (await persist()));
  };

  const draw = () => clear(pages, session.shots.map((s, i) =>
    h('button', { class: 'doc-page', 'aria-label': `${t('cam.modify')} · ${t('page')} ${i + 1}`, onclick: () => modifySheet(i, changed) },
      toCanvas(s.flat, 1100), h('span', { class: 'doc-num' }, `${i + 1}/${session.shots.length}`))));

  const addPage = () => ((session.batch = true), cameraView(root));
  const share = () => work('doc.working', async () => send(await persist()));
  const ocrAll = async () => {
    const out: string[] = [];
    for (let i = 0; i < session.shots.length; i++) {
      status.textContent = `${t('doc.reading')} ${i + 1}/${session.shots.length}`;
      out.push((await recognize('nep+eng', session.shots[i].flat, false)).text);
    }
    return out;
  };
  const toWord = () => work('doc.reading', async () => {
    const texts = await ocrAll();
    const file = { name: session.name.replace(/\.pdf$/, '.docx'), bytes: buildDocx(texts.map(textToParagraphs)), mime: DOCX };
    await addFile(file, 'toword').catch(() => {});
    toast(t('doc.saved'));
    celebrate(status);
    await send(file);
  });
  const extract = () => work('doc.reading', async () => textSheet((await ocrAll()).join('\n\n')));
  const sign = () => work('doc.working', async () => {
    await persist();
    location.hash = `#/sign?lib=${encodeURIComponent(session.itemId ?? '')}`;
  });
  const done = () => ((session = fresh(session.mode, false)), (location.hash = '#/'));

  const bar = (ico: Parameters<typeof icon>[0], key: Key, fn: () => void) =>
    h('button', { class: 'doc-act', onclick: fn }, icon(ico, 24), h('span', {}, t(key)));

  clear(root, h('div', { class: 'doc' },
    h('header', { class: 'doc-head' },
      h('button', { class: 'icon-btn', 'aria-label': t('back'), onclick: done }, icon('back', 22)),
      h('h2', { class: 'grow' }, session.name.replace(/\.pdf$/, '')),
      h('span', { class: 'muted small' }, t('cam.pages', { n: session.shots.length }))),
    pages,
    session.mode === 'idcard' ? null : h('button', { class: 'doc-add', onclick: addPage }, icon('plus', 20), t('doc.addPage')),
    status,
    h('nav', { class: 'doc-bar', 'aria-label': t('doc.actions') },
      session.mode === 'idcard' ? null : bar('scan', 'doc.add', addPage),
      bar('pen', 'doc.edit', () => modifySheet(0, changed)),
      bar('share', 'share', share),
      session.mode === 'ocr' ? bar('ocr', 'mode.ocr', extract) : bar('toword', 'mode.toword', toWord),
      bar('sign', 'mode.sign', sign))));
  draw();
  if (!autoAction) return;
  if (session.mode === 'ocr') void extract();
  else if (session.mode === 'toword') void toWord();
  else if (session.mode === 'sign') void sign();
  else toast(t('doc.saved'));
  celebrate(pages);
}

function textSheet(text: string) {
  const scrim = h('div', { class: 'scrim', onclick: () => (sheet.remove(), scrim.remove()) });
  const area = h('textarea', { class: 'doc-text', rows: 12, 'aria-label': t('doc.text') });
  area.value = text.trim();
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('doc.text') },
    h('h3', {}, t('doc.text')),
    area,
    h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: () => void send({ name: session.name.replace(/\.pdf$/, '.txt'), bytes: new TextEncoder().encode(area.value), mime: 'text/plain' }) }, icon('share', 18), t('share')),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn primary', onclick: () => void navigator.clipboard?.writeText(area.value).then(() => toast(t('doc.copied'))).catch(() => {}) }, t('copy'))));
  document.body.append(scrim, sheet);
}
