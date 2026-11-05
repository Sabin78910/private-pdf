// Startup budget: gzipped JS and CSS that index.html loads before first paint.
// Lazy chunks (tools, engines, workers) do not count. Usage: node scripts/check-budget.mjs <maxKB>
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const max = Number(process.argv[2] ?? 60);
const html = readFileSync('dist/index.html', 'utf8');
const refs = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="\/?([^"]+\.(?:js|css))"/g)].map((m) => m[1].replace(/^.*?assets\//, 'assets/'));
let total = 0;
for (const f of new Set(refs)) {
  const kb = gzipSync(readFileSync(`dist/${f}`)).length / 1024;
  total += kb;
  console.log(`${kb.toFixed(1).padStart(7)} KB  ${f}`);
}
for (const m of html.matchAll(/<style>([\s\S]*?)<\/style>/g)) {
  const kb = gzipSync(m[1]).length / 1024;
  total += kb;
  console.log(`${kb.toFixed(1).padStart(7)} KB  inline <style>`);
}
console.log(`${total.toFixed(1).padStart(7)} KB  startup total (budget ${max} KB)`);
if (total > max) {
  console.error(`Startup budget exceeded by ${(total - max).toFixed(1)} KB. Lazy-load the new code or raise the budget on purpose.`);
  process.exit(1);
}
