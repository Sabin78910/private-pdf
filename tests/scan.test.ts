import { describe, expect, it } from 'vitest';
import { applyFilter, detectDocument, homography, otsuThreshold, warpPerspective, type Pixels, type Quad } from '../src/core/scan';

function canvas(w: number, h: number, fill: number): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([fill, fill, fill, 255], i * 4);
  return { width: w, height: h, data };
}
function setPx(img: Pixels, x: number, y: number, v: number) {
  img.data.set([v, v, v, 255], (y * img.width + x) * 4);
}
/** Draws a white convex quad on dark background using a point-in-polygon test. */
function drawQuad(img: Pixels, q: Quad) {
  const inside = (x: number, y: number) =>
    q.every((a, i) => {
      const b = q[(i + 1) % 4];
      return (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) >= 0;
    });
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) if (inside(x, y)) setPx(img, x, y, 235);
}

describe('scanner', () => {
  it('Otsu splits a two-tone image between the tones', () => {
    const t = otsuThreshold(Uint8Array.from([...Array(50).fill(30), ...Array(50).fill(220)]));
    expect(t).toBeGreaterThanOrEqual(30);
    expect(t).toBeLessThan(220);
  });

  it('detects the corners of a tilted page', () => {
    const img = canvas(120, 120, 40);
    const q: Quad = [
      { x: 20, y: 15 },
      { x: 100, y: 25 },
      { x: 95, y: 105 },
      { x: 15, y: 95 },
    ];
    drawQuad(img, q);
    const found = detectDocument(img);
    found.forEach((p, i) => {
      expect(Math.abs(p.x - q[i].x)).toBeLessThanOrEqual(3);
      expect(Math.abs(p.y - q[i].y)).toBeLessThanOrEqual(3);
    });
  });

  it('falls back to the full frame when there is no page', () => {
    expect(detectDocument(canvas(20, 20, 128))[2]).toEqual({ x: 19, y: 19 });
  });

  it('homography maps rectangle corners onto the quad', () => {
    const q: Quad = [
      { x: 10, y: 5 },
      { x: 90, y: 12 },
      { x: 80, y: 70 },
      { x: 5, y: 60 },
    ];
    const m = homography(q, 50, 40);
    const map = (x: number, y: number) => {
      const d = m[6] * x + m[7] * y + m[8];
      return [(m[0] * x + m[1] * y + m[2]) / d, (m[3] * x + m[4] * y + m[5]) / d];
    };
    expect(map(50, 40)[0]).toBeCloseTo(80, 6);
    expect(map(50, 40)[1]).toBeCloseTo(70, 6);
    expect(map(0, 40)[0]).toBeCloseTo(5, 6);
  });

  it('warp flattens the page so the output is all page colour', () => {
    const img = canvas(120, 120, 40);
    const q: Quad = [
      { x: 20, y: 15 },
      { x: 100, y: 25 },
      { x: 95, y: 105 },
      { x: 15, y: 95 },
    ];
    drawQuad(img, q);
    const inner: Quad = q.map((p) => ({ x: p.x + (60 - p.x) * 0.1, y: p.y + (60 - p.y) * 0.1 })) as Quad;
    const out = warpPerspective(img, inner, { width: 30, height: 30 });
    for (let i = 0; i < out.data.length; i += 4) expect(out.data[i]).toBeGreaterThan(200);
  });

  it('black & white filter keeps dark text under a shadow gradient', () => {
    const img = canvas(64, 64, 0);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) setPx(img, x, y, 120 + x * 2); // uneven light
    for (let x = 10; x < 54; x++) setPx(img, x, 32, 20); // a line of "text"
    const bw = applyFilter(img, 'bw');
    expect(bw.data[(32 * 64 + 50) * 4]).toBe(0); // ink stays ink
    expect(bw.data[(10 * 64 + 5) * 4]).toBe(255); // dim paper becomes white
  });
});
