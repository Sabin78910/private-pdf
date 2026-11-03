import { h, clear } from '../ui/dom';
import { t } from '../i18n';
import { Runner, countUp, filePicker, fileChip, isPdfFile, select } from '../ui/common';
import { readFile } from '../platform/files';
import { runJob } from '../platform/jobs';
import { openPdf, rasterizerFor, renderPage, type PdfJsDoc } from '../platform/render';
import { compressRaster, estimateRasterSize, LEVEL_SETTINGS, summarize, type CompressLevel, type CompressResult } from '../core/compress';
import { formatBytes, outputName } from '../core/history';
import { PdfError } from '../core/errors';
import { loadPdf } from '../core/load';
import { bytesSaved } from '../core/feel';

export function compressTool(root: HTMLElement) {
  let file: File | null = null;
  let level: CompressLevel = 'medium';
  const runner = new Runner('compress');
  const body = h('div');
  const preview = h('div', { class: 'preview' });
  let doc: PdfJsDoc | null = null;
  let token = 0;
  const afterUrls: string[] = [];

  /** Renders page 1 as it is now and as it will look at the chosen level, plus a size estimate. */
  const renderPreview = async () => {
    const mine = ++token;
    if (!file) return clear(preview);
    try {
      if (!doc) {
        const bytes = await readFile(file);
        await loadPdf(bytes);
        doc = await openPdf(bytes);
      }
      if (mine !== token) return;
      const width = Math.min(preview.clientWidth || 360, 560);
      const base = (await (await doc.getPage(1)).getViewport({ scale: 1 })).width;
      const dpi = ((width * (window.devicePixelRatio || 1)) / base) * 72;
      const before = (await renderPage(doc, 0, dpi)).canvas;
      before.className = 'cmp-img';
      let after: HTMLElement = before.cloneNode() as HTMLCanvasElement;
      (after as HTMLCanvasElement).getContext('2d')!.drawImage(before, 0, 0);
      let estimate: Node | null = h('p', { class: 'muted small' }, t('losslessSame'));
      const settings = LEVEL_SETTINGS[level];
      if (settings) {
        const raster = rasterizerFor(doc);
        const samples = [...new Set([0, Math.floor(doc.numPages / 2), doc.numPages - 1])];
        const sizes: number[] = [];
        let first: Uint8Array | null = null;
        for (const i of samples) {
          const r = await raster(i, settings.dpi, settings.quality);
          if (mine !== token) return;
          sizes.push(r.jpeg.length);
          first ??= r.jpeg;
        }
        afterUrls.splice(0).forEach((u) => URL.revokeObjectURL(u));
        const url = URL.createObjectURL(new Blob([first!], { type: 'image/jpeg' }));
        afterUrls.push(url);
        after = h('img', { src: url, alt: '', class: 'cmp-img' });
        const est = estimateRasterSize(sizes, doc.numPages)!;
        estimate = est >= file.size
          ? h('p', { class: 'warn' }, t('estimateBigger'))
          : h('p', { class: 'estimate' }, t('estimate', { size: formatBytes(est), orig: formatBytes(file.size) }));
      }
      if (mine !== token) return;
      after.classList.add('cmp-after');
      const frame = h('div', { class: 'cmp' }, before, after,
        h('span', { class: 'cmp-tag l' }, t('preview.before')), h('span', { class: 'cmp-tag r' }, t('preview.after')));
      const slider = h('input', { type: 'range', min: 0, max: 100, value: 50, class: 'cmp-range', 'aria-label': t('compare'),
        oninput: () => frame.style.setProperty('--cut', `${slider.value}%`) });
      clear(preview, h('h3', { class: 'small muted' }, t('previewTitle')), frame, slider, estimate);
    } catch {
      clear(preview); // errors are shown when the user presses Start
    }
  };

  const draw = () => {
    if (!file) return clear(body);
    clear(
      body,
      h('ul', { class: 'list' }, fileChip(file.name, file.size)),
      select('level', [['low', 'level.low'], ['medium', 'level.medium'], ['high', 'level.high']], level, (v) => ((level = v), draw(), void renderPreview())),
      level !== 'low' ? h('p', { class: 'muted small' }, t('rasterNote')) : null,
      preview,
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
        const saved = bytesSaved(best.originalSize, best.compressedSize);
        const extra = r.notSmaller
          ? h('p', { class: 'warn' }, t('notSmaller'))
          : h('div', {},
              h('p', { class: 'saved' }, t('youSaved'), ' ', countUp(saved, formatBytes)),
              h('p', { class: 'muted' }, t('sizeResult', { orig: formatBytes(best.originalSize), out: formatBytes(best.compressedSize), pct: best.savedPercent })));
        return { files: [{ name: outputName(file!.name, 'compressed'), bytes: r.bytes, mime: 'application/pdf' }], inputs: [file!.name], extra };
      },
      start,
    );

  clear(root, filePicker({ accept: 'application/pdf,.pdf', label: 'choosePdf', onFiles: (fs) => {
    file = fs.filter(isPdfFile)[0] ?? null;
    void doc?.destroy();
    doc = null;
    runner.reset();
    draw();
    void renderPreview();
  } }), body, runner.el);
}
