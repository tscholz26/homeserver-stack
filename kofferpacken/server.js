import express from 'express'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'data')
const STATE_FILE = join(DATA_DIR, 'state.json')
const SEED_FILE = join(__dirname, 'seed.json')
const BACKUPS_DIR = join(__dirname, 'backups')
const KEEP_BACKUPS = 30
const PORT = Number(process.env.PORT) || 2606

mkdirSync(DATA_DIR, { recursive: true })
mkdirSync(BACKUPS_DIR, { recursive: true })

// ── Tägliches Backup ──────────────────────────────────────────────────────────
// Die persönlichen Listen stehen sonst nur ein einziges Mal in state.json und
// sind bewusst nicht im git (sie gehören niemandem außer dem Server).
function runBackup() {
  if (!existsSync(STATE_FILE)) return
  try {
    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`
    copyFileSync(STATE_FILE, join(BACKUPS_DIR, `state_${ts}.json`))

    const old = readdirSync(BACKUPS_DIR)
      .filter((f) => f.startsWith('state_') && f.endsWith('.json'))
      .sort()
      .slice(0, -KEEP_BACKUPS)
    for (const file of old) unlinkSync(join(BACKUPS_DIR, file))

    console.log(`[kofferpacken] Backup gespeichert (${KEEP_BACKUPS} werden aufbewahrt)`)
  } catch (err) {
    console.error('[kofferpacken] Backup fehlgeschlagen:', err.message)
  }
}

runBackup()
setInterval(runBackup, 24 * 60 * 60 * 1000)
// ─────────────────────────────────────────────────────────────────────────────

// The default packing list every new user starts with lives in seed.json
function readSeedCatalog() {
  const parsed = JSON.parse(readFileSync(SEED_FILE, 'utf8'))
  return {
    categories: Array.isArray(parsed.categories) ? parsed.categories : [],
    items: Array.isArray(parsed.items) ? parsed.items : [],
  }
}

function normalizeUser(u) {
  return {
    id: u.id,
    name: u.name,
    createdAt: u.createdAt,
    categories: Array.isArray(u.categories) ? u.categories : [],
    items: Array.isArray(u.items) ? u.items : [],
    trips: Array.isArray(u.trips) ? u.trips : [],
  }
}

// Throws on a corrupt file instead of falling back to an empty state, so a
// read error can never cascade into overwriting the data with nothing.
function readState() {
  if (!existsSync(STATE_FILE)) return { users: [] }
  const parsed = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
  if (Array.isArray(parsed.users)) return { users: parsed.users.map(normalizeUser) }
  // Legacy single-list format from before user accounts existed:
  // keep any real data reachable under a shared tile instead of dropping it
  if (Array.isArray(parsed.trips) && parsed.trips.length > 0) {
    return {
      users: [
        normalizeUser({
          id: 'user-gemeinsam',
          name: 'Gemeinsame Liste',
          createdAt: new Date().toISOString(),
          categories: parsed.categories,
          items: parsed.items,
          trips: parsed.trips,
        }),
      ],
    }
  }
  return { users: [] }
}

// Write to a temp file and rename so a crash mid-write can't corrupt state.json
function writeState(data) {
  const tmp = `${STATE_FILE}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  renameSync(tmp, STATE_FILE)
}

// Read → apply one change → write → return the authoritative state.
// Clients only send single changes, so concurrent devices can't erase
// each other's edits. `apply` returns { reject } to refuse a change.
function mutate(req, res, apply) {
  try {
    const state = readState()
    const result = apply(state) || {}
    if (result.reject) {
      return res.status(result.reject.status).json({ error: result.reject.error })
    }
    writeState(state)
    res.json(state)
  } catch (err) {
    console.error('[kofferpacken] mutation failed:', err.message)
    res.status(500).json({ error: err.message })
  }
}

// Same as mutate, but scoped to the user in the URL
function mutateUser(req, res, apply) {
  mutate(req, res, (state) => {
    const user = state.users.find((u) => u.id === req.params.userId)
    if (!user) return { reject: { status: 404, error: 'Nutzer nicht gefunden.' } }
    return apply(user)
  })
}

const app = express()
app.use(express.json({ limit: '1mb' }))
app.use(express.static(join(__dirname, 'dist')))

app.get('/api/state', (_req, res) => {
  try {
    res.json(readState())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Users ─────────────────────────────────────────────────────────────────────
app.post('/api/users', (req, res) => {
  const u = req.body
  if (!u || typeof u.id !== 'string' || typeof u.name !== 'string' || !u.name.trim()) {
    return res.status(400).json({ error: 'Invalid payload' })
  }
  mutate(req, res, (state) => {
    if (state.users.some((x) => x.id === u.id)) return
    if (state.users.some((x) => x.name.toLowerCase() === u.name.trim().toLowerCase())) {
      return { reject: { status: 409, error: 'Diesen Nutzer gibt es bereits.' } }
    }
    // Womit die persönliche Liste startet: Standardkatalog, leer, oder eine
    // Kopie der Liste eines anderen Nutzers (dessen Trips bleiben bei ihm).
    let categories = []
    let items = []
    if (u.source === 'empty') {
      // bleibt leer
    } else if (u.source === 'copy') {
      const from = state.users.find((x) => x.id === u.sourceUserId)
      if (!from) {
        return { reject: { status: 404, error: 'Die gewählte Vorlage gibt es nicht mehr.' } }
      }
      categories = from.categories.map((c) => ({ ...c }))
      items = from.items.map((i) => ({ ...i }))
    } else {
      const seed = readSeedCatalog()
      categories = seed.categories
      items = seed.items
    }

    state.users.push({
      id: u.id,
      name: u.name.trim(),
      createdAt: typeof u.createdAt === 'string' ? u.createdAt : new Date().toISOString(),
      categories,
      items,
      trips: [],
    })
  })
})

app.delete('/api/users/:id', (req, res) => {
  mutate(req, res, (state) => {
    state.users = state.users.filter((x) => x.id !== req.params.id)
  })
})

// ── Trips ─────────────────────────────────────────────────────────────────────
app.post('/api/users/:userId/trips', (req, res) => {
  const t = req.body
  if (!t || typeof t.id !== 'string' || typeof t.name !== 'string' || !t.name.trim()) {
    return res.status(400).json({ error: 'Invalid payload' })
  }
  mutateUser(req, res, (user) => {
    if (user.trips.some((x) => x.id === t.id)) return
    user.trips.push({
      id: t.id,
      name: t.name.trim(),
      createdAt: typeof t.createdAt === 'string' ? t.createdAt : new Date().toISOString(),
      packedItemIds: [],
    })
  })
})

app.delete('/api/users/:userId/trips/:id', (req, res) => {
  mutateUser(req, res, (user) => {
    user.trips = user.trips.filter((x) => x.id !== req.params.id)
  })
})

// Sets (not toggles) the packed flag, so a double-tap or a slow connection
// can never flip a checkbox into the wrong direction.
app.post('/api/users/:userId/trips/:id/check', (req, res) => {
  const { itemId, packed } = req.body || {}
  if (typeof itemId !== 'string' || typeof packed !== 'boolean') {
    return res.status(400).json({ error: 'Invalid payload' })
  }
  mutateUser(req, res, (user) => {
    const trip = user.trips.find((x) => x.id === req.params.id)
    if (!trip) return { reject: { status: 404, error: 'Trip nicht gefunden.' } }
    trip.packedItemIds = trip.packedItemIds.filter((x) => x !== itemId)
    if (packed) trip.packedItemIds.push(itemId)
  })
})

// Check or uncheck every item of one category at once
app.post('/api/users/:userId/trips/:id/check-category', (req, res) => {
  const { categoryId, packed } = req.body || {}
  if (typeof categoryId !== 'string' || typeof packed !== 'boolean') {
    return res.status(400).json({ error: 'Invalid payload' })
  }
  mutateUser(req, res, (user) => {
    const trip = user.trips.find((x) => x.id === req.params.id)
    if (!trip) return { reject: { status: 404, error: 'Trip nicht gefunden.' } }
    const categoryItemIds = new Set(
      user.items.filter((i) => i.categoryId === categoryId).map((i) => i.id),
    )
    trip.packedItemIds = trip.packedItemIds.filter((x) => !categoryItemIds.has(x))
    if (packed) trip.packedItemIds.push(...categoryItemIds)
  })
})

app.put('/api/users/:userId/trips/:id/notes', (req, res) => {
  const { notes } = req.body || {}
  if (typeof notes !== 'string') {
    return res.status(400).json({ error: 'Invalid payload' })
  }
  mutateUser(req, res, (user) => {
    const trip = user.trips.find((x) => x.id === req.params.id)
    if (!trip) return { reject: { status: 404, error: 'Trip nicht gefunden.' } }
    trip.notes = notes
  })
})

// ── Categories ────────────────────────────────────────────────────────────────
app.post('/api/users/:userId/categories', (req, res) => {
  const c = req.body
  if (!c || typeof c.id !== 'string' || typeof c.name !== 'string' || !c.name.trim()) {
    return res.status(400).json({ error: 'Invalid payload' })
  }
  mutateUser(req, res, (user) => {
    if (user.categories.some((x) => x.id === c.id)) return
    if (user.categories.some((x) => x.name.toLowerCase() === c.name.trim().toLowerCase())) {
      return { reject: { status: 409, error: 'Diese Kategorie gibt es bereits.' } }
    }
    user.categories.push({ id: c.id, name: c.name.trim() })
  })
})

// ── Items ─────────────────────────────────────────────────────────────────────
app.post('/api/users/:userId/items', (req, res) => {
  const i = req.body
  if (
    !i ||
    typeof i.id !== 'string' ||
    typeof i.categoryId !== 'string' ||
    typeof i.name !== 'string' ||
    !i.name.trim()
  ) {
    return res.status(400).json({ error: 'Invalid payload' })
  }
  mutateUser(req, res, (user) => {
    if (user.items.some((x) => x.id === i.id)) return
    if (!user.categories.some((x) => x.id === i.categoryId)) {
      return { reject: { status: 404, error: 'Kategorie nicht gefunden.' } }
    }
    user.items.push({ id: i.id, categoryId: i.categoryId, name: i.name.trim() })
  })
})

app.put('/api/users/:userId/items/:id', (req, res) => {
  const { name } = req.body || {}
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Invalid payload' })
  }
  mutateUser(req, res, (user) => {
    const item = user.items.find((x) => x.id === req.params.id)
    if (!item) return { reject: { status: 404, error: 'Gegenstand nicht gefunden.' } }
    item.name = name.trim()
  })
})

app.delete('/api/users/:userId/items/:id', (req, res) => {
  mutateUser(req, res, (user) => {
    user.items = user.items.filter((x) => x.id !== req.params.id)
    for (const trip of user.trips) {
      trip.packedItemIds = trip.packedItemIds.filter((x) => x !== req.params.id)
    }
  })
})

// SPA fallback (app.use catches all remaining routes in Express 5)
app.use((_req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Kofferpacken läuft auf http://0.0.0.0:${PORT}`)
})
