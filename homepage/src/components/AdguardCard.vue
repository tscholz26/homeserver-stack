<script setup lang="ts">
import { computed } from 'vue'
import type { Adguard } from '@/composables/useAdguard'

const props = defineProps<{
  adguard: Adguard | null
  failed: boolean
  pending: boolean
  now: Date
}>()

const emit = defineEmits<{ protection: [minutes: number | null] }>()

const PAUSE_MINUTES = 5

const number = (value: number) => value.toLocaleString('de-DE')

const share = computed(() => {
  const data = props.adguard
  if (!data || data.queries === 0) return null
  return Math.round((data.blocked / data.queries) * 100)
})

const period = computed(() =>
  props.adguard?.unit === 'days'
    ? `letzte ${props.adguard.series.length} Tage`
    : 'letzte 24 Stunden',
)

// Die Balken werden auf den größten Wert der Reihe skaliert – es geht um den
// Tagesverlauf, nicht um absolute Höhen.
const peak = computed(() => Math.max(1, ...(props.adguard?.series ?? []).map((p) => p.queries)))

const bars = computed(() =>
  (props.adguard?.series ?? []).map((point, index, all) => {
    const stepsBack = all.length - 1 - index
    const at = new Date(props.now)
    if (props.adguard?.unit === 'days') at.setDate(at.getDate() - stepsBack)
    else at.setHours(at.getHours() - stepsBack)

    const when =
      props.adguard?.unit === 'days'
        ? at.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })
        : `${at.getHours()} Uhr`

    return {
      key: index,
      height: (point.queries / peak.value) * 100,
      blocked: point.queries > 0 ? (point.blocked / point.queries) * 100 : 0,
      title: `${when}: ${number(point.queries)} Anfragen, davon ${number(point.blocked)} geblockt`,
    }
  }),
)

// Erste, mittlere und letzte Beschriftung unter dem Verlauf
const axis = computed(() => {
  const first = bars.value[0]?.title.split(':')[0] ?? ''
  const middle = bars.value[Math.floor(bars.value.length / 2)]?.title.split(':')[0] ?? ''
  return [first, middle, 'jetzt']
})

const paused = computed(() => props.adguard?.protectionEnabled === false)

const resumesIn = computed(() => {
  const until = props.adguard?.protectionDisabledUntil
  if (!until) return null
  const seconds = Math.round((new Date(until).getTime() - props.now.getTime()) / 1000)
  if (seconds <= 0) return null
  const minutes = Math.floor(seconds / 60)
  if (minutes >= 60) return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
  return `${minutes}:${String(seconds % 60).padStart(2, '0')} min`
})
</script>

<template>
  <div class="card guard" :class="{ paused }">
    <p class="label">
      Netzschutz
      <span class="period">{{ adguard ? period : '' }}</span>
    </p>

    <template v-if="paused">
      <p class="headline warn">
        <span class="beacon" />
        Schutz pausiert
      </p>
      <p class="sub">
        {{ resumesIn ? `läuft in ${resumesIn} wieder an` : 'bleibt aus, bis du ihn anschaltest' }}
      </p>
      <button
        v-if="adguard?.canPause"
        class="action on"
        :disabled="pending"
        @click="emit('protection', null)"
      >
        Jetzt wieder anschalten
      </button>
    </template>

    <template v-else-if="adguard">
      <p class="headline">
        {{ share === null ? '–' : `${share} %` }}
        <span class="unit">geblockt</span>
      </p>
      <p class="sub">{{ number(adguard.blocked) }} von {{ number(adguard.queries) }} Anfragen</p>

      <div class="chart" aria-hidden="true">
        <span v-for="bar in bars" :key="bar.key" class="bar" :title="bar.title">
          <span class="stack" :style="{ height: `${bar.height}%` }">
            <span class="hit" :style="{ height: `${bar.blocked}%` }" />
          </span>
        </span>
      </div>
      <p class="axis">
        <span v-for="(tick, index) in axis" :key="index">{{ tick }}</span>
      </p>

      <button
        v-if="adguard.canPause"
        class="action"
        :disabled="pending"
        @click="emit('protection', PAUSE_MINUTES)"
      >
        {{ PAUSE_MINUTES }} Minuten pausieren
      </button>
    </template>

    <p v-else-if="failed" class="fallback">Keine Verbindung zu AdGuard.</p>
    <p v-else class="fallback">Lade Netzschutz …</p>
  </div>
</template>

<style scoped>
/* Wie die Wetterkarte: die Reihe zieht die Karte auf Höhe, der Knopf soll sich
   dann unten absetzen statt in der Mitte zu hängen. */
.guard {
  --accent: #0f766e;
  display: flex;
  flex-direction: column;
}

.guard.paused {
  --accent: #b91c1c;
  border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
}

.label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin: 0 0 0.7rem;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
}

.period {
  letter-spacing: 0.04em;
  text-transform: none;
}

.headline {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin: 0;
  font-size: 2.4rem;
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 1;
}

.headline.warn {
  align-items: center;
  font-size: 1.35rem;
  color: var(--accent);
}

.unit {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--muted);
}

.beacon {
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
  animation: blink 1.6s ease-in-out infinite;
}

@keyframes blink {
  50% {
    opacity: 0.25;
  }
}

.sub {
  margin: 0.5rem 0 0;
  font-size: 0.85rem;
  color: var(--muted);
}

/* Ein Balken je Stunde: die Höhe ist die Zahl der Anfragen, der eingefärbte
   Fuß der geblockte Anteil daran. */
.chart {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 3.2rem;
  margin: auto 0 0;
  padding-top: 0.9rem;
}

.bar {
  flex: 1;
  display: flex;
  align-items: flex-end;
  height: 100%;
  min-width: 2px;
}

.stack {
  position: relative;
  width: 100%;
  min-height: 1px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--accent) 22%, transparent);
}

.hit {
  position: absolute;
  inset: auto 0 0 0;
  border-radius: 2px;
  background: var(--accent);
}

.axis {
  display: flex;
  justify-content: space-between;
  margin: 0.35rem 0 0;
  font-size: 0.7rem;
  color: var(--muted);
}

.action {
  margin-top: 0.9rem;
  padding: 0.55rem 0.9rem;
  border: 1px solid var(--line);
  border-radius: 0.7rem;
  background: transparent;
  font: inherit;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--muted);
  cursor: pointer;
  transition:
    border-color 0.25s ease,
    color 0.25s ease;
}

.action:hover:not(:disabled),
.action:focus-visible:not(:disabled) {
  border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  color: var(--accent);
}

/* Wieder anschalten ist der wichtigere Knopf – der darf auffallen */
.action.on {
  margin-top: auto;
  border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  color: var(--accent);
}

.action:disabled {
  opacity: 0.5;
  cursor: progress;
}

.fallback {
  margin: 0;
  font-size: 0.9rem;
  color: var(--muted);
}

@media (prefers-reduced-motion: reduce) {
  .beacon {
    animation: none;
  }
}
</style>
