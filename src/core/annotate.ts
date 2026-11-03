import { PDFHexString, PDFName, PDFString, type PDFContext, type PDFDict } from 'pdf-lib';
import { loadPdf } from './load';
import { PdfError } from './errors';

/**
 * Reader annotations, written as real PDF annotations (Highlight, Ink, Text) with appearance
 * streams so every viewer shows them. Coordinates are PDF user-space points of the page.
 */
export type Rgb = [number, number, number];

export type Annotation =
  | { kind: 'highlight'; page: number; x0: number; y0: number; x1: number; y1: number; color: Rgb }
  | { kind: 'ink'; page: number; paths: [number, number][][]; color: Rgb; width: number }
  | { kind: 'note'; page: number; x: number; y: number; text: string; color: Rgb };

export const COLORS: Record<'yellow' | 'green' | 'pink' | 'blue', Rgb> = {
  yellow: [1, 0.86, 0.2],
  green: [0.45, 0.9, 0.55],
  pink: [1, 0.55, 0.75],
  blue: [0.45, 0.7, 1],
};
export const NOTE_SIZE = 18;
export const MAX_NOTE_LENGTH = 2000;

const n = (v: number) => (Math.round(v * 100) / 100).toString();
const rgb = (c: Rgb) => c.map(n).join(' ');

function bounds(a: Annotation): [number, number, number, number] {
  if (a.kind === 'highlight') return [Math.min(a.x0, a.x1), Math.min(a.y0, a.y1), Math.max(a.x0, a.x1), Math.max(a.y0, a.y1)];
  if (a.kind === 'note') return [a.x, a.y - NOTE_SIZE, a.x + NOTE_SIZE, a.y];
  const pts = a.paths.flat();
  const pad = a.width / 2 + 1;
  return [Math.min(...pts.map((p) => p[0])) - pad, Math.min(...pts.map((p) => p[1])) - pad, Math.max(...pts.map((p) => p[0])) + pad, Math.max(...pts.map((p) => p[1])) + pad];
}

/** Drops annotations that cannot be drawn (empty ink, zero-size highlights, blank notes). */
export function isDrawable(a: Annotation): boolean {
  if (a.kind === 'note') return a.text.trim().length > 0;
  if (a.kind === 'ink') return a.paths.some((p) => p.length > 1);
  return Math.abs(a.x1 - a.x0) >= 2 && Math.abs(a.y1 - a.y0) >= 2;
}

function appearance(ctx: PDFContext, bbox: number[], content: string, resources?: { ExtGState: { GS0: { Type: string; BM: string; CA: number; ca: number } } }) {
  const stream = ctx.flateStream(content, {
    Type: 'XObject',
    Subtype: 'Form',
    BBox: bbox,
    ...(resources ? { Resources: resources } : {}),
  });
  return ctx.register(stream);
}

function build(ctx: PDFContext, a: Annotation): PDFDict {
  const rect = bounds(a);
  const [x0, y0, x1, y1] = rect;
  const base = { Type: 'Annot', Rect: rect, C: a.color, F: 4 };
  if (a.kind === 'highlight') {
    const ap = appearance(ctx, rect, `/GS0 gs ${rgb(a.color)} rg ${n(x0)} ${n(y0)} ${n(x1 - x0)} ${n(y1 - y0)} re f`, {
      ExtGState: { GS0: { Type: 'ExtGState', BM: 'Multiply', CA: 1, ca: 1 } },
    });
    return ctx.obj({ ...base, Subtype: 'Highlight', QuadPoints: [x0, y1, x1, y1, x0, y0, x1, y0], AP: { N: ap } });
  }
  if (a.kind === 'ink') {
    const paths = a.paths.filter((p) => p.length > 1);
    const ops = paths.map((p) => p.map(([x, y], i) => `${n(x)} ${n(y)} ${i ? 'l' : 'm'}`).join(' ') + ' S').join(' ');
    const ap = appearance(ctx, rect, `${rgb(a.color)} RG ${n(a.width)} w 1 J 1 j ${ops}`);
    return ctx.obj({ ...base, Subtype: 'Ink', InkList: paths.map((p) => p.flat()), BS: { W: a.width }, AP: { N: ap } });
  }
  const s = NOTE_SIZE;
  const ap = appearance(ctx, [0, 0, s, s],
    `${rgb(a.color)} rg 0.25 0.2 0.05 RG 1 w 0.5 0.5 ${s - 1} ${s - 1} re B 4 13 m 14 13 l S 4 9.5 m 14 9.5 l S 4 6 m 11 6 l S`);
  const dict = ctx.obj({ ...base, Subtype: 'Text', Name: 'Comment', Open: false, AP: { N: ap } });
  dict.set(PDFName.of('Contents'), PDFHexString.fromText(a.text.slice(0, MAX_NOTE_LENGTH)));
  dict.set(PDFName.of('M'), PDFString.fromDate(new Date()));
  return dict;
}

export async function addAnnotations(bytes: Uint8Array, annotations: Annotation[]): Promise<Uint8Array> {
  const list = annotations.filter(isDrawable);
  if (!list.length) throw new PdfError('no-input');
  const doc = await loadPdf(bytes);
  const pages = doc.getPages();
  for (const a of list) {
    const page = pages[a.page];
    if (!page) throw new PdfError('invalid-range');
    const ref = doc.context.register(build(doc.context, a));
    page.node.addAnnot(ref);
  }
  return doc.save();
}
