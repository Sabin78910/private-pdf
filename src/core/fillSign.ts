import {
  PDFCheckBox,
  PDFDropdown,
  PDFRadioGroup,
  PDFTextField,
  StandardFonts,
  rgb,
} from 'pdf-lib';
import { PdfError } from './errors';
import { loadPdf } from './load';

export type FieldKind = 'text' | 'checkbox' | 'dropdown' | 'radio';
export interface FormFieldInfo {
  name: string;
  kind: FieldKind;
  value: string | boolean;
  options: string[];
}

/** A placement in PDF points, origin at the bottom-left of the page. */
export interface Box {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}
export type Stamp =
  | (Box & { kind: 'image'; png: Uint8Array })
  | { kind: 'text'; page: number; x: number; y: number; size: number; text: string };

export interface FillSignInput {
  fields?: Record<string, string | boolean>;
  stamps?: Stamp[];
  /** Flatten form fields so values cannot be edited later. */
  flatten?: boolean;
}

/** Helvetica (WinAnsi) can only draw Latin-1-ish text; Nepali must be stamped as an image. */
export function isWinAnsi(text: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /^[\x20-\x7e\xa0-\xff\n\r\t]*$/.test(text);
}

export async function listFormFields(bytes: Uint8Array): Promise<FormFieldInfo[]> {
  const doc = await loadPdf(bytes);
  return doc.getForm().getFields().flatMap((f): FormFieldInfo[] => {
    const name = f.getName();
    if (f instanceof PDFTextField) return [{ name, kind: 'text', value: f.getText() ?? '', options: [] }];
    if (f instanceof PDFCheckBox) return [{ name, kind: 'checkbox', value: f.isChecked(), options: [] }];
    if (f instanceof PDFDropdown)
      return [{ name, kind: 'dropdown', value: f.getSelected()[0] ?? '', options: f.getOptions() }];
    if (f instanceof PDFRadioGroup)
      return [{ name, kind: 'radio', value: f.getSelected() ?? '', options: f.getOptions() }];
    return [];
  });
}

export async function fillAndSign(bytes: Uint8Array, input: FillSignInput): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  const form = doc.getForm();
  for (const [name, value] of Object.entries(input.fields ?? {})) {
    const f = form.getFieldMaybe(name);
    if (!f) continue;
    if (f instanceof PDFTextField) {
      const text = String(value);
      if (!isWinAnsi(text)) throw new PdfError('font-unsupported', name);
      f.setText(text);
    } else if (f instanceof PDFCheckBox) {
      if (value === true || value === 'true') f.check();
      else f.uncheck();
    } else if (f instanceof PDFDropdown || f instanceof PDFRadioGroup) {
      if (value) f.select(String(value));
    }
  }
  const pageCount = doc.getPageCount();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  for (const s of input.stamps ?? []) {
    if (s.page < 0 || s.page >= pageCount) throw new PdfError('invalid-range', `page ${s.page + 1}`);
    const page = doc.getPage(s.page);
    if (s.kind === 'image') {
      const img = await doc.embedPng(s.png);
      page.drawImage(img, { x: s.x, y: s.y, width: s.width, height: s.height });
    } else {
      if (!isWinAnsi(s.text)) throw new PdfError('font-unsupported', 'text stamp');
      page.drawText(s.text, { x: s.x, y: s.y, size: s.size, font: helv, color: rgb(0, 0, 0.35) });
    }
  }
  if (input.flatten) form.flatten();
  return doc.save({ useObjectStreams: true });
}
