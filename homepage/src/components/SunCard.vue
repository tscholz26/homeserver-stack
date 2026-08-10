<script setup lang="ts">
import { computed } from 'vue'
import type { Weather } from '@/composables/useWeather'

const props = defineProps<{ weather: Weather | null; now: Date }>()

const ARC = { cx: 60, cy: 58, r: 46 }

const progress = computed(() => {
  if (!props.weather) return 0
  const { sunrise, sunset } = props.weather
  const span = sunset.getTime() - sunrise.getTime()
  if (span <= 0) return 0
  const done = (props.now.getTime() - sunrise.getTime()) / span
  return Math.min(1, Math.max(0, done))
})

// Halbkreis von links (Aufgang) nach rechts (Untergang)
const sun = computed(() => {
  const angle = Math.PI * (1 - progress.value)
  return {
    x: ARC.cx + ARC.r * Math.cos(angle),
    y: ARC.cy - ARC.r * Math.sin(angle),
  }
})

const isDay = computed(() => progress.value > 0 && progress.value < 1)

const remaining = computed(() => {
  if (!props.weather) return ''
  const target = isDay.value ? props.weather.sunset : props.weather.sunrise
  const minutes = Math.round(Math.abs(target.getTime() - props.now.getTime()) / 60_000)
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  const duration = hours > 0 ? `${hours} h ${rest} min` : `${rest} min`
  return isDay.value ? `noch ${duration} Tageslicht` : `Sonnenaufgang in ${duration}`
})

const time = (date: Date) =>
  date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <div class="card sun">
    <p class="label">Sonne</p>

    <template v-if="weather">
      <svg viewBox="0 0 120 72" class="arc" aria-hidden="true">
        <path d="M14 58a46 46 0 0 1 92 0" class="track" />
        <!-- pathLength="1" macht die Strichelung direkt zum Tagesfortschritt -->
        <path
          d="M14 58a46 46 0 0 1 92 0"
          class="travelled"
          path-length="1"
          :style="{ strokeDasharray: `${progress} 1` }"
        />
        <circle :cx="sun.x" :cy="sun.y" r="6" class="disc" :class="{ night: !isDay }" />
        <path d="M6 58h108" class="horizon" />
      </svg>

      <div class="times">
        <span
          ><strong>{{ time(weather.sunrise) }}</strong> auf</span
        >
        <span
          ><strong>{{ time(weather.sunset) }}</strong> unter</span
        >
      </div>
      <p class="hint">{{ remaining }}</p>
    </template>

    <p v-else class="hint">Warte auf Wetterdaten …</p>
  </div>
</template>

<style scoped>
.label {
  margin: 0 0 0.7rem;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
}

.sun {
  --accent: #fbbf24;
}

.arc {
  width: 100%;
  max-width: 13rem;
  margin: 0 auto;
  display: block;
  overflow: visible;
}

.track {
  fill: none;
  stroke: var(--line);
  stroke-width: 2;
  stroke-dasharray: 3 5;
  stroke-linecap: round;
}

.travelled {
  fill: none;
  stroke: var(--accent);
  stroke-width: 2.5;
  stroke-linecap: round;
  opacity: 0.75;
}

.horizon {
  fill: none;
  stroke: var(--line);
  stroke-width: 1.5;
}

.disc {
  fill: var(--accent);
  filter: drop-shadow(0 0 0.5rem color-mix(in srgb, var(--accent) 70%, transparent));
}

.disc.night {
  fill: #64748b;
  filter: none;
}

.times {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: 0.4rem;
  font-size: 0.85rem;
  color: var(--muted);
}

.times strong {
  color: inherit;
  font-size: 1rem;
  font-weight: 800;
  margin-right: 0.2rem;
}

.hint {
  margin: 0.6rem 0 0;
  font-size: 0.85rem;
  color: var(--muted);
}
</style>
