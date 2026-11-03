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
