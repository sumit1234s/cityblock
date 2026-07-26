/**
 * Dev helper: loads the scene in headless Chrome (SwiftShader), reports console
 * errors, and screenshots every era. Not part of the app.
 *
 *   node tools/shoot.mjs [outdir] [eraIndexList]
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const OUT = process.argv[2] || '/tmp/shots';
const ERAS = (process.argv[3] || '0,1,2,3,4,5').split(',').map(Number);
mkdirSync(OUT, { recursive: true });

// ---- serve the app from this process so it can't be reaped -----------------
const ROOT = new URL('..', import.meta.url).pathname;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
};
const server = createServer((req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/' || p.endsWith('/')) p += 'index.html';
    const f = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!statSync(f).isFile()) throw 0;
    const body = readFileSync(f);
    res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('404');
  }
});
await new Promise((r) => server.listen(4173, r));

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || '/usr/local/bin/chrome',
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--disable-gpu-sandbox',
    '--ignore-gpu-blocklist',
  ],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 1 });

const errors = [];
const logs = [];
page.on('console', (m) => {
  const t = `[${m.type()}] ${m.text()}`;
  logs.push(t);
  if (m.type() === 'error') errors.push(t);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
page.on('requestfailed', (r) => errors.push(`[reqfail] ${r.url()}`));
page.on('response', (r) => {
  if (r.status() >= 400) errors.push(`[http ${r.status()}] ${r.url()}`);
});

await page.goto('http://localhost:4173/index.html', { waitUntil: 'load', timeout: 90000 });

// wait for the start button to be enabled
try {
  await page.waitForFunction(() => !document.getElementById('start-btn').disabled, { timeout: 120000 });
} catch (e) {
  console.log('!! start button never enabled');
}
await page.screenshot({ path: `${OUT}/00-loader.png` });
await page.click('#start-btn');
await page.waitForTimeout(4000);

const IDS = ['1945', '1965', '1985', '2005', '2025', '2055'];
for (const i of ERAS) {
  await page.evaluate((idx) => window.__chrono.select(idx), i);
  // software rendering is slow: wait until the era is actually current
  try {
    await page.waitForFunction(
      (id) => window.__chrono.debug().current === id && !window.__chrono.debug().running,
      IDS[i],
      { timeout: 180000 }
    );
  } catch {
    console.log('!! timed out waiting for ' + IDS[i]);
  }
  await page.waitForTimeout(2500);
  const year = await page.evaluate(() => document.getElementById('eh-year').textContent);
  await page.screenshot({ path: `${OUT}/${String(i + 1).padStart(2, '0')}-${year}.png` });
  console.log(`shot ${year}`);
}

// a mid-transition frame
await page.evaluate(() => window.__chrono.select(0));
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/90-transition.png` });
try {
  await page.waitForFunction(() => !window.__chrono.debug().running, { timeout: 120000 });
} catch {}

// close-up views
for (const [view, era, name] of [
  ['shopfront', 0, 'shopfront-1945'],
  ['lookup', 4, 'lookup-2025'],
  ['corner', 5, 'corner-2055'],
  ['aerial', 2, 'aerial-1985'],
]) {
  await page.evaluate((i) => window.__chrono.select(i), era);
  await page.waitForTimeout(1200);
  try {
    await page.waitForFunction(() => !window.__chrono.debug().running, { timeout: 120000 });
  } catch {}
  await page.evaluate((v) => document.querySelector(`#view-buttons [data-view="${v}"]`).click(), view);
  await page.waitForTimeout(4500);
  await page.screenshot({ path: `${OUT}/9-${name}.png` });
  console.log('shot ' + name);
}

const stats = await page.evaluate(() => document.getElementById('stats').textContent);
console.log('\n--- stats ---\n' + stats);
console.log('\n--- console errors (' + errors.length + ') ---');
for (const e of errors.slice(0, 40)) console.log(e);
const warns = logs.filter((l) => l.startsWith('[warning]'));
console.log('\n--- warnings (' + warns.length + ') ---');
for (const w of warns.slice(0, 25)) console.log(w);

await browser.close();
server.close();
