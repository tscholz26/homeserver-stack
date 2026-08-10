import express from 'express'
import https from 'node:https'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statfsSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT) || 2607

// Die Host-Werte kommen aus einzelnen, read-only gemounteten Dateien (siehe
// docker-compose.yml). Absichtlich nicht das ganze /proc: dort stünden auch die
// Umgebungsvariablen aller anderen Prozesse, also z. B. Nextclouds DB-Passwort.
const PROC = process.env.HOST_PROC || '/host/proc'
const OS_RELEASE = process.env.HOST_OS_RELEASE || '/host/os-release'
const HOSTNAME_FILE = process.env.HOST_HOSTNAME || '/host/hostname'
const THERMAL = process.env.HOST_THERMAL || '/host/thermal'
const POWERCAP = process.env.HOST_POWERCAP || '/host/powercap/intel-rapl'
const DATA_DISK = process.env.DATA_DISK || '/host/datadisk'
const DOCKER_API = process.env.DOCKER_API || 'http://docker-socket-proxy:2375'

const DATA_DIR = join(__dirname, 'data')
const UPTIME_FILE = join(DATA_DIR, 'uptime.json')

mkdirSync(DATA_DIR, { recursive: true })

// Fehlt ein Mount (z. B. im Devserver), soll das Feld null sein und nicht die
// ganze Antwort kippen.
function read(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

function readNumbers(text) {
  return (text ?? '').trim().split(/\s+/).map(Number)
}

function uptimeSeconds() {
  const [seconds] = readNumbers(read(join(PROC, 'uptime')))
  return Number.isFinite(seconds) ? Math.round(seconds) : null
}

function loadAverage() {
  const values = readNumbers(read(join(PROC, 'loadavg'))).slice(0, 3)
  return values.length === 3 && values.every(Number.isFinite) ? values : null
}

function cpuInfo() {
  const text = read(join(PROC, 'cpuinfo')) ?? ''
  const model = text.match(/^model name\s*:\s*(.+)$/m)?.[1]?.trim() ?? null
  const cores = (text.match(/^processor\s*:/gm) ?? []).length || null
  return { model, cores }
}

function memory() {
  const text = read(join(PROC, 'meminfo'))
  if (!text) return null
  const field = (name) => {
    const kb = Number(text.match(new RegExp(`^${name}:\\s*(\\d+) kB$`, 'm'))?.[1])
    return Number.isFinite(kb) ? kb * 1024 : null
  }
  const total = field('MemTotal')
  const available = field('MemAvailable')
  const swapTotal = field('SwapTotal')
  const swapFree = field('SwapFree')
  if (total === null || available === null) return null
  return {
    totalBytes: total,
    availableBytes: available,
    usedBytes: total - available,
    swapTotalBytes: swapTotal,
    swapUsedBytes: swapTotal !== null && swapFree !== null ? swapTotal - swapFree : null,
  }
}

function diskAt(path) {
  try {
    const { blocks, bfree, bavail, bsize } = statfsSync(path)
    return {
      totalBytes: Number(blocks) * Number(bsize),
      freeBytes: Number(bavail) * Number(bsize),
      usedBytes: (Number(blocks) - Number(bfree)) * Number(bsize),
    }
  } catch {
    return null
  }
}

// Systemplatte: der Container liegt auf dem gleichen Dateisystem wie
// /var/lib/docker, bei Standard-Setup also auf der Systemplatte.
// Datenplatte: dort ist ein leeres Verzeichnis gemountet, nur damit statfs die
// Belegung messen kann – die Nextcloud-Daten selbst bleiben außen vor.
function disks() {
  return { system: diskAt('/'), data: diskAt(DATA_DISK) }
}

// Bevorzugt die Paket-Temperatur der CPU, sonst die wärmste gemeldete Zone
function temperature() {
  try {
    const zones = readdirSync(THERMAL).filter((name) => name.startsWith('thermal_zone'))
    const readings = zones
      .map((zone) => ({
        type: read(join(THERMAL, zone, 'type'))?.trim(),
        milliDegrees: Number(read(join(THERMAL, zone, 'temp'))),
      }))
      .filter((zone) => Number.isFinite(zone.milliDegrees))
    if (readings.length === 0) return null
    const preferred =
      readings.find((zone) => zone.type === 'x86_pkg_temp') ??
      readings.reduce((warmest, zone) => (zone.milliDegrees > warmest.milliDegrees ? zone : warmest))
    return Math.round(preferred.milliDegrees / 1000)
  } catch {
    return null
  }
}

// ── CPU-Auslastung ────────────────────────────────────────────────────────────
// Ein einzelner Blick in /proc/stat liefert nur Summen seit dem Boot; die
// Auslastung ist die Differenz zweier Messungen. Deshalb läuft hier ein Ticker,
// und die API gibt einfach den letzten Wert aus.
function cpuTicks() {
  const line = read(join(PROC, 'stat'))
    ?.split('\n')
    .find((row) => row.startsWith('cpu '))
  if (!line) return null
  const values = readNumbers(line.replace('cpu ', ''))
  const total = values.reduce((sum, value) => sum + value, 0)
  const idle = (values[3] ?? 0) + (values[4] ?? 0)
  return { total, idle }
}

let previousTicks = cpuTicks()
let cpuUsagePercent = null

// ── Stromverbrauch ───────────────────────────────────────────────────────────
// Intel RAPL zählt verbrauchte Mikrojoule hoch; Watt ist die Differenz pro
// Sekunde. Das ist ausdrücklich nur das CPU-Paket, nicht der ganze Rechner –
// Platten, Board und Netzteilverluste sieht der Zähler nicht.
function raplZone() {
  try {
    const packages = readdirSync(POWERCAP).filter((name) => /^intel-rapl:\d+$/.test(name))
    return packages[0] ? join(POWERCAP, packages[0]) : null
  } catch {
    return null
  }
}

const RAPL = raplZone()
const RAPL_NAME = RAPL ? read(join(RAPL, 'name'))?.trim() : null
const RAPL_MAX = RAPL ? Number(read(join(RAPL, 'max_energy_range_uj'))) : null

function energyMicrojoules() {
  if (!RAPL) return null
  const value = Number(read(join(RAPL, 'energy_uj')))
  return Number.isFinite(value) ? value : null
}

let previousEnergy = energyMicrojoules()
let previousEnergyAt = Date.now()
let watts = null

setInterval(() => {
  const current = cpuTicks()
  if (current && previousTicks) {
    const deltaTotal = current.total - previousTicks.total
    const deltaIdle = current.idle - previousTicks.idle
    if (deltaTotal > 0) cpuUsagePercent = Math.round(100 * (1 - deltaIdle / deltaTotal))
  }
  previousTicks = current

  const energy = energyMicrojoules()
  const now = Date.now()
  if (energy !== null && previousEnergy !== null) {
    // Der Zähler läuft irgendwann über und beginnt wieder bei 0
    let delta = energy - previousEnergy
    if (delta < 0 && Number.isFinite(RAPL_MAX)) delta += RAPL_MAX
    const seconds = (now - previousEnergyAt) / 1000
    if (delta >= 0 && seconds > 0) watts = Math.round((delta / 1_000_000 / seconds) * 10) / 10
  }
  previousEnergy = energy
  previousEnergyAt = now
}, 5000)
// ─────────────────────────────────────────────────────────────────────────────

// ── Container ─────────────────────────────────────────────────────────────────
// Läuft über den docker-socket-proxy, der nur lesende Container-Abfragen
// durchlässt – der Socket selbst wäre Root-Zugriff auf den Host.
async function dockerGet(path) {
  const response = await fetch(`${DOCKER_API}${path}`, { signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error(`Docker-API antwortete mit ${response.status}`)
  return response.json()
}

async function containerList() {
  const list = (await dockerGet('/containers/json?all=true'))
    .map((container) => ({
      id: container.Id,
      name: (container.Names?.[0] ?? '').replace(/^\//, ''),
      image: container.Image ?? '',
      state: container.State ?? 'unknown',
      status: container.Status ?? '',
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))

  return {
    running: list.filter((container) => container.state === 'running').length,
    total: list.length,
    list,
  }
}

// Speicher, CPU, Neustarts und Healthcheck pro Container. Ein stats-Abruf
// dauert rund eine Sekunde (Docker misst intern zweimal), deshalb läuft das
// im Hintergrund und die API gibt den zuletzt gesammelten Stand aus.
const details = new Map()

async function collectDetails() {
  let list
  try {
    list = (await containerList()).list
  } catch {
    return
  }

  for (const container of list) {
    try {
      const inspect = await dockerGet(`/containers/${container.id}/json`)
      const entry = {
        restarts: inspect.RestartCount ?? null,
        health: inspect.State?.Health?.Status ?? null,
        memoryBytes: null,
        cpuPercent: null,
      }

      if (container.state === 'running') {
        const stats = await dockerGet(`/containers/${container.id}/stats?stream=false`)
        // Docker rechnet den Cache mit; ohne ihn entspricht der Wert dem, was
        // `docker stats` anzeigt.
        const used = stats.memory_stats?.usage
        const cache = stats.memory_stats?.stats?.inactive_file ?? 0
        entry.memoryBytes = Number.isFinite(used) ? Math.max(0, used - cache) : null

        const cpuDelta =
          (stats.cpu_stats?.cpu_usage?.total_usage ?? 0) -
          (stats.precpu_stats?.cpu_usage?.total_usage ?? 0)
        const systemDelta =
          (stats.cpu_stats?.system_cpu_usage ?? 0) - (stats.precpu_stats?.system_cpu_usage ?? 0)
        const cores = stats.cpu_stats?.online_cpus ?? 1
        if (systemDelta > 0 && cpuDelta >= 0) {
          entry.cpuPercent = Math.round((cpuDelta / systemDelta) * cores * 1000) / 10
        }
      }

      details.set(container.name, entry)
    } catch {
      // Einzelne Container dürfen scheitern, ohne die Runde abzubrechen
    }
  }
}

collectDetails()
setInterval(collectDetails, 60_000)
// ─────────────────────────────────────────────────────────────────────────────

// ── Verfügbarkeit der Dienste ────────────────────────────────────────────────
// Geprüft wird über Caddy und mit dem echten Hostnamen im SNI, also genau der
// Weg, den ein Besucher nimmt – so fällt auch ein Proxy-Problem auf.
const SITE_HOST = process.env.SITE_HOST || 'tshomeserv.duckdns.org'
const PROXY_HOST = process.env.PROXY_HOST || 'caddy-caddy-1'
const SAMPLE_MS = 60_000
const KEEP_HOURS = 48

const WATCHED = [
  { id: 'nextcloud', path: '/status.php' },
  { id: 'donnerskat', path: '/skat/' },
  { id: 'kofferpacken', path: '/koffer/' },
]

function probe(path) {
  return new Promise((resolve) => {
    const request = https.request(
      {
        host: PROXY_HOST,
        port: 443,
        path,
        method: 'GET',
        servername: SITE_HOST,
        headers: { Host: SITE_HOST },
        timeout: 8000,
      },
      (response) => {
        response.resume()
        // Gleiche Regel wie auf der Startseite: erst ab 500 ist es ein Problem
        resolve(response.statusCode < 500)
      },
    )
    request.on('error', () => resolve(false))
    request.on('timeout', () => {
      request.destroy()
      resolve(false)
    })
    request.end()
  })
}

function readHistory() {
  if (!existsSync(UPTIME_FILE)) return { startedAt: new Date().toISOString(), samples: [] }
  try {
    const parsed = JSON.parse(readFileSync(UPTIME_FILE, 'utf8'))
    return {
      startedAt: parsed.startedAt ?? new Date().toISOString(),
      samples: Array.isArray(parsed.samples) ? parsed.samples : [],
    }
  } catch {
    return { startedAt: new Date().toISOString(), samples: [] }
  }
}

let history = readHistory()

function writeHistory() {
  const tmp = `${UPTIME_FILE}.tmp`
  writeFileSync(tmp, JSON.stringify(history), 'utf8')
  renameSync(tmp, UPTIME_FILE)
}

async function sampleServices() {
  const up = {}
  for (const service of WATCHED) {
    up[service.id] = (await probe(service.path)) ? 1 : 0
  }

  const cutoff = Date.now() - KEEP_HOURS * 3600_000
  history.samples = history.samples.filter((sample) => sample.t >= cutoff)
  history.samples.push({ t: Date.now(), up })

  try {
    writeHistory()
  } catch (err) {
    console.error('[homepage] Verlauf konnte nicht gespeichert werden:', err.message)
  }
}

sampleServices()
setInterval(sampleServices, SAMPLE_MS)

/** Fasst den Verlauf zu gleich breiten Abschnitten zusammen. */
function uptimeReport(hours, buckets = 96) {
  const now = Date.now()
  const from = now - hours * 3600_000
  const width = (now - from) / buckets
  const inWindow = history.samples.filter((sample) => sample.t >= from)

  return {
    recordedSince: history.startedAt,
    windowHours: hours,
    sampleCount: inWindow.length,
    intervalSeconds: SAMPLE_MS / 1000,
    services: WATCHED.map((service) => {
      const states = []
      for (let index = 0; index < buckets; index += 1) {
        const start = from + index * width
        const slice = inWindow.filter((sample) => sample.t >= start && sample.t < start + width)
        if (slice.length === 0) states.push('none')
        else if (slice.every((sample) => sample.up[service.id] === 1)) states.push('up')
        else if (slice.every((sample) => sample.up[service.id] !== 1)) states.push('down')
        else states.push('partial')
      }

      const upCount = inWindow.filter((sample) => sample.up[service.id] === 1).length
      return {
        id: service.id,
        states,
        availability: inWindow.length > 0 ? (upCount / inWindow.length) * 100 : null,
      }
    }),
  }
}
// ─────────────────────────────────────────────────────────────────────────────

const app = express()
app.use(express.static(join(__dirname, 'dist')))

app.get('/api/system', async (_req, res) => {
  const { model, cores } = cpuInfo()

  let containers = null
  let dockerError = null
  try {
    const listed = await containerList()
    containers = {
      ...listed,
      // Die Container-IDs bleiben drinnen, nach außen reichen Name und Zustand
      list: listed.list.map((container) => ({
        name: container.name,
        image: container.image,
        state: container.state,
        status: container.status,
        ...(details.get(container.name) ?? {
          restarts: null,
          health: null,
          memoryBytes: null,
          cpuPercent: null,
        }),
      })),
    }
  } catch (err) {
    dockerError = err.message
  }

  res.set('Cache-Control', 'no-store')
  res.json({
    generatedAt: new Date().toISOString(),
    host: {
      hostname: read(HOSTNAME_FILE)?.trim() ?? null,
      kernel: read(join(PROC, 'osrelease'))?.trim() ?? null,
      os: read(OS_RELEASE)?.match(/^PRETTY_NAME="?(.+?)"?$/m)?.[1] ?? null,
      uptimeSeconds: uptimeSeconds(),
    },
    cpu: { model, cores, load: loadAverage(), usagePercent: cpuUsagePercent, tempC: temperature() },
    memory: memory(),
    disks: disks(),
    power: RAPL ? { watts, zone: RAPL_NAME } : null,
    containers,
    dockerError,
  })
})

app.get('/api/uptime', (req, res) => {
  const hours = Math.min(KEEP_HOURS, Math.max(1, Number(req.query.hours) || 24))
  res.set('Cache-Control', 'no-store')
  res.json(uptimeReport(hours))
})

// SPA-Fallback (app.use fängt in Express 5 alle übrigen Routen)
app.use((_req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Homepage läuft auf http://0.0.0.0:${PORT}`)
})
