/**
 * Pure image maths for the document scanner: edge (corner) detection, perspective
 * correction and cleanup filters. Works on RGBA pixel buffers so it runs anywhere,
 * including a Web Worker, and is unit tested without a browser.
 */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray; // RGBA
}
export interface Point {
  x: number;
  y: number;
}
/** Corners in order: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Point, Point, Point, Point];

export function toGray(img: Pixels): Uint8Array {
  const g = new Uint8Array(img.width * img.height);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) {
    g[i] = (img.data[j] * 77 + img.data[j + 1] * 150 + img.data[j + 2] * 29) >> 8;
  }
  return g;
}

/** Otsu's method: the threshold that best separates a bright page from the background. */
export function otsuThreshold(gray: Uint8Array): number {
  const hist = new Array<number>(256).fill(0);
  for (const v of gray) hist[v]++;
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let bestVar = -1;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > bestVar) {
      bestVar = v;
      best = t;
    }
  }
  return best;
}

/**
 * Finds the page corners: threshold, keep the largest bright connected region, then take
 * its extreme points along the diagonals. Returns the full frame when no page stands out.
 */
export function detectDocument(img: Pixels): Quad {
  const { width: w, height: h } = img;
  const full: Quad = [
    { x: 0, y: 0 },
    { x: w - 1, y: 0 },
    { x: w - 1, y: h - 1 },
    { x: 0, y: h - 1 },
  ];
  const gray = toGray(img);
  const t = otsuThreshold(gray);
  const label = new Int32Array(w * h);
  let bestLabel = 0;
  let bestSize = 0;
  let next = 1;
  const stack: number[] = [];
  for (let start = 0; start < gray.length; start++) {
    if (gray[start] <= t || label[start]) continue;
    let size = 0;
    label[start] = next;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop()!;
      size++;
      const x = p % w;
      const y = (p - x) / w;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const q of nb) {
        if (q >= 0 && !label[q] && gray[q] > t) {
          label[q] = next;
          stack.push(q);
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      bestLabel = next;
    }
    next++;
  }
  // A "page" smaller than 15% of the frame, or one filling it, is not a useful detection.
  const frac = bestSize / (w * h);
  if (!bestLabel || frac < 0.15 || frac > 0.98) return full;
  let tl = { x: 0, y: 0, s: Infinity };
  let br = { x: 0, y: 0, s: -Infinity };
  let tr = { x: 0, y: 0, s: -Infinity };
  let bl = { x: 0, y: 0, s: Infinity };
  for (let p = 0; p < label.length; p++) {
    if (label[p] !== bestLabel) continue;
    const x = p % w;
    const y = (p - x) / w;
    if (x + y < tl.s) tl = { x, y, s: x + y };
    if (x + y > br.s) br = { x, y, s: x + y };
    if (x - y > tr.s) tr = { x, y, s: x - y };
    if (x - y < bl.s) bl = { x, y, s: x - y };
  }
  return [tl, tr, br, bl].map(({ x, y }) => ({ x, y })) as Quad;
}

/** Solves the 3x3 homography mapping the unit rectangle (0..W,0..H) onto `quad`. */
export function homography(quad: Quad, W: number, H: number): number[] {
  const src = [
    [0, 0],
    [W, 0],
    [W, H],
    [0, H],
  ];
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const { x: u, y: v } = quad[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  // Gaussian elimination with partial pivoting.
  for (let c = 0; c < 8; c++) {
    let piv = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    [b[c], b[piv]] = [b[piv], b[c]];
    for (let r = c + 1; r < 8; r++) {
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const x = new Array<number>(8).fill(0);
  for (let r = 7; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < 8; k++) s -= A[r][k] * x[k];
    x[r] = s / A[r][r];
  }
  return [...x, 1];
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Output size that keeps the page's real proportions. */
export function quadOutputSize(q: Quad): { width: number; height: number } {
  return {
    width: Math.round(Math.max(dist(q[0], q[1]), dist(q[3], q[2]))),
    height: Math.round(Math.max(dist(q[0], q[3]), dist(q[1], q[2]))),
  };
}

/** Perspective-corrects `quad` of `img` into a flat rectangle (bilinear sampling). */
export function warpPerspective(img: Pixels, quad: Quad, out = quadOutputSize(quad)): Pixels {
  const { width: W, height: H } = out;
  const m = homography(quad, W, H);
  const data = new Uint8ClampedArray(W * H * 4);
  const sw = img.width;
  const sh = img.height;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = m[6] * x + m[7] * y + m[8];
      const u = Math.min(Math.max((m[0] * x + m[1] * y + m[2]) / d, 0), sw - 1);
      const v = Math.min(Math.max((m[3] * x + m[4] * y + m[5]) / d, 0), sh - 1);
      const x0 = Math.floor(u);
      const y0 = Math.floor(v);
      const x1 = Math.min(x0 + 1, sw - 1);
      const y1 = Math.min(y0 + 1, sh - 1);
      const fx = u - x0;
      const fy = v - y0;
      const o = (y * W + x) * 4;
      for (let c = 0; c < 4; c++) {
        const a = img.data[(y0 * sw + x0) * 4 + c];
        const b2 = img.data[(y0 * sw + x1) * 4 + c];
        const c2 = img.data[(y1 * sw + x0) * 4 + c];
        const d2 = img.data[(y1 * sw + x1) * 4 + c];
        data[o + c] = (a * (1 - fx) + b2 * fx) * (1 - fy) + (c2 * (1 - fx) + d2 * fx) * fy;
      }
    }
  }
  return { width: W, height: H, data };
}

export type ScanFilter = 'original' | 'enhance' | 'grayscale' | 'bw';

/**
 * Cleanup filters. 'enhance' stretches contrast; 'bw' uses a local (adaptive) threshold so
 * shadows and uneven phone lighting do not swallow text.
 */
export function applyFilter(img: Pixels, filter: ScanFilter): Pixels {
  if (filter === 'original') return img;
  const { width: w, height: h } = img;
  const data = new Uint8ClampedArray(img.data);
  const gray = toGray(img);
  if (filter === 'grayscale' || filter === 'enhance') {
    let lo = 255;
    let hi = 0;
    const sorted = Uint32Array.from(gray).sort();
    lo = sorted[Math.floor(sorted.length * 0.02)];
    hi = sorted[Math.floor(sorted.length * 0.98)];
    const span = Math.max(hi - lo, 1);
    for (let i = 0; i < gray.length; i++) {
      const o = i * 4;
      if (filter === 'grayscale') {
        data[o] = data[o + 1] = data[o + 2] = ((gray[i] - lo) * 255) / span;
      } else {
        for (let c = 0; c < 3; c++) data[o + c] = ((img.data[o + c] - lo) * 255) / span;
      }
    }
    return { width: w, height: h, data };
  }
  // Adaptive threshold via an integral image: pixel is ink if darker than its local mean - C.
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += gray[y * w + x];
      integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + row;
    }
  }
  const r = Math.max(4, Math.round(Math.min(w, h) / 32));
  const C = 10;
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const sum =
        integral[y1 * (w + 1) + x1] - integral[y0 * (w + 1) + x1] - integral[y1 * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      const v = gray[y * w + x] < mean - C ? 0 : 255;
      const o = (y * w + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = v;
    }
  }
  return { width: w, height: h, data };
}
