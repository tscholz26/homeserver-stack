import { onUnmounted, ref } from 'vue'

export interface Weather {
  city: string
  temp: number
  feelsLike: number
  description: string
  /** OpenWeatherMap-Code wie `04d`, daraus wählen wir unser eigenes Icon */
  icon: string
  humidity: number
  wind: number
  /** Grad, aus der der Wind kommt; fehlt bei Windstille manchmal */
  windDeg: number | null
  sunrise: Date
  sunset: Date
}

interface OwmResponse {
  name?: string
  cod?: number | string
  weather?: { description?: string; icon?: string }[]
  main?: { temp?: number; feels_like?: number; humidity?: number }
  wind?: { speed?: number; deg?: number }
  sys?: { sunrise?: number; sunset?: number }
}

const REFRESH_MS = 10 * 60 * 1000

/**
 * Live-Wetter aus der vorhandenen Wetter-API des Servers (`/home/weather`).
 * Fällt die API aus, bleibt `weather` leer und die Karte zeigt einen Hinweis –
 * die Startseite selbst funktioniert ohne sie weiter.
 */
export function useWeather() {
  const weather = ref<Weather | null>(null)
  const failed = ref(false)

  async function load() {
    try {
      const response = await fetch('/home/weather')
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const data: OwmResponse = await response.json()
      const current = data.weather?.[0]
      if (data.main?.temp === undefined || !current) throw new Error('Unerwartete Antwort')

      weather.value = {
        city: data.name ?? 'Zuhause',
        temp: data.main.temp,
        feelsLike: data.main.feels_like ?? data.main.temp,
        description: current.description ?? '',
        icon: current.icon ?? '01d',
        humidity: data.main.humidity ?? 0,
        wind: data.wind?.speed ?? 0,
        windDeg: typeof data.wind?.deg === 'number' ? data.wind.deg : null,
        sunrise: new Date((data.sys?.sunrise ?? 0) * 1000),
        sunset: new Date((data.sys?.sunset ?? 0) * 1000),
      }
      failed.value = false
    } catch {
      failed.value = weather.value === null
    }
  }

  load()
  const timer = setInterval(load, REFRESH_MS)
  onUnmounted(() => clearInterval(timer))

  return { weather, failed }
}
