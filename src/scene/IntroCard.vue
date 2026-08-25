<script setup lang="ts">
import { computed } from 'vue';
import type { Locale } from '@/i18n';

/** Opening title. Deliberately three lines — it has two seconds to be read. */
const props = defineProps<{
  title: string;
  region: string;
  from: string;
  to: string;
  locale: Locale;
  /** BCP-47 tag; decides whether the day carries an ordinal point. */
  localeTag: string;
  opacity: number;
  enter: number;
}>();

const period = computed(() => {
  const months = props.locale.months;
  const [, fm, fd] = props.from.split('-').map(Number);
  const [, tm, td] = props.to.split('-').map(Number);
  const dot = props.localeTag.startsWith('de') ? '.' : '';
  return fm === tm
    ? `${fd}${dot} – ${td}${dot} ${months[tm! - 1]}`
    : `${fd}${dot} ${months[fm! - 1]} – ${td}${dot} ${months[tm! - 1]}`;
});
</script>

<template>
  <div class="intro" :style="{ opacity }">
    <div
      class="card"
      :style="{
        transform: `translateY(${(1 - enter) * 26}px)`,
        opacity: enter
      }"
    >
      <div class="eyebrow">{{ region }}</div>
      <h1>{{ title }}</h1>
      <div class="rule" :style="{ transform: `scaleX(${enter})` }" />
      <div class="period">{{ period }}</div>
    </div>
  </div>
</template>

<style scoped>
.intro {
  align-items: center;
  display: flex;
  inset: 0;
  justify-content: center;
  position: absolute;
}

.card {
  align-items: center;
  background: rgb(251 250 245 / 94%);
  border-radius: 4px;
  box-shadow: 0 26px 64px rgb(40 46 34 / 24%);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin: 0 56px;
  padding: 62px 50px;
}

.eyebrow {
  color: #e8331b;
  font:
    600 22px/1 Inter,
    system-ui,
    sans-serif;
  letter-spacing: 0.3em;
  text-transform: uppercase;
}

h1 {
  color: #1e2630;
  font:
    700 76px/1.06 Inter,
    system-ui,
    sans-serif;
  letter-spacing: -0.025em;
  margin: 0;
  text-align: center;
}

.rule {
  background: #e8331b;
  height: 3px;
  width: 180px;
}

.period {
  color: #6d6455;
  font:
    500 27px/1 Inter,
    system-ui,
    sans-serif;
  font-variant-numeric: tabular-nums;
}
</style>
