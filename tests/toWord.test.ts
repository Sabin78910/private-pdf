import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { buildDocx, toParagraphs, xmlEscape } from '../src/core/toWord';

describe('PDF to Word', () => {
  it('joins items on a line and splits paragraphs at big gaps', () => {
    const paras = toParagraphs([
      { str: 'world', x: 60, y: 700, h: 12 },
      { str: 'Hello', x: 10, y: 700.5, h: 12 },
      { str: 'second line', x: 10, y: 686, h: 12 },
      { str: 'New para', x: 10, y: 640, h: 12 },
      { str: '  ', x: 10, y: 600, h: 12 },
    ]);
    expect(paras).toEqual(['Hello world second line', 'New para']);
  });

  it('escapes XML and drops characters Word rejects', () => {
    expect(xmlEscape('a<b & "c"\u0001')).toBe('a&lt;b &amp; &quot;c&quot;');
  });

  it('builds a docx with a page break between pages', () => {
    const zip = unzipSync(buildDocx([['नमस्ते', 'A & B'], ['Page two']]));
    expect(Object.keys(zip).sort()).toEqual(['[Content_Types].xml', '_rels/.rels', 'word/document.xml']);
    const xml = strFromU8(zip['word/document.xml']);
    expect(xml).toContain('नमस्ते');
    expect(xml).toContain('A &amp; B');
    expect(xml.match(/w:type="page"/g)).toHaveLength(1);
  });

  it('refuses a PDF with no text (a scan needs OCR first)', () => {
    expect(() => buildDocx([[], []])).toThrow(expect.objectContaining({ code: 'no-text' }));
  });
});
