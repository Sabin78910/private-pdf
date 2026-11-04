import { h, clear } from '../ui/dom';
import { t, type Key } from '../i18n';
import { Runner, filePicker, fileChip, isPdfFile } from '../ui/common';
import { readFile } from '../platform/files';
import { runJob } from '../platform/jobs';
import { outputName } from '../core/history';
import type { CropMargins } from '../core/crop';

const SIDES: (keyof CropMargins)[] = ['top', 'right', 'bottom', 'left'];

/** Trim margins from every page (crop) or bake in form fields (flatten). Both are one-file, one-button tools. */
function pdfTool(root: HTMLElement, id: 'crop' | 'flatten') {
  let file: File | null = null;
  const runner = new Runner(id);
  const inputs = Object.fromEntries(SIDES.map((s) => [s, h('input', { type: 'number', id: `crop-${s}`, min: 0, max: 100, step: 1, value: 10, inputmode: 'decimal' })])) as Record<keyof CropMargins, HTMLInputElement>;
  const body = h('div');

  const draw = () => {
    if (!file) return clear(body);
    clear(
      body,
      h('ul', { class: 'list' }, fileChip(file.name, file.size)),
      id === 'crop'
        ? h('div', {}, h('p', { class: 'muted small' }, t('crop.hint')),
            h('div', { class: 'crop-grid' }, SIDES.map((s) => h('div', { class: 'field' }, h('label', { for: `crop-${s}` }, t(`crop.${s}` as Key)), inputs[s]))))
        : h('p', { class: 'muted small' }, t('flatten.hint')),
      h('button', { class: 'btn primary run', id: 'run', onclick: () => start() }, t(`action.${id}` as Key)),
    );
  };

  const start = () =>
    runner.run(
      async ({ setCancel }) => {
        const bytes = await readFile(file!);
        const margins = Object.fromEntries(SIDES.map((s) => [s, Number(inputs[s].value) || 0])) as unknown as CropMargins;
        const job = runJob<Uint8Array>(id === 'crop' ? { op: 'crop', bytes, margins } : { op: 'flatten', bytes });
        setCancel(job.cancel);
        return job.promise;
      },
      (out) => ({ files: [{ name: outputName(file!.name, id === 'crop' ? 'cropped' : 'flattened'), bytes: out, mime: 'application/pdf' }], inputs: [file!.name] }),
      start,
    );

  clear(root, filePicker({ accept: 'application/pdf,.pdf', label: 'choosePdf', onFiles: (fs) => {
    const f = fs.find(isPdfFile);
    if (f) ((file = f), runner.reset(), draw());
  } }), body, runner.el);
}

export const cropTool = (root: HTMLElement) => pdfTool(root, 'crop');
export const flattenTool = (root: HTMLElement) => pdfTool(root, 'flatten');
