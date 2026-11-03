import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { checkPassword, protectPdf } from '../src/core/protect';
import { loadPdf } from '../src/core/load';
import { makePdf } from './helpers';

async function openWith(bytes: Uint8Array, password?: string) {
  const doc = await getDocument({ data: bytes.slice(), password, isEvalSupported: false, useSystemFonts: false }).promise;
  const page = await doc.getPage(1);
  const text = (await page.getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join(' ');
  const pages = doc.numPages;
  await doc.destroy();
  return { pages, text };
}

describe('protect', () => {
  it('validates the password', () => {
    expect(checkPassword('abc', 'abc')).toBe('short');
    expect(checkPassword('abcd', 'abce')).toBe('mismatch');
    expect(checkPassword('पासवर्ड', 'पासवर्ड')).toBeNull();
  });

  it('encrypts with AES-256 so the right password opens it and no password does not', async () => {
    const out = await protectPdf(await makePdf(3, { form: true }), 'kathmandu-42');
    const raw = new TextDecoder('latin1').decode(out);
    expect(raw).toMatch(/\/V 5/);
    expect(raw).toMatch(/\/R 6/);
    expect(raw).toMatch(/\/CFM \/AESV3/);
    expect(raw).not.toContain('Page 1'); // content streams are no longer readable
    const opened = await openWith(out, 'kathmandu-42');
    expect(opened.pages).toBe(3);
    expect(opened.text).toContain('Page 1');
    await expect(openWith(out)).rejects.toMatchObject({ name: 'PasswordException' });
    await expect(openWith(out, 'wrong')).rejects.toMatchObject({ name: 'PasswordException' });
  });

  it('works with a Nepali password and leaves the input unchanged', async () => {
    const input = await makePdf(1);
    const copy = input.slice();
    const out = await protectPdf(input, 'नेपाल१२३');
    expect(input).toEqual(copy);
    expect((await openWith(out, 'नेपाल१२३')).pages).toBe(1);
    await expect(loadPdf(out)).rejects.toMatchObject({ code: 'encrypted' });
  });

  it('refuses a too-short password and an already protected PDF', async () => {
    await expect(protectPdf(await makePdf(1), 'ab')).rejects.toMatchObject({ code: 'invalid-password' });
    const once = await protectPdf(await makePdf(1), 'secret1');
    await expect(protectPdf(once, 'secret2')).rejects.toMatchObject({ code: 'encrypted' });
    expect(PDFDocument).toBeTruthy();
  });
});
