export type PdfErrorCode =
  | 'encrypted'
  | 'corrupted'
  | 'empty'
  | 'invalid-range'
  | 'unsupported-image'
  | 'no-input'
  | 'cancelled'
  | 'font-unsupported';

/** Error with a stable code so the UI can show an actionable, localised message. */
export class PdfError extends Error {
  constructor(public readonly code: PdfErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'PdfError';
  }
}
