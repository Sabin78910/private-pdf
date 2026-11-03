import { h, clear } from '../ui/dom';
import { t } from '../i18n';
import { Runner, filePicker, fileChip, isPdfFile, select } from '../ui/common';
import { readFile } from '../platform/files';
import { runJob } from '../platform/jobs';
import { outputName } from '../core/history';
import { MAX_TEXT, type WatermarkLayout } from '../core/watermark';

const LAYOUTS: WatermarkLayout[] = ['diagonal', 'center', 'footer'];
const STRENGTHS = ['0.12', '0.25', '0.5'] as const;
type Strength = (typeof STRENGTHS)[number];

export function watermarkTool(root: HTMLElement) {
  let file: File | null = null;
  let bytes: Uint8Array | null = null;
  let pageCount = 0;
  let layout: WatermarkLayout = 'diagonal';
  let strength: Strength = '0.25';
  const runner = new Runner('watermark');
  const text = h('input', { type: 'text', id: 'wmText', value: 'CONFIDENTIAL', maxlength: MAX_TEXT });
  const body = h('div');

  const draw = () => {
    if (!file) return clear(body);
    clear(
      body,
      h('ul', { class: 'list' }, fileChip(file.name, file.size, [h('span', { class: 'muted' }, `${pageCount} ${t('pages')}`)])),
      h('div', { class: 'field' }, h('label', { for: 'wmText' }, t('wmText')), text),
      select('wmLayout', LAYOUTS.map((l) => [l, `wm.${l}`] as [WatermarkLayout, `wm.${WatermarkLayout}`]), layout, (v) => (layout = v)),
      select('wmOpacity', STRENGTHS.map((s) => [s, `wm.${s}`] as [Strength, `wm.${Strength}`]), strength, (v) => (strength = v)),
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
        const options = { text: text.value, layout, opacity: Number(strength) };
        const job = runJob<Uint8Array>({ op: 'watermark', bytes: bytes!, options });
        setCancel(job.cancel);
        return job.promise;
      },
      (out) => ({
        files: [{ name: outputName(file!.name, 'watermarked'), bytes: out, mime: 'application/pdf' }],
        inputs: [file!.name],
      }),
      start,
    );

  clear(root, filePicker({ accept: 'application/pdf,.pdf', label: 'choosePdf', onFiles: (fs) => fs.filter(isPdfFile)[0] && load(fs.filter(isPdfFile)[0]) }), body, runner.el);
}
