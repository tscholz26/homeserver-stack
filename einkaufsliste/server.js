import express from 'express'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'data')
const STATE_FILE = join(DATA_DIR, 'state.json')
const SEED_DIR = join(__dirname, 'seed')
const EXPORT_DIR = join(__dirname, 'export')
const EXPORT_FILE = join(EXPORT_DIR, 'katalog.json')
const PORT = Number(process.env.PORT) || 2608

mkdirSync(DATA_DIR, { recursive: true })
mkdirSync(EXPORT_DIR, { recursive: true })

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
    // Der komplette Katalog, beim ersten Start aus dem Seed befüllt und danach
    // in der Verwaltung frei bearbeitbar
    catalog: [],
    // Aus dem Seed gelöschte Artikel: sonst wären sie beim nächsten Start
    // wieder da (siehe seedNachziehen)
    removedSeedNames: [],
    unmatched: [],
    // Kategorie-Reihenfolge pro Filiale, gepflegt in der Verwaltung
    storeProfiles: [],
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
    // Katalogartikel, über den die Kategorie kam – leer, wenn von Hand gesetzt
    matchedName: typeof i.matchedName === 'string' ? i.matchedName : '',
    done: i.done === true,
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
    removedSeedNames: Array.isArray(parsed.removedSeedNames) ? parsed.removedSeedNames : [],
    unmatched: Array.isArray(parsed.unmatched) ? parsed.unmatched : [],
    storeProfiles: Array.isArray(parsed.storeProfiles)
      ? parsed.storeProfiles.map(normalizeProfile)
      : [],
  }
}

// Erst in eine temporäre Datei, dann umbenennen: ein Absturz mitten im
// Schreiben kann state.json so nicht zerstören.
function writeState(data) {
  const tmp = `${STATE_FILE}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  renameSync(tmp, STATE_FILE)
  exportKatalog(data)
}

// ── Katalog fürs git ──────────────────────────────────────────────────────────
// Die eigentliche Einkaufsliste ist ersetzbar, Katalog und Märkte sind es nicht:
// die stecken in Monaten Nachpflege. Deshalb liegen genau die beiden in einer
// eigenen Datei, die – anders als data/ – ins git gehört und den Rechner damit
// verlassen kann.
let letzterExport = existsSync(EXPORT_FILE) ? readFileSync(EXPORT_FILE, 'utf8') : null

function exportInhalt(state) {
  return `${JSON.stringify({ catalog: state.catalog, storeProfiles: state.storeProfiles }, null, 2)}\n`
}

function exportKatalog(state) {
  try {
    const inhalt = exportInhalt(state)
    if (inhalt === letzterExport) return
    const tmp = `${EXPORT_FILE}.tmp`
    writeFileSync(tmp, inhalt, 'utf8')
    renameSync(tmp, EXPORT_FILE)
    letzterExport = inhalt
    console.log('[einkaufsliste] Katalog nach export/katalog.json geschrieben')
  } catch (err) {
    // Ein fehlgeschlagener Export darf die Änderung selbst nicht kippen
    console.error('[einkaufsliste] Export fehlgeschlagen:', err.message)
  }
}

/**
 * Umgekehrter Weg: ohne data/state.json (neuer Rechner, geleertes Volume)
 * kommen Katalog und Märkte aus dem git zurück. Die Listen sind dann leer –
 * genau die sind auch das Ersetzbare.
 */
function restoreAusExport(state) {
  if (!existsSync(EXPORT_FILE)) return
  try {
    const gesichert = JSON.parse(readFileSync(EXPORT_FILE, 'utf8'))
    if (Array.isArray(gesichert.catalog)) state.catalog = gesichert.catalog
    if (Array.isArray(gesichert.storeProfiles)) {
      // Die Listen sind neu und haben neue IDs; Märkte hängen an der ersten
      // kategorisierten Liste, statt ins Leere zu zeigen.
      const ziel = state.lists.find((l) => l.type === 'kategorisiert')
      state.storeProfiles = gesichert.storeProfiles
        .map((p) => normalizeProfile({ ...p, listId: ziel?.id }))
        .filter((p) => p.listId)
    }
    console.log(`[einkaufsliste] Katalog aus dem git übernommen (${state.catalog.length} Artikel)`)
  } catch (err) {
    console.error('[einkaufsliste] Export nicht lesbar:', err.message)
  }
}

// Beim allerersten Start einmal festschreiben: sonst würde jeder Aufruf neue
// IDs für die beiden Standardlisten erfinden, und zwei Geräte hätten
// unterschiedliche Listen vor sich.
if (!existsSync(STATE_FILE)) {
  const start = defaultState()
  restoreAusExport(start)
  writeState(start)
}

/**
 * Der Katalog in data/state.json ist die Wahrheit; der Seed liefert nur nach,
 * was dort noch fehlt. Beim ersten Start ist das der komplette Seed, später
 * genau die Artikel, die mit einem Update dazugekommen sind – gelöschte bleiben
 * gelöscht.
 */
function seedNachziehen() {
  // Eine kaputte state.json darf den Start nicht verhindern – dann meldet sich
  // stattdessen jeder API-Aufruf mit dem Fehler.
  let state
  try {
    state = readState()
  } catch (err) {
    console.error('[einkaufsliste] Seed-Abgleich übersprungen:', err.message)
    return
  }
  const bekannt = new Set([
    ...state.catalog.map((e) => normalize(e.name)),
    ...state.removedSeedNames.map(normalize),
  ])
  const fehlend = SEED_CATALOG.filter((e) => !bekannt.has(normalize(e.name)))
  if (fehlend.length === 0) return

  state.catalog = [...state.catalog, ...fehlend.map((e) => ({ ...e, aliases: [...e.aliases] }))]
  writeState(state)
  console.log(`[einkaufsliste] ${fehlend.length} Artikel aus dem Seed übernommen`)
}

seedNachziehen()

// Einmal beim Start, damit export/katalog.json auch dann aktuell ist, wenn seit
// dem letzten Deploy niemand etwas geändert hat.
try {
  exportKatalog(readState())
} catch (err) {
  console.error('[einkaufsliste] Export beim Start fehlgeschlagen:', err.message)
}

function publicState(state) {
  return {
    lists: state.lists,
    categories: SEED_CATEGORIES,
    defaultCategoryOrder: DEFAULT_CATEGORY_ORDER,
    catalog: state.catalog,
    unmatched: state.unmatched,
    storeProfiles: state.storeProfiles,
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

// ── Ladenprofile ──────────────────────────────────────────────────────────────
// Ein Profil ist die Reihenfolge der Kategorien in einer Filiale. Ohne Profil
// gilt die Standard-Reihenfolge aus seed/kategorien.json.
app.post('/api/store-profiles', (req, res) => {
  const p = req.body
  if (!p || typeof p.id !== 'string' || typeof p.name !== 'string' || !p.name.trim()) {
    return res.status(400).json({ error: 'Invalid payload' })
  }
  mutate(req, res, (state) => {
    if (state.storeProfiles.some((x) => x.id === p.id)) return
    if (!state.lists.some((l) => l.id === p.listId)) {
      return { reject: { status: 404, error: 'Liste nicht gefunden.' } }
    }
    state.storeProfiles.push(
      normalizeProfile({
        id: p.id,
        name: p.name.trim(),
        listId: p.listId,
        categoryOrder: Array.isArray(p.categoryOrder) ? p.categoryOrder : DEFAULT_CATEGORY_ORDER,
      }),
    )
  })
})

app.put('/api/store-profiles/:id', (req, res) => {
  const { name, categoryOrder } = req.body || {}
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    return res.status(400).json({ error: 'Invalid payload' })
  }
  if (categoryOrder !== undefined && !Array.isArray(categoryOrder)) {
    return res.status(400).json({ error: 'Invalid payload' })
  }
  mutate(req, res, (state) => {
    const profile = state.storeProfiles.find((x) => x.id === req.params.id)
    if (!profile) return { reject: { status: 404, error: 'Markt nicht gefunden.' } }
    if (name !== undefined) profile.name = name.trim()
    if (categoryOrder !== undefined) {
      profile.categoryOrder = categoryOrder.filter(
        (id) => CATEGORY_IDS.has(id) && id !== 'sonstiges',
      )
    }
  })
})

app.delete('/api/store-profiles/:id', (req, res) => {
  mutate(req, res, (state) => {
    state.storeProfiles = state.storeProfiles.filter((x) => x.id !== req.params.id)
    // Listen, die gerade auf diesem Markt standen, fallen auf den Standard
    for (const list of state.lists) {
      if (list.storeProfileId === req.params.id) list.storeProfileId = null
    }
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

// Korrektur direkt in der Liste: Name und/oder Kategorie. Eine von Hand
// gesetzte Kategorie gilt als zugeordnet, der ◌-Badge verschwindet also.
app.put('/api/lists/:listId/items/:itemId', (req, res) => {
  const { name, quantity, categoryId } = req.body || {}
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    return res.status(400).json({ error: 'Invalid payload' })
  }
  if (quantity !== undefined && typeof quantity !== 'string') {
    return res.status(400).json({ error: 'Invalid payload' })
  }
  if (categoryId !== undefined && !CATEGORY_IDS.has(categoryId)) {
    return res.status(400).json({ error: 'Unbekannte Kategorie' })
  }
  mutateList(req, res, (list) => {
    const item = list.items.find((x) => x.id === req.params.itemId)
    if (!item) return { reject: { status: 404, error: 'Artikel nicht gefunden.' } }
    if (name !== undefined) item.name = name.trim()
    if (quantity !== undefined) item.quantity = quantity.trim()
    if (categoryId !== undefined) {
      item.categoryId = categoryId
      item.matched = true
      // Von Hand gesetzt: der alte Treffer erklärt die Kategorie nicht mehr
      item.matchedName = ''
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

// Handsortierung in flachen Listen: der Client schickt die neue Reihenfolge der
// IDs. Was fehlt (weil ein anderes Gerät gerade etwas eingetragen hat), bleibt
// hinten stehen, statt verloren zu gehen.
app.put('/api/lists/:listId/order', (req, res) => {
  const { itemIds } = req.body || {}
  if (!Array.isArray(itemIds) || itemIds.some((id) => typeof id !== 'string')) {
    return res.status(400).json({ error: 'Invalid payload' })
  }
  mutateList(req, res, (list) => {
    const rang = new Map(itemIds.map((id, index) => [id, index]))
    list.items = [...list.items].sort(
      (a, b) => (rang.get(a.id) ?? Infinity) - (rang.get(b.id) ?? Infinity),
    )
  })
})

// „Einkauf beenden“: abgehakte Artikel raus, der Rest bleibt liegen
app.post('/api/lists/:listId/finish', (req, res) => {
  mutateList(req, res, (list) => {
    list.items = list.items.filter((x) => !x.done)
  })
})

// ── Katalog & nicht zugeordnete Artikel ───────────────────────────────────────
// Wird ein Name neu zugeordnet, sollen die Artikel, die deshalb in „Sonstiges“
// gelandet sind, gleich mitwandern – sonst müsste man dieselbe Zuordnung in der
// Liste ein zweites Mal von Hand machen. Von Hand einsortierte Artikel
// (matched) bleiben unangetastet.
function applyToUnmatchedItems(state, name, categoryId, matchedName) {
  const key = normalize(name)
  for (const list of state.lists) {
    if (list.type !== 'kategorisiert') continue
    for (const item of list.items) {
      if (!item.matched && normalize(item.name) === key) {
        item.categoryId = categoryId
        item.matched = true
        item.matchedName = matchedName
      }
    }
  }
}

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
    // Schon vorhandene Schreibweisen bleiben erhalten – auch die eines
    // Seed-Artikels, der hier nur eine andere Kategorie bekommt.
    const vorher = state.catalog.find((e) => normalize(e.name) === key)
    const gemerkt = new Set([
      ...(vorher?.aliases ?? []),
      ...(Array.isArray(aliases) ? aliases.filter((a) => typeof a === 'string') : []),
    ])
    state.catalog = state.catalog.filter((e) => normalize(e.name) !== key)
    state.catalog.push({ name: clean, aliases: [...gemerkt], category_id: categoryId })
    state.unmatched = state.unmatched.filter((u) => normalize(u.name) !== key)
    applyToUnmatchedItems(state, clean, categoryId, clean)
  })
})

// Hängt eine weitere Schreibweise an einen bestehenden Artikel. Bei einem
// Seed-Artikel entsteht dabei eine eigene Kopie in state.catalog, die den Seed
// überdeckt – der Seed selbst bleibt unangetastet und aktualisierbar.
app.post('/api/catalog/alias', (req, res) => {
  const { name, alias } = req.body || {}
  if (typeof name !== 'string' || !name.trim() || typeof alias !== 'string' || !alias.trim()) {
    return res.status(400).json({ error: 'Invalid payload' })
  }
  mutate(req, res, (state) => {
    const key = normalize(name)
    const eintrag = state.catalog.find((e) => normalize(e.name) === key)
    if (!eintrag) return { reject: { status: 404, error: 'Artikel nicht im Katalog.' } }

    const sauber = alias.trim()
    const aliasKey = normalize(sauber)
    if (aliasKey === key) {
      return { reject: { status: 409, error: 'Das ist der Artikelname selbst.' } }
    }

    const aliase = eintrag.aliases.filter((a) => normalize(a) !== aliasKey)
    aliase.push(sauber)

    state.catalog = state.catalog.filter((e) => normalize(e.name) !== key)
    state.catalog.push({
      name: eintrag.name,
      aliases: aliase,
      category_id: eintrag.category_id,
    })
    state.unmatched = state.unmatched.filter((u) => normalize(u.name) !== aliasKey)
    applyToUnmatchedItems(state, sauber, eintrag.category_id, eintrag.name)
  })
})

// Einen Katalogeintrag überschreiben: Kategorie ändern oder eine Schreibweise
// wieder loswerden, die versehentlich dort gelandet ist.
function pruefeEintrag(e) {
  if (!e || typeof e.name !== 'string' || !e.name.trim()) return 'Name fehlt'
  if (typeof e.category_id !== 'string' || !CATEGORY_IDS.has(e.category_id)) {
    return `Unbekannte Kategorie bei „${e.name}“`
  }
  if (e.aliases !== undefined && !Array.isArray(e.aliases)) return `aliases muss eine Liste sein`
  return null
}

function sauberEintrag(e) {
  return {
    name: e.name.trim(),
    aliases: (e.aliases ?? [])
      .filter((a) => typeof a === 'string' && a.trim())
      .map((a) => a.trim()),
    category_id: e.category_id,
  }
}

app.put('/api/catalog', (req, res) => {
  const fehler = pruefeEintrag(req.body)
  if (fehler) return res.status(400).json({ error: fehler })
  mutate(req, res, (state) => {
    const eintrag = sauberEintrag(req.body)
    const key = normalize(eintrag.name)
    state.catalog = state.catalog.filter((e) => normalize(e.name) !== key)
    state.catalog.push(eintrag)
  })
})

// Artikel aus dem Katalog werfen. Kam er aus dem Seed, wird das vermerkt –
// sonst stünde er beim nächsten Start wieder da.
app.delete('/api/catalog', (req, res) => {
  const { name } = req.body || {}
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Invalid payload' })
  }
  mutate(req, res, (state) => {
    const key = normalize(name)
    state.catalog = state.catalog.filter((e) => normalize(e.name) !== key)
    if (SEED_CATALOG.some((e) => normalize(e.name) === key)) {
      state.removedSeedNames.push(name.trim())
    }
  })
})

// Vertipper, die nie ein Artikel werden sollen
app.delete('/api/unmatched/:id', (req, res) => {
  mutate(req, res, (state) => {
    state.unmatched = state.unmatched.filter((u) => u.id !== req.params.id)
  })
})

// SPA fallback (app.use fängt in Express 5 alle übrigen Routen)
app.use((_req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Einkaufsliste läuft auf http://0.0.0.0:${PORT}`)
})
