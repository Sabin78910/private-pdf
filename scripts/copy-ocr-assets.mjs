// Copies the OCR engine and Nepali + English language data into public/ocr so
// OCR runs fully offline. Nothing is fetched from a CDN at runtime.
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
const out = join(root, 'public', 'ocr');
mkdirSync(join(out, 'core'), { recursive: true });
mkdirSync(join(out, 'lang'), { recursive: true });

cpSync(join(nm, 'tesseract.js/dist/worker.min.js'), join(out, 'worker.min.js'));
for (const f of [
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js',
]) {
  const src = join(nm, 'tesseract.js-core', f);
  if (existsSync(src)) cpSync(src, join(out, 'core', f));
}
for (const lang of ['eng', 'nep']) {
  cpSync(
    join(nm, '@tesseract.js-data', lang, '4.0.0_best_int', `${lang}.traineddata.gz`),
    join(out, 'lang', `${lang}.traineddata.gz`),
  );
}
console.log('OCR assets copied to public/ocr');
