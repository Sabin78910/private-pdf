// Browser smoke test: runs real tools in Chromium against the production build and checks
// that no request leaves the app's own origin. Usage: npm run build && node e2e/smoke.mjs
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const { chromium } = createRequire(import.meta.url)('playwright'); // uses the globally installed Playwright
const PORT = 4179;
const server = spawn('node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((r) => server.stdout.on('data', (d) => /Local/.test(d) && r()));
const origin = `http://localhost:${PORT}`;
const dir = mkdtempSync(join(tmpdir(), 'pdfapp-'));

async function makePdf(n, label) {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < n; i++) d.addPage([300, 400]).drawText(`${label} ${i + 1}`, { x: 30, y: 200, size: 28, font: f });
  const p = join(dir, `${label}.pdf`);
  writeFileSync(p, await d.save());
  return p;
}

const failures = [];
const check = (ok, msg) => (ok ? console.log('  ok', msg) : (failures.push(msg), console.log('  FAIL', msg)));

const browser = await chromium.launch();
const page = await browser.newPage({ acceptDownloads: true });
const foreign = [];
page.on('request', (r) => !r.url().startsWith(origin) && !r.url().startsWith('blob:') && !r.url().startsWith('data:') && foreign.push(r.url()));
page.on('pageerror', (e) => failures.push(`pageerror: ${e.message}`));

async function download(trigger) {
  const [d] = await Promise.all([page.waitForEvent('download'), trigger()]);
  return readFileSync(await d.path());
}

try {
  await page.goto(`${origin}/#/merge`);
  await page.setInputFiles('input[type=file]', [await makePdf(2, 'A'), await makePdf(3, 'B')]);
  await page.click('#run');
  const merged = await download(() => page.click('.act-save >> nth=0'));
  check((await PDFDocument.load(merged)).getPageCount() === 5, 'merge 2+3 pages = 5');

  await page.goto(`${origin}/#/split`);
  await page.setInputFiles('input[type=file]', await makePdf(6, 'S'));
  await page.fill('#range', '2-3, 6');
  await page.click('#run');
  const split = await download(() => page.click('.act-save >> nth=0'));
  check((await PDFDocument.load(split)).getPageCount() === 3, 'split extract 2-3,6 = 3 pages');

  await page.goto(`${origin}/#/compress`);
  await page.setInputFiles('input[type=file]', await makePdf(3, 'C'));
  await page.waitForSelector('.cmp img', { timeout: 20_000 });
  check(await page.locator('.cmp-range').isVisible(), 'compress shows a before/after preview');
  await page.click('#run');
  await page.waitForSelector('.card.ok');
  const compressed = await download(() => page.click('.act-save >> nth=0'));
  check((await PDFDocument.load(compressed)).getPageCount() === 3, 'compress medium keeps 3 pages');

  await page.goto(`${origin}/#/organize`);
  await page.setInputFiles('input[type=file]', await makePdf(3, 'O'));
  await page.waitForSelector('.page');
  await page.locator('.page').nth(0).getByLabel('Delete').click();
  await page.locator('.page').nth(0).getByLabel('Rotate right').click();
  await page.click('#run');
  const organized = await PDFDocument.load(await download(() => page.click('.act-save >> nth=0')));
  check(organized.getPageCount() === 2 && organized.getPage(0).getRotation().angle === 90, 'organize delete + rotate');

  await page.goto(`${origin}/#/toimage`);
  await page.setInputFiles('input[type=file]', await makePdf(1, 'I'));
  await page.click('#run');
  const png = await download(() => page.click('.act-save >> nth=0'));
  check(png[0] === 0xff && png[1] === 0xd8, 'pdf to image gives a JPEG');

  await page.goto(`${origin}/#/numbers`);
  await page.setInputFiles('input[type=file]', await makePdf(3, 'N'));
  await page.waitForSelector('#startAt');
  await page.click('#run');
  const numbered = await PDFDocument.load(await download(() => page.click('.act-save >> nth=0')));
  check(numbered.getPageCount() === 3, 'page numbers keeps 3 pages');

  await page.goto(`${origin}/#/watermark`);
  await page.setInputFiles('input[type=file]', await makePdf(2, 'W'));
  await page.waitForSelector('#wmText');
  await page.fill('#wmText', 'COPY');
  await page.click('#run');
  const marked = await PDFDocument.load(await download(() => page.click('.act-save >> nth=0')));
  check(marked.getPageCount() === 2, 'watermark keeps 2 pages');

  // OCR: draw English text into an image in the page, then OCR it offline.
  const imgPath = join(dir, 'text.png');
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 900;
    c.height = 200;
    const x = c.getContext('2d');
    x.fillStyle = '#fff';
    x.fillRect(0, 0, 900, 200);
    x.fillStyle = '#000';
    x.font = '56px sans-serif';
    x.fillText('Private PDF works offline', 30, 120);
    return c.toDataURL('image/png').split(',')[1];
  });
  writeFileSync(imgPath, Buffer.from(b64, 'base64'));
  await page.goto(`${origin}/#/ocr`);
  await page.setInputFiles('input[type=file] >> nth=0', imgPath);
  await page.check('input[type=radio][value=pdf]', { force: true });
  await page.click('#run');
  await page.waitForSelector('.card.ok, .card.err', { timeout: 120_000 });
  const text = await page.inputValue('.ocr-text').catch(() => '');
  check(/offline/i.test(text), `OCR reads text (got: ${JSON.stringify(text.trim().slice(0, 60))})`);
  const searchable = await download(() => page.click('.act-save >> nth=0'));
  check((await PDFDocument.load(searchable)).getPageCount() === 1, 'OCR searchable PDF has 1 page');

  // Nepali OCR (needs a Devanagari font to draw the test image: NEPALI_FONT=/path/to/font.woff2).
  if (process.env.NEPALI_FONT) {
    const fontB64 = readFileSync(process.env.NEPALI_FONT).toString('base64');
    const neB64 = await page.evaluate(async (fb) => {
      const bytes = Uint8Array.from(atob(fb), (ch) => ch.charCodeAt(0));
      const face = new FontFace('TestDeva', bytes);
      await face.load();
      document.fonts.add(face);
      const c = document.createElement('canvas');
      c.width = 1000;
      c.height = 220;
      const x = c.getContext('2d');
      x.fillStyle = '#fff';
      x.fillRect(0, 0, 1000, 220);
      x.fillStyle = '#000';
      x.font = '64px TestDeva';
      x.fillText('नेपाल सरकार काठमाडौं', 30, 130);
      return c.toDataURL('image/png').split(',')[1];
    }, fontB64);
    const nePath = join(dir, 'nepali.png');
    writeFileSync(nePath, Buffer.from(neB64, 'base64'));
    await page.goto(`${origin}/#/ocr`);
    await page.setInputFiles('input[type=file] >> nth=0', nePath);
    await page.check('input[type=radio][value=text]', { force: true });
    await page.click('#run');
    await page.waitForSelector('.card.ok, .card.err', { timeout: 120_000 });
    const ne = await page.inputValue('.ocr-text').catch(() => '');
    check(/नेपाल/.test(ne) && /सरकार/.test(ne), `Nepali OCR (got: ${JSON.stringify(ne.trim())})`);
  }

  // Scanner: a tilted bright page on a dark table becomes a 1-page PDF.
  const scanB64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 800;
    c.height = 1000;
    const x = c.getContext('2d');
    x.fillStyle = '#3a3a3a';
    x.fillRect(0, 0, 800, 1000);
    x.fillStyle = '#f2f2f2';
    x.beginPath();
    x.moveTo(120, 90); x.lineTo(700, 140); x.lineTo(660, 920); x.lineTo(90, 860);
    x.fill();
    x.fillStyle = '#111';
    x.font = '40px sans-serif';
    x.fillText('Scanned page', 200, 450);
    return c.toDataURL('image/jpeg', 0.9).split(',')[1];
  });
  const scanPath = join(dir, 'photo.jpg');
  writeFileSync(scanPath, Buffer.from(scanB64, 'base64'));
  await page.goto(`${origin}/#/scan`);
  await page.setInputFiles('input[type=file] >> nth=0', [scanPath, scanPath]);
  await page.waitForSelector('canvas.editor');
  await page.click('#run');
  const scanned = await PDFDocument.load(await download(() => page.click('.act-save >> nth=0')));
  check(scanned.getPageCount() === 2, 'scanner makes a 2-page PDF from 2 photos');

  // Fill & Sign: fill a form field and stamp text by clicking the page.
  const formDoc = await PDFDocument.create();
  const fp = formDoc.addPage([400, 500]);
  formDoc.getForm().createTextField('full_name').addToPage(fp, { x: 50, y: 400, width: 200, height: 24 });
  const formPath = join(dir, 'form.pdf');
  writeFileSync(formPath, await formDoc.save());
  await page.goto(`${origin}/#/sign`);
  await page.setInputFiles('input[type=file]', formPath);
  await page.fill('#f-full_name', 'Sita Sharma');
  await page.fill('input[placeholder="Add text"]', '2026-11-03');
  await page.click('button:has-text("Add text")');
  await page.waitForSelector('canvas.pdfpage');
  await page.click('canvas.pdfpage', { position: { x: 100, y: 300 } });
  await page.click('#run');
  const signed = await PDFDocument.load(await download(() => page.click('.act-save >> nth=0')));
  check(signed.getForm().getTextField('full_name').getText() === 'Sita Sharma', 'fill & sign fills the field');

  await page.goto(`${origin}/#/protect`);
  await page.setInputFiles('input[type=file]', await makePdf(2, 'P'));
  await page.waitForSelector('#pw');
  await page.fill('#pw', 'secret-123');
  await page.fill('#pw2', 'secret-123');
  await page.click('#run');
  const locked = await download(() => page.click('.act-save >> nth=0'));
  const lockedDoc = await PDFDocument.load(locked, { ignoreEncryption: true });
  check(lockedDoc.isEncrypted && /\/AESV3/.test(Buffer.from(locked).toString('latin1')), 'protect encrypts with AES-256');

  // Reader: drag a highlight and add a note, then save a copy with real annotations.
  await page.goto(`${origin}/#/reader`);
  await page.setInputFiles('input[type=file]', await makePdf(1, 'R'));
  await page.waitForSelector('.rcanvas');
  await page.click('.chipbtn >> text=Highlight');
  await page.locator('.rpage').first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
  let rb = await page.locator('.rpage').first().boundingBox();
  const cy = Math.min(rb.y + rb.height / 2, 600);
  await page.mouse.move(rb.x + 20, cy);
  await page.mouse.down();
  await page.mouse.move(rb.x + 200, cy + 30, { steps: 4 });
  await page.mouse.up();
  await page.click('.chipbtn >> text=Note');
  rb = await page.locator('.rpage').first().boundingBox();
  await page.mouse.click(rb.x + 40, cy + 80);
  await page.fill('#noteText', 'Check this');
  await page.click('text=Add note');
  await page.click('text=Save annotated copy');
  const annotated = await PDFDocument.load(await download(() => page.click('.act-save >> nth=0')));
  check(annotated.getPage(0).node.Annots()?.size() === 2, 'reader saves a highlight and a note');

  // Library: keep a result, find it by search, file it in a new folder, favorite it.
  await page.goto(`${origin}/#/split`);
  await page.setInputFiles('input[type=file]', await makePdf(2, 'Keepme'));
  await page.fill('#range', '1');
  await page.click('#run');
  await page.click('text=Keep in Library');
  await page.waitForSelector('text=Kept in Library');
  await page.goto(`${origin}/#/library`);
  await page.waitForSelector('.lib-item');
  await page.fill('#libSearch', 'keepme');
  check((await page.locator('.lib-item').count()) === 1, 'library finds the kept file by search');
  await page.click('text=New folder');
  await page.fill('#folderName', 'Bills');
  await page.click('form.namer >> text=Save');
  await page.waitForSelector('.chipbtn.on >> text=Bills');
  await page.click('.chipbtn >> text=All');
  await page.click('.lib-item .more');
  await page.selectOption('.sheet .move-select', { label: 'Bills' });
  await page.waitForSelector('.sheet', { state: 'detached' });
  await page.locator('.lib-item .star').click();
  await page.click('.chipbtn >> text=Favorites');
  await page.waitForSelector('.lib-item');
  check((await page.locator('.lib-item').count()) === 1, 'library favorites and folders work');

  await page.goto(`${origin}/#/history`);
  check((await page.locator('.chip').count()) >= 6, 'history lists jobs');

  if (await page.locator('a[href="#/account"]').count()) {
    await page.goto(`${origin}/#/account`);
    check(await page.getByText('Signing in is optional').isVisible(), 'sign-in page explains it is optional');
  }

  check(foreign.length === 0, `no requests outside the app (${foreign.join(', ') || 'none'})`);
} catch (e) {
  failures.push(String(e));
  await page.screenshot({ path: join(dir, 'fail.png') });
  console.log('screenshot', join(dir, 'fail.png'));
} finally {
  await browser.close();
  server.kill();
}
console.log(failures.length ? `\n${failures.length} failure(s):\n${failures.join('\n')}` : '\nAll browser checks passed');
process.exit(failures.length ? 1 : 0);
