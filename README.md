# Private PDF

Privacy-first PDF tools for **Android (Google Play)** and **Web** from one codebase. Every tool runs on
the device: nothing is uploaded, OCR (Nepali + English) works offline. Scope lives in
[MASTER_PROMPT.md](MASTER_PROMPT.md); per-feature behaviour in [docs/FEATURES.md](docs/FEATURES.md).

## Tools (v1.0)

Merge · Split / Extract · Compress · Scan / Image to PDF · OCR (Nepali + English, searchable PDF) ·
Organize pages · Fill & Sign · PDF to Image · History · Privacy policy

## Stack

- Vite + TypeScript, no UI framework (small, fast on low-end phones)
- [pdf-lib](https://pdf-lib.js.org) for PDF editing, run in a Web Worker
- [pdf.js](https://mozilla.github.io/pdf.js/) for rendering
- [tesseract.js](https://tesseract.projectnaptha.com) with bundled `nep` + `eng` models (no CDN)
- Scanner maths (edge detection, perspective correction, adaptive threshold) in `src/core/scan.ts`
- [Capacitor](https://capacitorjs.com) wraps the same web build as the Android app

```
src/core/      pure logic, no DOM: merge, split, organize, compress, images, fill & sign, scan, history
src/platform/  browser/Android glue: pdf.js rendering, OCR worker, save/share, background jobs
src/tools/     one screen per tool
src/i18n.ts    English + Nepali strings
tests/         unit tests (Vitest)
e2e/smoke.mjs  real-browser test of every tool + "no request leaves the app" check
android/       Capacitor Android project
```

## Commands

```bash
npm install          # also copies the OCR engine and language data into public/ocr
npm run dev          # local dev server
npm test             # unit tests
npm run build        # production web build in dist/
node e2e/smoke.mjs   # browser smoke test against the build (needs Playwright)
npm run android:sync # build web and copy into the Android project
```

CI (GitHub Actions) runs typecheck, unit tests, the browser smoke test, and builds a debug APK you can
download from the workflow run, so no local Android setup is needed.

## Deploying the web app

`dist/` is static. Any static host works (GitHub Pages, Cloudflare Pages, Netlify). Keep the CSP in
`index.html`; it is what guarantees documents cannot be sent anywhere.

## Releasing to Google Play

Signing keys are never committed. Create an upload keystore, store it as a CI secret, and add a
release job that runs `./gradlew bundleRelease`. See docs/FEATURES.md for the pre-release device test plan.
