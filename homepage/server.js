import express from 'express'
import { readFileSync, readdirSync, statfsSync } from 'node:fs'
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
const DOCKER_API = process.env.DOCKER_API || 'http://docker-socket-proxy:2375'

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

// Der Container liegt auf dem gleichen Dateisystem wie /var/lib/docker, also
// bei Standard-Setup auf der Systemplatte – statfs hier liefert genau deren
// Belegung, ohne dass irgendein Host-Verzeichnis gemountet werden muss.
function disk() {
  try {
    const { blocks, bfree, bavail, bsize } = statfsSync('/')
    return {
      totalBytes: Number(blocks) * Number(bsize),
      freeBytes: Number(bavail) * Number(bsize),
      usedBytes: (Number(blocks) - Number(bfree)) * Number(bsize),
    }
  } catch {
    return null
  }
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

setInterval(() => {
  const current = cpuTicks()
  if (!current || !previousTicks) {
    previousTicks = current
    return
  }
  const deltaTotal = current.total - previousTicks.total
  const deltaIdle = current.idle - previousTicks.idle
  if (deltaTotal > 0) {
    cpuUsagePercent = Math.round(100 * (1 - deltaIdle / deltaTotal))
  }
  previousTicks = current
}, 5000)
// ─────────────────────────────────────────────────────────────────────────────

// Läuft über den docker-socket-proxy, der nur lesende Container-Abfragen
// durchlässt – der Socket selbst wäre Root-Zugriff auf den Host.
async function containers() {
  const response = await fetch(`${DOCKER_API}/containers/json?all=true`, {
    signal: AbortSignal.timeout(4000),
  })
  if (!response.ok) throw new Error(`Docker-API antwortete mit ${response.status}`)

  const list = (await response.json())
    .map((container) => ({
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

const app = express()
app.use(express.static(join(__dirname, 'dist')))

app.get('/api/system', async (_req, res) => {
  const { model, cores } = cpuInfo()
  const load = loadAverage()

  let docker = null
  let dockerError = null
  try {
    docker = await containers()
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
    cpu: { model, cores, load, usagePercent: cpuUsagePercent, tempC: temperature() },
    memory: memory(),
    disk: disk(),
    containers: docker,
    dockerError,
  })
})

// SPA-Fallback (app.use fängt in Express 5 alle übrigen Routen)
app.use((_req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Homepage läuft auf http://0.0.0.0:${PORT}`)
})
