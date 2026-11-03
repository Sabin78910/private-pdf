import { h, clear } from '../ui/dom';
import { t } from '../i18n';
import { Runner, filePicker, fileChip, isPdfFile, select } from '../ui/common';
import { readFile } from '../platform/files';
import { runJob } from '../platform/jobs';
import { openPdf, rasterizerFor } from '../platform/render';
import { compressRaster, summarize, type CompressLevel, type CompressResult } from '../core/compress';
import { formatBytes, outputName } from '../core/history';
import { PdfError } from '../core/errors';
import { loadPdf } from '../core/load';

export function compressTool(root: HTMLElement) {
  let file: File | null = null;
  let level: CompressLevel = 'medium';
  const runner = new Runner('compress');
  const body = h('div');

  const draw = () => {
    if (!file) return clear(body);
    clear(
      body,
      h('ul', { class: 'list' }, fileChip(file.name, file.size)),
      select('level', [['low', 'level.low'], ['medium', 'level.medium'], ['high', 'level.high']], level, (v) => ((level = v), draw())),
      level !== 'low' ? h('p', { class: 'muted small' }, t('rasterNote')) : null,
      h('button', { class: 'btn primary', onclick: () => start() }, t('start')),
    );
  };

  const start = () =>
    runner.run<CompressResult>(
      async ({ setCancel, progress }) => {
        const bytes = await readFile(file!);
        if (level === 'low') {
          const job = runJob<CompressResult>({ op: 'compressLossless', bytes });
          setCancel(job.cancel);
          return job.promise;
        }
        await loadPdf(bytes); // early, clear errors for encrypted / damaged files
        const doc = await openPdf(bytes);
        let stop = false;
        setCancel(() => {
          stop = true;
          void doc.destroy();
        });
        const raster = rasterizerFor(doc);
        const r = await compressRaster(bytes, doc.numPages, async (i, dpi, q) => {
          if (stop) throw new PdfError('cancelled');
          return raster(i, dpi, q);
        }, level, progress);
        void doc.destroy();
        return r;
      },
      (r) => {
        const best = r.notSmaller ? summarize(r.originalSize, r.bytes) : r;
        const extra = h(
          'p',
          { class: r.notSmaller ? 'warn' : '' },
          r.notSmaller ? t('notSmaller') : t('sizeResult', { orig: formatBytes(best.originalSize), out: formatBytes(best.compressedSize), pct: best.savedPercent }),
        );
        return { files: [{ name: outputName(file!.name, 'compressed'), bytes: r.bytes, mime: 'application/pdf' }], inputs: [file!.name], extra };
      },
      start,
    );

  clear(root, filePicker({ accept: 'application/pdf,.pdf', label: 'choosePdf', onFiles: (fs) => ((file = fs.filter(isPdfFile)[0] ?? null), runner.reset(), draw()) }), body, runner.el);
}
