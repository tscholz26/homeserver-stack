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
  /** Nur aus dem Heimnetz darf der Schutz geschaltet werden */
  canPause: boolean
}

const REFRESH_MS = 30 * 1000

interface Answer extends Partial<Adguard> {
  configured?: boolean
  error?: string
}

/**
 * Netzschutz-Zahlen aus AdGuard Home, über den eigenen Server geholt (der hält
 * das Passwort). Ist AdGuard nicht eingerichtet, bleibt `available` falsch und
 * die Startseite zeigt die Karte gar nicht erst.
 */
export function useAdguard() {
  const adguard = ref<Adguard | null>(null)
  const available = ref(true)
  const failed = ref(false)
  const pending = ref(false)

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
      canPause: data.canPause === true,
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

  /** `minutes` pausiert den Schutz, `null` schaltet ihn wieder an. */
  async function setProtection(minutes: number | null) {
    pending.value = true
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/adguard/protection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(minutes === null ? { enabled: true } : { minutes }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`)
      apply(data)
    } catch {
      // Der nächste Durchlauf holt den echten Zustand ohnehin nach
      await load()
    } finally {
      pending.value = false
    }
  }

  load()
  const timer = setInterval(load, REFRESH_MS)
  onUnmounted(() => clearInterval(timer))

  return { adguard, available, failed, pending, setProtection }
}
