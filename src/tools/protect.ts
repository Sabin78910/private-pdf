import { h, clear } from '../ui/dom';
import { t } from '../i18n';
import { Runner, filePicker, fileChip, isPdfFile } from '../ui/common';
import { readFile } from '../platform/files';
import { runJob } from '../platform/jobs';
import { outputName } from '../core/history';
import { checkPassword } from '../core/protect';

export function protectTool(root: HTMLElement) {
  let file: File | null = null;
  let bytes: Uint8Array | null = null;
  let pageCount = 0;
  const runner = new Runner('protect');
  const pw = h('input', { type: 'password', id: 'pw', autocomplete: 'new-password' });
  const pw2 = h('input', { type: 'password', id: 'pw2', autocomplete: 'new-password' });
  const show = h('input', { type: 'checkbox', id: 'pwShow', onchange: () => (pw.type = pw2.type = show.checked ? 'text' : 'password') });
  const problem = h('p', { class: 'warn', role: 'status' });
  const body = h('div');

  const draw = () => {
    if (!file) return clear(body);
    clear(
      body,
      h('ul', { class: 'list' }, fileChip(file.name, file.size, [h('span', { class: 'muted' }, `${pageCount} ${t('pages')}`)])),
      h('div', { class: 'field' }, h('label', { for: 'pw' }, t('password')), pw),
      h('div', { class: 'field' }, h('label', { for: 'pw2' }, t('confirmPassword')), pw2),
      h('label', { class: 'row' }, show, t('showPassword')),
      h('p', { class: 'muted small' }, t('protectWarn')),
      problem,
      h('button', { class: 'btn primary run', id: 'run', onclick: () => start() }, t('action.protect')),
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

  const start = () => {
    const bad = checkPassword(pw.value, pw2.value);
    problem.textContent = bad === 'short' ? t('err.invalid-password') : bad === 'mismatch' ? t('pwMismatch') : '';
    if (bad) return;
    return runner.run(
      async ({ setCancel }) => {
        const job = runJob<Uint8Array>({ op: 'protect', bytes: bytes!, password: pw.value });
        setCancel(job.cancel);
        return job.promise;
      },
      (out) => ({
        files: [{ name: outputName(file!.name, 'protected'), bytes: out, mime: 'application/pdf' }],
        inputs: [file!.name],
      }),
      start,
    );
  };

  clear(root, filePicker({ accept: 'application/pdf,.pdf', label: 'choosePdf', onFiles: (fs) => fs.filter(isPdfFile)[0] && load(fs.filter(isPdfFile)[0]) }), body, runner.el);
}
