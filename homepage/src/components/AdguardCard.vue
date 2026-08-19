<script setup lang="ts">
import { computed } from 'vue'
import type { Adguard } from '@/composables/useAdguard'

const props = defineProps<{ adguard: Adguard | null; failed: boolean; now: Date }>()

// AdGuards eigene Oberfläche liegt auf Port 81 des Servers und ist nur im
// Heimnetz erreichbar – deshalb die feste Adresse statt der DuckDNS-Domain.
const ADGUARD_URL = 'http://192.168.178.34:81/'

const number = (value: number) => value.toLocaleString('de-DE')

const share = computed(() => {
  const data = props.adguard
  if (!data || data.queries === 0) return null
  return Math.round((data.blocked / data.queries) * 100)
})

const period = computed(() =>
  props.adguard?.unit === 'days' ? `${props.adguard.series.length} Tage` : '24 Stunden',
)

// Die Balken werden auf den größten Wert der Reihe skaliert – es geht um den
// Verlauf, nicht um absolute Höhen.
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

const summary = computed(() => {
  const data = props.adguard
  if (!data) return ''
  return `${number(data.blocked)}/${number(data.queries)} Anfragen geblockt`
})

const paused = computed(() => props.adguard?.protectionEnabled === false)

/** Wie lange die Pause noch läuft; ältere AdGuard-Versionen sagen das nicht. */
const resumesIn = computed(() => {
  const until = props.adguard?.protectionDisabledUntil
  if (!until) return null
  const seconds = Math.round((new Date(until).getTime() - props.now.getTime()) / 1000)
  if (seconds <= 0) return null
  const minutes = Math.floor(seconds / 60)
  if (minutes >= 60) return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
  return `${minutes}:${String(seconds % 60).padStart(2, '0')} min`
})

const alarm = computed(() => {
  if (!paused.value) return null
  return resumesIn.value ? `Schutz ist aus · ${resumesIn.value}` : 'Schutz ist aus'
})

// Von unterwegs führt der Knopf ins Leere – dann bleibt die Kachel eine reine
// Anzeige ohne Verweis.
const tag = computed(() => (props.adguard?.local ? 'a' : 'div'))
</script>

<template>
  <component
    :is="tag"
    class="tile guard"
    :class="{ paused }"
    :href="adguard?.local ? ADGUARD_URL : undefined"
    target="_blank"
    rel="noopener noreferrer"
  >
    <span class="badge">
      <svg
        viewBox="0 0 24 24"
        width="26"
        height="26"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3 4.5 6v5.5c0 4.4 3.1 8.3 7.5 9.5 4.4-1.2 7.5-5.1 7.5-9.5V6L12 3Z" />
        <path d="m8.8 11.9 2.2 2.2 4.2-4.2" />
      </svg>
    </span>

    <span class="meta">
      {{ adguard ? period : '' }}
      <span class="dot" :title="paused ? 'Schutz ist aus' : 'Schutz läuft'" />
    </span>

    <span class="text">
      <span class="tagline">{{ alarm ?? 'Netzschutz' }}</span>
      <h2>AdGuard Home</h2>

      <template v-if="adguard">
        <span class="stat">
          <strong>{{ share === null ? '–' : `${share} %` }}</strong>
          <span class="of" :title="summary">{{ summary }}</span>
        </span>

        <span class="chart" aria-hidden="true">
          <span v-for="bar in bars" :key="bar.key" class="bar" :title="bar.title">
            <span class="stack" :style="{ height: `${bar.height}%` }">
              <span v-if="bar.blocked > 0" class="hit" :style="{ height: `${bar.blocked}%` }" />
            </span>
          </span>
        </span>
      </template>

      <span v-else class="fallback">
        {{ failed ? 'Keine Verbindung zu AdGuard.' : 'Lade Zahlen …' }}
      </span>
    </span>

    <span v-if="adguard?.local" class="go">
      Öffnen
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M5 12h13M13 6l6 6-6 6" />
      </svg>
    </span>
  </component>
</template>

<style scoped>
/* Gleiche Geometrie wie die Dienst-Kacheln, damit sie in derselben Reihe nicht
   aus dem Rahmen fällt – nur ohne Lichtschein, sie ist ja kein Dienst. */
.guard {
  --accent: #0f766e;
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    'badge meta'
    'text  text'
    'go    go';
  padding: 1.4rem;
  border: 1px solid var(--line);
  border-radius: 1.5rem;
  background: var(--card);
  box-shadow: var(--shadow);
  color: inherit;
  text-decoration: none;
  transition:
    transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1),
    border-color 0.25s ease,
    box-shadow 0.25s ease;
}

a.guard:hover,
a.guard:focus-visible {
  transform: translateY(-6px);
  border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  box-shadow:
    var(--shadow),
    0 1.2rem 2.6rem -1.4rem color-mix(in srgb, var(--accent) 70%, transparent);
}

.guard.paused {
  --accent: #b91c1c;
}

.badge {
  grid-area: badge;
  display: grid;
  place-items: center;
  width: 3.2rem;
  height: 3.2rem;
  border-radius: 1rem;
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
  transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
}

a.guard:hover .badge {
  transform: rotate(-8deg) scale(1.06);
}

/* Wie bei den Dienst-Kacheln sagt der Punkt den Zustand; das Wort daneben ist
   der Zeitraum, für den die Zahlen unten gelten. */
.meta {
  grid-area: meta;
  justify-self: end;
  align-self: start;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: #16a34a;
  box-shadow: 0 0 0 0.25rem rgba(22, 163, 74, 0.18);
}

.paused .dot {
  background: #dc2626;
  box-shadow: 0 0 0 0.25rem rgba(220, 38, 38, 0.18);
  animation: blink 1.6s ease-in-out infinite;
}

@keyframes blink {
  50% {
    opacity: 0.3;
  }
}

.text {
  grid-area: text;
  display: flex;
  flex-direction: column;
  min-width: 0;
  margin-top: 0.9rem;
}

.tagline {
  display: block;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--accent);
}

h2 {
  margin: 0;
  font-size: 1.5rem;
  letter-spacing: -0.02em;
}

/* Eine Zeile: der Anteil führt, die Zahlen daneben erklären ihn. Beides bleibt
   umbruchfrei, sonst wächst die Kachel über die der Dienste hinaus. */
.stat {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin-top: 0.2rem;
  min-width: 0;
}

.stat strong {
  flex: none;
  font-size: 1.3rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.2;
  white-space: nowrap;
  color: var(--accent);
}

.of {
  min-width: 0;
  overflow: hidden;
  font-size: 0.78rem;
  line-height: 1.2;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--muted);
}

/* Ein Balken je Stunde: die Höhe sind die Anfragen, der eingefärbte Fuß der
   geblockte Anteil daran. Der Verlauf nimmt sich, was in der Kachel übrig
   bleibt, und gibt es wieder her, wenn es eng wird. */
.chart {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  flex: 1;
  min-height: 1.1rem;
  max-height: 2.2rem;
  margin-top: 0.4rem;
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
  background: color-mix(in srgb, var(--accent) 26%, transparent);
}

.hit {
  position: absolute;
  inset: auto 0 0 0;
  min-height: 2px;
  border-radius: 2px;
  background: var(--accent);
}

.fallback {
  display: block;
  margin-top: 0.7rem;
  font-size: 0.9rem;
  color: var(--muted);
}

.go {
  grid-area: go;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.7rem;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--accent);
}

.go svg {
  transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
}

a.guard:hover .go svg,
a.guard:focus-visible .go svg {
  transform: translateX(0.35rem);
}

/* Auf dem Handy wie die Dienst-Kacheln eine flache Zeile – der Verlauf ist
   dort Beiwerk und fliegt raus, die Zahl bleibt. */
@media (max-width: 34rem) {
  .guard {
    grid-template-columns: auto 1fr auto;
    grid-template-rows: auto;
    grid-template-areas: 'badge text meta';
    align-items: center;
    gap: 0 0.9rem;
    padding: 1rem 1.1rem;
  }

  .badge {
    width: 2.9rem;
    height: 2.9rem;
    border-radius: 0.9rem;
  }

  .text {
    margin-top: 0;
    min-width: 0;
  }

  h2 {
    font-size: 1.25rem;
  }

  .stat {
    margin-top: 0.15rem;
    gap: 0.45rem;
  }

  .stat strong {
    font-size: 1.15rem;
  }

  .chart,
  .go {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .paused .dot {
    animation: none;
  }

  .guard {
    transition: none;
  }

  a.guard:hover {
    transform: none;
  }
}
</style>
