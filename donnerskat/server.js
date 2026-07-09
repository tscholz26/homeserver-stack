import express from 'express'
import { appendFileSync, copyFileSync, existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR    = join(__dirname, 'data')
const STATE_FILE  = join(DATA_DIR, 'state.json')
const CHANGELOG_FILE = join(DATA_DIR, 'changelog.jsonl')
const AVATARS_DIR = join(__dirname, 'avatars')
const BACKUPS_DIR = join(__dirname, 'backups')
const PORT = Number(process.env.PORT) || 2605

mkdirSync(DATA_DIR,    { recursive: true })
mkdirSync(AVATARS_DIR, { recursive: true })
mkdirSync(BACKUPS_DIR, { recursive: true })

// ── Daily backup ──────────────────────────────────────────────────────────────
function runBackup() {
  if (!existsSync(STATE_FILE)) return
  try {
    const now = new Date()
    const pad = n => String(n).padStart(2, '0')
    const ts  = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`
    const dest = join(BACKUPS_DIR, `state_${ts}.json`)
    copyFileSync(STATE_FILE, dest)
    console.log(`[donnerskat] backup saved: ${dest}`)
  } catch (err) {
    console.error('[donnerskat] backup failed:', err.message)
  }
}

// Run once on startup, then every 24 h
runBackup()
setInterval(runBackup, 24 * 60 * 60 * 1000)
// ─────────────────────────────────────────────────────────────────────────────

// Throws on a corrupt file instead of falling back to an empty state, so a
// read error can never cascade into overwriting the data with nothing.
function readState() {
  if (!existsSync(STATE_FILE)) return { players: [], hands: [] }
  const parsed = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
  return {
    players: Array.isArray(parsed.players) ? parsed.players : [],
    hands: Array.isArray(parsed.hands) ? parsed.hands : [],
  }
}

// Write to a temp file and rename so a crash mid-write can't corrupt state.json
function writeState(data) {
  const tmp = `${STATE_FILE}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  renameSync(tmp, STATE_FILE)
}

// Append-only audit log: one JSON line per change, so games can be
// reconstructed by hand even if state.json is ever damaged again.
function logChange(req, state, entry) {
  try {
    const names = Object.fromEntries(state.players.map((p) => [p.id, p.name]))
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      ...entry,
      playerNames: names,
      totals: { players: state.players.length, hands: state.hands.length },
    })
    appendFileSync(CHANGELOG_FILE, line + '\n', 'utf8')
  } catch (err) {
    console.error('[donnerskat] changelog write failed:', err.message)
  }
}

// Read → apply one change → write → return the authoritative state.
// Clients never send the full state, so concurrent tabs can't erase
// each other's games. `apply` returns { reject } to refuse, { log } to
// record the change in the changelog, or nothing for an idempotent no-op.
function mutate(req, res, apply) {
  try {
    const state = readState()
    const result = apply(state) || {}
    if (result.reject) {
      return res.status(result.reject.status).json({ error: result.reject.error })
    }
    writeState(state)
    if (result.log) logChange(req, state, result.log)
    res.json(state)
  } catch (err) {
    console.error('[donnerskat] mutation failed:', err.message)
    res.status(500).json({ error: err.message })
  }
}

const app = express()
app.use(express.json({ limit: '10mb' }))
app.use(express.static(join(__dirname, 'dist')))
app.use('/avatars', express.static(AVATARS_DIR))

app.get('/api/state', (_req, res) => {
  try {
    res.json(readState())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/players', (req, res) => {
  const p = req.body
  if (!p || typeof p.id !== 'string' || typeof p.name !== 'string' || !p.name.trim()) {
    return res.status(400).json({ error: 'Invalid payload' })
  }
  mutate(req, res, (state) => {
    if (state.players.some((x) => x.id === p.id)) return
    if (state.players.some((x) => x.name.toLowerCase() === p.name.trim().toLowerCase())) {
      return { reject: { status: 409, error: 'Dieser Spieler ist bereits vorhanden.' } }
    }
    const player = {
      id: p.id,
      name: p.name.trim(),
      createdAt: typeof p.createdAt === 'string' ? p.createdAt : new Date().toISOString(),
    }
    state.players.push(player)
    return { log: { action: 'add_player', player } }
  })
})

app.delete('/api/players/:id', (req, res) => {
  mutate(req, res, (state) => {
    if (state.hands.some((h) => Array.isArray(h.players) && h.players.includes(req.params.id))) {
      return { reject: { status: 409, error: 'Dieser Spieler kann nicht entfernt werden, da bereits Partien eingetragen wurden.' } }
    }
    const player = state.players.find((x) => x.id === req.params.id)
    if (!player) return
    state.players = state.players.filter((x) => x.id !== req.params.id)
    return { log: { action: 'remove_player', player } }
  })
})

app.post('/api/hands', (req, res) => {
  const h = req.body
  if (!h || typeof h.id !== 'string' || !Array.isArray(h.players) || !Array.isArray(h.scores)) {
    return res.status(400).json({ error: 'Invalid payload' })
  }
  mutate(req, res, (state) => {
    if (state.hands.some((x) => x.id === h.id)) return
    state.hands.push(h)
    return { log: { action: 'add_hand', hand: h } }
  })
})

app.delete('/api/hands/:id', (req, res) => {
  mutate(req, res, (state) => {
    const hand = state.hands.find((x) => x.id === req.params.id)
    if (!hand) return { reject: { status: 404, error: 'Partie nicht gefunden.' } }
    hand.deleted = true
    return { log: { action: 'delete_hand', hand } }
  })
})

// The old whole-state PUT allowed any stale tab to overwrite everyone else's
// games (last write wins). Answer explicitly so outdated cached clients fail
// loudly instead of hitting the SPA fallback.
app.put('/api/state', (_req, res) => {
  res.status(410).json({ error: 'Bitte die Seite neu laden – diese Version der App ist veraltet.' })
})

// SPA fallback (app.use catches all remaining routes in Express 5)
app.use((_req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Donnerskat läuft auf http://0.0.0.0:${PORT}`)
})
