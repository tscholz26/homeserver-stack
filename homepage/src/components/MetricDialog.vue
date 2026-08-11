<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import {
  averageOverBy,
  wattsOf,
  yearlyCost,
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

// 'live' = die letzte Minute im Sekundentakt, 'full' = alles Aufgezeichnete,
// sonst das gewählte Minutenfenster
type Choice = 'live' | '60' | '480' | 'full'
const CHOICES: { key: Choice; label: string }[] = [
  { key: 'live', label: '60 s' },
  { key: '60', label: '60 min' },
  { key: '480', label: '8 Std' },
]
const choice = ref<Choice>('full')
const minutes = (key: Choice) => (key === 'full' || key === 'live' ? null : Number(key))

// Die Sekundenwerte werden nicht gespeichert, sondern erst beim Öffnen des
// Reiters gesammelt – wie im Taskmanager. Der Puffer hält eine Minute.
const LIVE_SECONDS = 60
const liveBuffer = ref<MetricPoint[]>([])
let liveTimer: ReturnType<typeof setInterval> | undefined

async function pullLive() {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}api/live`, { cache: 'no-store' })
    if (!response.ok) return
    const point: MetricPoint = await response.json()
    const cutoff = Date.now() - LIVE_SECONDS * 1000
    liveBuffer.value = [...liveBuffer.value.filter((entry) => entry.t >= cutoff), point]
  } catch {
    // Einzelne Aussetzer einfach überspringen
  }
}

function stopLive() {
  if (liveTimer) clearInterval(liveTimer)
  liveTimer = undefined
}

watch(
  [() => props.metric, choice],
  ([metric, current]) => {
    stopLive()
    if (!metric || current !== 'live') return
    liveBuffer.value = []
    pullLive()
    liveTimer = setInterval(pullLive, 1000)
  },
  { immediate: true },
)

onUnmounted(stopLive)

watch(
  () => props.metric,
  (metric) => {
    if (metric) dialog.value?.showModal()
    else dialog.value?.close()
  },
)

const CONFIG: Record<
  MetricName,
  { title: string; unit: string; key: MetricKey; cap: number | null }
> = {
  cpu: { title: 'CPU-Auslastung', unit: '%', key: 'cpu', cap: 100 },
  memory: { title: 'Arbeitsspeicher', unit: '%', key: 'mem', cap: 100 },
  power: { title: 'Stromverbrauch', unit: 'W', key: 'watts', cap: null },
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
  const points = choice.value === 'live' ? liveBuffer.value : props.history?.points
  if (!points) return []
  return points
    .map((point) => ({ t: point.t, value: valueOf(point) }))
    .filter((point): point is { t: number; value: number } => point.value !== null)
})

const series = computed(() => {
  const window = minutes(choice.value)
  if (window === null) return all.value
  const from = Date.now() - window * 60_000
  return all.value.filter((point) => point.t >= from)
})

const stats = computed(() => {
  if (series.value.length === 0) return null
  const values = series.value.map((point) => point.value)
  return {
    now: values[values.length - 1] ?? 0,
    // Der Schnitt gilt für das, was gerade oben eingestellt ist
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
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
  if (choice.value === 'live') {
    // Der rechte Rand ist der jüngste Messwert, nicht Date.now(): nur so hängt
    // dieses computed am Puffer und das Fenster wandert jede Sekunde mit.
    const span = LIVE_SECONDS * 1000
    const newest = liveBuffer.value[liveBuffer.value.length - 1]?.t ?? now
    return { from: newest - span, now: newest, span }
  }

  const chosen = minutes(choice.value)
  if (chosen !== null) {
    const span = chosen * 60_000
    return { from: now - span, now, span }
  }

  const window = (props.history?.windowHours ?? 24) * 3600_000
  const first = series.value[0]?.t
  const from =
    first === undefined ? now - window : Math.max(now - window, Math.min(first, now - 15 * 60_000))
  return { from, now, span: now - from }
})

const spanText = computed(() => {
  const span = range.value.span
  if (span < 120_000) return `${Math.round(span / 1000)} s`
  const minutes = Math.round(span / 60_000)
  if (minutes < 120) return `${minutes} min`
  return `${Math.round(minutes / 60)} Std`
})

// Die Achse endet knapp über dem höchsten Wert, sonst liegt die Kurve platt am
// Boden. Die Schrittweite kommt aus einer Liste runder Zahlen und wird so
// gewählt, dass höchstens sieben Linien entstehen.
const NICE_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]

function stepFor(span: number, intervals: number) {
  return NICE_STEPS.find((step) => span / step <= intervals) ?? span / intervals
}

/**
 * Von 0 an, damit die Größenordnung stimmt – außer die Werte liegen alle in der
 * obersten Hälfte. Dann wäre die untere Hälfte totes Bild und die eigentliche
 * Schwankung unsichtbar (typisch beim Stromverbrauch mit fester Grundlast).
 * In dem Fall wird hineingezoomt und die Fläche weggelassen, weil eine Fläche
 * über einer Nulllinie, die nicht null ist, in die Irre führt.
 */
function axis(low: number, peak: number, cap: number | null) {
  if (peak > 0 && low > peak * 0.5) {
    const step = stepFor(Math.max(peak - low, peak * 0.02), 5)
    const min = Math.floor(low / step) * step
    const max = Math.max(Math.ceil(peak / step) * step, min + step)
    return { min, max, step, zoomed: true }
  }

  const headroom = Math.max(peak * 1.15, peak + 1, cap === null ? 5 : 10)
  const target = cap === null ? headroom : Math.min(cap, headroom)
  const step = stepFor(target, 7)
  return { min: 0, max: Math.ceil(target / step) * step, step, zoomed: false }
}

const scale = computed(() => {
  const { from, now, span } = range.value
  const values = series.value.map((point) => point.value)
  const peak = values.length > 0 ? Math.max(...values) : 0
  const low = values.length > 0 ? Math.min(...values) : 0
  const { min, max, step, zoomed } = axis(low, peak, config.value?.cap ?? null)
  const plotWidth = BOX.width - BOX.left - BOX.right
  const plotHeight = BOX.height - BOX.top - BOX.bottom
  return {
    min,
    max,
    step,
    zoomed,
    x: (t: number) => BOX.left + ((t - from) / span) * plotWidth,
    y: (value: number) =>
      BOX.top +
      plotHeight -
      ((Math.min(Math.max(value, min), max) - min) / (max - min)) * plotHeight,
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

const gridLines = computed(() => {
  const { min, max, step } = scale.value
  const lines = []
  for (let value = min; value <= max + step / 2; value += step) {
    lines.push({ value: Math.round(value * 100) / 100, y: scale.value.y(value) })
  }
  return lines
})

const timeLabels = computed(() =>
  [0, 0.5, 1].map((share) => {
    const t = scale.value.from + (scale.value.now - scale.value.from) * share
    return {
      x: scale.value.x(t),
      text: new Date(t).toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit',
        ...(range.value.span <= 300_000 ? { second: '2-digit' } : {}),
      }),
    }
  }),
)

const watt = (value: number) =>
  value.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

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
          <p class="label">Verlauf · letzte {{ spanText }}</p>
          <h2>{{ config.title }}</h2>
        </div>
        <div class="controls">
          <div class="switch" role="group" aria-label="Zeitraum">
            <button
              v-for="option in CHOICES"
              :key="option.key"
              :class="{ active: choice === option.key }"
              @click="choice = option.key"
            >
              {{ option.label }}
            </button>
            <button :class="{ active: choice === 'full' }" @click="choice = 'full'">
              {{ history?.windowHours ?? 24 }} Std
            </button>
          </div>
          <button class="close" title="Schließen" @click="emit('close')">✕</button>
        </div>
      </header>

      <p v-if="series.length === 0" class="empty">
        <template v-if="choice === 'live'">Sammelt Messwerte …</template>
        <template v-else-if="all.length === 0">
          Noch keine Messwerte aufgezeichnet. Der Verlauf füllt sich mit einem Punkt pro Minute.
        </template>
        <template v-else>In diesem Zeitraum wurde nichts aufgezeichnet.</template>
      </p>

      <template v-else>
        <svg :viewBox="`0 0 ${BOX.width} ${BOX.height}`" class="chart" role="img">
          <g class="grid">
            <template v-for="line in gridLines" :key="line.value">
              <line :x1="BOX.left" :x2="BOX.width - BOX.right" :y1="line.y" :y2="line.y" />
              <text :x="BOX.left - 8" :y="line.y + 4">{{ format(line.value) }}</text>
            </template>
          </g>

          <path v-if="!scale.zoomed" :d="area" class="area" />
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
            <span>Ø {{ spanText }}</span>
            <strong>{{ format(stats.mean) }} {{ config.unit }}</strong>
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
          <template v-if="choice === 'live'">
            {{ stats?.count }} Messwerte, jede Sekunde einer – nur im Fenster, nicht gespeichert.
          </template>
          <template v-else>{{ stats?.count }} Messpunkte, je ein Mittelwert pro Minute.</template>
          <template v-if="metric === 'power' && stats && power">
            Der Schnitt entspricht {{ yearlyCost(stats.mean, power.pricePerKwh) }}.
          </template>
          <template v-if="metric === 'power'">
            Kurve inklusive geschätzter Grundlast von
            {{ power ? watt(power.baselineWatts) : '–' }} W.
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
