import { PDFDocument, StandardFonts } from 'pdf-lib';

/** Makes a PDF whose page N has width 100+N so page identity survives copying. */
export async function makePdf(pages: number, opts: { form?: boolean } = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const p = doc.addPage([100 + i, 200]);
    p.drawText(`Page ${i + 1}`, { x: 10, y: 100, size: 12, font });
  }
  if (opts.form) {
    const form = doc.getForm();
    form.createTextField('name').addToPage(doc.getPage(0), { x: 5, y: 5, width: 80, height: 20 });
    form.createCheckBox('agree').addToPage(doc.getPage(0), { x: 5, y: 40, width: 15, height: 15 });
  }
  return doc.save();
}

export async function pageWidths(bytes: Uint8Array): Promise<number[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((p) => Math.round(p.getWidth()));
}

/** Smallest valid 1x1 PNG. */
export const PNG_1x1 = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII='),
  (c) => c.charCodeAt(0),
);
