interface SWContainer {
  register(url: string): Promise<unknown>;
}

/** Registers the offline service worker on the web build. The Android app already ships every file. */
export function registerServiceWorker(isProd: boolean, native: boolean, container: SWContainer | undefined): boolean {
  if (!isProd || native || !container) return false;
  container.register('./sw.js').catch(() => {
    // Offline support is best-effort; the app works without it.
  });
  return true;
}
