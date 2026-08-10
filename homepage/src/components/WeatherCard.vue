<script setup lang="ts">
import WeatherIcon from '@/components/WeatherIcon.vue'
import type { Weather } from '@/composables/useWeather'

defineProps<{ weather: Weather | null; failed: boolean }>()

const round = (value: number) => Math.round(value)
const kmh = (metersPerSecond: number) => Math.round(metersPerSecond * 3.6)
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

// Die Zahlen kommen aus der eigenen Wetter-API, der Klick führt aber direkt
// aufs Regenradar von WetterOnline. Die Stadt steht fest, weil die Wetter-API
// auf dem Server ebenfalls fest auf Leipzig zeigt.
const RADAR_URL = 'https://www.wetteronline.de/regenradar/leipzig'
</script>

<template>
  <a class="card weather" :href="RADAR_URL" target="_blank" rel="noopener noreferrer">
    <p class="label">
      Wetter
      <span class="ext">
        Regenradar
        <svg
          viewBox="0 0 24 24"
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M7 17 17 7M9 7h8v8" />
        </svg>
      </span>
    </p>

    <template v-if="weather">
      <div class="now">
        <span class="icon"><WeatherIcon :code="weather.icon" :size="44" /></span>
        <span class="temp">{{ round(weather.temp) }}<span class="unit">°C</span></span>
      </div>
      <p class="desc">{{ capitalize(weather.description) }} · {{ weather.city }}</p>
      <ul class="chips">
        <li>gefühlt {{ round(weather.feelsLike) }}°</li>
        <li>{{ weather.humidity }}% Luft</li>
        <li>{{ kmh(weather.wind) }} km/h</li>
      </ul>
    </template>

    <p v-else-if="failed" class="fallback">Keine Verbindung zur Wetter-API.</p>
    <p v-else class="fallback">Lade Wetter …</p>
  </a>
</template>

<style scoped>
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

/* Weist darauf hin, dass es hier vom Server weg nach draußen geht */
.ext {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--accent);
}

/* Die Karte wird von der Grid-Reihe auf Höhe gezogen – die Chips setzen sich
   dann unten ab, statt eine Lücke stehen zu lassen. */
.card.weather {
  --accent: #60a5fa;
  display: flex;
  flex-direction: column;
}

.now {
  display: flex;
  align-items: center;
  gap: 0.9rem;
}

.icon {
  color: var(--accent);
}

.temp {
  font-size: 2.6rem;
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 1;
}

.unit {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--muted);
  margin-left: 0.15rem;
}

.desc {
  margin: 0.7rem 0 0;
  font-size: 0.95rem;
  font-weight: 600;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: auto 0 0;
  padding: 0.9rem 0 0;
  list-style: none;
}

.chips li {
  font-size: 0.75rem;
  padding: 0.25rem 0.55rem;
  border-radius: 999px;
  border: 1px solid var(--line);
  color: var(--muted);
}

.fallback {
  margin: 0;
  font-size: 0.9rem;
  color: var(--muted);
}
</style>
