import { computed, onUnmounted, ref } from 'vue'

const GREETINGS: [hour: number, text: string][] = [
  [22, 'Gute Nacht'],
  [18, 'Guten Abend'],
  [11, 'Guten Tag'],
  [5, 'Guten Morgen'],
  [0, 'Noch wach?'],
]

/** Sekundengenaue Uhr für den Hero-Bereich. */
export function useClock() {
  const now = ref(new Date())
  const timer = setInterval(() => (now.value = new Date()), 1000)
  onUnmounted(() => clearInterval(timer))

  const time = computed(() =>
    now.value.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
  )

  const date = computed(() =>
    now.value.toLocaleDateString('de-DE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
  )

  const greeting = computed(
    () => GREETINGS.find(([hour]) => now.value.getHours() >= hour)?.[1] ?? 'Hallo',
  )

  return { now, time, date, greeting }
}
