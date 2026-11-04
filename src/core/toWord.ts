import { strToU8, zipSync } from 'fflate';
import { PdfError } from './errors';

/** One run of text from pdf.js, in page space (y grows upwards). */
export interface TextItem {
  str: string;
  x: number;
  y: number;
  /** Font height in points. */
  h: number;
}

/**
 * Turns positioned text into paragraphs: items on the same baseline join into a line, and a gap
 * larger than ~1.6 line heights starts a new paragraph. Reading order is top to bottom, left to right.
 */
export function toParagraphs(items: TextItem[]): string[] {
  const live = items.filter((i) => i.str.trim());
  if (!live.length) return [];
  const sorted = [...live].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { y: number; h: number; text: string }[] = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - it.y) <= Math.max(2, it.h * 0.4)) {
      last.text += (/\s$/.test(last.text) || /^\s/.test(it.str) ? '' : ' ') + it.str;
    } else lines.push({ y: it.y, h: it.h || 10, text: it.str });
  }
  const paras: string[] = [];
  let cur = '';
  lines.forEach((l, i) => {
    const gap = i ? lines[i - 1].y - l.y : 0;
    if (i && gap > Math.max(l.h, lines[i - 1].h) * 1.6) (paras.push(cur), (cur = ''));
    cur = cur ? `${cur} ${l.text.trim()}` : l.text.trim();
  });
  if (cur) paras.push(cur);
  return paras.map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

export const xmlEscape = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
    // Characters XML 1.0 forbids would make Word refuse the file.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '');

const CT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

/** A minimal, valid .docx: one paragraph per entry, a page break between PDF pages. */
export function buildDocx(pages: string[][]): Uint8Array {
  if (!pages.some((p) => p.length)) throw new PdfError('no-text');
  const para = (s: string) => `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(s)}</w:t></w:r></w:p>`;
  const brk = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  const body = pages.map((p) => p.map(para).join('')).join(brk);
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  return zipSync({ '[Content_Types].xml': strToU8(CT), '_rels/.rels': strToU8(RELS), 'word/document.xml': strToU8(doc) }, { level: 6 });
}
