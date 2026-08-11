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
const SEED_DIR = join(__dirname, 'seed')
const BACKUPS_DIR = join(__dirname, 'backups')
const KEEP_BACKUPS = 30
const PORT = Number(process.env.PORT) || 2608

mkdirSync(DATA_DIR, { recursive: true })
mkdirSync(BACKUPS_DIR, { recursive: true })

// ── Seed ──────────────────────────────────────────────────────────────────────
// Kategorien und Basiskatalog liegen als Datei im Image und sind damit die
// einzige Quelle für beides – der Client bekommt sie über /api/state, damit sie
// nirgends ein zweites Mal im Code stehen.
const SEED_CATEGORIES = JSON.parse(
  readFileSync(join(SEED_DIR, 'kategorien.json'), 'utf8'),
).categories
const SEED_CATALOG = JSON.parse(readFileSync(join(SEED_DIR, 'artikelkatalog.json'), 'utf8'))

// Die Reihenfolge in kategorien.json ist die Standard-Reihenfolge im Laden.
// „sonstiges“ hängt immer hinten und wird nie umsortiert.
const CATEGORY_IDS = new Set(SEED_CATEGORIES.map((c) => c.id))
const DEFAULT_CATEGORY_ORDER = SEED_CATEGORIES.map((c) => c.id).filter((id) => id !== 'sonstiges')

const LIST_TYPES = new Set(['kategorisiert', 'flach'])

// ── Tägliches Backup ──────────────────────────────────────────────────────────
// Listen und selbst zugeordnete Artikel stehen sonst nur ein einziges Mal in
// state.json und sind bewusst nicht im git.
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

    console.log(`[einkaufsliste] Backup gespeichert (${KEEP_BACKUPS} werden aufbewahrt)`)
  } catch (err) {
    console.error('[einkaufsliste] Backup fehlgeschlagen:', err.message)
  }
}

runBackup()
setInterval(runBackup, 24 * 60 * 60 * 1000)

// ── State ─────────────────────────────────────────────────────────────────────
function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`
}

// Muss zur gleichnamigen Funktion in src/utils/matching.ts passen: beide
// entscheiden, ob zwei Schreibweisen derselbe Artikel sind.
function normalize(text) {
  return String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function defaultState() {
  return {
    lists: [
      { id: createId(), name: 'Lebensmittel', type: 'kategorisiert', items: [] },
      { id: createId(), name: 'Drogerie', type: 'flach', items: [] },
    ],
    // Nur die selbst ergänzten Artikel; der Basiskatalog kommt aus dem Seed
    catalog: [],
    unmatched: [],
    // Kategorie-Reihenfolge pro Laden. Noch ohne UI: Profile werden vorerst von
    // Hand in data/state.json eingetragen, das Rendering nutzt sie schon.
    storeProfiles: [],
    settings: { users: ['Tristan', 'Freundin'] },
  }
}

function normalizeItem(i) {
  return {
    id: i.id,
    name: i.name,
    quantity: typeof i.quantity === 'string' ? i.quantity : '',
    categoryId: CATEGORY_IDS.has(i.categoryId) ? i.categoryId : 'sonstiges',
    // false = beim Hinzufügen im Katalog nicht gefunden (◌-Badge)
    matched: i.matched !== false,
    done: i.done === true,
    addedBy: typeof i.addedBy === 'string' ? i.addedBy : '',
    addedAt: typeof i.addedAt === 'string' ? i.addedAt : new Date().toISOString(),
  }
}

function normalizeList(l) {
  return {
    id: l.id,
    name: l.name,
    type: LIST_TYPES.has(l.type) ? l.type : 'kategorisiert',
    // Welches Ladenprofil gerade aktiv ist (null = Standard-Reihenfolge)
    storeProfileId: typeof l.storeProfileId === 'string' ? l.storeProfileId : null,
    items: Array.isArray(l.items) ? l.items.map(normalizeItem) : [],
  }
}

function normalizeProfile(p) {
  return {
    id: p.id,
    name: p.name,
    listId: p.listId,
    categoryOrder: Array.isArray(p.categoryOrder)
      ? p.categoryOrder.filter((id) => CATEGORY_IDS.has(id) && id !== 'sonstiges')
      : [],
  }
}

// Wirft bei einer kaputten Datei, statt auf einen leeren Stand zurückzufallen –
// ein Lesefehler darf nie dazu führen, dass die Daten mit nichts überschrieben
// werden.
function readState() {
  if (!existsSync(STATE_FILE)) return defaultState()
  const parsed = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
  return {
    lists: Array.isArray(parsed.lists) ? parsed.lists.map(normalizeList) : [],
    catalog: Array.isArray(parsed.catalog) ? parsed.catalog : [],
    unmatched: Array.isArray(parsed.unmatched) ? parsed.unmatched : [],
    storeProfiles: Array.isArray(parsed.storeProfiles)
      ? parsed.storeProfiles.map(normalizeProfile)
      : [],
    settings: {
      users:
        Array.isArray(parsed.settings?.users) && parsed.settings.users.length === 2
          ? parsed.settings.users
          : defaultState().settings.users,
    },
  }
}

// Erst in eine temporäre Datei, dann umbenennen: ein Absturz mitten im
// Schreiben kann state.json so nicht zerstören.
function writeState(data) {
  const tmp = `${STATE_FILE}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  renameSync(tmp, STATE_FILE)
}

// Beim allerersten Start einmal festschreiben: sonst würde jeder Aufruf neue
// IDs für die beiden Standardlisten erfinden, und zwei Geräte hätten
// unterschiedliche Listen vor sich.
if (!existsSync(STATE_FILE)) writeState(defaultState())

// Was der Client sieht: gespeicherter Stand plus die Seed-Daten. Eigene
// Katalog-Einträge stehen vorn, damit sie bei gleichem Namen gewinnen.
function publicState(state) {
  return {
    lists: state.lists,
    categories: SEED_CATEGORIES,
    defaultCategoryOrder: DEFAULT_CATEGORY_ORDER,
    catalog: [...state.catalog, ...SEED_CATALOG],
    unmatched: state.unmatched,
    storeProfiles: state.storeProfiles,
    settings: state.settings,
  }
}

// ── Live-Sync ─────────────────────────────────────────────────────────────────
// Jede Änderung geht sofort an alle offenen Geräte. Fällt die Verbindung weg,
// verbindet der Browser selbst neu und der Client holt sich beim nächsten
// Sichtbarwerden ohnehin den vollen Stand.
const clients = new Set()

function broadcast(state) {
  const payload = `data: ${JSON.stringify(publicState(state))}\n\n`
  for (const res of clients) res.write(payload)
}

// Read → eine Änderung anwenden → schreiben → autoritativen Stand zurückgeben.
// Die Clients schicken immer nur einzelne Änderungen, damit zwei Geräte sich
// nicht gegenseitig überschreiben. `apply` gibt { reject } zurück, um eine
// Änderung abzulehnen.
function mutate(req, res, apply) {
  try {
    const state = readState()
    const result = apply(state) || {}
    if (result.reject) {
      return res.status(result.reject.status).json({ error: result.reject.error })
    }
    writeState(state)
    broadcast(state)
    res.json(publicState(state))
  } catch (err) {
    console.error('[einkaufsliste] mutation failed:', err.message)
    res.status(500).json({ error: err.message })
  }
}

function mutateList(req, res, apply) {
  mutate(req, res, (state) => {
    const list = state.lists.find((l) => l.id === req.params.listId)
    if (!list) return { reject: { status: 404, error: 'Liste nicht gefunden.' } }
    return apply(list, state)
  })
}

const app = express()
app.use(express.json({ limit: '1mb' }))
app.use(express.static(join(__dirname, 'dist')))

app.get('/api/state', (_req, res) => {
  try {
    res.json(publicState(readState()))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  })
  try {
    res.write(`data: ${JSON.stringify(publicState(readState()))}\n\n`)
  } catch (err) {
    console.error('[einkaufsliste] SSE-Start fehlgeschlagen:', err.message)
  }
  clients.add(res)
  req.on('close', () => clients.delete(res))
})

// Hält die Verbindung durch Proxys und Mobilfunk-NAT offen
setInterval(() => {
  for (const res of clients) res.write(': ping\n\n')
}, 25_000)

// ── Listen ────────────────────────────────────────────────────────────────────
app.post('/api/lists', (req, res) => {
  const l = req.body
  if (!l || typeof l.id !== 'string' || typeof l.name !== 'string' || !l.name.trim()) {
    return res.status(400).json({ error: 'Invalid payload' })
  }
  if (!LIST_TYPES.has(l.type)) return res.status(400).json({ error: 'Unbekannter Listentyp' })
  mutate(req, res, (state) => {
    if (state.lists.some((x) => x.id === l.id)) return
    if (state.lists.some((x) => x.name.toLowerCase() === l.name.trim().toLowerCase())) {
      return { reject: { status: 409, error: 'Diese Liste gibt es bereits.' } }
    }
    state.lists.push(normalizeList({ id: l.id, name: l.name.trim(), type: l.type, items: [] }))
  })
})

app.put('/api/lists/:listId', (req, res) => {
  const { name } = req.body || {}
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Invalid payload' })
  }
  mutateList(req, res, (list, state) => {
    if (
      state.lists.some(
        (x) => x.id !== list.id && x.name.toLowerCase() === name.trim().toLowerCase(),
      )
    ) {
      return { reject: { status: 409, error: 'Diese Liste gibt es bereits.' } }
    }
    list.name = name.trim()
  })
})

app.delete('/api/lists/:listId', (req, res) => {
  mutate(req, res, (state) => {
    state.lists = state.lists.filter((x) => x.id !== req.params.listId)
    state.storeProfiles = state.storeProfiles.filter((p) => p.listId !== req.params.listId)
  })
})

// Welches Ladenprofil für diese Liste gilt (null = Standard-Reihenfolge)
app.put('/api/lists/:listId/store-profile', (req, res) => {
  const { storeProfileId } = req.body || {}
  if (storeProfileId !== null && typeof storeProfileId !== 'string') {
    return res.status(400).json({ error: 'Invalid payload' })
  }
  mutateList(req, res, (list, state) => {
    if (storeProfileId && !state.storeProfiles.some((p) => p.id === storeProfileId)) {
      return { reject: { status: 404, error: 'Ladenprofil nicht gefunden.' } }
    }
    list.storeProfileId = storeProfileId
  })
})

// ── Artikel ───────────────────────────────────────────────────────────────────
// Die Zuordnung zur Kategorie passiert im Browser (Katalog + Fuzzy-Matching),
// der Server hält nur fest, was dabei herauskam.
app.post('/api/lists/:listId/items', (req, res) => {
  const i = req.body
  if (!i || typeof i.id !== 'string' || typeof i.name !== 'string' || !i.name.trim()) {
    return res.status(400).json({ error: 'Invalid payload' })
  }
  if (typeof i.categoryId !== 'string' || !CATEGORY_IDS.has(i.categoryId)) {
    return res.status(400).json({ error: 'Unbekannte Kategorie' })
  }
  mutateList(req, res, (list, state) => {
    if (list.items.some((x) => x.id === i.id)) return
    const item = normalizeItem({ ...i, name: i.name.trim(), done: false })
    list.items.push(item)

    // Nicht erkannte Artikel sammeln – aber nur aus kategorisierten Listen, in
    // flachen Listen gibt es gar keine Zuordnung, die fehlen könnte.
    if (list.type === 'kategorisiert' && !item.matched) {
      const key = normalize(item.name)
      const known = state.unmatched.find((u) => normalize(u.name) === key)
      if (known) {
        known.count += 1
        known.lastAddedAt = item.addedAt
      } else {
        state.unmatched.push({
          id: createId(),
          name: item.name,
          count: 1,
          lastAddedAt: item.addedAt,
        })
      }
    }
  })
})

// Setzt den Haken (kein Umschalten), damit ein Doppeltipp oder eine langsame
// Verbindung die Checkbox nicht in die falsche Richtung kippt.
app.post('/api/lists/:listId/items/:itemId/check', (req, res) => {
  const { done } = req.body || {}
  if (typeof done !== 'boolean') return res.status(400).json({ error: 'Invalid payload' })
  mutateList(req, res, (list) => {
    const item = list.items.find((x) => x.id === req.params.itemId)
    if (!item) return { reject: { status: 404, error: 'Artikel nicht gefunden.' } }
    item.done = done
  })
})

app.delete('/api/lists/:listId/items/:itemId', (req, res) => {
  mutateList(req, res, (list) => {
    list.items = list.items.filter((x) => x.id !== req.params.itemId)
  })
})

// „Einkauf beenden“: abgehakte Artikel raus, der Rest bleibt liegen
app.post('/api/lists/:listId/finish', (req, res) => {
  mutateList(req, res, (list) => {
    list.items = list.items.filter((x) => !x.done)
  })
})

// ── Katalog & nicht zugeordnete Artikel ───────────────────────────────────────
// Ordnet einen bisher unbekannten Artikelnamen einer Kategorie zu. Bereits in
// den Listen stehende Einträge bleiben absichtlich unverändert.
app.post('/api/catalog', (req, res) => {
  const { name, category_id: categoryId, aliases } = req.body || {}
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Invalid payload' })
  }
  if (typeof categoryId !== 'string' || !CATEGORY_IDS.has(categoryId)) {
    return res.status(400).json({ error: 'Unbekannte Kategorie' })
  }
  mutate(req, res, (state) => {
    const clean = name.trim()
    const key = normalize(clean)
    state.catalog = state.catalog.filter((e) => normalize(e.name) !== key)
    state.catalog.push({
      name: clean,
      aliases: Array.isArray(aliases) ? aliases.filter((a) => typeof a === 'string') : [],
      category_id: categoryId,
    })
    state.unmatched = state.unmatched.filter((u) => normalize(u.name) !== key)
  })
})

// Vertipper, die nie ein Artikel werden sollen
app.delete('/api/unmatched/:id', (req, res) => {
  mutate(req, res, (state) => {
    state.unmatched = state.unmatched.filter((u) => u.id !== req.params.id)
  })
})

// ── Einstellungen ─────────────────────────────────────────────────────────────
app.put('/api/settings/users', (req, res) => {
  const { users } = req.body || {}
  if (
    !Array.isArray(users) ||
    users.length !== 2 ||
    users.some((u) => typeof u !== 'string' || !u.trim())
  ) {
    return res.status(400).json({ error: 'Invalid payload' })
  }
  mutate(req, res, (state) => {
    state.settings.users = users.map((u) => u.trim())
  })
})

// SPA fallback (app.use fängt in Express 5 alle übrigen Routen)
app.use((_req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Einkaufsliste läuft auf http://0.0.0.0:${PORT}`)
})
