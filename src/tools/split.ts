import { h, clear } from '../ui/dom';
import { t } from '../i18n';
import { Runner, filePicker, fileChip, isPdfFile, select } from '../ui/common';
import { bundle, readFile } from '../platform/files';
import { runJob } from '../platform/jobs';
import { parsePageRanges } from '../core/pageRanges';
import { outputName } from '../core/history';

export function splitTool(root: HTMLElement) {
  let file: File | null = null;
  let bytes: Uint8Array | null = null;
  let pageCount = 0;
  let mode: 'extract' | 'every' = 'extract';
  const runner = new Runner('split');
  const range = h('input', { type: 'text', inputmode: 'numeric', value: '1', id: 'range' });
  const every = h('input', { type: 'number', min: 1, value: 1, id: 'every' });
  const body = h('div');

  const draw = () => {
    if (!file) return clear(body);
    clear(
      body,
      h('ul', { class: 'list' }, fileChip(file.name, file.size, [h('span', { class: 'muted' }, `${pageCount} ${t('pages')}`)])),
      select('splitMode', [['extract', 'splitExtract'], ['every', 'splitEvery']], mode, (v) => ((mode = v), draw())),
      mode === 'extract'
        ? h('div', { class: 'field' }, h('label', { for: 'range' }, t('pageRange')), range)
        : h('div', { class: 'field' }, h('label', { for: 'every' }, t('everyN')), every),
      h('button', { class: 'btn primary run', id: 'run', onclick: () => start() }, t('action.split')),
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
        range.value = `1-${n}`;
        draw();
        return { files: [], inputs: [] };
      },
      () => load(f),
    );
    if (pageCount) runner.reset();
  };

  const start = () =>
    runner.run(
      async ({ setCancel, progress }) => {
        if (mode === 'extract') {
          const indices = parsePageRanges(range.value, pageCount);
          const job = runJob<Uint8Array>({ op: 'extract', bytes: bytes!, indices });
          setCancel(job.cancel);
          return [await job.promise];
        }
        const job = runJob<Uint8Array[]>({ op: 'splitEvery', bytes: bytes!, every: Number(every.value) }, progress);
        setCancel(job.cancel);
        return job.promise;
      },
      (parts) => {
        const outs = parts.map((b, i) => ({
          name: outputName(file!.name, parts.length === 1 ? 'pages' : `part${i + 1}`),
          bytes: b,
          mime: 'application/pdf',
        }));
        return { files: [bundle(outs, outputName(file!.name, 'split', 'zip'))], inputs: [file!.name] };
      },
      start,
    );

  clear(root, filePicker({ accept: 'application/pdf,.pdf', label: 'choosePdf', onFiles: (fs) => fs.filter(isPdfFile)[0] && load(fs.filter(isPdfFile)[0]) }), body, runner.el);
}
