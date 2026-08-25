import { readonly, ref } from 'vue';

const current = ref(0);

/** The frame the scene is currently showing. Every animated value derives from this. */
export const frame = readonly(current);

/**
 * Move the scene to a frame. Called by the preview's rAF loop during `pnpm dev`,
 * and by the renderer via `window.__setFrame` — never from inside a component.
 */
export function setFrame(next: number): void {
  current.value = next;
}
