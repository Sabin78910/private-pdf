/**
 * On-device "frecency" for Quick tools: tools you use often and recently move to the front.
 * Each use adds 1 to a tool's score, and scores halve every 14 days so old habits fade.
 * Only which tool screen was opened is counted, on this device. No document content, ever.
 */
export type Usage = Record<string, { score: number; at: number }>;

const HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000;
export const USAGE_KEY = 'pdfapp.toolUsage';

export function decayed(entry: { score: number; at: number }, now: number): number {
  const age = Math.max(0, now - entry.at);
  return entry.score * 0.5 ** (age / HALF_LIFE_MS);
}

export function recordUse(usage: Usage, id: string, now: number): Usage {
  const prev = usage[id];
  return { ...usage, [id]: { score: (prev ? decayed(prev, now) : 0) + 1, at: now } };
}

/** Defaults in their usual order, with any tool you actually use pulled forward. Same length as defaults. */
export function rankTools(defaults: readonly string[], usage: Usage, now: number, known: readonly string[] = defaults): string[] {
  const used = known
    .map((id) => ({ id, s: usage[id] ? decayed(usage[id], now) : 0 }))
    .filter((x) => x.s >= 0.5)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.id);
  const out = [...used, ...defaults.filter((id) => !used.includes(id))];
  return out.slice(0, defaults.length);
}

export function parseUsage(raw: string | null): Usage {
  if (!raw) return {};
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== 'object') return {};
    const out: Usage = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      const e = v as { score?: unknown; at?: unknown };
      if (typeof e?.score === 'number' && typeof e.at === 'number' && Number.isFinite(e.score) && Number.isFinite(e.at) && e.score > 0)
        out[k] = { score: e.score, at: e.at };
    }
    return out;
  } catch {
    return {};
  }
}
