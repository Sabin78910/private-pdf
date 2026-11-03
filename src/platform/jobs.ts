/// <reference lib="webworker" />
// Runs pdf-lib operations off the main thread so a 50 MB file never freezes the UI.
// Cancelling terminates the worker, which discards all in-memory intermediate data.
import type { PagePlanItem } from '../core/organize';
import type { ImageInput, PageFit } from '../core/imagesToPdf';
import type { PageNumberOptions } from '../core/pageNumbers';
import type { WatermarkOptions } from '../core/watermark';
import type { FillSignInput } from '../core/fillSign';

export type JobRequest =
  | { op: 'merge'; inputs: Uint8Array[] }
  | { op: 'extract'; bytes: Uint8Array; indices: number[] }
  | { op: 'splitEvery'; bytes: Uint8Array; every: number }
  | { op: 'organize'; bytes: Uint8Array; plan: PagePlanItem[] }
  | { op: 'images'; images: ImageInput[]; fit: PageFit }
  | { op: 'compressLossless'; bytes: Uint8Array }
  | { op: 'fillSign'; bytes: Uint8Array; input: FillSignInput }
  | { op: 'pageNumbers'; bytes: Uint8Array; options: PageNumberOptions }
  | { op: 'watermark'; bytes: Uint8Array; options: WatermarkOptions }
  | { op: 'pageCount'; bytes: Uint8Array };

export type JobMessage =
  | { type: 'progress'; done: number; total: number }
  | { type: 'result'; value: unknown }
  | { type: 'error'; code: string; message: string };

export class CancelledError extends Error {
  code = 'cancelled' as const;
}

export interface Job<T> {
  promise: Promise<T>;
  cancel(): void;
}

export function runJob<T>(req: JobRequest, onProgress?: (done: number, total: number) => void): Job<T> {
  const worker = new Worker(new URL('./jobs.worker.ts', import.meta.url), { type: 'module' });
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    reject = rej;
    worker.onmessage = (ev: MessageEvent<JobMessage>) => {
      const m = ev.data;
      if (m.type === 'progress') onProgress?.(m.done, m.total);
      else {
        worker.terminate();
        if (m.type === 'result') res(m.value as T);
        else rej(Object.assign(new Error(m.message), { code: m.code }));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      rej(Object.assign(new Error(e.message || 'worker failed'), { code: /memory/i.test(e.message) ? 'memory' : 'unknown' }));
    };
  });
  worker.postMessage(req);
  return {
    promise,
    cancel() {
      worker.terminate();
      reject(new CancelledError('cancelled'));
    },
  };
}
