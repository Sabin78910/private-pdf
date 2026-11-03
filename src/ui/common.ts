import { h, clear, announce } from './dom';
import { icon } from './icons';
import { t, type Key } from '../i18n';
import { canShare, history, previewUrl, saveFile, shareFile, type OutputFile } from '../platform/files';
import { formatBytes } from '../core/history';
import { countUpValue } from '../core/feel';

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
    h('span', { class: 'btn primary' }, t(opts.label)),
    h('span', { class: 'muted' }, t('dropHere')),
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
  const known = ['encrypted', 'corrupted', 'empty', 'invalid-range', 'unsupported-image', 'no-input', 'cancelled', 'font-unsupported', 'text-unsupported', 'invalid-password', 'memory'];
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
    const pct = total ? Math.round((done / total) * 100) : 0;
    // Update the bar in place so it glides to the new value instead of snapping.
    const existing = this.el.querySelector<HTMLElement>('.bar');
    if (existing) {
      existing.setAttribute('aria-valuenow', String(pct));
      existing.setAttribute('aria-label', label);
      existing.classList.toggle('indeterminate', !total);
      (existing.firstElementChild as HTMLElement).style.width = `${pct}%`;
      this.el.querySelector('.run-label')!.textContent = label;
      this.el.querySelector('.run-pct')!.textContent = total ? `${pct}%` : '';
      return;
    }
    const bar = h('div', { class: `bar${total ? '' : ' indeterminate'}`, role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct, 'aria-label': label },
      h('i', { style: `width:${pct}%` }));
    clear(
      this.el,
      h('div', { class: 'card' }, h('div', { class: 'row' }, h('strong', { class: 'run-label' }, label), h('span', { class: 'muted run-pct' }, total ? `${pct}%` : '')), bar,
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
      const actions = [
        h('button', { class: 'btn primary', onclick: () => saveFile(f) }, t('download')),
        canShare() ? h('button', { class: 'btn', onclick: () => shareFile(f).catch(() => {}) }, t('share')) : null,
        f.mime === 'application/pdf' || f.mime.startsWith('image/')
          ? h('a', { class: 'btn', href: previewUrl(f), target: '_blank', rel: 'noopener' }, t('open'))
          : null,
      ];
      return h('div', { class: 'result' }, h('div', {}, h('strong', {}, f.name), h('div', { class: 'muted' }, formatBytes(f.bytes.length))), h('div', { class: 'row wrap' }, actions));
    });
    const tick = h('span', { class: 'tick', 'aria-hidden': 'true' });
    tick.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28"><circle cx="12" cy="12" r="11"/><path d="M7 12.5l3.2 3.2L17 9"/></svg>';
    clear(this.el, h('div', { class: 'card ok pop' }, h('h3', { class: 'row' }, tick, t('done')), extra ?? null, cards, h('p', { class: 'muted small' }, t('originalSafe'))));
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

export function select<T extends string>(label: Key, options: [T, Key][], value: T, onChange: (v: T) => void) {
  const id = `s-${Math.random().toString(36).slice(2)}`;
  return h(
    'div',
    { class: 'field' },
    h('label', { for: id }, t(label)),
    h('select', { id, onchange: (e: Event) => onChange((e.target as HTMLSelectElement).value as T) },
      options.map(([v, k]) => h('option', { value: v, selected: v === value }, t(k)))),
  );
}
