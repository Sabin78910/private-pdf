import { getItem, readItem } from '../platform/libraryStore';
import { h, clear, announce } from './dom';
import { icon } from './icons';
import { keepButton } from './libraryView';
import { t, type Key } from '../i18n';
import { canShare, history, previewUrl, saveFile, shareFile, type OutputFile } from '../platform/files';
import { formatBytes } from '../core/history';
import { countUpValue } from '../core/feel';
import { progressStep } from '../core/theme';
import { celebrate } from './celebrate';

/** File picker with drag-and-drop. Validation happens in each tool. */
export function filePicker(opts: {
  accept: string;
  multiple?: boolean;
  label: Key;
  capture?: boolean;
  onFiles: (files: File[]) => void;
}): HTMLElement {
  const input = h('input', {
    type: 'file',
    accept: opts.accept,
    multiple: !!opts.multiple,
    class: 'visually-hidden',
    onchange: () => {
      if (input.files?.length) opts.onFiles([...input.files]);
      input.value = '';
    },
  });
  const zone = h(
    'label',
    { class: 'drop' },
    input,
    h('span', { class: 'chipico' }, icon(opts.accept.includes('image') && !opts.accept.includes('pdf') ? 'toimage' : 'upload', 30)),
    h('strong', {}, t(opts.label)),
    h('span', { class: 'hint' }, t('pickHint')),
    h('span', { class: 'btn primary' }, t('browseFiles')),
    h('span', { class: 'dz' }, t('dropHere')),
  );
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('over');
    const files = [...(e.dataTransfer?.files ?? [])];
    if (files.length) opts.onFiles(opts.multiple ? files : files.slice(0, 1));
  });
  if (!opts.capture) return zone;
  const cam = h('input', {
    type: 'file',
    accept: 'image/*',
    capture: 'environment',
    class: 'visually-hidden',
    onchange: () => {
      if (cam.files?.length) opts.onFiles([...cam.files]);
      cam.value = '';
    },
  });
  return h('div', { class: 'row wrap' }, zone, h('label', { class: 'btn' }, cam, icon('scan', 18), t('takePhoto')));
}

export function errorKey(e: unknown): Key {
  const code = (e as { code?: string })?.code;
  const known = ['encrypted', 'corrupted', 'empty', 'invalid-range', 'unsupported-image', 'no-input', 'cancelled', 'font-unsupported', 'text-unsupported', 'invalid-password', 'no-form', 'no-text', 'memory'];
  if (code && known.includes(code)) return `err.${code}` as Key;
  if (/memory|allocation/i.test(String((e as Error)?.message))) return 'err.memory';
  return 'err.unknown';
}

/**
 * Shared run area: progress bar, cancel, result card with download/share/open, and error
 * card with retry. Every tool goes through this so behaviour is consistent.
 */
export class Runner {
  readonly el = h('div', { class: 'runner', 'aria-live': 'polite' });
  private cancelFn: (() => void) | null = null;
  private cancelled = false;

  constructor(private tool: string) {}

  get isCancelled() {
    return this.cancelled;
  }

  progress(done: number, total: number, label: string = t('working')) {
    const step = progressStep(done, total);
    const pct = step?.pct ?? 0;
    const stepText = step ? t('stepOf', { n: step.n, total: step.total }) : '';
    // Update the bar in place so it glides to the new value instead of snapping.
    const existing = this.el.querySelector<HTMLElement>('.bar');
    if (existing) {
      existing.setAttribute('aria-valuenow', String(pct));
      existing.setAttribute('aria-label', label);
      existing.classList.toggle('indeterminate', !total);
      (existing.firstElementChild as HTMLElement).style.width = `${pct}%`;
      this.el.querySelector('.run-label')!.textContent = label;
      this.el.querySelector('.run-pct')!.textContent = total ? `${pct}%` : '';
      this.el.querySelector('.run-step')!.textContent = stepText;
      return;
    }
    const bar = h('div', { class: `bar${total ? '' : ' indeterminate'}`, role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct, 'aria-label': label },
      h('i', { style: `width:${pct}%` }));
    clear(
      this.el,
      h('div', { class: 'card' }, h('div', { class: 'row' }, h('strong', { class: 'run-label' }, label), h('span', { class: 'muted run-pct' }, total ? `${pct}%` : '')), bar,
        h('p', { class: 'muted small run-step', 'aria-live': 'polite' }, stepText),
        h('button', { class: 'btn', onclick: () => this.cancel() }, t('cancel'))),
    );
  }

  private cancel() {
    this.cancelled = true;
    this.cancelFn?.();
    this.fail({ code: 'cancelled' }, () => {});
  }

  async run<T>(
    work: (ctx: { setCancel: (fn: () => void) => void; progress: (d: number, tot: number, label?: string) => void }) => Promise<T>,
    done: (value: T) => { files: OutputFile[]; inputs: string[]; extra?: Node },
    retry: () => void,
  ) {
    this.cancelled = false;
    this.cancelFn = null;
    this.progress(0, 0);
    announce(t('working'));
    try {
      const value = await work({
        setCancel: (fn) => (this.cancelFn = fn),
        progress: (d, tot, label) => !this.cancelled && this.progress(d, tot, label),
      });
      if (this.cancelled) return;
      const { files, inputs, extra } = done(value);
      this.success(files, extra);
      for (const f of files) history.add({ tool: this.tool, inputs, output: f.name, outputSize: f.bytes.length, ok: true });
    } catch (e) {
      if (this.cancelled) return;
      console.warn('job failed', (e as { code?: string })?.code ?? 'unknown'); // no content logged
      this.fail(e, retry);
    }
  }

  success(files: OutputFile[], extra?: Node) {
    announce(t('done'));
    const cards = files.map((f) => {
      const pdf = f.mime === 'application/pdf';
      const viewable = pdf || f.mime.startsWith('image/');
      return h('div', { class: 'result' },
        h('div', { class: 'fhead' },
          h('span', { class: `thumb-doc${pdf ? '' : ' img'}` }, icon(pdf ? 'file' : f.mime === 'application/zip' ? 'folder' : f.mime.startsWith('image/') ? 'toimage' : 'file', 20)),
          h('div', { class: 'grow' }, h('strong', {}, f.name), h('span', { class: 'muted small' }, formatBytes(f.bytes.length)))),
        h('div', { class: 'acts' },
          h('button', { class: 'btn primary act-save', onclick: () => saveFile(f).then(() => toast(t('done'))).catch(() => {}) }, icon('download', 18), t('saveDevice')),
          canShare() ? h('button', { class: 'icon-btn btn', 'aria-label': t('share'), title: t('share'), onclick: () => shareFile(f).catch(() => {}) }, icon('share', 20)) : null,
          viewable ? h('a', { class: 'icon-btn btn', href: previewUrl(f), target: '_blank', rel: 'noopener', 'aria-label': t('open'), title: t('open') }, icon('eye', 20)) : null,
          keepButton(f, this.tool)));
    });
    const tick = h('span', { class: 'tick', 'aria-hidden': 'true' });
    tick.innerHTML = '<svg viewBox="0 0 24 24" width="34" height="34"><circle cx="12" cy="12" r="11"/><path d="M7 12.5l3.2 3.2L17 9"/></svg>';
    clear(this.el, h('div', { class: 'card ok pop success' }, tick, h('h3', {}, t('done')), h('p', { class: 'sub' }, t('doneSub')), extra ?? null, cards));
    this.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    celebrate(tick);
  }

  fail(e: unknown, retry: () => void) {
    const key = errorKey(e);
    announce(t(key));
    clear(
      this.el,
      h('div', { class: 'card err', role: 'alert' }, h('p', {}, t(key)), key === 'err.cancelled' ? null : h('button', { class: 'btn', onclick: retry }, t('retry'))),
    );
  }

  reset() {
    clear(this.el);
  }
}

/** Element whose number counts up from 0 to `target`, formatted by `format`. Jumps straight there with reduced motion. */
export function countUp(target: number, format: (n: number) => string, durationMs = 700): HTMLElement {
  const el = h('strong', { class: 'countup' }, format(target));
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || typeof requestAnimationFrame !== 'function') return el;
  el.textContent = format(0);
  const t0 = performance.now();
  const step = (now: number) => {
    const v = countUpValue(target, now - t0, durationMs);
    el.textContent = format(v);
    if (v < target) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  return el;
}

export function fileChip(name: string, size: number, actions: Node[] = []) {
  return h('li', { class: 'chip' }, h('span', { class: 'grow' }, name, ' ', h('span', { class: 'muted' }, formatBytes(size))), actions);
}

export const isPdfFile = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
export const isImageFile = (f: File) => /^image\/(jpeg|png|webp|heic|heif)$/.test(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name);

/** Choice control: a segmented control for short labels, option cards for labels with a note in brackets. */
export function select<T extends string>(label: Key, options: [T, Key | { text: string }][], value: T, onChange: (v: T) => void) {
  const name = `o-${label}-${Math.random().toString(36).slice(2, 7)}`;
  const parts = options.map(([v, k]) => {
    const text = typeof k === 'string' ? t(k) : k.text;
    const m = /^(.*?)\s*\((.*)\)\s*$/.exec(text);
    return { v, title: m ? m[1] : text, desc: m ? m[2] : '' };
  });
  const seg = parts.length <= 4 && parts.every((p) => !p.desc && [...p.title].length <= 14);
  return h('div', { class: 'optgroup field', role: 'radiogroup', 'aria-label': t(label) },
    h('span', { class: 'lbl' }, t(label)),
    h('div', { class: `opts${seg ? ' seg' : ''}` }, parts.map((p) => h('label', { class: 'opt' },
      h('input', { type: 'radio', name, value: p.v, checked: p.v === value, onchange: () => onChange(p.v) }),
      h('span', {}, h('span', { class: 'o-t' }, p.title), p.desc ? h('span', { class: 'o-d' }, p.desc) : null)))));
}

/** Small confirmation that floats above the tab bar for two seconds. */
export function toast(msg: string) {
  document.querySelector('.toast')?.remove();
  const el = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(el);
  setTimeout(() => el.remove(), 2000);
}

/** A Library file passed as #/tool?lib=<id>, e.g. from the scanner or Recents. */
export async function libraryFile(): Promise<File | null> {
  const id = new URLSearchParams(location.hash.split('?')[1] ?? '').get('lib');
  if (!id) return null;
  const it = await getItem(id).catch(() => undefined);
  if (!it) return null;
  const f = await readItem(it);
  return new File([f.bytes], f.name, { type: f.mime });
}
