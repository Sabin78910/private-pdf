import { PDFDocument, PageSizes, degrees } from 'pdf-lib';
import { PdfError } from './errors';
import { loadPdf } from './load';

export type Rotation = 0 | 90 | 180 | 270;

/** One output page: a source page (zero-based) or a blank page, plus extra rotation. */
export interface PagePlanItem {
  source: number | 'blank';
  rotate: Rotation;
}

/** Initial plan that reproduces the document unchanged. */
export function identityPlan(pageCount: number): PagePlanItem[] {
  return Array.from({ length: pageCount }, (_, i) => ({ source: i, rotate: 0 as Rotation }));
}

export function rotateBy(r: Rotation, delta: number): Rotation {
  return ((((r + delta) % 360) + 360) % 360) as Rotation;
}

/**
 * Builds a new PDF from a page plan. Reorder, delete (omit), duplicate (repeat a source),
 * insert blank pages and rotate all reduce to this one operation.
 */
export async function applyPagePlan(bytes: Uint8Array, plan: PagePlanItem[]): Promise<Uint8Array> {
  if (plan.length === 0) throw new PdfError('invalid-range', 'document would have no pages');
  const src = await loadPdf(bytes);
  const n = src.getPageCount();
  const out = await PDFDocument.create();
  const wanted = plan.filter((p) => p.source !== 'blank').map((p) => p.source as number);
  if (wanted.some((i) => !Number.isInteger(i) || i < 0 || i >= n)) throw new PdfError('invalid-range');
  const copied = await out.copyPages(src, wanted);
  let k = 0;
  let lastSize: [number, number] = PageSizes.A4;
  for (const item of plan) {
    if (item.source === 'blank') {
      const page = out.addPage(lastSize);
      page.setRotation(degrees(item.rotate));
      continue;
    }
    const page = out.addPage(copied[k++]);
    const { width, height } = page.getSize();
    lastSize = [width, height];
    page.setRotation(degrees(rotateBy(page.getRotation().angle as Rotation, item.rotate)));
  }
  return out.save({ useObjectStreams: true });
}
