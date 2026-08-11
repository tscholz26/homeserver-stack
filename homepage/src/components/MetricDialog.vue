<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  averageOverBy,
  wattsOf,
  type MetricHistory,
  type MetricKey,
  type MetricPoint,
  type SystemInfo,
} from '@/composables/useSystem'

export type MetricName = 'cpu' | 'memory' | 'power'

const props = defineProps<{
  metric: MetricName | null
  history: MetricHistory | null
  power: SystemInfo['power']
}>()

const emit = defineEmits<{ close: [] }>()

const dialog = ref<HTMLDialogElement | null>(null)

// 'full' = alles, was aufgezeichnet ist (bis 24 Std), '60' = letzte Stunde
const choice = ref<'60' | 'full'>('full')

watch(
  () => props.metric,
  (metric) => {
    if (metric) dialog.value?.showModal()
    else dialog.value?.close()
  },
)

const CONFIG: Record<
  MetricName,
  { title: string; unit: string; key: MetricKey; fixedMax: number | null }
> = {
  cpu: { title: 'CPU-Auslastung', unit: '%', key: 'cpu', fixedMax: 100 },
  memory: { title: 'Arbeitsspeicher', unit: '%', key: 'mem', fixedMax: 100 },
  power: { title: 'Stromverbrauch', unit: 'W', key: 'watts', fixedMax: null },
}

const config = computed(() => (props.metric ? CONFIG[props.metric] : null))

// Beim Strom wird der gemessene CPU-Anteil hochgerechnet – dieselbe Regel wie
// auf der Karte.
function valueOf(point: MetricPoint): number | null {
  const key = config.value?.key
  if (!key) return null
  return props.metric === 'power' ? wattsOf(point, props.power) : point[key]
}

const all = computed(() => {
  if (!props.history) return []
  return props.history.points
    .map((point) => ({ t: point.t, value: valueOf(point) }))
    .filter((point): point is { t: number; value: number } => point.value !== null)
})

const series = computed(() =>
  choice.value === 'full'
    ? all.value
    : all.value.filter((point) => point.t >= Date.now() - 60 * 60_000),
)

const stats = computed(() => {
  if (series.value.length === 0) return null
  const values = series.value.map((point) => point.value)
  return {
    now: values[values.length - 1] ?? 0,
    hour: averageOverBy(props.history?.points, 60, valueOf),
    min: Math.min(...values),
    max: Math.max(...values),
    count: values.length,
  }
})

const BOX = { width: 640, height: 200, left: 46, right: 10, top: 10, bottom: 22 }

// Solange weniger als das ganze Fenster aufgezeichnet ist, spannt die Achse nur
// über die vorhandenen Daten – sonst wäre die Kurve ein Strich am rechten Rand.
// Mindestens 15 Minuten, damit die Achse nicht entartet.
const range = computed(() => {
  const now = Date.now()
  if (choice.value === '60') return { from: now - 60 * 60_000, now, span: 60 * 60_000 }

  const window = (props.history?.windowHours ?? 24) * 3600_000
  const first = series.value[0]?.t
  const from =
    first === undefined ? now - window : Math.max(now - window, Math.min(first, now - 15 * 60_000))
  return { from, now, span: now - from }
})

const spanLabel = computed(() => {
  const minutes = Math.round(range.value.span / 60_000)
  if (minutes < 90) return `letzte ${minutes} min`
  const hours = Math.round(minutes / 60)
  return `letzte ${hours} Std`
})

const scale = computed(() => {
  const { from, now, span } = range.value
  const peak = series.value.reduce((highest, point) => Math.max(highest, point.value), 0)
  const max = config.value?.fixedMax ?? Math.max(10, Math.ceil((peak * 1.15) / 5) * 5)
  const plotWidth = BOX.width - BOX.left - BOX.right
  const plotHeight = BOX.height - BOX.top - BOX.bottom
  return {
    max,
    x: (t: number) => BOX.left + ((t - from) / span) * plotWidth,
    y: (value: number) => BOX.top + plotHeight - (Math.min(value, max) / max) * plotHeight,
    baseline: BOX.top + plotHeight,
    from,
    now,
  }
})

const line = computed(() =>
  series.value.map((point) => `${scale.value.x(point.t)},${scale.value.y(point.value)}`).join(' '),
)

const area = computed(() => {
  if (series.value.length === 0) return ''
  const first = series.value[0]
  const last = series.value[series.value.length - 1]
  if (!first || !last) return ''
  return [
    `M ${scale.value.x(first.t)} ${scale.value.baseline}`,
    ...series.value.map((point) => `L ${scale.value.x(point.t)} ${scale.value.y(point.value)}`),
    `L ${scale.value.x(last.t)} ${scale.value.baseline}`,
    'Z',
  ].join(' ')
})

const gridLines = computed(() =>
  [0, 0.25, 0.5, 0.75, 1].map((share) => ({
    value: scale.value.max * share,
    y: scale.value.y(scale.value.max * share),
  })),
)

const timeLabels = computed(() =>
  [0, 0.5, 1].map((share) => {
    const t = scale.value.from + (scale.value.now - scale.value.from) * share
    return {
      x: scale.value.x(t),
      text: new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
    }
  }),
)

const format = (value: number) =>
  value.toLocaleString('de-DE', {
    minimumFractionDigits: config.value?.unit === 'W' ? 1 : 0,
    maximumFractionDigits: config.value?.unit === 'W' ? 1 : 0,
  })
</script>

<template>
  <dialog ref="dialog" class="modal" @close="emit('close')" @click.self="emit('close')">
    <div v-if="config" class="sheet">
      <header>
        <div>
          <p class="label">Verlauf · {{ spanLabel }}</p>
          <h2>{{ config.title }}</h2>
        </div>
        <div class="controls">
          <div class="switch" role="group" aria-label="Zeitraum">
            <button :class="{ active: choice === '60' }" @click="choice = '60'">60 min</button>
            <button :class="{ active: choice === 'full' }" @click="choice = 'full'">
              {{ history?.windowHours ?? 24 }} Std
            </button>
          </div>
          <button class="close" title="Schließen" @click="emit('close')">✕</button>
        </div>
      </header>

      <p v-if="series.length === 0" class="empty">
        <template v-if="all.length === 0">
          Noch keine Messwerte aufgezeichnet. Der Verlauf füllt sich mit einem Punkt pro Minute.
        </template>
        <template v-else>In der letzten Stunde wurde nichts aufgezeichnet.</template>
      </p>

      <template v-else>
        <svg :viewBox="`0 0 ${BOX.width} ${BOX.height}`" class="chart" role="img">
          <g class="grid">
            <template v-for="line in gridLines" :key="line.value">
              <line :x1="BOX.left" :x2="BOX.width - BOX.right" :y1="line.y" :y2="line.y" />
              <text :x="BOX.left - 8" :y="line.y + 4">{{ format(line.value) }}</text>
            </template>
          </g>

          <path :d="area" class="area" />
          <polyline :points="line" class="line" />

          <g class="times">
            <text v-for="mark in timeLabels" :key="mark.x" :x="mark.x" :y="BOX.height - 6">
              {{ mark.text }}
            </text>
          </g>
        </svg>

        <ul v-if="stats" class="stats">
          <li>
            <span>Jetzt</span>
            <strong>{{ format(stats.now) }} {{ config.unit }}</strong>
          </li>
          <li>
            <span>Ø 60 min</span>
            <strong>{{
              stats.hour === null ? '–' : `${format(stats.hour)} ${config.unit}`
            }}</strong>
          </li>
          <li>
            <span>Minimum</span>
            <strong>{{ format(stats.min) }} {{ config.unit }}</strong>
          </li>
          <li>
            <span>Maximum</span>
            <strong>{{ format(stats.max) }} {{ config.unit }}</strong>
          </li>
        </ul>

        <p class="foot">
          {{ stats?.count }} Messpunkte, je ein Mittelwert pro Minute.
          <template v-if="metric === 'power'">
            Kurve inklusive geschätzter Grundlast von {{ power?.baselineWatts }} W.
          </template>
        </p>
      </template>
    </div>
  </dialog>
</template>

<style scoped>
.modal {
  border: 1px solid var(--line);
  border-radius: 1.3rem;
  background: var(--bg);
  color: var(--text);
  padding: 0;
  width: min(44rem, calc(100vw - 2rem));
  box-shadow: 0 2rem 4rem -1rem rgba(16, 24, 40, 0.35);
}

.modal::backdrop {
  background: rgba(24, 28, 36, 0.45);
  backdrop-filter: blur(2px);
}

.sheet {
  padding: 1.3rem;
}

header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.label {
  margin: 0;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
}

h2 {
  margin: 0.2rem 0 0;
  font-size: 1.4rem;
  letter-spacing: -0.02em;
}

.controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.switch {
  display: flex;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0.15rem;
  background: var(--card);
}

.switch button {
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 0.78rem;
  font-weight: 700;
  padding: 0.25rem 0.7rem;
  cursor: pointer;
}

.switch button.active {
  background: color-mix(in srgb, var(--violet) 14%, transparent);
  color: var(--violet);
}

.close {
  border: 1px solid var(--line);
  border-radius: 0.6rem;
  background: var(--card);
  color: var(--muted);
  font: inherit;
  padding: 0.3rem 0.55rem;
  cursor: pointer;
}

.chart {
  width: 100%;
  height: auto;
  display: block;
}

.grid line {
  stroke: var(--line);
  stroke-width: 1;
}

.grid text {
  fill: var(--muted);
  font-size: 11px;
  text-anchor: end;
}

.times text {
  fill: var(--muted);
  font-size: 11px;
  text-anchor: middle;
}

.area {
  fill: color-mix(in srgb, var(--violet) 16%, transparent);
}

.line {
  fill: none;
  stroke: var(--violet);
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
  gap: 0.6rem;
  margin: 1rem 0 0;
  padding: 0;
  list-style: none;
}

.stats li {
  border: 1px solid var(--line);
  border-radius: 0.8rem;
  background: var(--card);
  padding: 0.6rem 0.7rem;
}

.stats span {
  display: block;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
}

.stats strong {
  font-size: 1.1rem;
  font-variant-numeric: tabular-nums;
}

.empty,
.foot {
  margin: 0.8rem 0 0;
  font-size: 0.82rem;
  color: var(--muted);
}
</style>
