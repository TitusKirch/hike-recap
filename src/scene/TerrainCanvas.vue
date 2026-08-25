<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { holdFrame } from '@/render-bridge';
import { renderTerrain } from '@/util/terrain';
import type { View } from '@/util/camera';
import { OVER_HEIGHT, OVER_WIDTH, OVER_X, OVER_Y } from '@/video';

/**
 * Hypsometric tint + hillshade, rasterised once per chapter.
 *
 * Repainting 1080×1920 pixels in JS costs a few hundred ms, so it must not
 * happen per frame. The camera therefore rests during a chapter; the Ken Burns
 * drift is a CSS transform applied to the finished bitmap.
 */
const props = defineProps<{
  dem: {
    data: Float32Array;
    width: number;
    height: number;
    originX: number;
    originY: number;
  };
  view: View;
  /** Changing this key is what triggers a repaint. */
  chapterKey: string;
  /** Terrain range the colour ramp is stretched across. */
  range: { min: number; max: number };
}>();

const canvas = ref<HTMLCanvasElement | null>(null);

function paint(): void {
  const el = canvas.value;
  if (el === null) {
    return;
  }
  const release = holdFrame('terrain');
  const ctx = el.getContext('2d')!;
  const image = ctx.createImageData(OVER_WIDTH, OVER_HEIGHT);
  renderTerrain(props.dem.data, props.dem.width, props.dem.height, image.data, {
    width: OVER_WIDTH,
    height: OVER_HEIGHT,
    originX: props.dem.originX,
    originY: props.dem.originY,
    centerX: props.view.centerX,
    centerY: props.view.centerY,
    scale: props.view.scale,
    range: props.range
  });
  ctx.putImageData(image, 0, 0);
  release();
}

onMounted(paint);
watch(() => props.chapterKey, paint);
</script>

<template>
  <canvas
    ref="canvas"
    :width="OVER_WIDTH"
    :height="OVER_HEIGHT"
    class="terrain"
    :style="{ left: `${-OVER_X}px`, top: `${-OVER_Y}px` }"
  />
</template>

<style scoped>
.terrain {
  position: absolute;
}
</style>
