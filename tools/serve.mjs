/**
 * Minimal static file server for local viewing.
 *
 *   node tools/serve.mjs [port]
 *
 * Serves the repository root regardless of the directory you launch it from.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.argv[2] || 4173);

// fileURLToPath (not URL.pathname) so paths containing spaces or a Windows
// drive letter resolve correctly
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

if (!existsSync(join(ROOT, 'index.html'))) {
  console.error(`! index.html not found in ${ROOT}`);
  console.error('  Run this from inside the repository: node tools/serve.mjs');
  process.exit(1);
}

const VERBOSE = process.argv.includes('-v') || process.argv.includes('--verbose');

createServer(async (req, res) => {
  let urlPath = '/';
  let file = '';
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (urlPath.endsWith('/')) urlPath += 'index.html';

    // resolve inside ROOT and refuse anything that escapes it
    file = resolve(join(ROOT, urlPath));
    if (file !== ROOT && !file.startsWith(ROOT + sep)) throw new Error('outside root');

    const s = await stat(file);
    if (!s.isFile()) throw new Error('not a file');

    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-cache',
    });
    res.end(body);
    if (VERBOSE) console.log(`200 ${urlPath}`);
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`404 — ${urlPath}\nlooked for: ${file}\n`);
    // favicon misses are normal and not worth reporting
    if (!urlPath.endsWith('favicon.ico')) {
      console.warn(`404 ${urlPath}  (looked for ${file})`);
    }
  }
}).listen(PORT, () => {
  console.log(`chrono-block  →  http://localhost:${PORT}/`);
  console.log(`serving       ${ROOT}`);
});
