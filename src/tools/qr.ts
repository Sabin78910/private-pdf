import { h, clear } from '../ui/dom';
import { t, type Key } from '../i18n';
import { filePicker, isImageFile, toast } from '../ui/common';
import { icon } from '../ui/icons';
import { parseQr } from '../core/qr';

type Decoder = (data: Uint8ClampedArray, w: number, h: number) => string | null;
let decoder: Promise<Decoder> | null = null;
/** jsQR is loaded only when this tool opens, so it costs nothing elsewhere. */
const loadDecoder = () =>
  (decoder ??= import('jsqr').then((m) => (d, w, ht) => m.default(d, w, ht, { inversionAttempts: 'attemptBoth' })?.data ?? null));

function decodeFrame(src: CanvasImageSource, w: number, ht: number, dec: Decoder): string | null {
  const s = Math.min(1, 1000 / Math.max(w, ht));
  const c = document.createElement('canvas');
  c.width = Math.round(w * s);
  c.height = Math.round(ht * s);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return dec(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
}

function copyBtn(text: string) {
  return h('button', { class: 'btn', onclick: () => navigator.clipboard?.writeText(text).then(() => toast(t('qr.copied')), () => {}) }, t('qr.copy'));
}

function resultCard(raw: string, again: () => void) {
  const c = parseQr(raw);
  const rows: (Node | null)[] = [];
  if (c.kind === 'url') rows.push(h('p', { class: 'qr-val' }, c.url), h('div', { class: 'row wrap' },
    h('a', { class: 'btn primary', href: c.url, target: '_blank', rel: 'noopener noreferrer' }, t('qr.open')), copyBtn(c.url)));
  else if (c.kind === 'wifi') rows.push(
    h('p', {}, h('span', { class: 'muted' }, t('qr.network'), ' '), h('strong', {}, c.ssid)),
    c.password ? h('p', {}, h('span', { class: 'muted' }, t('qr.password'), ' '), h('strong', { class: 'qr-val' }, c.password)) : null,
    c.password ? copyBtn(c.password) : null);
  else if (c.kind === 'email') rows.push(h('p', { class: 'qr-val' }, c.to), h('div', { class: 'row wrap' }, h('a', { class: 'btn primary', href: `mailto:${c.to}` }, t('qr.email')), copyBtn(c.to)));
  else if (c.kind === 'phone') rows.push(h('p', { class: 'qr-val' }, c.number), h('div', { class: 'row wrap' }, h('a', { class: 'btn primary', href: `tel:${c.number}` }, t('qr.call')), copyBtn(c.number)));
  else rows.push(h('p', { class: 'qr-val' }, c.text), copyBtn(c.text));
  return h('section', { class: 'card', role: 'status' },
    h('div', { class: 'caption-label' }, t(`qr.kind.${c.kind}` as Key)),
    ...rows,
    h('button', { class: 'btn ghost', onclick: again }, icon('scan', 18), t('qr.again')));
}

/** Reads QR codes from the camera or a photo. Decoding happens on the device; nothing is sent. */
export function qrTool(root: HTMLElement) {
  const camHost = h('div');
  const out = h('div');
  let stream: MediaStream | null = null;
  let raf = 0;
  const stop = () => {
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((tr) => tr.stop());
    stream = null;
    clear(camHost);
  };
  window.addEventListener('hashchange', stop, { once: true });

  const show = (text: string) => {
    stop();
    navigator.vibrate?.(30);
    clear(out, resultCard(text, () => (clear(out), void startCamera())));
  };

  const startCamera = async () => {
    clear(out);
    const dec = await loadDecoder();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    } catch {
      return clear(camHost, h('p', { class: 'muted' }, t('qr.noCamera')));
    }
    const video = h('video', { autoplay: true, playsInline: true, muted: true, class: 'webcam' });
    video.srcObject = stream;
    clear(camHost, h('div', { class: 'qr-cam' }, video, h('span', { class: 'qr-frame', 'aria-hidden': 'true' })),
      h('p', { class: 'muted small' }, t('qr.aim')),
      h('button', { class: 'btn', onclick: stop }, t('cancel')));
    let last = 0;
    const tick = (now: number) => {
      if (!stream) return;
      if (now - last > 200 && video.videoWidth) {
        last = now;
        const text = decodeFrame(video, video.videoWidth, video.videoHeight, dec);
        if (text) return show(text);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  };

  const fromPhoto = async (files: File[]) => {
    const f = files.find(isImageFile);
    if (!f) return;
    stop();
    const [dec, bmp] = await Promise.all([loadDecoder(), createImageBitmap(f)]);
    const text = decodeFrame(bmp, bmp.width, bmp.height, dec);
    bmp.close();
    if (text) show(text);
    else clear(out, h('p', { class: 'card empty-row', role: 'status' }, t('qr.none')));
  };

  const camBtn = typeof navigator.mediaDevices?.getUserMedia === 'function'
    ? h('button', { class: 'btn primary', onclick: () => void startCamera() }, icon('qr', 18), t('qr.start'))
    : null;
  clear(root, camBtn, camHost, filePicker({ accept: 'image/jpeg,image/png,image/webp', label: 'qr.fromPhoto', onFiles: (fs) => void fromPhoto(fs) }), out);
}
