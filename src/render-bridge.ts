import { nextTick } from 'vue';
import { setFrame } from './frame';

/**
 * The contract between the scene and `scripts/render.ts`.
 *
 * The renderer drives the scene one frame at a time instead of letting it play:
 * it calls `__setFrame`, waits for `__frameReady` to flip back to true, then
 * screenshots. `__frameReady` stays false while anything asynchronous is still
 * settling — fonts above all, since one that loads a frame late silently
 * reflows every label.
 */
declare global {
  interface Window {
    __setFrame: (frame: number) => Promise<void>;
    __frameReady: boolean;
  }
}

const pending = new Set<string>();

/** Hold frame capture until `release()` is called. Use for tiles, fonts, images. */
export function holdFrame(reason: string): () => void {
  const token = `${reason}:${pending.size}`;
  pending.add(token);
  window.__frameReady = false;
  return () => {
    pending.delete(token);
    if (pending.size === 0) {
      window.__frameReady = true;
    }
  };
}

export function installRenderBridge(): void {
  window.__frameReady = true;
  window.__setFrame = async (next: number) => {
    window.__frameReady = false;
    setFrame(next);
    await nextTick();
    if (pending.size === 0) {
      window.__frameReady = true;
    }
  };
}
