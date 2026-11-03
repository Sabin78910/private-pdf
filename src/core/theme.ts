export type Theme = 'dark' | 'light';

/** The app opens in dark mode unless the user has picked light. Unknown stored values fall back to dark. */
export function resolveTheme(stored: string | null | undefined): Theme {
  return stored === 'light' ? 'light' : 'dark';
}

export const otherTheme = (t: Theme): Theme => (t === 'dark' ? 'light' : 'dark');

/** Tool groups for the home screen, in display order. Every tool id appears exactly once. */
export const TOOL_GROUPS: { id: string; tools: string[] }[] = [
  { id: 'scanocr', tools: ['scan', 'ocr'] },
  { id: 'edit', tools: ['reader', 'merge', 'split', 'organize', 'numbers', 'watermark'] },
  { id: 'optimize', tools: ['compress', 'toimage'] },
  { id: 'secure', tools: ['sign', 'protect'] },
];
