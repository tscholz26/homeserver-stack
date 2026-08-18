<script setup lang="ts">
import { computed } from 'vue'
import { ringAnteil } from '@/utils/verschleiss'

const props = withDefaults(
  defineProps<{
    percent: number
    farbe: string
    groesse?: number
  }>(),
  { groesse: 84 },
)

const RADIUS = 42
const UMFANG = 2 * Math.PI * RADIUS

const gefuellt = computed(() => (ringAnteil(props.percent) / 100) * UMFANG)
</script>

<template>
  <svg
    class="ring"
    :width="groesse"
    :height="groesse"
    viewBox="0 0 100 100"
    role="img"
    :aria-label="`${Math.round(percent)} Prozent der Verschleißgrenze`"
  >
    <circle class="bahn" cx="50" cy="50" :r="RADIUS" />
    <circle
      class="fuellung"
      cx="50"
      cy="50"
      :r="RADIUS"
      :stroke="farbe"
      :stroke-dasharray="`${gefuellt} ${UMFANG}`"
    />
    <text x="50" y="50" class="wert" :fill="farbe">{{ Math.round(percent) }}</text>
    <text x="50" y="66" class="prozent">%</text>
  </svg>
</template>

<style scoped>
.ring {
  transform: rotate(-90deg);
  flex-shrink: 0;
}

.bahn,
.fuellung {
  fill: none;
  stroke-width: 9;
}

.bahn {
  stroke: color-mix(in srgb, var(--text) 8%, transparent);
}

.fuellung {
  stroke-linecap: round;
  transition: stroke-dasharray 0.3s ease;
}

/* Der Ring selbst ist gedreht, die Schrift darf das nicht mitmachen */
.wert,
.prozent {
  transform: rotate(90deg);
  transform-origin: 50% 50%;
  text-anchor: middle;
  dominant-baseline: middle;
  font-weight: 700;
}

.wert {
  font-size: 1.7rem;
}

.prozent {
  font-size: 0.85rem;
  font-weight: 600;
  fill: var(--muted);
}
</style>
