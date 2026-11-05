import type { Plugin } from "vite";

/**
 * Replaces the <link rel="stylesheet"> for a built CSS file with an inline <style>, so first paint does not
 * wait on a second request. Relative url()s are rewritten from the CSS file's folder to the page's.
 */
export function inlineCssInto(html: string, fileName: string, css: string): string {
  const dir = fileName.includes("/") ? fileName.slice(0, fileName.lastIndexOf("/") + 1) : "";
  const fixed = css.replace(/url\((["']?)\.\//g, `url($1./${dir}`);
  const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const link = new RegExp(`<link[^>]*rel="stylesheet"[^>]*href="[^"]*${escaped}"[^>]*>`);
  return link.test(html) ? html.replace(link, () => `<style>${fixed}</style>`) : html;
}

export function inlineCss(): Plugin {
  return {
    name: "inline-css",
    apply: "build",
    enforce: "post",
    generateBundle(_, bundle) {
      for (const page of Object.values(bundle)) {
        if (page.type !== "asset" || !page.fileName.endsWith(".html")) continue;
        let html = String(page.source);
        for (const file of Object.values(bundle)) {
          if (file.type === "asset" && file.fileName.endsWith(".css")) html = inlineCssInto(html, file.fileName, String(file.source));
        }
        page.source = html;
      }
    },
  };
}
