import { h, clear } from '../ui/dom';
import { t } from '../i18n';
import { Runner, filePicker, fileChip, isPdfFile, select } from '../ui/common';
import { readFile } from '../platform/files';
import { runJob } from '../platform/jobs';
import { outputName } from '../core/history';
import type { NumberFormat, NumberPosition } from '../core/pageNumbers';

const POSITIONS: NumberPosition[] = ['bottom-center', 'bottom-right', 'bottom-left', 'top-center', 'top-right', 'top-left'];
const FORMATS: NumberFormat[] = ['n', 'n-of-total', 'page-n-of-total'];

export function pageNumbersTool(root: HTMLElement) {
  let file: File | null = null;
  let bytes: Uint8Array | null = null;
  let pageCount = 0;
  let position: NumberPosition = 'bottom-center';
  let format: NumberFormat = 'n';
  let skipFirst = false;
  const runner = new Runner('numbers');
  const startAt = h('input', { type: 'number', min: 0, value: 1, id: 'startAt', inputmode: 'numeric' });
  const body = h('div');

  const draw = () => {
    if (!file) return clear(body);
    clear(
      body,
      h('ul', { class: 'list' }, fileChip(file.name, file.size, [h('span', { class: 'muted' }, `${pageCount} ${t('pages')}`)])),
      select('numPosition', POSITIONS.map((p) => [p, `pos.${p}`] as [NumberPosition, `pos.${NumberPosition}`]), position, (v) => (position = v)),
      select('numFormat', FORMATS.map((f) => [f, `fmt.${f}`] as [NumberFormat, `fmt.${NumberFormat}`]), format, (v) => (format = v)),
      h('div', { class: 'field' }, h('label', { for: 'startAt' }, t('numStartAt')), startAt),
      h('label', { class: 'row' },
        h('input', { type: 'checkbox', checked: skipFirst, onchange: (e: Event) => (skipFirst = (e.target as HTMLInputElement).checked) }),
        t('numSkipFirst')),
      h('button', { class: 'btn primary', onclick: () => start() }, t('start')),
    );
  };

  const load = async (f: File) => {
    file = f;
    runner.reset();
    await runner.run(
      async () => {
        bytes = await readFile(f);
        return runJob<number>({ op: 'pageCount', bytes }).promise;
      },
      (n) => {
        pageCount = n;
        draw();
        return { files: [], inputs: [] };
      },
      () => load(f),
    );
    if (pageCount) runner.reset();
  };

  const start = () =>
    runner.run(
      async ({ setCancel }) => {
        const options = { position, format, skipFirst, startAt: Math.round(Number(startAt.value) || 0) };
        const job = runJob<Uint8Array>({ op: 'pageNumbers', bytes: bytes!, options });
        setCancel(job.cancel);
        return job.promise;
      },
      (out) => ({
        files: [{ name: outputName(file!.name, 'numbered'), bytes: out, mime: 'application/pdf' }],
        inputs: [file!.name],
      }),
      start,
    );

  clear(root, filePicker({ accept: 'application/pdf,.pdf', label: 'choosePdf', onFiles: (fs) => fs.filter(isPdfFile)[0] && load(fs.filter(isPdfFile)[0]) }), body, runner.el);
}
