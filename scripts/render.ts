/**
 * Renders the scene to out/hike-recap.mp4.
 *
 * The scene is never "played". Vite serves it, Playwright opens it, and this
 * script steps it frame by frame: set the frame, wait until the scene reports
 * it has finished settling, screenshot, repeat. That is what makes the output
 * deterministic — a slow tile fetch costs wall-clock time, never a dropped or
 * half-drawn frame.
 *
 * Frames are piped into ffmpeg over stdin rather than written to disk; 1800
 * PNGs would be several GB of pointless I/O.
 *
 * They are JPEGs rather than PNGs purely for speed: encoding a 1080x1920 PNG
 * costs ~260 ms per frame against ~95 ms for JPEG, which is the difference
 * between a twenty-minute and a five-minute render. At quality 95, feeding an
 * H.264 encoder that recompresses anyway, the difference is not visible.
 */
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { FPS, HEIGHT, TOTAL_FRAMES, WIDTH } from '@/video.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = resolve(ROOT, 'out/hike-recap.mp4');

/** Wall-clock ceiling for one frame. A chapter switch rebuilds every layer. */
const FRAME_TIMEOUT_MS = 60_000;
/** High enough that recompression to H.264 hides it entirely. */
const JPEG_QUALITY = 95;

const preview = process.argv.includes('--preview');
const frameCount = preview ? FPS * 3 : TOTAL_FRAMES;

function startEncoder(): ChildProcessWithoutNullStreams {
  if (!ffmpegPath) {
    throw new Error(
      'ffmpeg-static did not resolve a binary — run `pnpm rebuild ffmpeg-static`.'
    );
  }

  const encoder = spawn(ffmpegPath, [
    '-y',
    '-f',
    'image2pipe',
    '-framerate',
    String(FPS),
    '-i',
    'pipe:0',
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '18',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    OUTPUT
  ]);

  encoder.stderr.on('data', (chunk: Buffer) => {
    const line = chunk.toString();
    if (line.includes('Error') || line.includes('Invalid')) {
      process.stderr.write(line);
    }
  });

  return encoder;
}

async function main(): Promise<void> {
  await mkdir(dirname(OUTPUT), { recursive: true });

  const server = await createServer({
    root: ROOT,
    server: { port: 5175, strictPort: true }
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

  const scene = page.locator('#scene');
  const encoder = startEncoder();
  const finished = new Promise<void>((resolveDone, rejectDone) => {
    encoder.on('error', rejectDone);
    encoder.on('close', (code) => {
      if (code === 0) {
        resolveDone();
      } else {
        rejectDone(new Error(`ffmpeg exited with code ${code}`));
      }
    });
  });

  const startedAt = Date.now();
  for (let index = 0; index < frameCount; index += 1) {
    await page.evaluate((value) => window.__setFrame(value), index);
    await page.waitForFunction(() => window.__frameReady, undefined, {
      timeout: FRAME_TIMEOUT_MS
    });

    const jpeg = await scene.screenshot({
      type: 'jpeg',
      quality: JPEG_QUALITY
    });
    if (!encoder.stdin.write(jpeg)) {
      await new Promise((flushed) => encoder.stdin.once('drain', flushed));
    }

    if (index % FPS === 0 || index === frameCount - 1) {
      const done = index + 1;
      const elapsed = (Date.now() - startedAt) / 1000;
      const fps = done / elapsed;
      const remaining = Math.round((frameCount - done) / fps);
      process.stdout.write(
        `\r  frame ${done}/${frameCount} · ${fps.toFixed(1)} fps · ~${remaining}s left   `
      );
    }
  }

  encoder.stdin.end();
  await finished;
  process.stdout.write('\n');

  await browser.close();
  await server.close();

  const seconds = (frameCount / FPS).toFixed(1);
  console.info(
    `\n✓ ${OUTPUT}\n  ${WIDTH}×${HEIGHT} · ${FPS} fps · ${seconds}s`
  );
}

await main();
