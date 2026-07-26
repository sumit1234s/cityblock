import { chromium } from 'playwright';
import { readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = createServer((req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/' || p.endsWith('/')) p += 'index.html';
    const f = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!statSync(f).isFile()) throw 0;
    res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' });
    res.end(readFileSync(f));
  } catch {
    res.writeHead(404);
    res.end('404');
  }
});
await new Promise((r) => server.listen(4173, r));

const browser = await chromium.launch({
  executablePath: '/usr/local/bin/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text());
});
await page.goto('http://localhost:4173/index.html');
await page.waitForFunction(() => !document.getElementById('start-btn').disabled, { timeout: 120000 });
await page.click('#start-btn');
await page.waitForTimeout(2000);

// build every era directly and report failures
for (const id of ['1965', '1985', '2005', '2025', '2055']) {
  const r = await page.evaluate((eid) => {
    try {
      const t0 = performance.now();
      const mod = window.__chrono;
      const idx = ['1945', '1965', '1985', '2005', '2025', '2055'].indexOf(eid);
      mod.select(idx);
      return { ok: true, ms: Math.round(performance.now() - t0), dbg: mod.debug() };
    } catch (e) {
      return { ok: false, err: e.message + '\n' + e.stack };
    }
  }, id);
  console.log(id, JSON.stringify(r).slice(0, 600));
  await page.waitForTimeout(1500);
  try {
    await page.waitForFunction(() => !window.__chrono.debug().running, { timeout: 120000 });
  } catch {}
  console.log('  after:', JSON.stringify(await page.evaluate(() => window.__chrono.debug())));
}
await browser.close();
server.close();
