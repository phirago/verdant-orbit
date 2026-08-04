import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8');

test('game shell exposes mobile controls, restoration HUD, and PWA metadata', async () => {
  const html = await read('index.html');
  assert.match(html, /<canvas[^>]+id="world"/);
  assert.match(html, /id="joystick"/);
  assert.match(html, /id="action-button"/);
  assert.match(html, /id="build-sheet"/);
  assert.match(html, /manifest\.webmanifest/);
  assert.match(html, /app\.mjs/);
});

test('web manifest launches as a landscape standalone game', async () => {
  const manifest = JSON.parse(await read('manifest.webmanifest'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.orientation, 'landscape');
  assert.equal(manifest.name, 'Verdant Orbit');
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192' && icon.type === 'image/png'));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.type === 'image/png'));
});

test('game exposes a manual install action for mobile browsers', async () => {
  const html = await read('index.html');
  const app = await read('src/app.mjs');
  assert.match(html, /id="install-button"/);
  assert.match(html, /apple-touch-icon/);
  assert.match(app, /beforeinstallprompt/);
  assert.match(app, /Add to Home Screen/);
});

test('construction and journal sheets remain touch-scrollable on short phone screens', async () => {
  const css = await read('styles.css');
  assert.match(css, /\.sheet,.journal\{[^}]*overflow-y:auto[^}]*touch-action:pan-y/);
});

test('PWA asset paths are project-relative for GitHub Pages hosting', async () => {
  const manifest = JSON.parse(await read('manifest.webmanifest'));
  const app = await read('src/app.mjs');
  const worker = await read('service-worker.js');
  assert.match(manifest.start_url, /^\.\//);
  assert.equal(manifest.scope, './');
  assert.ok(manifest.icons.every((icon) => !icon.src.startsWith('/')));
  assert.match(app, /\.\.\/vendor\/three\.module\.js/);
  assert.match(app, /register\('\.\/service-worker\.js'\)/);
  assert.doesNotMatch(worker, /['"]\//);
});
