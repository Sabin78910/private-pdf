import { describe, expect, it } from 'vitest';
import { checkFolderName, matchesQuery, releaseFolder, RECENT_LIMIT, uniqueName, viewItems, type LibraryItem } from '../src/core/library';

const item = (id: string, over: Partial<LibraryItem> = {}): LibraryItem => ({
  id, name: `${id}.pdf`, size: 1, mime: 'application/pdf', folder: null, favorite: false, addedAt: 0, openedAt: 0, source: 'merge', ...over,
});

describe('library', () => {
  it('searches names by every word, ignoring case and spacing', () => {
    expect(matchesQuery('Citizenship Scan 2026.pdf', '  scan   citizen ')).toBe(true);
    expect(matchesQuery('Citizenship Scan.pdf', 'passport')).toBe(false);
    expect(matchesQuery('नागरिकता.pdf', 'नागरिकता')).toBe(true);
    expect(matchesQuery('anything', '')).toBe(true);
  });

  it('builds the All, Recent, Favorites and folder views', () => {
    const items = [
      item('a', { addedAt: 1, openedAt: 30, favorite: true }),
      item('b', { addedAt: 2, openedAt: 10, folder: 'f1' }),
      item('c', { addedAt: 3, openedAt: 20, folder: 'f1', favorite: true }),
    ];
    expect(viewItems(items, { kind: 'all' }).map((i) => i.id)).toEqual(['c', 'b', 'a']);
    expect(viewItems(items, { kind: 'recent' }).map((i) => i.id)).toEqual(['a', 'c', 'b']);
    expect(viewItems(items, { kind: 'favorites' }).map((i) => i.id)).toEqual(['c', 'a']);
    expect(viewItems(items, { kind: 'folder', id: 'f1' }).map((i) => i.id)).toEqual(['c', 'b']);
    expect(viewItems(items, { kind: 'folder', id: 'f1' }, 'b').map((i) => i.id)).toEqual(['b']);
    const many = Array.from({ length: 30 }, (_, i) => item(`x${i}`, { openedAt: i }));
    expect(viewItems(many, { kind: 'recent' })).toHaveLength(RECENT_LIMIT);
  });

  it('validates folder names', () => {
    const folders = [{ id: 'f1', name: 'Bills', createdAt: 0 }];
    expect(checkFolderName('  ', folders)).toBe('empty');
    expect(checkFolderName('x'.repeat(41), folders)).toBe('long');
    expect(checkFolderName('bills', folders)).toBe('taken');
    expect(checkFolderName('Bills', folders, 'f1')).toBeNull(); // renaming itself
    expect(checkFolderName('कागजात', folders)).toBeNull();
  });

  it('moves files out of a deleted folder instead of deleting them', () => {
    const items = [item('a', { folder: 'f1' }), item('b')];
    expect(releaseFolder(items, 'f1')).toEqual([{ ...items[0], folder: null }]);
  });

  it('makes clashing names unique', () => {
    const items = [item('scan'), item('x', { name: 'scan (2).pdf' })];
    expect(uniqueName('new.pdf', items)).toBe('new.pdf');
    expect(uniqueName('SCAN.pdf', items)).toBe('SCAN (3).pdf');
    expect(uniqueName('notes', [item('y', { name: 'notes' })])).toBe('notes (2)');
  });
});
