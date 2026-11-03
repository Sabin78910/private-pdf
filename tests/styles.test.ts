import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// An unclosed block makes the browser fold every later rule into it, so most styling silently
// never applies. These checks catch that before it ships.
const css = readFileSync(resolve(__dirname, '../src/style.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""');

/** Selectors of the rules that sit at the top level of the sheet (not nested in another block). */
function topLevelSelectors(src: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '{') {
      if (depth === 0) out.push(src.slice(start, i).trim());
      depth++;
    } else if (src[i] === '}') {
      depth--;
      if (depth < 0) throw new Error(`stray } at offset ${i}`);
      if (depth === 0) start = i + 1;
    } else if (src[i] === ';' && depth === 0) start = i + 1;
  }
  if (depth !== 0) throw new Error(`${depth} block(s) left open at end of file`);
  return out;
}

describe('style.css', () => {
  it('has balanced braces', () => {
    expect(() => topLevelSelectors(css)).not.toThrow();
  });

  it('keeps the core components as top-level rules', () => {
    const tops = topLevelSelectors(css);
    const has = (sel: string) => tops.some((s) => s.split(',').map((x) => x.trim()).includes(sel));
    for (const sel of [':root', 'body', '.appbar', '.tabbar', '.largetitle', '.btn', '.btn.run', '.drop', '.optgroup', '.result', '.sheet', '.toast', '.lib-item', '.rpage'])
      expect(has(sel), sel).toBe(true);
  });

  it('defines a light theme override on :root', () => {
    expect(topLevelSelectors(css).some((s) => s.startsWith(':root[data-theme='))).toBe(true);
  });
});
