/**
 * Pure rules for the full-screen camera scanner: capture modes, when a live detection
 * counts as a page, smoothing the outline between frames, and document names.
 */
import type { Point, Quad, ScanFilter } from './scan';

export type CamMode = 'ocr' | 'idcard' | 'sign' | 'scan' | 'toword' | 'questions';

export interface CamModeInfo {
  id: CamMode;
  filter: ScanFilter;
  /** Batch is allowed (Single/Batch toggle shown). */
  batch: boolean;
  /** Most pages one session takes; ID cards are front and back. */
  maxPages: number;
}

/** Order of the swipeable mode strip. */
export const CAM_MODES: CamModeInfo[] = [
  { id: 'ocr', filter: 'enhance', batch: true, maxPages: 50 },
  { id: 'idcard', filter: 'enhance', batch: false, maxPages: 2 },
  { id: 'sign', filter: 'enhance', batch: false, maxPages: 1 },
  { id: 'scan', filter: 'enhance', batch: true, maxPages: 50 },
  { id: 'toword', filter: 'enhance', batch: true, maxPages: 50 },
  // Question papers and worksheets: black and white keeps print crisp and files small.
  { id: 'questions', filter: 'bw', batch: true, maxPages: 50 },
];

export const modeInfo = (id: CamMode) => CAM_MODES.find((m) => m.id === id) ?? CAM_MODES[3];

/** Shoelace area of the outline. */
export function quadArea(q: Quad): number {
  let a = 0;
  for (let i = 0; i < 4; i++) {
    const p = q[i];
    const n = q[(i + 1) % 4];
    a += p.x * n.y - n.x * p.y;
  }
  return Math.abs(a) / 2;
}

/**
 * True when the outline looks like a real page in a w×h frame: it covers a sensible share
 * of the frame and is not just the whole frame (what detection returns when nothing stands out).
 */
export function pageFound(q: Quad, w: number, h: number): boolean {
  const share = quadArea(q) / (w * h);
  const edge = Math.max(w, h) * 0.02;
  const hugsFrame = q.every((p) => p.x <= edge || p.y <= edge || p.x >= w - 1 - edge || p.y >= h - 1 - edge);
  return share >= 0.12 && share <= 0.97 && !hugsFrame;
}

/** Eases the drawn outline toward the newest detection so it does not jitter. */
export function smoothQuad(prev: Quad | null, next: Quad, amount = 0.4): Quad {
  if (!prev) return next.map((p) => ({ ...p })) as Quad;
  const mix = (a: Point, b: Point) => ({ x: a.x + (b.x - a.x) * amount, y: a.y + (b.y - a.y) * amount });
  return prev.map((p, i) => mix(p, next[i])) as Quad;
}

/** Maps a point in video pixels to screen pixels for a video shown with object-fit: cover. */
export function coverMap(vw: number, vh: number, cw: number, ch: number) {
  const s = Math.max(cw / vw, ch / vh);
  const ox = (cw - vw * s) / 2;
  const oy = (ch - vh * s) / 2;
  return (p: Point): Point => ({ x: p.x * s + ox, y: p.y * s + oy });
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "Scan 05-11-2026 12.19.pdf": readable, sorts by day, safe as a file name. */
export function scanDocName(d: Date, ext = 'pdf'): string {
  return `Scan ${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}.${pad(d.getMinutes())}.${ext}`;
}

/** OCR text to Word paragraphs: blank lines split paragraphs, single line breaks join. */
export function textToParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
}
