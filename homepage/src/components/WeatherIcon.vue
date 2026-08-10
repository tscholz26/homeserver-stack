<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ code: string; size?: number }>()

type Kind = 'clear' | 'partly' | 'cloudy' | 'rain' | 'thunder' | 'snow' | 'mist'

// OpenWeatherMap-Codes wie `04d` – die ersten zwei Ziffern reichen. Eigene
// Icons statt der Bilder von openweathermap.org: kein externer Request und
// alles im gleichen Strichstil wie der Rest der Seite.
const KINDS: Record<string, Kind> = {
  '01': 'clear',
  '02': 'partly',
  '03': 'cloudy',
  '04': 'cloudy',
  '09': 'rain',
  '10': 'rain',
  '11': 'thunder',
  '13': 'snow',
  '50': 'mist',
}

const kind = computed<Kind>(() => KINDS[props.code.slice(0, 2)] ?? 'cloudy')
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    :width="size ?? 40"
    :height="size ?? 40"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="kind === 'clear'">
      <circle cx="12" cy="12" r="4.6" />
      <path d="M12 1.5v2.4M12 20.1v2.4M4.6 4.6l1.7 1.7M17.7 17.7l1.7 1.7M1.5 12h2.4M20.1 12h2.4" />
      <path d="M4.6 19.4l1.7-1.7M17.7 6.3l1.7-1.7" />
    </template>

    <template v-else-if="kind === 'partly'">
      <circle cx="8" cy="7.5" r="3.2" />
      <path d="M8 1.8v1.6M2.3 7.5h1.6M4 3.5l1.1 1.1M12 3.5l-1.1 1.1" />
      <path d="M18 22h-6.5a4.5 4.5 0 0 1-.5-8.97A5.5 5.5 0 0 1 21.8 15A3.5 3.5 0 0 1 18 22z" />
    </template>

    <path v-else-if="kind === 'cloudy'" d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />

    <template v-else-if="kind === 'rain'">
      <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" />
      <path d="M8 14v4M12 16v4M16 14v4" />
    </template>

    <template v-else-if="kind === 'thunder'">
      <path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9" />
      <path d="M13 11l-4 6h6l-4 6" />
    </template>

    <template v-else-if="kind === 'snow'">
      <path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25" />
      <path d="M8 16h.01M8 20h.01M12 18h.01M12 22h.01M16 16h.01M16 20h.01" />
    </template>

    <path v-else d="M3 8h18M6 12h12M4 16h16M8 20h8" />
  </svg>
</template>
