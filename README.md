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

`.github/workflows/release.yml` builds the Play bundle (`private-pdf-aab` artifact) on every push to
`main`, on `v*` tags, or on demand. The version code is the run number, so each upload is higher.

The bundle is signed only when these repository secrets exist (same upload key setup as the other apps;
keys are never committed): `KEYSTORE_BASE64` (base64 of the `.jks`), `KEYSTORE_PASSWORD`, `KEY_ALIAS`,
`KEY_PASSWORD`. Without them the bundle is unsigned.

Store listing (English + Nepali), Data safety answers, icon, feature graphic and 1080×1920 screenshots
are in `store/`, with the same text for fastlane in `fastlane/metadata/android/`. See docs/FEATURES.md
for the pre-release device test plan.

## Optional Google sign-in

Sign-in is optional and hidden until a client ID is set. Tools never need it and documents are never
uploaded. To switch it on:

1. In [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials), create an
   **OAuth client ID** of type **Web application**. Add your web URL (e.g. `https://your-site.example`) under
   *Authorized JavaScript origins*.
2. For Android, also create an **Android** OAuth client ID with package `app.privatepdf.mobile` and the
   SHA-1 of your signing key (debug and Play App Signing keys each need one).
3. Put the **Web** client ID in the GitHub repository variable `GOOGLE_CLIENT_ID`
   (Settings → Secrets and variables → Actions → Variables). Locally: `VITE_GOOGLE_CLIENT_ID=... npm run build`.

The client ID is public (it ships in the page), so it is a variable, not a secret.
