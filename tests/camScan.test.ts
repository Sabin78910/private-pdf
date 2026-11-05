import { describe, expect, it } from 'vitest';
import { CAM_MODES, coverMap, modeInfo, pageFound, quadArea, scanDocName, smoothQuad, textToParagraphs } from '../src/core/camScan';
import type { Quad } from '../src/core/scan';

const rect = (x0: number, y0: number, x1: number, y1: number): Quad => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

describe('camera scanner rules', () => {
  it('lists the six modes in strip order with Scan as default', () => {
    expect(CAM_MODES.map((m) => m.id)).toEqual(['ocr', 'idcard', 'sign', 'scan', 'toword', 'questions']);
    expect(modeInfo('questions').filter).toBe('bw');
    expect(modeInfo('idcard').maxPages).toBe(2);
    expect(modeInfo('sign').batch).toBe(false);
  });

  it('measures outline area', () => {
    expect(quadArea(rect(0, 0, 10, 20))).toBe(200);
  });

  it('treats a page inside the frame as found, the whole frame or a speck as not', () => {
    expect(pageFound(rect(20, 30, 80, 90), 100, 120)).toBe(true);
    expect(pageFound(rect(0, 0, 99, 119), 100, 120)).toBe(false);
    expect(pageFound(rect(40, 40, 50, 50), 100, 120)).toBe(false);
  });

  it('eases the outline toward the newest detection', () => {
    const a = rect(0, 0, 10, 10);
    const b = rect(10, 10, 20, 20);
    expect(smoothQuad(null, b)).toEqual(b);
    expect(smoothQuad(a, b, 0.5)[0]).toEqual({ x: 5, y: 5 });
  });

  it('maps video pixels to a cover-fitted screen', () => {
    const map = coverMap(1000, 500, 200, 200); // scaled by 0.4, cropped 100px each side
    expect(map({ x: 500, y: 250 })).toEqual({ x: 100, y: 100 });
    expect(map({ x: 0, y: 0 })).toEqual({ x: -100, y: 0 });
  });

  it('names documents by date and time', () => {
    expect(scanDocName(new Date(2026, 10, 5, 9, 4))).toBe('Scan 05-11-2026 09.04.pdf');
    expect(scanDocName(new Date(2026, 0, 1, 23, 59), 'docx')).toBe('Scan 01-01-2026 23.59.docx');
  });

  it('turns OCR text into paragraphs', () => {
    expect(textToParagraphs('Line one\nline two\n\n  Next para \n\n\n')).toEqual(['Line one line two', 'Next para']);
  });
});
