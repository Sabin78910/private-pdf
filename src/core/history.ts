/**
 * Job history. Stores only metadata (tool, file names, sizes, time), never document content.
 * Android keeps it on the device (localStorage in the app's WebView); Web keeps it for the
 * browser session only (sessionStorage).
 */
export interface HistoryEntry {
  id: string;
  tool: string;
  inputs: string[];
  output: string;
  outputSize: number;
  at: number; // epoch ms
  ok: boolean;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const KEY = 'pdfapp.history.v1';
export const MAX_ENTRIES = 50;

export class History {
  constructor(private readonly store: KeyValueStore) {}

  list(): HistoryEntry[] {
    try {
      const raw = this.store.getItem(KEY);
      const parsed = raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  add(entry: Omit<HistoryEntry, 'id' | 'at'>, now = Date.now()): HistoryEntry {
    const full: HistoryEntry = { ...entry, id: `${now}-${Math.random().toString(36).slice(2, 8)}`, at: now };
    const next = [full, ...this.list()].slice(0, MAX_ENTRIES);
    try {
      this.store.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage full or blocked: history is a convenience, never fail the job for it */
    }
    return full;
  }

  clear(): void {
    try {
      this.store.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }
}

/** In-memory store used when browser storage is unavailable (private mode) and in tests. */
export class MemoryStore implements KeyValueStore {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Output name next to the original, so the original is never overwritten. */
export function outputName(input: string, suffix: string, ext = 'pdf'): string {
  const base = input.replace(/\.[^.]+$/, '') || 'document';
  return `${base}-${suffix}.${ext}`;
}
