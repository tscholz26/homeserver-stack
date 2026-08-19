import { onUnmounted, ref } from 'vue'

export interface AdguardPoint {
  queries: number
  blocked: number
}

export interface Adguard {
  protectionEnabled: boolean
  /** Ende der Pause als ISO-Zeit; ältere AdGuard-Versionen melden das nicht */
  protectionDisabledUntil: string | null
  /** Ein Punkt der Reihe ist eine Stunde oder ein Tag – je nach Aufbewahrung */
  unit: 'hours' | 'days'
  queries: number
  blocked: number
  series: AdguardPoint[]
  /** Ob die Anfrage aus dem Heimnetz kam – nur von dort ist AdGuard erreichbar */
  local: boolean
}

const REFRESH_MS = 30 * 1000

interface Answer extends Partial<Adguard> {
  configured?: boolean
  error?: string
}

/**
 * Netzschutz-Zahlen aus AdGuard Home, über den eigenen Server geholt (der hält
 * das Passwort). Ist AdGuard nicht eingerichtet, bleibt `available` falsch und
 * die Startseite zeigt die Kachel gar nicht erst.
 */
export function useAdguard() {
  const adguard = ref<Adguard | null>(null)
  const available = ref(true)
  const failed = ref(false)

  function apply(data: Answer) {
    if (data.configured === false) {
      available.value = false
      adguard.value = null
      return
    }
    if (!data.series) throw new Error(data.error ?? 'Unerwartete Antwort')

    adguard.value = {
      protectionEnabled: data.protectionEnabled !== false,
      protectionDisabledUntil: data.protectionDisabledUntil ?? null,
      unit: data.unit === 'days' ? 'days' : 'hours',
      queries: data.queries ?? 0,
      blocked: data.blocked ?? 0,
      series: data.series,
      local: data.local === true,
    }
    failed.value = false
  }

  async function load() {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/adguard`, { cache: 'no-store' })
      apply(await response.json())
    } catch {
      // Ein Aussetzer soll die schon angezeigten Zahlen nicht wegräumen
      failed.value = adguard.value === null
    }
  }

  load()
  const timer = setInterval(load, REFRESH_MS)
  onUnmounted(() => clearInterval(timer))

  return { adguard, available, failed }
}
