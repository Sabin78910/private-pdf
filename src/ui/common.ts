import { h, clear, announce } from './dom';
import { t, type Key } from '../i18n';
import { canShare, history, previewUrl, saveFile, shareFile, type OutputFile } from '../platform/files';
import { formatBytes } from '../core/history';

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
  return h('div', { class: 'row wrap' }, zone, h('label', { class: 'btn' }, cam, '📷 ', t('takePhoto')));
}

export function errorKey(e: unknown): Key {
  const code = (e as { code?: string })?.code;
  const known = ['encrypted', 'corrupted', 'empty', 'invalid-range', 'unsupported-image', 'no-input', 'cancelled', 'font-unsupported', 'memory'];
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
    const bar = h('progress', { max: 100, value: pct, 'aria-label': label });
    clear(
      this.el,
      h('div', { class: 'card' }, h('div', { class: 'row' }, h('strong', {}, label), h('span', { class: 'muted' }, total ? `${pct}%` : '')), bar,
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
    clear(this.el, h('div', { class: 'card ok' }, h('h3', {}, '✓ ', t('done')), extra ?? null, cards, h('p', { class: 'muted small' }, t('originalSafe'))));
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
