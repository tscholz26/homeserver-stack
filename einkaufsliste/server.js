import express from 'express'
import { existsSync, mkdirSync, readFileSync, renameSync, watch, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'data')
const STATE_FILE = join(DATA_DIR, 'state.json')
const SEED_DIR = join(__dirname, 'seed')
const EXPORT_DIR = join(__dirname, 'export')
const KATALOG_FILE = join(EXPORT_DIR, 'katalog.json')
const MARKT_FILE = join(EXPORT_DIR, 'maerkte.json')
const REZEPT_FILE = join(EXPORT_DIR, 'rezepte.json')
const GRUPPEN_FILE = join(EXPORT_DIR, 'rezeptgruppen.json')
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
// Nur als Notnagel für einen völlig leeren Server: sonst kommen die Gruppen aus
// export/rezeptgruppen.json und werden in der App gepflegt.
const START_GRUPPEN = [
  { id: 'frisch', emoji: '🥗', label: 'Frisch gekocht' },
  { id: 'vorrat', emoji: '🥫', label: 'Aus dem Vorrat' },
  { id: 'sonstiges', emoji: '❓', label: 'Sonstiges' },
]

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
    // Namen, die einmal eingetippt und nie zugeordnet wurden
    unmatched: [],
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

function normalizeIngredient(z) {
  return {
    name: String(z?.name ?? '').trim(),
    quantity: typeof z?.quantity === 'string' ? z.quantity.trim() : '',
  }
}

function istGruppe(id) {
  return buch.recipeGroups.some((g) => g.id === id)
}

function normalizeGroup(g) {
  return {
    id: String(g?.id ?? '').trim(),
    emoji: typeof g?.emoji === 'string' && g.emoji.trim() ? g.emoji.trim() : '❓',
    label: String(g?.label ?? '').trim(),
  }
}

function normalizeRecipe(r) {
  return {
    id: r.id,
    name: r.name,
    // Zeigt ein Rezept auf eine Gruppe, die es nicht (mehr) gibt, landet es in
    // der ersten – sichtbar bleiben ist besser als unsichtbar werden.
    group: istGruppe(r.group) ? r.group : (buch.recipeGroups[0]?.id ?? 'frisch'),
    ingredients: Array.isArray(r.ingredients)
      ? r.ingredients.map(normalizeIngredient).filter((z) => z.name)
      : [],
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
// In state.json stehen nur noch die Einkaufslisten und die Historie der nicht
// zugeordneten Namen – alles Weitere lebt in den Dateien unter export/.
function readState() {
  if (!existsSync(STATE_FILE)) return defaultState()
  const parsed = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
  return {
    lists: Array.isArray(parsed.lists) ? parsed.lists.map(normalizeList) : [],
    unmatched: Array.isArray(parsed.unmatched) ? parsed.unmatched : [],
  }
}

// Erst in eine temporäre Datei, dann umbenennen: ein Absturz mitten im
// Schreiben kann state.json so nicht zerstören.
function writeState(data) {
  const tmp = `${STATE_FILE}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  renameSync(tmp, STATE_FILE)
}

// ── Die Dateien unter export/ ────────────────────────────────────────────────
// Katalog, Märkte und Rezeptbuch stehen in je einer Datei. Die Datei *ist* die
// Wahrheit – es gibt keine zweite Kopie im State und keinen Seed, aus dem etwas
// nachgezogen wird. Damit ist der Stand im Arbeitsverzeichnis immer der, den
// die App gerade benutzt, und ein `git diff` zeigt genau, was sich geändert hat.
const letzterStand = new Map()

function schreibeWennNeu(datei, daten) {
  try {
    const inhalt = `${JSON.stringify(daten, null, 2)}\n`
    if (inhalt === letzterStand.get(datei)) return
    const tmp = `${datei}.tmp`
    writeFileSync(tmp, inhalt, 'utf8')
    renameSync(tmp, datei)
    letzterStand.set(datei, inhalt)
    console.log(`[einkaufsliste] ${datei.split('/').pop()} geschrieben`)
  } catch (err) {
    // Ein fehlgeschlagener Schreibvorgang darf die Änderung selbst nicht kippen
    console.error('[einkaufsliste] Schreiben fehlgeschlagen:', err.message)
  }
}

/** Liest eine Datei als Liste – schlicht `[…]` oder `{ "schluessel": […] }`. */
function leseListe(datei, schluessel, normalisiere) {
  if (!existsSync(datei)) return []
  try {
    const roh = JSON.parse(readFileSync(datei, 'utf8'))
    const liste = Array.isArray(roh) ? roh : Array.isArray(roh[schluessel]) ? roh[schluessel] : []
    letzterStand.set(datei, readFileSync(datei, 'utf8'))
    return normalisiere ? liste.map(normalisiere) : liste
  } catch (err) {
    console.error(`[einkaufsliste] ${datei.split('/').pop()} nicht lesbar:`, err.message)
    return []
  }
}

const buch = { catalog: [], storeProfiles: [], recipes: [], recipeGroups: [] }

function leseBuch() {
  buch.catalog = leseListe(KATALOG_FILE, 'catalog')
  buch.storeProfiles = leseListe(MARKT_FILE, 'storeProfiles', normalizeProfile)
  // Gruppen vor den Rezepten: die Rezepte werden gegen sie geprüft
  const gruppen = leseListe(GRUPPEN_FILE, 'groups', normalizeGroup).filter((g) => g.id && g.label)
  buch.recipeGroups = gruppen.length ? gruppen : START_GRUPPEN
  buch.recipes = leseListe(REZEPT_FILE, 'recipes', (r) =>
    normalizeRecipe({ ...r, id: r.id || createId() }),
  )
}

function schreibeBuch() {
  schreibeWennNeu(KATALOG_FILE, buch.catalog)
  schreibeWennNeu(MARKT_FILE, buch.storeProfiles)
  schreibeWennNeu(GRUPPEN_FILE, buch.recipeGroups)
  schreibeWennNeu(REZEPT_FILE, buch.recipes)
}

leseBuch()

// Einmalige Übernahme aus der Zeit, als das alles im State stand. Zusammen-
// geführt statt ersetzt: hinkt eine Datei hinterher, geht nichts verloren.
try {
  const alt = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
  let uebernommen = []

  if (Array.isArray(alt.catalog)) {
    const bekannt = new Set(buch.catalog.map((e) => normalize(e.name)))
    const dazu = alt.catalog.filter((e) => !bekannt.has(normalize(e.name)))
    if (dazu.length) {
      buch.catalog = [...buch.catalog, ...dazu]
      uebernommen.push(`${dazu.length} Artikel`)
    }
  }
  if (Array.isArray(alt.storeProfiles) && buch.storeProfiles.length === 0) {
    buch.storeProfiles = alt.storeProfiles.map(normalizeProfile)
    if (buch.storeProfiles.length) uebernommen.push(`${buch.storeProfiles.length} Märkte`)
  }
  if (Array.isArray(alt.recipes)) {
    const bekannt = new Set(buch.recipes.map((r) => normalize(r.name)))
    const dazu = alt.recipes
      .filter((r) => !bekannt.has(normalize(r.name)))
      .map((r) => normalizeRecipe({ ...r, id: r.id || createId() }))
    if (dazu.length) {
      buch.recipes = [...buch.recipes, ...dazu]
      uebernommen.push(`${dazu.length} Rezepte`)
    }
  }
  if (uebernommen.length) {
    console.log(`[einkaufsliste] aus dem alten State übernommen: ${uebernommen.join(', ')}`)
  }
  if ('catalog' in alt || 'recipes' in alt || 'storeProfiles' in alt || 'removedSeedNames' in alt) {
    writeState(readState())
    console.log('[einkaufsliste] state.json enthält jetzt nur noch Listen und Historie')
  }
} catch {
  /* keine oder keine lesbare state.json – dann zählen allein die Dateien */
}

schreibeBuch()
console.log(
  `[einkaufsliste] ${buch.catalog.length} Artikel, ${buch.storeProfiles.length} Märkte, ${buch.recipes.length} Rezepte`,
)

// Beim allerersten Start einmal festschreiben: sonst würde jeder Aufruf neue
// IDs für die beiden Standardlisten erfinden, und zwei Geräte hätten
// unterschiedliche Listen vor sich.
if (!existsSync(STATE_FILE)) writeState(defaultState())

// Wer eine der Dateien ersetzt – von Hand oder mit `git checkout` –, soll dafür
// den Container nicht neu starten müssen. Beobachtet wird das Verzeichnis, weil
// atomares Schreiben die Datei ersetzt (neuer Inode).
let nachladen
watch(EXPORT_DIR, (_event, datei) => {
  const name = String(datei ?? '')
  if (!['katalog.json', 'maerkte.json', 'rezepte.json', 'rezeptgruppen.json'].includes(name)) {
    return
  }
  clearTimeout(nachladen)
  nachladen = setTimeout(() => {
    const pfad = join(EXPORT_DIR, name)
    const jetzt = existsSync(pfad) ? readFileSync(pfad, 'utf8') : ''
    if (jetzt === letzterStand.get(pfad)) return // unser eigener Schreibvorgang
    leseBuch()
    console.log(`[einkaufsliste] ${name} neu gelesen`)
    try {
      broadcast(readState())
    } catch (err) {
      console.error('[einkaufsliste] Broadcast nach Dateiänderung:', err.message)
    }
  }, 300)
})

function publicState(state) {
  return {
    lists: state.lists,
    categories: SEED_CATEGORIES,
    defaultCategoryOrder: DEFAULT_CATEGORY_ORDER,
    catalog: buch.catalog,
    recipes: buch.recipes,
    recipeGroups: buch.recipeGroups,
    unmatched: state.unmatched,
    storeProfiles: buch.storeProfiles,
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
    schreibeBuch()
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
    buch.storeProfiles = buch.storeProfiles.filter((p) => p.listId !== req.params.listId)
  })
})

// Welches Ladenprofil für diese Liste gilt (null = Standard-Reihenfolge)
app.put('/api/lists/:listId/store-profile', (req, res) => {
  const { storeProfileId } = req.body || {}
  if (storeProfileId !== null && typeof storeProfileId !== 'string') {
    return res.status(400).json({ error: 'Invalid payload' })
  }
  mutateList(req, res, (list) => {
    if (storeProfileId && !buch.storeProfiles.some((p) => p.id === storeProfileId)) {
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
    if (buch.storeProfiles.some((x) => x.id === p.id)) return
    if (!state.lists.some((l) => l.id === p.listId)) {
      return { reject: { status: 404, error: 'Liste nicht gefunden.' } }
    }
    buch.storeProfiles.push(
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
  mutate(req, res, () => {
    const profile = buch.storeProfiles.find((x) => x.id === req.params.id)
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
    buch.storeProfiles = buch.storeProfiles.filter((x) => x.id !== req.params.id)
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

// ── Rezepte ───────────────────────────────────────────────────────────────────
function pruefeRezept(r) {
  if (!r || typeof r.name !== 'string' || !r.name.trim()) return 'Name fehlt'
  if (r.group !== undefined && !istGruppe(r.group)) return 'Unbekannte Gruppe'
  if (r.ingredients !== undefined && !Array.isArray(r.ingredients)) {
    return 'Zutaten müssen eine Liste sein'
  }
  return null
}

// ── Rezeptgruppen ─────────────────────────────────────────────────────────────
// Die Gruppen sind das Gerüst des Rezeptbuchs und stehen deshalb in derselben
// Art Datei: export/rezeptgruppen.json.
function gruppenId(label) {
  const roh = normalize(label)
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
  const basis = roh || 'gruppe'
  let id = basis
  let n = 2
  while (istGruppe(id)) id = `${basis}_${n++}`
  return id
}

app.post('/api/recipe-groups', (req, res) => {
  const { label, emoji } = req.body || {}
  if (typeof label !== 'string' || !label.trim()) {
    return res.status(400).json({ error: 'Name fehlt' })
  }
  mutate(req, res, () => {
    if (buch.recipeGroups.some((g) => normalize(g.label) === normalize(label))) {
      return { reject: { status: 409, error: 'Diese Gruppe gibt es schon.' } }
    }
    buch.recipeGroups.push(normalizeGroup({ id: gruppenId(label), label, emoji }))
  })
})

app.put('/api/recipe-groups/:id', (req, res) => {
  const { label, emoji } = req.body || {}
  if (label !== undefined && (typeof label !== 'string' || !label.trim())) {
    return res.status(400).json({ error: 'Name fehlt' })
  }
  mutate(req, res, () => {
    const gruppe = buch.recipeGroups.find((g) => g.id === req.params.id)
    if (!gruppe) return { reject: { status: 404, error: 'Gruppe nicht gefunden.' } }
    if (
      label !== undefined &&
      buch.recipeGroups.some((g) => g.id !== gruppe.id && normalize(g.label) === normalize(label))
    ) {
      return { reject: { status: 409, error: 'Diese Gruppe gibt es schon.' } }
    }
    // Die id bleibt: an ihr hängen die Rezepte
    Object.assign(gruppe, normalizeGroup({ ...gruppe, label: label ?? gruppe.label, emoji }))
  })
})

// Eine Gruppe mit Rezepten wird nicht gelöscht – sonst verschwinden sie
// stillschweigend woanders hin. Erst umhängen, dann löschen.
app.delete('/api/recipe-groups/:id', (req, res) => {
  mutate(req, res, () => {
    const gruppe = buch.recipeGroups.find((g) => g.id === req.params.id)
    if (!gruppe) return
    const drin = buch.recipes.filter((r) => r.group === gruppe.id).length
    if (drin > 0) {
      return {
        reject: {
          status: 409,
          error: `In „${gruppe.label}“ liegen noch ${drin} Rezepte. Erst umhängen, dann löschen.`,
        },
      }
    }
    if (buch.recipeGroups.length === 1) {
      return { reject: { status: 409, error: 'Die letzte Gruppe muss bleiben.' } }
    }
    buch.recipeGroups = buch.recipeGroups.filter((g) => g.id !== gruppe.id)
  })
})

app.post('/api/recipes', (req, res) => {
  const fehler = pruefeRezept(req.body)
  if (fehler) return res.status(400).json({ error: fehler })
  mutate(req, res, () => {
    const r = normalizeRecipe({ ...req.body, id: req.body.id || createId() })
    if (buch.recipes.some((x) => x.id === r.id)) return
    if (buch.recipes.some((x) => normalize(x.name) === normalize(r.name))) {
      return { reject: { status: 409, error: 'Dieses Rezept gibt es schon.' } }
    }
    buch.recipes.push(r)
  })
})

/**
 * Reihenfolge der Rezepte, wie sie im Rezeptbuch stehen sollen. Geschickt wird
 * die komplette Liste der IDs; was fehlt (weil gerade jemand anderes etwas
 * angelegt hat), bleibt hinten stehen, statt verloren zu gehen.
 */
app.put('/api/recipes/order', (req, res) => {
  const { ids } = req.body || {}
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
    return res.status(400).json({ error: 'Invalid payload' })
  }
  mutate(req, res, () => {
    const rang = new Map(ids.map((id, index) => [id, index]))
    buch.recipes = [...buch.recipes].sort(
      (a, b) => (rang.get(a.id) ?? Infinity) - (rang.get(b.id) ?? Infinity),
    )
  })
})

app.put('/api/recipes/:id', (req, res) => {
  const fehler = pruefeRezept({ name: 'x', ...req.body })
  if (fehler) return res.status(400).json({ error: fehler })
  mutate(req, res, () => {
    const rezept = buch.recipes.find((x) => x.id === req.params.id)
    if (!rezept) return { reject: { status: 404, error: 'Rezept nicht gefunden.' } }
    const neu = normalizeRecipe({ ...rezept, ...req.body, id: rezept.id })
    if (buch.recipes.some((x) => x.id !== rezept.id && normalize(x.name) === normalize(neu.name))) {
      return { reject: { status: 409, error: 'Dieses Rezept gibt es schon.' } }
    }
    Object.assign(rezept, neu)
  })
})

app.delete('/api/recipes/:id', (req, res) => {
  mutate(req, res, () => {
    buch.recipes = buch.recipes.filter((x) => x.id !== req.params.id)
  })
})

/**
 * Ein ganzes Rezept auf die Liste: neue Artikel anlegen und bei Artikeln, die
 * schon draufstehen, die Menge fortschreiben. Beides in einem Request, damit
 * die Liste nicht halb gefüllt dasteht, wenn unterwegs die Verbindung abreißt.
 */
app.post('/api/lists/:listId/add-batch', (req, res) => {
  const { items, quantities } = req.body || {}
  if (!Array.isArray(items) || !Array.isArray(quantities)) {
    return res.status(400).json({ error: 'Invalid payload' })
  }
  for (const i of items) {
    if (!i || typeof i.id !== 'string' || typeof i.name !== 'string' || !i.name.trim()) {
      return res.status(400).json({ error: 'Invalid payload' })
    }
    if (typeof i.categoryId !== 'string' || !CATEGORY_IDS.has(i.categoryId)) {
      return res.status(400).json({ error: 'Unbekannte Kategorie' })
    }
  }
  for (const q of quantities) {
    if (!q || typeof q.itemId !== 'string' || typeof q.quantity !== 'string') {
      return res.status(400).json({ error: 'Invalid payload' })
    }
  }

  mutateList(req, res, (list, state) => {
    for (const q of quantities) {
      const item = list.items.find((x) => x.id === q.itemId)
      if (item) item.quantity = q.quantity.trim()
    }
    for (const i of items) {
      if (list.items.some((x) => x.id === i.id)) continue
      const item = normalizeItem({ ...i, name: i.name.trim(), done: false })
      list.items.push(item)
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
    }
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
    const vorher = buch.catalog.find((e) => normalize(e.name) === key)
    const gemerkt = new Set([
      ...(vorher?.aliases ?? []),
      ...(Array.isArray(aliases) ? aliases.filter((a) => typeof a === 'string') : []),
    ])
    buch.catalog = buch.catalog.filter((e) => normalize(e.name) !== key)
    buch.catalog.push({ name: clean, aliases: [...gemerkt], category_id: categoryId })
    state.unmatched = state.unmatched.filter((u) => normalize(u.name) !== key)
    applyToUnmatchedItems(state, clean, categoryId, clean)
  })
})

// Hängt eine weitere Schreibweise an einen bestehenden Artikel. Bei einem
// Der Katalog steht in genau einer Datei; die Änderung landet direkt dort.
app.post('/api/catalog/alias', (req, res) => {
  const { name, alias } = req.body || {}
  if (typeof name !== 'string' || !name.trim() || typeof alias !== 'string' || !alias.trim()) {
    return res.status(400).json({ error: 'Invalid payload' })
  }
  mutate(req, res, (state) => {
    const key = normalize(name)
    const eintrag = buch.catalog.find((e) => normalize(e.name) === key)
    if (!eintrag) return { reject: { status: 404, error: 'Artikel nicht im Katalog.' } }

    const sauber = alias.trim()
    const aliasKey = normalize(sauber)
    if (aliasKey === key) {
      return { reject: { status: 409, error: 'Das ist der Artikelname selbst.' } }
    }

    const aliase = eintrag.aliases.filter((a) => normalize(a) !== aliasKey)
    aliase.push(sauber)

    buch.catalog = buch.catalog.filter((e) => normalize(e.name) !== key)
    buch.catalog.push({
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
  mutate(req, res, () => {
    const eintrag = sauberEintrag(req.body)
    const key = normalize(eintrag.name)
    buch.catalog = buch.catalog.filter((e) => normalize(e.name) !== key)
    buch.catalog.push(eintrag)
  })
})

// Artikel aus dem Katalog werfen. Ohne Seed im Rücken ist er damit weg – die
// alte Rückkehr beim nächsten Start gibt es nicht mehr.
app.delete('/api/catalog', (req, res) => {
  const { name } = req.body || {}
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Invalid payload' })
  }
  mutate(req, res, () => {
    const key = normalize(name)
    buch.catalog = buch.catalog.filter((e) => normalize(e.name) !== key)
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
