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

export type Hue = 'teal' | 'indigo' | 'amber' | 'rose' | 'sky';
const GROUP_HUE: Record<string, Hue> = { scanocr: 'teal', edit: 'indigo', optimize: 'amber', secure: 'rose' };

/** Category colour of a tool's icon chip. The reader gets its own hue. */
export function toolHue(id: string): Hue {
  if (id === 'reader') return 'sky';
  const g = TOOL_GROUPS.find((x) => x.tools.includes(id));
  return g ? GROUP_HUE[g.id] : 'teal';
}

/** The eight tools on Home, most used first. Everything else is under Tools. */
export const QUICK_TOOLS = ['compress', 'merge', 'split', 'sign', 'ocr', 'protect', 'organize', 'toimage'];

export type Greeting = 'morning' | 'afternoon' | 'evening';
export function greeting(hour: number): Greeting {
  if (hour >= 4 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  return 'evening';
}

/** Case-insensitive match of every word against a tool's name (both languages are passed in). */
export function matchTool(names: string[], query: string): boolean {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const hay = names.join(' ').toLocaleLowerCase();
  return words.length > 0 && words.every((w) => hay.includes(w));
}

/** Progress for a job: percent and the 1-based step to show ("3 of 12"), clamped to the total. */
export function progressStep(done: number, total: number): { pct: number; n: number; total: number } | null {
  if (!(total > 0)) return null;
  const d = Math.min(Math.max(done, 0), total);
  return { pct: Math.round((d / total) * 100), n: Math.max(1, Math.min(total, Math.ceil(d) || 1)), total };
}
