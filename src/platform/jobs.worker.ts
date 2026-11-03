/// <reference lib="webworker" />
import { mergePdfs } from '../core/merge';
import { extractPages, splitEvery } from '../core/split';
import { applyPagePlan } from '../core/organize';
import { imagesToPdf } from '../core/imagesToPdf';
import { compressLossless } from '../core/compress';
import { fillAndSign } from '../core/fillSign';
import { loadPdf } from '../core/load';
import { addPageNumbers } from '../core/pageNumbers';
import { addWatermark } from '../core/watermark';
import type { JobMessage, JobRequest } from './jobs';

const post = (m: JobMessage, transfer: Transferable[] = []) => (self as DedicatedWorkerGlobalScope).postMessage(m, transfer);
const progress = (done: number, total: number) => post({ type: 'progress', done, total });

async function run(req: JobRequest): Promise<unknown> {
  switch (req.op) {
    case 'merge':
      return mergePdfs(req.inputs, progress);
    case 'extract':
      return extractPages(req.bytes, req.indices);
    case 'splitEvery':
      return splitEvery(req.bytes, req.every, progress);
    case 'organize':
      return applyPagePlan(req.bytes, req.plan);
    case 'images':
      return imagesToPdf(req.images, req.fit, progress);
    case 'compressLossless':
      return compressLossless(req.bytes);
    case 'fillSign':
      return fillAndSign(req.bytes, req.input);
    case 'pageNumbers':
      return addPageNumbers(req.bytes, req.options);
    case 'watermark':
      return addWatermark(req.bytes, req.options);
    case 'pageCount':
      return (await loadPdf(req.bytes)).getPageCount();
  }
}

self.onmessage = async (ev: MessageEvent<JobRequest>) => {
  try {
    post({ type: 'result', value: await run(ev.data) });
  } catch (e) {
    const err = e as { code?: string; message?: string };
    const code = err.code ?? (/memory|allocation/i.test(err.message ?? '') ? 'memory' : 'unknown');
    // Never include document content in errors; message is code-level detail only.
    post({ type: 'error', code, message: String(err.message ?? 'error').slice(0, 200) });
  }
};
