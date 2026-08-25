<script setup lang="ts">
import { formatDuration, formatKm, formatMetres, type Locale } from '@/i18n';

/**
 * Closing figures.
 *
 * Ascent and descent share one row rather than taking a line each: they are a
 * pair, and stacking them would make a four-second card four rows tall. Note
 * that descent is the larger of the two here (4,369 m against 3,710 m) — the
 * cable cars carried them up more than once. The two are never summed; in
 * German usage "Höhenmeter" on its own means the ascent.
 */
defineProps<{
  totals: {
    distanceKm: number;
    ascentM: number;
    descentM: number;
    durationMin: number;
  };
  locale: Locale;
  localeTag: string;
  enter: number;
}>();
</script>

<template>
  <div class="outro" :style="{ opacity: enter }">
    <div
      class="card"
      :style="{ transform: `translateY(${(1 - enter) * 22}px)` }"
    >
      <div class="row">
        <span class="value">{{
          formatKm(totals.distanceKm, locale, localeTag)
        }}</span>
        <span class="key">{{ locale.stats.distance }}</span>
      </div>
      <div class="row pair">
        <div class="half">
          <span class="value small"
            >↑ {{ formatMetres(totals.ascentM, locale, localeTag) }}</span
          >
          <span class="key">{{ locale.stats.ascent }}</span>
        </div>
        <div class="half">
          <span class="value small"
            >↓ {{ formatMetres(totals.descentM, locale, localeTag) }}</span
          >
          <span class="key">{{ locale.stats.descent }}</span>
        </div>
      </div>
      <div class="row last">
        <span class="value">{{
          formatDuration(totals.durationMin, locale)
        }}</span>
        <span class="key">{{ locale.stats.duration }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.outro {
  align-items: center;
  display: flex;
  inset: 0;
  justify-content: center;
  position: absolute;
}

.card {
  background: rgb(251 250 245 / 95%);
  border-radius: 4px;
  box-shadow: 0 26px 64px rgb(40 46 34 / 24%);
  box-sizing: border-box;
  margin: 0 56px;
  padding: 58px 54px 54px;
  text-align: center;
}

.row {
  margin-bottom: 36px;
}

.pair {
  display: flex;
  gap: 34px;
  justify-content: center;
}

.half {
  flex: 1;
}

.row.last {
  margin-bottom: 0;
}

.value {
  color: #1e2630;
  display: block;
  font:
    700 64px/1 Inter,
    system-ui,
    sans-serif;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.03em;
}

.value.small {
  font-size: 46px;
  letter-spacing: -0.02em;
}

.key {
  color: #a8a08e;
  display: block;
  font:
    600 16px/1 Inter,
    system-ui,
    sans-serif;
  letter-spacing: 0.2em;
  margin-top: 9px;
  text-transform: uppercase;
}

.foot {
  border-top: 1px solid #e6e1d4;
  color: #6d6455;
  font:
    500 25px/1 Inter,
    system-ui,
    sans-serif;
  padding-top: 30px;
}
</style>
