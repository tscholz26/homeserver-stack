import express from 'express'
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'data')
const STATE_FILE = join(DATA_DIR, 'state.json')
const SEED_FILE = join(__dirname, 'seed.json')
const PORT = Number(process.env.PORT) || 2606

mkdirSync(DATA_DIR, { recursive: true })

// Throws on a corrupt file instead of falling back to an empty state, so a
// read error can never cascade into overwriting the data with nothing.
// On the very first start the committed seed catalog becomes the state.
function readState() {
  const source = existsSync(STATE_FILE) ? STATE_FILE : SEED_FILE
  const parsed = JSON.parse(readFileSync(source, 'utf8'))
  return {
    categories: Array.isArray(parsed.categories) ? parsed.categories : [],
    items: Array.isArray(parsed.items) ? parsed.items : [],
    trips: Array.isArray(parsed.trips) ? parsed.trips : [],
  }
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

// ── Trips ─────────────────────────────────────────────────────────────────────
app.post('/api/trips', (req, res) => {
  const t = req.body
  if (!t || typeof t.id !== 'string' || typeof t.name !== 'string' || !t.name.trim()) {
    return res.status(400).json({ error: 'Invalid payload' })
  }
  mutate(req, res, (state) => {
    if (state.trips.some((x) => x.id === t.id)) return
    state.trips.push({
      id: t.id,
      name: t.name.trim(),
      createdAt: typeof t.createdAt === 'string' ? t.createdAt : new Date().toISOString(),
      packedItemIds: [],
    })
  })
})

app.delete('/api/trips/:id', (req, res) => {
  mutate(req, res, (state) => {
    state.trips = state.trips.filter((x) => x.id !== req.params.id)
  })
})

// Sets (not toggles) the packed flag, so a double-tap or a slow connection
// can never flip a checkbox into the wrong direction.
app.post('/api/trips/:id/check', (req, res) => {
  const { itemId, packed } = req.body || {}
  if (typeof itemId !== 'string' || typeof packed !== 'boolean') {
    return res.status(400).json({ error: 'Invalid payload' })
  }
  mutate(req, res, (state) => {
    const trip = state.trips.find((x) => x.id === req.params.id)
    if (!trip) return { reject: { status: 404, error: 'Trip nicht gefunden.' } }
    trip.packedItemIds = trip.packedItemIds.filter((x) => x !== itemId)
    if (packed) trip.packedItemIds.push(itemId)
  })
})

// Check or uncheck every item of one category at once
app.post('/api/trips/:id/check-category', (req, res) => {
  const { categoryId, packed } = req.body || {}
  if (typeof categoryId !== 'string' || typeof packed !== 'boolean') {
    return res.status(400).json({ error: 'Invalid payload' })
  }
  mutate(req, res, (state) => {
    const trip = state.trips.find((x) => x.id === req.params.id)
    if (!trip) return { reject: { status: 404, error: 'Trip nicht gefunden.' } }
    const categoryItemIds = new Set(
      state.items.filter((i) => i.categoryId === categoryId).map((i) => i.id),
    )
    trip.packedItemIds = trip.packedItemIds.filter((x) => !categoryItemIds.has(x))
    if (packed) trip.packedItemIds.push(...categoryItemIds)
  })
})

app.put('/api/trips/:id/notes', (req, res) => {
  const { notes } = req.body || {}
  if (typeof notes !== 'string') {
    return res.status(400).json({ error: 'Invalid payload' })
  }
  mutate(req, res, (state) => {
    const trip = state.trips.find((x) => x.id === req.params.id)
    if (!trip) return { reject: { status: 404, error: 'Trip nicht gefunden.' } }
    trip.notes = notes
  })
})

// ── Categories ────────────────────────────────────────────────────────────────
app.post('/api/categories', (req, res) => {
  const c = req.body
  if (!c || typeof c.id !== 'string' || typeof c.name !== 'string' || !c.name.trim()) {
    return res.status(400).json({ error: 'Invalid payload' })
  }
  mutate(req, res, (state) => {
    if (state.categories.some((x) => x.id === c.id)) return
    if (state.categories.some((x) => x.name.toLowerCase() === c.name.trim().toLowerCase())) {
      return { reject: { status: 409, error: 'Diese Kategorie gibt es bereits.' } }
    }
    state.categories.push({ id: c.id, name: c.name.trim() })
  })
})

// ── Items ─────────────────────────────────────────────────────────────────────
app.post('/api/items', (req, res) => {
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
  mutate(req, res, (state) => {
    if (state.items.some((x) => x.id === i.id)) return
    if (!state.categories.some((x) => x.id === i.categoryId)) {
      return { reject: { status: 404, error: 'Kategorie nicht gefunden.' } }
    }
    state.items.push({ id: i.id, categoryId: i.categoryId, name: i.name.trim() })
  })
})

app.put('/api/items/:id', (req, res) => {
  const { name } = req.body || {}
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Invalid payload' })
  }
  mutate(req, res, (state) => {
    const item = state.items.find((x) => x.id === req.params.id)
    if (!item) return { reject: { status: 404, error: 'Gegenstand nicht gefunden.' } }
    item.name = name.trim()
  })
})

app.delete('/api/items/:id', (req, res) => {
  mutate(req, res, (state) => {
    state.items = state.items.filter((x) => x.id !== req.params.id)
    for (const trip of state.trips) {
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
