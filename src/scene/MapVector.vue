<script setup lang="ts">
import { computed } from 'vue';
import type { Area, CompiledTour, Peak, Place, WaterArea } from '@/data';
import {
  cumulativeScreenLengths,
  pathFor,
  pointAtFraction,
  project,
  projectGrid,
  type View
} from '@/util/camera';
import {
  estimateTextWidth,
  placeLabels,
  principalAxis,
  type LabelInput
} from '@/util/labels';
import { routeColours } from '@/util/palette';
import { coarsen, gridExtent, isoSegments } from '@/util/terrain';
import {
  HEIGHT,
  OVER_HEIGHT,
  OVER_WIDTH,
  OVER_X,
  OVER_Y,
  WIDTH
} from '@/video';

/**
 * Everything vector on one fixed map: contours, water, land cover, routes,
 * labels.
 *
 * The camera never moves, so every layer here is a `computed` that survives for
 * the whole video — only the per-tour dash offsets change from frame to frame.
 */
const props = defineProps<{
  dem: {
    data: Float32Array;
    width: number;
    height: number;
    originX: number;
    originY: number;
  };
  landcover: Area[];
  water: WaterArea[];
  places: Place[];
  peaks: Peak[];
  tours: CompiledTour[];
  view: View;
  /** Bump to force every cached layer to rebuild. */
  chapterKey: string;
  /** One 0→1 value per tour: how much of that route is drawn. */
  progress: number[];
  /** Index of the tour currently being drawn, or -1 when none is. */
  drawing: number;
  labelOpacity: number;
  /** Lowest y a label may occupy — the attribution strip owns everything below. */
  labelBottom: number;
}>();

const AREA_STYLE: Record<string, { fill: string; opacity: number }> = {
  grass: { fill: '#a9c489', opacity: 0.5 },
  farm: { fill: '#b9cd90', opacity: 0.5 },
  alp: { fill: '#bcc98f', opacity: 0.45 },
  scrub: { fill: '#6f9668', opacity: 0.5 },
  wood: { fill: '#386142', opacity: 0.78 },
  rock: { fill: '#cdc7bb', opacity: 0.8 },
  built: { fill: '#cfc4b4', opacity: 0.65 }
};
const AREA_ORDER = ['alp', 'farm', 'grass', 'scrub', 'wood', 'rock', 'built'];

const ring = (r: ReadonlyArray<[number, number]>): string => {
  let d = '';
  for (let i = 0; i < r.length; i += 1) {
    const [x, y] = project(props.view, r[i]![0], r[i]![1]);
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return `${d}Z`;
};

/** Cheap reject: skip anything entirely off-screen. */
const visible = (r: ReadonlyArray<[number, number]>): boolean => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [lon, lat] of r) {
    const [x, y] = project(props.view, lon, lat);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return (
    maxX > -OVER_X - 40 &&
    minX < WIDTH + OVER_X + 40 &&
    maxY > -OVER_Y - 40 &&
    minY < HEIGHT + OVER_Y + 40
  );
};

const areaPaths = computed(() => {
  void props.chapterKey;
  return AREA_ORDER.map((kind) => {
    let d = '';
    for (const a of props.landcover) {
      if (a.k === kind && visible(a.r)) {
        d += ring(a.r);
      }
    }
    return { kind, d, ...AREA_STYLE[kind]! };
  }).filter((a) => a.d !== '');
});

const waterPath = computed(() => {
  void props.chapterKey;
  let d = '';
  for (const w of props.water) {
    if (visible(w.ring)) {
      d += ring(w.ring);
    }
  }
  return d;
});

/**
 * Contour detail follows the zoom.
 *
 * The DEM is a fixed z13 raster, so a tight frame magnifies it heavily. Pooling
 * it 3x and spacing lines 50 m apart — right for the wide view — leaves a close
 * frame almost blank. Sampling the same data more finely when zoomed in costs
 * nothing extra and keeps the terrain legible at every step.
 */
const contours = computed(() => {
  void props.chapterKey;
  const zoom = props.view.scale;
  const pool = zoom > 3 ? 1 : zoom > 1.4 ? 2 : 3;
  const grid = coarsen(props.dem.data, props.dem.width, props.dem.height, pool);
  const { min, max } = gridExtent(grid);
  if (!Number.isFinite(min)) {
    return [];
  }
  const step = zoom > 3 ? 20 : zoom > 1.4 ? 25 : 50;
  const out: Array<{ d: string; major: boolean }> = [];
  for (let level = Math.ceil(min / step) * step; level < max; level += step) {
    let d = '';
    for (const [ax, ay, bx, by] of isoSegments(grid, level)) {
      const [x1, y1] = projectGrid(
        props.view,
        props.dem.originX,
        props.dem.originY,
        ax,
        ay,
        grid.step
      );
      if (
        x1 < -OVER_X - 60 ||
        x1 > WIDTH + OVER_X + 60 ||
        y1 < -OVER_Y - 60 ||
        y1 > HEIGHT + OVER_Y + 60
      ) {
        continue;
      }
      const [x2, y2] = projectGrid(
        props.view,
        props.dem.originX,
        props.dem.originY,
        bx,
        by,
        grid.step
      );
      d += `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`;
    }
    if (d !== '') {
      out.push({ d, major: level % (step * 5) === 0 });
    }
  }
  return out;
});

/** Long enough for however many tours there are — no wrap-around. */
const colours = computed(() => routeColours(props.tours.length));

const routePaths = computed(() => {
  void props.chapterKey;
  return props.tours.map((t, i) => ({
    id: t.id,
    index: i,
    d: pathFor(props.view, t.points),
    colour: colours.value[i]!
  }));
});

/**
 * Screen geometry per tour: the projected vertices and their running length.
 *
 * Both the dash reveal and the moving head read from this, so the two can not
 * drift apart.
 */
const screenPaths = computed(() => {
  void props.chapterKey;
  return props.tours.map((t) => {
    const pts = t.points.map(
      (p) => project(props.view, p.lon, p.lat) as [number, number]
    );
    const cumulative = cumulativeScreenLengths(pts);
    return { pts, cumulative, length: cumulative[cumulative.length - 1] ?? 0 };
  });
});

const pathLengths = computed(() => screenPaths.value.map((p) => p.length));

/**
 * Named lakes, labelled inside their own outline.
 *
 * A water label does not get to move: a lake name that has wandered off its
 * lake is worse than no name at all. It sits at the centroid, rotated onto the
 * lake's long axis the way printed maps set them — written level it would only
 * fit a lake that happens to be wide, but along the axis it fits whenever the
 * lake is long, which most of them are. It is then handed to placeLabels as an
 * obstacle so place and peak labels route around it.
 */
const waterLabels = computed(() => {
  void props.chapterKey;
  const byName = new Map<string, Array<[number, number]>>();
  for (const w of props.water) {
    if (w.n === '' || !visible(w.ring)) {
      continue;
    }
    // keep only the largest ring per name — lakes arrive as several polygons
    const prev = byName.get(w.n);
    if (prev === undefined || w.ring.length > prev.length) {
      byName.set(w.n, w.ring);
    }
  }

  const out: Array<{
    n: string;
    x: number;
    y: number;
    width: number;
    angle: number;
    /** True when the name is set within the outline; otherwise it sits beside it. */
    inside: boolean;
  }> = [];
  for (const [name, ring] of byName) {
    const screen = ring.map(
      ([lon, lat]) => project(props.view, lon, lat) as [number, number]
    );
    const axis = principalAxis(screen);
    const width = estimateTextWidth(name, 17, 0.16);
    // too small to be worth naming at all
    if (axis.length < 44) {
      continue;
    }
    // fits along the lake's length, and the lake is thick enough to carry the
    // text without letters spilling over both shores
    const fits = axis.length >= width + 18 && axis.width >= 15;
    out.push({
      n: name,
      x: axis.x,
      y: axis.y,
      width,
      angle: axis.angle,
      inside: fits
    });
  }
  return out;
});

/** Route pixels act as obstacles so labels never sit on a track. */
const routeObstacles = computed<Array<[number, number]>>(() => {
  void props.chapterKey;
  const pts: Array<[number, number]> = [];
  for (const t of props.tours) {
    for (const p of t.points) {
      pts.push(project(props.view, p.lon, p.lat));
    }
  }
  return pts;
});

/**
 * Only summits that were actually walked get named — matched by position.
 *
 * Matching by name labelled every peak sharing a name with a climbed one, and
 * a dozen names occur twice around here.
 */
const climbedKeys = computed(() => {
  const keys = new Set<string>();
  for (const t of props.tours) {
    for (const s of t.summits) {
      keys.add(`${s.lat.toFixed(4)},${s.lon.toFixed(4)}`);
    }
  }
  return keys;
});

/** Places far from any track tell you nothing about where the tours were. */
const PLACE_RADIUS_DEG = 0.03;

const nearbyPlaces = computed(() =>
  props.places.filter(
    (pl) =>
      pl.rank <= 2 &&
      props.tours.some((t) =>
        t.points.some(
          (pt) =>
            Math.abs(pt.lat - pl.lat) < PLACE_RADIUS_DEG &&
            Math.abs(pt.lon - pl.lon) < PLACE_RADIUS_DEG * 1.5
        )
      )
  )
);

const insideWaterLabels = computed(() =>
  waterLabels.value.filter((w) => w.inside)
);

const labels = computed(() => {
  void props.chapterKey;
  const candidates: LabelInput[] = [];

  for (const p of nearbyPlaces.value) {
    const [x, y] = project(props.view, p.lon, p.lat);
    candidates.push({
      id: `place:${p.n}:${p.lat}`,
      kind: 'place',
      x,
      y,
      width: estimateTextWidth(p.n, 21, 0.2) + 30,
      above: 20,
      below: 9,
      priority: p.rank
    });
  }
  for (const p of props.peaks) {
    if (!climbedKeys.value.has(`${p.lat.toFixed(4)},${p.lon.toFixed(4)}`)) {
      continue;
    }
    const [x, y] = project(props.view, p.lon, p.lat);
    candidates.push({
      id: `peak:${p.n}:${p.lat}`,
      kind: 'peak',
      x,
      y,
      ele: p.ele,
      // below covers the name *and* the "1234 m" line drawn under it
      width: Math.max(estimateTextWidth(p.n, 17, 0.14), 62) + 26,
      above: 17,
      below: 28,
      priority: 4
    });
  }

  /**
   * Every summit marker is an obstacle, not just a label's own.
   *
   * placeLabels only knows to keep a label clear of the marker it belongs to;
   * without this, one peak's name lands on a neighbouring peak's triangle —
   * which is how "1463 m" ended up with a marker through it.
   */
  const markerPoints: Array<[number, number]> = [];
  for (const cand of candidates) {
    if (cand.kind !== 'peak') {
      continue;
    }
    for (let dx = -11; dx <= 11; dx += 11) {
      for (let dy = -11; dy <= 11; dy += 11) {
        markerPoints.push([cand.x + dx, cand.y + dy]);
      }
    }
  }

  // water labels are already fixed in place; everything else routes around them
  // a lake too small to hold its own name gets one beside it instead
  for (const w of waterLabels.value) {
    if (w.inside) {
      continue;
    }
    candidates.push({
      id: `water:${w.n}:${w.y.toFixed(0)}`,
      kind: 'water',
      x: w.x,
      y: w.y,
      width: w.width + 26,
      above: 17,
      below: 9,
      priority: 3
    });
  }

  const waterPoints: Array<[number, number]> = [];
  for (const w of insideWaterLabels.value) {
    const rad = (w.angle * Math.PI) / 180;
    const ux = Math.cos(rad);
    const uy = Math.sin(rad);
    for (let d = -w.width / 2; d <= w.width / 2; d += 18) {
      waterPoints.push(
        [w.x + d * ux - uy * 7, w.y + d * uy + ux * 7],
        [w.x + d * ux + uy * 7, w.y + d * uy - ux * 7]
      );
    }
  }

  const placed = placeLabels(candidates, {
    obstacles: [...routeObstacles.value, ...markerPoints, ...waterPoints],
    safe: { x0: 34, y0: 70, x1: WIDTH - 34, y1: props.labelBottom },
    max: 14
  });

  // ele travels with the candidate; looking it up by name again would find the
  // first peak sharing that name, which is how a 1511 m summit got labelled 1444 m
  return placed.map((l) => ({
    ...l,
    name: l.id.split(':')[1]!,
    ele: (l as LabelInput & { ele?: number }).ele ?? 0,
    isPeak: l.kind === 'peak'
  }));
});

/**
 * The moving head sits on whichever tour is currently being drawn.
 *
 * Positioned by path length, exactly like the dash reveal. Picking a vertex by
 * index instead put it up to 4 % of the route away from the line's end.
 */
const headPoint = computed<[number, number] | null>(() => {
  if (props.drawing === -1) {
    return null;
  }
  const path = screenPaths.value[props.drawing];
  if (path === undefined || path.pts.length === 0) {
    return null;
  }
  return pointAtFraction(
    path.pts,
    path.cumulative,
    props.progress[props.drawing] ?? 0
  );
});
</script>

<template>
  <svg
    :viewBox="`${-OVER_X} ${-OVER_Y} ${OVER_WIDTH} ${OVER_HEIGHT}`"
    :width="OVER_WIDTH"
    :height="OVER_HEIGHT"
    class="vector"
    :style="{ left: `${-OVER_X}px`, top: `${-OVER_Y}px` }"
  >
    <defs>
      <filter id="halo" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow
          dx="0"
          dy="0"
          stdDeviation="4.5"
          flood-color="#fbfaf5"
          flood-opacity="0.95"
        />
      </filter>
    </defs>

    <path
      v-for="a in areaPaths"
      :key="a.kind"
      :d="a.d"
      :fill="a.fill"
      :opacity="a.opacity"
      fill-rule="evenodd"
    />
    <path
      v-if="waterPath"
      :d="waterPath"
      fill="#7fb4d4"
      stroke="#4e88a8"
      stroke-width="1"
      opacity="0.95"
    />

    <path
      v-for="(c, i) in contours"
      :key="`c${i}`"
      :d="c.d"
      fill="none"
      :stroke="c.major ? '#67624f' : '#7f7a63'"
      :stroke-width="c.major ? 1.3 : 0.85"
      :opacity="c.major ? 0.5 : 0.3"
      stroke-linecap="round"
    />

    <!-- every route on one map, each revealed by its own dash offset -->
    <g v-for="r in routePaths" :key="r.id">
      <template v-if="(progress[r.index] ?? 0) > 0">
        <path
          :d="r.d"
          fill="none"
          stroke="#ffffff"
          stroke-width="10"
          opacity="0.7"
          stroke-linejoin="round"
          stroke-linecap="round"
          :stroke-dasharray="pathLengths[r.index]"
          :stroke-dashoffset="
            pathLengths[r.index]! * (1 - (progress[r.index] ?? 0))
          "
        />
        <path
          :d="r.d"
          fill="none"
          :stroke="r.colour"
          stroke-width="5.5"
          stroke-linejoin="round"
          stroke-linecap="round"
          :stroke-dasharray="pathLengths[r.index]"
          :stroke-dashoffset="
            pathLengths[r.index]! * (1 - (progress[r.index] ?? 0))
          "
        />
      </template>
    </g>

    <circle
      v-if="headPoint"
      :cx="headPoint[0]"
      :cy="headPoint[1]"
      r="10"
      fill="#ffffff"
      stroke="#1b2430"
      stroke-width="3.5"
    />

    <g :opacity="labelOpacity">
      <text
        v-for="w in insideWaterLabels"
        :key="`w-${w.n}`"
        :x="w.x"
        :y="w.y"
        text-anchor="middle"
        dominant-baseline="middle"
        class="water-name"
        :transform="`rotate(${w.angle.toFixed(1)} ${w.x.toFixed(1)} ${w.y.toFixed(1)})`"
      >
        {{ w.n }}
      </text>

      <g v-for="l in labels" :key="l.id" filter="url(#halo)">
        <path
          v-if="l.isPeak"
          :d="`M${l.x - 8} ${l.y + 6}L${l.x} ${l.y - 8}L${l.x + 8} ${l.y + 6}Z`"
          fill="none"
          stroke="#3b4857"
          stroke-width="2.2"
          stroke-linejoin="round"
        />
        <text
          :x="l.labelX"
          :y="l.labelY"
          text-anchor="middle"
          :class="
            l.kind === 'peak'
              ? 'peak'
              : l.kind === 'water'
                ? 'water-name'
                : 'place'
          "
        >
          {{ l.name }}
        </text>
        <text
          v-if="l.isPeak && l.ele"
          :x="l.labelX"
          :y="l.labelY + 19"
          text-anchor="middle"
          class="ele"
        >
          {{ l.ele }} m
        </text>
      </g>
    </g>
  </svg>
</template>

<style scoped>
.vector {
  position: absolute;
}

.place {
  fill: #222c38;
  font:
    600 21px/1 Inter,
    system-ui,
    sans-serif;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}

.peak {
  fill: #3b4857;
  font:
    600 17px/1 Inter,
    system-ui,
    sans-serif;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.water-name {
  fill: #2c5f80;
  font:
    600 17px/1 Inter,
    system-ui,
    sans-serif;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.ele {
  fill: #64717f;
  font:
    500 13px/1 Inter,
    system-ui,
    sans-serif;
  letter-spacing: 0.08em;
}
</style>
