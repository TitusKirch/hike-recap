/**
 * Renders single frames to build/stills/ — the fast way to inspect a chapter
 * without sitting through a full render.
 *
 * Usage: pnpm still 0 300 600 900
 */
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { HEIGHT, WIDTH } from '@/video.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'build/stills');

const frames = process.argv
  .slice(2)
  .map(Number)
  .filter((n) => Number.isFinite(n));
if (frames.length === 0) {
  throw new Error('give at least one frame number: pnpm still 0 300 600');
}

await mkdir(OUT_DIR, { recursive: true });
const server = await createServer({
  root: ROOT,
  server: { port: 5176, strictPort: true }
});
await server.listen();
const url = server.resolvedUrls?.local[0];
if (!url) {
  throw new Error('Vite did not report a local URL.');
}

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 1
});
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.error('CONSOLE:', m.text());
});
/**
 * `domcontentloaded`, not `networkidle`.
 *
 * The scene signals readiness itself: `holdFrame` keeps `__frameReady` false
 * until the data and fonts have settled, and every frame waits on that anyway.
 * `networkidle` is a weaker proxy that simply times out once a region ships
 * enough tiles and land cover — which is a property of the data, not a fault.
 */
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__frameReady === true, undefined, {
  timeout: 180_000
});

for (const f of frames) {
  await page.evaluate((n) => window.__setFrame(n), f);
  await page.waitForFunction(() => window.__frameReady, undefined, {
    timeout: 60_000
  });
  const path = resolve(OUT_DIR, `frame-${String(f).padStart(4, '0')}.png`);
  await page.locator('#scene').screenshot({ path });
  console.info(`✓ ${path}`);
}

await browser.close();
await server.close();
