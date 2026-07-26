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
const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('CONSOLE-ERR', m.text());
});
await page.goto('http://localhost:4173/index.html');
await page.waitForFunction(() => !document.getElementById('start-btn').disabled, { timeout: 120000 });
await page.click('#start-btn');
await page.waitForTimeout(2500);
console.log('start:', JSON.stringify(await page.evaluate(() => window.__chrono.debug())));

await page.keyboard.press('3');
for (const ms of [300, 900, 1500, 2200, 3000, 4500]) {
  await page.waitForTimeout(ms === 300 ? 300 : 600);
  console.log(ms, JSON.stringify(await page.evaluate(() => window.__chrono.debug())));
}
await page.waitForTimeout(2000);
console.log('final:', JSON.stringify(await page.evaluate(() => window.__chrono.debug())));
await browser.close();
server.close();
