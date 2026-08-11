import { onUnmounted, ref } from 'vue'

export interface Container {
  name: string
  image: string
  state: string
  status: string
  restarts: number | null
  health: string | null
  memoryBytes: number | null
  cpuPercent: number | null
}

export interface DiskInfo {
  totalBytes: number
  freeBytes: number
  usedBytes: number
}

export interface SystemInfo {
  generatedAt: string
  host: {
    hostname: string | null
    kernel: string | null
    os: string | null
    uptimeSeconds: number | null
  }
  cpu: {
    model: string | null
    cores: number | null
    load: [number, number, number] | null
    usagePercent: number | null
    tempC: number | null
  }
  memory: {
    totalBytes: number
    availableBytes: number
    usedBytes: number
    swapTotalBytes: number | null
    swapUsedBytes: number | null
  } | null
  disks: { system: DiskInfo | null; data: DiskInfo | null }
  /**
   * `watts` ist der Wert, der gilt: bei `source: 'meter'` von einer
   * Messsteckdose gemessen, sonst die Schätzung aus gemessenem CPU-Anteil
   * (`cpuWatts`), Grundlast und Netzteil-Wirkungsgrad.
   */
  power: {
    watts: number | null
    source: 'meter' | 'estimate'
    cpuWatts: number | null
    estimatedTotalWatts: number | null
    baselineWatts: number
    psuEfficiency: number
    zones: string[]
    meterConfigured: boolean
    meterError: string | null
  } | null
  containers: { running: number; total: number; list: Container[] } | null
  dockerError: string | null
}

const REFRESH_MS = 5000

/** Fragt die Systemwerte des Servers ab und hält sie aktuell. */
export function useSystem() {
  const info = ref<SystemInfo | null>(null)
  const failed = ref(false)

  async function load() {
    try {
      // Über BASE_URL, damit der Pfad auch von / aus auf /start/api/… zeigt
      const response = await fetch(`${import.meta.env.BASE_URL}api/system`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      info.value = await response.json()
      failed.value = false
    } catch {
      // Ein Aussetzer soll die schon angezeigten Werte nicht wegräumen
      failed.value = info.value === null
    }
  }

  load()
  const timer = setInterval(load, REFRESH_MS)
  onUnmounted(() => clearInterval(timer))

  return { info, failed, reload: load }
}

export interface MetricPoint {
  t: number
  cpu: number | null
  mem: number | null
  /** Gemessener CPU-Anteil (RAPL) */
  watts: number | null
  /** Messsteckdose, falls eine eingerichtet ist */
  meter: number | null
}

export type MetricKey = 'cpu' | 'mem' | 'watts'

export interface MetricHistory {
  recordedSince: string
  intervalSeconds: number
  windowHours: number
  points: MetricPoint[]
}

/** Der Messwert-Verlauf wächst um einen Punkt pro Minute. */
export function useMetrics() {
  const history = ref<MetricHistory | null>(null)

  async function load() {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/metrics`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      history.value = await response.json()
    } catch {
      // Bleibt beim letzten Stand
    }
  }

  load()
  const timer = setInterval(load, 60_000)
  onUnmounted(() => clearInterval(timer))

  return { history }
}

export function averageOverBy(
  points: MetricPoint[] | undefined,
  minutes: number,
  select: (point: MetricPoint) => number | null,
): number | null {
  if (!points) return null
  const from = Date.now() - minutes * 60_000
  const values = points
    .filter((point) => point.t >= from)
    .map(select)
    .filter((value): value is number => value !== null)
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function averageOver(
  points: MetricPoint[] | undefined,
  minutes: number,
  key: MetricKey,
): number | null {
  return averageOverBy(points, minutes, (point) => point[key])
}

/**
 * Watt eines Verlaufspunkts so, wie sie angezeigt werden: der Messwert der
 * Steckdose, falls es einen gibt, sonst der gemessene CPU-Anteil hochgerechnet
 * mit der aktuellen Grundlast. Dadurch bleibt die gespeicherte Datei roh.
 */
export function wattsOf(point: MetricPoint, power: SystemInfo['power']): number | null {
  if (point.meter !== null) return point.meter
  if (point.watts === null || !power) return point.meter
  return (point.watts + power.baselineWatts) / power.psuEfficiency
}

export type UptimeState = 'up' | 'down' | 'partial' | 'none'

export interface UptimeReport {
  recordedSince: string
  windowHours: number
  sampleCount: number
  intervalSeconds: number
  services: { id: string; states: UptimeState[]; availability: number | null }[]
}

const UPTIME_REFRESH_MS = 60_000

/** Der Verfügbarkeits-Verlauf ändert sich langsam, also seltener abfragen. */
export function useUptime() {
  const report = ref<UptimeReport | null>(null)

  async function load() {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/uptime`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      report.value = await response.json()
    } catch {
      // Bleibt beim letzten Stand; die Karte zeigt dann einfach nichts Neues
    }
  }

  load()
  const timer = setInterval(load, UPTIME_REFRESH_MS)
  onUnmounted(() => clearInterval(timer))

  return { report }
}

export function formatUptime(seconds: number | null): string {
  if (seconds === null) return '–'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days} ${days === 1 ? 'Tag' : 'Tage'}, ${hours} Std`
  if (hours > 0) return `${hours} Std, ${minutes} min`
  return `${minutes} min`
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return '\u2013'
  const gib = bytes / 1024 ** 3
  if (gib >= 100) return `${gib.toLocaleString('de-DE', { maximumFractionDigits: 0 })} GB`
  if (gib >= 1) {
    return `${gib.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} GB`
  }
  return `${(bytes / 1024 ** 2).toLocaleString('de-DE', { maximumFractionDigits: 0 })} MB`
}

/** „5,5 / 15,5 GB“ – die Einheit steht nur einmal, wenn sie gleich ist. */
export function formatBytesPair(used: number, total: number): string {
  const usedText = formatBytes(used)
  const totalText = formatBytes(total)
  const usedUnit = usedText.split(' ')[1]
  const totalUnit = totalText.split(' ')[1]
  if (usedUnit !== totalUnit) return `${usedText} / ${totalText}`
  return `${usedText.split(' ')[0]} / ${totalText}`
}

/** Ab 90 % wird es rot, ab 70 % gelb – gilt für CPU, RAM und Platte gleich. */
export function toneFor(percent: number | null): 'ok' | 'warn' | 'crit' | 'unknown' {
  if (percent === null) return 'unknown'
  if (percent >= 90) return 'crit'
  if (percent >= 70) return 'warn'
  return 'ok'
}
