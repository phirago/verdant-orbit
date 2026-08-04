import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createStaticServer } from '../server.mjs';

test('static server serves the game and rejects traversal', async (t) => {
  const server = createStaticServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const home = await fetch(base + '/');
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-type'), /text\/html/);
  const manifest = await fetch(base + '/manifest.webmanifest');
  assert.match(manifest.headers.get('content-type'), /application\/manifest\+json/);
  const icon = await fetch(base + '/assets/icon-192.png');
  assert.match(icon.headers.get('content-type'), /image\/png/);
  const traversal = await fetch(base + '/..%2Fpackage.json');
  assert.equal(traversal.status, 403);
});
