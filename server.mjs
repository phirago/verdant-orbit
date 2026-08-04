import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

export function createStaticServer() {
  return http.createServer(async (request, response) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname); }
    catch { response.writeHead(400).end('Bad request'); return; }
    if (pathname.split('/').includes('..')) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    try {
      const body = await readFile(join(ROOT, relative));
      response.writeHead(200, {
        'Content-Type': MIME[extname(relative)] || 'application/octet-stream',
        'Cache-Control': relative === 'service-worker.js' ? 'no-cache' : 'public, max-age=300',
      });
      response.end(body);
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain' });
      response.end('Not found');
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4173);
  createStaticServer().listen(port, '0.0.0.0', () => {
    console.log(`Verdant Orbit ready at http://localhost:${port}`);
  });
}
