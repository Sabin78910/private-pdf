/**
 * Build-time helper: writes the list of built files into the service worker so the
 * whole app is cached on first visit and works offline straight away.
 */
export function precacheList(files: string[]): string[] {
  return files
    .filter((f) => !f.endsWith('.map') && f !== 'sw.js')
    .map((f) => './' + f.replace(/^\.?\//, ''))
    .sort();
}

/** Small stable hash so each build gets its own cache name and old caches are cleared. */
export function buildVersion(files: string[]): string {
  let h = 5381;
  for (const c of files.join('|')) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0;
  return h.toString(36);
}

export function injectPrecache(swSource: string, files: string[]): string {
  const list = precacheList(files);
  return swSource
    .replace('self.__PRECACHE__ || []', JSON.stringify(list))
    .replace('__BUILD__', buildVersion(list));
}
