<script setup lang="ts">
import { computed, ref } from 'vue';
import { loadSceneData, type SceneData } from '@/data';
import { frame } from '@/frame';
import { mergeBounds } from '@/lib/geo';
import { holdFrame } from '@/render-bridge';
import {
  collapseViews,
  lerpView,
  transformBetween,
  viewForBounds,
  type View
} from '@/util/camera';
import { easeInOutCubic, easeOutCubic, ramp } from '@/util/easing';
import { cameraAt, drawnFraction, planDrawSchedule } from '@/util/schedule';
import { loadLocale } from '@/i18n';
import { layoutAttribution, STRIP } from '@/util/attribution';
import { FPS, HEIGHT, TOTAL_FRAMES, WIDTH } from '@/video';
import IntroCard from './IntroCard.vue';
import MapVector from './MapVector.vue';
import OutroCard from './OutroCard.vue';
import TerrainCanvas from './TerrainCanvas.vue';

/**
 * Frame → picture.
 *
 * The viewport grows. It opens framed on the first tour alone, and before each
 * later tour pulls back just far enough to fit everything drawn so far. Tours
 * stay once drawn, so the map fills up as the holiday accumulates.
 */
const data = ref<SceneData | null>(null);
const release = holdFrame('scene-data');
void loadSceneData().then((loaded) => {
  data.value = loaded;
  release();
});

/**
 * The lead-in and hold-out double as the intro and outro.
 *
 * The map is already live under both cards — framed on the first tour during
 * the intro, showing everything during the outro — so the titles sit on the
 * real scene rather than on a separate slide.
 */
const LEAD_IN = Math.round(FPS * 2.1);
const HOLD_OUT = Math.round(FPS * 4);
const ZOOM_FRAMES = Math.round(FPS * 0.42);
/** Breathing room around the framed tours, in pixels. */
const PADDING = 120;

/**
 * One view per tour: the frame that fits tours 0…n.
 *
 * Bounds are merged cumulatively, so the sequence only ever widens — which is
 * what makes the zoom read as pulling back rather than wandering.
 */
/** Tile zoom everything projects in, resolved at ingest. */
const demZoom = computed(() => data.value?.compiled.demZoom ?? 13);

const views = computed<View[]>(() => {
  if (data.value === null) {
    return [];
  }
  const raw: View[] = [];
  const seen = [];
  for (const tour of data.value.compiled.tours) {
    seen.push(tour.bounds);
    raw.push(viewForBounds(mergeBounds(seen), PADDING, HEIGHT, demZoom.value));
  }
  // a tour inside the frame already shown widens it by nothing; animating that
  // is a twitch, not a move, so those steps hold the previous view instead
  return collapseViews(raw);
});

/**
 * The terrain's own elevation range, for stretching the colour ramp.
 *
 * Taken from the DEM rather than from the tours: the ramp colours the whole
 * visible ground, not just the ground that was walked on.
 */
const elevationRange = computed(() => {
  if (data.value === null) {
    return { min: 0, max: 1 };
  }
  let min = Infinity;
  let max = -Infinity;
  const { data: dem } = data.value.dem;
  // every 7th sample: a million-cell grid does not need exhaustive scanning
  for (let i = 0; i < dem.length; i += 7) {
    const v = dem[i]!;
    if (!Number.isNaN(v)) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return Number.isFinite(min) ? { min, max } : { min: 0, max: 1 };
});

/**
 * The attribution strip wraps, so how far down a label may sit depends on how
 * many credit lines the area owes. Derived here rather than fixed in MapVector:
 * a fourth line used to push the strip off both edges of the frame.
 */
const attributionText = computed(() =>
  (data.value?.compiled.attribution ?? []).join(STRIP.separator)
);
const strip = computed(() =>
  layoutAttribution(data.value?.compiled.attribution ?? [], WIDTH, HEIGHT)
);

const localeTag = computed(() => data.value?.compiled.locale ?? 'de-DE');
const locale = computed(() => loadLocale(localeTag.value));

/** True where the camera actually moves before that tour. */
const cameraMoves = computed(() =>
  views.value.map((v, i) => i > 0 && v !== views.value[i - 1])
);

const schedule = computed(() => {
  if (data.value === null) {
    return null;
  }
  const lengths = data.value.compiled.tours.map(
    (t) => t.elevationProfile.at(-1)?.d ?? 1
  );
  return planDrawSchedule(lengths, {
    totalFrames: TOTAL_FRAMES,
    leadIn: LEAD_IN,
    holdOut: HOLD_OUT,
    zoomFrames: ZOOM_FRAMES,
    needsZoom: cameraMoves.value
  });
});

const camera = computed(() =>
  schedule.value === null ? null : cameraAt(schedule.value, frame.value)
);

/** The view the layers are rasterised for. Changes only between tours. */
const targetView = computed<View | null>(() => {
  if (camera.value === null || views.value.length === 0) {
    return null;
  }
  return views.value[camera.value.target] ?? null;
});

/**
 * The transform that turns the target-view layers into what the camera sees.
 *
 * Identity while the camera rests, which is every frame that actually draws
 * something — so the zoom costs nothing once it is over.
 */
const cameraTransform = computed(() => {
  const cam = camera.value;
  const target = targetView.value;
  if (cam === null || target === null || cam.from < 0) {
    return 'none';
  }
  const from = views.value[cam.from];
  if (from === undefined) {
    return 'none';
  }
  const current = lerpView(from, target, easeInOutCubic(cam.t));
  const { scale, offsetX, offsetY } = transformBetween(target, current);
  return `translate(${offsetX.toFixed(2)}px, ${offsetY.toFixed(2)}px) scale(${scale.toFixed(5)})`;
});

const progress = computed<number[]>(() =>
  schedule.value === null
    ? []
    : schedule.value.phases.map((p) => drawnFraction(p, frame.value))
);

/** Which tour the head is riding, or -1 while zooming / holding. */
const drawing = computed(() => {
  if (schedule.value === null) {
    return -1;
  }
  const f = frame.value;
  return (
    schedule.value.phases.find((p) => f > p.drawStart && f < p.drawEnd)
      ?.index ?? -1
  );
});

/** Labels settle in as the intro card clears. */
const labelOpacity = computed(() =>
  easeOutCubic(ramp(frame.value, LEAD_IN * 0.55, LEAD_IN))
);

const introEnter = computed(() =>
  easeOutCubic(ramp(frame.value, FPS * 0.15, FPS * 0.85))
);
/** Fades out over the last third of the lead-in, just before tour one starts. */
const introOpacity = computed(
  () => 1 - ramp(frame.value, LEAD_IN * 0.62, LEAD_IN)
);

const outroEnter = computed(() => {
  const start = schedule.value?.holdFrom ?? TOTAL_FRAMES;
  return easeOutCubic(ramp(frame.value, start, start + FPS * 0.55));
});

/**
 * Layers rebuild per framed extent, not per tour.
 *
 * Where the camera holds, the view object is literally the previous one, so the
 * key stays the same and the cached contours, land cover and terrain are reused.
 */
const layerKey = computed(() => {
  const target = camera.value?.target ?? 0;
  const view = views.value[target];
  if (view === undefined) {
    return 'view:0';
  }
  return `view:${views.value.indexOf(view)}`;
});
</script>

<template>
  <div class="scene">
    <template v-if="data && targetView">
      <div class="camera" :style="{ transform: cameraTransform }">
        <TerrainCanvas
          :dem="data.dem"
          :view="targetView"
          :chapter-key="layerKey"
          :range="elevationRange"
        />
        <MapVector
          :dem="data.dem"
          :landcover="data.landcover"
          :water="data.water"
          :places="data.places"
          :peaks="data.peaks"
          :tours="data.compiled.tours"
          :view="targetView"
          :chapter-key="layerKey"
          :progress="progress"
          :drawing="drawing"
          :label-opacity="labelOpacity"
          :label-bottom="strip.labelBottom"
        />
      </div>
      <IntroCard
        v-if="introOpacity > 0"
        :title="data.compiled.title"
        :region="data.compiled.region"
        :from="data.compiled.period.from"
        :to="data.compiled.period.to"
        :locale="locale"
        :locale-tag="localeTag"
        :opacity="introOpacity"
        :enter="introEnter"
      />

      <OutroCard
        v-if="outroEnter > 0"
        :totals="data.compiled.aggregate"
        :locale="locale"
        :locale-tag="localeTag"
        :enter="outroEnter"
      />

      <div class="attribution">{{ attributionText }}</div>
    </template>
  </div>
</template>

<style scoped>
.scene {
  background: #eceadf;
  height: 100%;
  overflow: hidden;
  position: relative;
  width: 100%;
}

.camera {
  inset: 0;
  position: absolute;
  transform-origin: 50% 50%;
}

.attribution {
  background: rgb(251 250 245 / 82%);
  border-radius: 3px;
  bottom: 24px;
  color: #5f5849;
  font:
    500 14px/1.4 Inter,
    system-ui,
    sans-serif;
  left: 24px;
  padding: 8px 16px;
  position: absolute;
  right: 24px;
  text-align: center;
  text-wrap: balance;
}
</style>
