/**
 * On-device Library: metadata and pure view logic. File bytes live in IndexedDB
 * (src/platform/libraryStore.ts) and are never uploaded.
 */
export interface LibraryItem {
  id: string;
  name: string;
  size: number;
  mime: string;
  /** Folder id, or null for the top level. */
  folder: string | null;
  favorite: boolean;
  addedAt: number;
  openedAt: number;
  /** Tool that produced it, or 'import'. */
  source: string;
}

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
}

export type LibraryView = { kind: 'all' } | { kind: 'recent' } | { kind: 'favorites' } | { kind: 'folder'; id: string };

export const RECENT_LIMIT = 20;
export const MAX_FOLDER_NAME = 40;

/** Search is case-insensitive, ignores extra spaces, and every word must appear in the name. */
export function matchesQuery(name: string, query: string): boolean {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const hay = name.toLocaleLowerCase();
  return words.every((w) => hay.includes(w));
}

export function viewItems(items: LibraryItem[], view: LibraryView, query = ''): LibraryItem[] {
  let out = items.filter((i) => matchesQuery(i.name, query));
  switch (view.kind) {
    case 'recent':
      return out.sort((a, b) => b.openedAt - a.openedAt).slice(0, RECENT_LIMIT);
    case 'favorites':
      out = out.filter((i) => i.favorite);
      break;
    case 'folder':
      out = out.filter((i) => i.folder === view.id);
      break;
  }
  return out.sort((a, b) => b.addedAt - a.addedAt);
}

export type FolderNameProblem = 'empty' | 'long' | 'taken';

export function checkFolderName(name: string, folders: Folder[], ignoreId?: string): FolderNameProblem | null {
  const n = name.trim();
  if (!n) return 'empty';
  if ([...n].length > MAX_FOLDER_NAME) return 'long';
  if (folders.some((f) => f.id !== ignoreId && f.name.toLocaleLowerCase() === n.toLocaleLowerCase())) return 'taken';
  return null;
}

export const newId = (now = Date.now()) => `${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Items whose folder was deleted go back to the top level; they are never deleted with it. */
export function releaseFolder(items: LibraryItem[], folderId: string): LibraryItem[] {
  return items.filter((i) => i.folder === folderId).map((i) => ({ ...i, folder: null }));
}

/** A name that does not clash with existing items, e.g. "scan (2).pdf". */
export function uniqueName(name: string, items: LibraryItem[]): string {
  const taken = new Set(items.map((i) => i.name.toLocaleLowerCase()));
  if (!taken.has(name.toLocaleLowerCase())) return name;
  const m = /^(.*?)(\.[^.]*)?$/.exec(name)!;
  for (let n = 2; ; n++) {
    const candidate = `${m[1]} (${n})${m[2] ?? ''}`;
    if (!taken.has(candidate.toLocaleLowerCase())) return candidate;
  }
}
