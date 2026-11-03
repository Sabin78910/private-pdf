import { h, clear } from '../ui/dom';
import { t } from '../i18n';
import { Runner, filePicker, fileChip, isPdfFile } from '../ui/common';
import { readFile } from '../platform/files';
import { runJob } from '../platform/jobs';

export function mergeTool(root: HTMLElement) {
  let files: File[] = [];
  const list = h('ol', { class: 'list' });
  const runner = new Runner('merge');
  const startBtn = h('button', { class: 'btn primary', disabled: true, onclick: () => start() }, t('start'));

  const draw = () => {
    clear(
      list,
      files.map((f, i) =>
        fileChip(f.name, f.size, [
          h('button', { class: 'icon', title: t('moveUp'), 'aria-label': t('moveUp'), disabled: i === 0, onclick: () => move(i, -1) }, '↑'),
          h('button', { class: 'icon', title: t('moveDown'), 'aria-label': t('moveDown'), disabled: i === files.length - 1, onclick: () => move(i, 1) }, '↓'),
          h('button', { class: 'icon', title: t('remove'), 'aria-label': t('remove'), onclick: () => ((files = files.filter((_, k) => k !== i)), draw()) }, '✕'),
        ]),
      ),
    );
    startBtn.disabled = files.length < 2;
  };
  const move = (i: number, d: number) => {
    const next = [...files];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    files = next;
    draw();
  };

  const start = () =>
    runner.run(
      async ({ setCancel, progress }) => {
        const inputs = await Promise.all(files.map(readFile));
        const job = runJob<Uint8Array>({ op: 'merge', inputs }, progress);
        setCancel(job.cancel);
        return job.promise;
      },
      (bytes) => ({ files: [{ name: 'merged.pdf', bytes, mime: 'application/pdf' }], inputs: files.map((f) => f.name) }),
      start,
    );

  clear(
    root,
    filePicker({ accept: 'application/pdf,.pdf', multiple: true, label: 'choosePdfs', onFiles: (fs) => ((files = [...files, ...fs.filter(isPdfFile)]), runner.reset(), draw()) }),
    list,
    startBtn,
    runner.el,
  );
}
