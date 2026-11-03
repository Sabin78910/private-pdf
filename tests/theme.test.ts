import { describe, expect, it } from 'vitest';
import { otherTheme, resolveTheme, TOOL_GROUPS } from '../src/core/theme';
import { allKeys } from '../src/i18n';

describe('theme', () => {
  it('defaults to dark and keeps an explicit light choice', () => {
    expect(resolveTheme(null)).toBe('dark');
    expect(resolveTheme('nonsense')).toBe('dark');
    expect(resolveTheme('dark')).toBe('dark');
    expect(resolveTheme('light')).toBe('light');
    expect(otherTheme('dark')).toBe('light');
    expect(otherTheme('light')).toBe('dark');
  });

  it('lists every tool once, and every group has a label in both languages', () => {
    const ids = TOOL_GROUPS.flatMap((g) => g.tools);
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of TOOL_GROUPS) {
      const key = `group.${g.id}` as keyof typeof allKeys.en;
      expect(allKeys.en[key]).toBeTruthy();
      expect(allKeys.ne[key]).toBeTruthy();
      for (const id of g.tools) expect(allKeys.en[`tool.${id}` as keyof typeof allKeys.en]).toBeTruthy();
    }
  });
});

describe('home helpers', async () => {
  const { greeting, matchTool, QUICK_TOOLS, toolHue } = await import('../src/core/theme');
  it('greets by time of day', () => {
    expect(greeting(3)).toBe('evening');
    expect(greeting(4)).toBe('morning');
    expect(greeting(11)).toBe('morning');
    expect(greeting(12)).toBe('afternoon');
    expect(greeting(17)).toBe('evening');
  });
  it('gives each group its own hue and the reader sky', () => {
    expect(toolHue('scan')).toBe('teal');
    expect(toolHue('merge')).toBe('indigo');
    expect(toolHue('compress')).toBe('amber');
    expect(toolHue('protect')).toBe('rose');
    expect(toolHue('reader')).toBe('sky');
  });
  it('matches tools in either language and lists eight quick tools that exist', () => {
    expect(matchTool(['Compress PDF', 'PDF सानो बनाउनुहोस्'], 'compress')).toBe(true);
    expect(matchTool(['Compress PDF', 'PDF सानो बनाउनुहोस्'], 'सानो')).toBe(true);
    expect(matchTool(['Compress PDF'], '')).toBe(false);
    expect(QUICK_TOOLS).toHaveLength(8);
    const all = TOOL_GROUPS.flatMap((g) => g.tools);
    for (const id of QUICK_TOOLS) expect(all).toContain(id);
  });
});
