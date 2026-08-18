import express from 'express'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'data')
const SEED_DIR = join(__dirname, 'seed')
const BACKUPS_DIR = join(__dirname, 'backups')
const KEEP_BACKUPS = 30
const PORT = Number(process.env.PORT) || 2609

// Öffentliche Adresse der App – daraus baut sich die Strava-Rücksprungadresse.
const PUBLIC_URL = (process.env.PUBLIC_URL || 'https://tshomeserv.duckdns.org/fahrrad').replace(
  /\/+$/,
  '',
)
const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID || ''
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET || ''
const STRAVA_CONFIGURED = Boolean(STRAVA_CLIENT_ID && STRAVA_CLIENT_SECRET)

mkdirSync(DATA_DIR, { recursive: true })
mkdirSync(BACKUPS_DIR, { recursive: true })

// ── Die Dateien unter data/ ──────────────────────────────────────────────────
// Ein Modell je Datei, jede eine schlichte JSON-Liste (settings.json ist das
// einzige Objekt). Die Datei *ist* die Wahrheit: es gibt keine zweite Fassung
// im Speicher, die irgendwann nachgezogen würde – geschrieben wird im selben
// Request, in dem die Änderung ankommt.
const USERS_FILE = join(DATA_DIR, 'users.json')
const STRAVA_FILE = join(DATA_DIR, 'strava.json')
const BIKES_FILE = join(DATA_DIR, 'bikes.json')
const TYPES_FILE = join(DATA_DIR, 'component-types.json')
const COMPONENTS_FILE = join(DATA_DIR, 'components.json')
const ACTIVITIES_FILE = join(DATA_DIR, 'activities.json')
const SESSIONS_FILE = join(DATA_DIR, 'sessions.json')
const SETTINGS_FILE = join(DATA_DIR, 'settings.json')

const letzterStand = new Map()

/** Erst in eine temporäre Datei, dann umbenennen – ein Absturz mitten im
 *  Schreiben kann so keine halb beschriebene Datei hinterlassen. */
function schreibe(datei, daten) {
  const inhalt = `${JSON.stringify(daten, null, 2)}\n`
  if (inhalt === letzterStand.get(datei)) return
  const tmp = `${datei}.tmp`
  writeFileSync(tmp, inhalt, 'utf8')
  renameSync(tmp, datei)
  letzterStand.set(datei, inhalt)
}

function lies(datei, fallback) {
  if (!existsSync(datei)) return fallback
  try {
    const roh = readFileSync(datei, 'utf8')
    letzterStand.set(datei, roh)
    return JSON.parse(roh)
  } catch (err) {
    // Lieber laut abbrechen als mit einem leeren Stand weiterlaufen und ihn
    // beim nächsten Schreiben über die kaputte Datei bügeln.
    console.error(`[fahrradtracker] ${basename(datei)} ist nicht lesbar:`, err.message)
    throw err
  }
}

const DEFAULT_SETTINGS = {
  // Ampel: unter „gelb“ ist grün, ab „rot“ ist rot. Prozent vom Grenzwert.
  thresholds: { yellow: 70, red: 100 },
  // Wie oft im Hintergrund bei Strava nachgefragt wird
  syncIntervalHours: 3,
}

const db = {
  users: [],
  strava: [],
  bikes: [],
  types: [],
  components: [],
  activities: [],
  sessions: [],
  settings: { ...DEFAULT_SETTINGS },
}

function ladeAlles() {
  db.users = lies(USERS_FILE, [])
  db.strava = lies(STRAVA_FILE, [])
  db.bikes = lies(BIKES_FILE, [])
  db.types =
    lies(TYPES_FILE, null) ?? JSON.parse(readFileSync(join(SEED_DIR, 'teile.json'), 'utf8'))
  db.components = lies(COMPONENTS_FILE, [])
  db.activities = lies(ACTIVITIES_FILE, [])
  db.sessions = lies(SESSIONS_FILE, [])
  const s = lies(SETTINGS_FILE, null)
  db.settings = {
    thresholds: { ...DEFAULT_SETTINGS.thresholds, ...s?.thresholds },
    syncIntervalHours: Number(s?.syncIntervalHours) || DEFAULT_SETTINGS.syncIntervalHours,
  }
}

const DATEIEN = {
  users: USERS_FILE,
  strava: STRAVA_FILE,
  bikes: BIKES_FILE,
  types: TYPES_FILE,
  components: COMPONENTS_FILE,
  activities: ACTIVITIES_FILE,
  sessions: SESSIONS_FILE,
  settings: SETTINGS_FILE,
}

/** Schreibt genau die Modelle, die sich geändert haben. */
function sichere(...modelle) {
  for (const modell of modelle) {
    try {
      schreibe(DATEIEN[modell], db[modell])
    } catch (err) {
      console.error(`[fahrradtracker] ${modell} schreiben fehlgeschlagen:`, err.message)
    }
  }
}

ladeAlles()
if (!existsSync(TYPES_FILE)) sichere('types')
console.log(
  `[fahrradtracker] ${db.users.length} Profile, ${db.bikes.length} Räder, ${db.components.length} Teile, ${db.activities.length} Fahrten`,
)

// ── Tägliches Backup ─────────────────────────────────────────────────────────
// Ein Schnappschuss pro Tag in eine einzige Datei, damit backup-sync ihn wie
// bei den anderen Apps in die Nextcloud schieben kann. Die Strava-Tokens
// bleiben bewusst draußen: das sind echte Zugangsdaten, und nach einer
// Wiederherstellung ist „neu verbinden“ ein Klick.
function runBackup() {
  try {
    if (!db.users.length && !db.components.length) return
    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`
    const schnappschuss = {
      erstelltAm: now.toISOString(),
      users: db.users,
      bikes: db.bikes,
      componentTypes: db.types,
      components: db.components,
      activities: db.activities,
      settings: db.settings,
    }
    writeFileSync(
      join(BACKUPS_DIR, `fahrrad_${ts}.json`),
      `${JSON.stringify(schnappschuss, null, 2)}\n`,
      'utf8',
    )

    const alt = readdirSync(BACKUPS_DIR)
      .filter((f) => f.startsWith('fahrrad_') && f.endsWith('.json'))
      .sort()
      .slice(0, -KEEP_BACKUPS)
    for (const file of alt) unlinkSync(join(BACKUPS_DIR, file))
    console.log(`[fahrradtracker] Backup gespeichert (${KEEP_BACKUPS} werden aufbewahrt)`)
  } catch (err) {
    console.error('[fahrradtracker] Backup fehlgeschlagen:', err.message)
  }
}

// Ältere Formate der anderen Apps kopieren state.json; hier ist es ein
// Schnappschuss aus mehreren Dateien – deshalb einmal beim Start und danach
// täglich.
runBackup()
setInterval(runBackup, 24 * 60 * 60 * 1000)

// ── Kleinkram ────────────────────────────────────────────────────────────────
function createId() {
  return randomUUID()
}

function heute() {
  return new Date().toISOString().slice(0, 10)
}

const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/

function istDatum(wert) {
  return typeof wert === 'string' && ISO_DATUM.test(wert) && !Number.isNaN(Date.parse(wert))
}

function text(wert, max = 120) {
  return String(wert ?? '')
    .trim()
    .slice(0, max)
}

// ── Profile und PIN ──────────────────────────────────────────────────────────
// Die App ist von außen erreichbar, deshalb hängt vor jedem Profil eine kurze
// PIN. Gespeichert wird sie als scrypt-Hash mit eigenem Salt je Profil – im
// Klartext steht sie nirgends, auch nicht im Browser.
function hashePin(pin, salt = randomBytes(16).toString('hex')) {
  return { pinSalt: salt, pinHash: scryptSync(String(pin), salt, 64).toString('hex') }
}

function pinStimmt(user, pin) {
  const { pinHash } = hashePin(pin, user.pinSalt)
  const a = Buffer.from(pinHash, 'hex')
  const b = Buffer.from(String(user.pinHash ?? ''), 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

const PIN_MUSTER = /^\d{4,6}$/

// Bremse gegen Durchprobieren: nach fünf Fehlversuchen ist das Profil kurz
// gesperrt, und die Sperre verdoppelt sich mit jedem weiteren Versuch. Bewusst
// nur im Speicher – ein Neustart passiert selten genug, und die Zähler sind
// nichts, was eine Datei wert wäre.
const fehlversuche = new Map()

function sperreBis(userId) {
  const eintrag = fehlversuche.get(userId)
  return eintrag && eintrag.bis > Date.now() ? eintrag.bis : 0
}

function merkeFehlversuch(userId) {
  const eintrag = fehlversuche.get(userId) ?? { anzahl: 0, bis: 0 }
  eintrag.anzahl += 1
  if (eintrag.anzahl >= 5) {
    const sekunden = Math.min(30 * 2 ** (eintrag.anzahl - 5), 900)
    eintrag.bis = Date.now() + sekunden * 1000
  }
  fehlversuche.set(userId, eintrag)
}

// ── Sitzungen ────────────────────────────────────────────────────────────────
// Der Browser bekommt ein Token und legt es in localStorage ab; auf dem Server
// liegt nur sein SHA-256-Hash. Ein gestohlener Dateizugriff auf sessions.json
// hilft damit niemandem weiter.
const SESSION_TAGE = 180

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function neueSession(userId) {
  const token = randomBytes(32).toString('hex')
  db.sessions.push({
    tokenHash: hashToken(token),
    userId,
    createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  })
  raeumeSessions()
  sichere('sessions')
  return token
}

function raeumeSessions() {
  const grenze = Date.now() - SESSION_TAGE * 24 * 60 * 60 * 1000
  const bekannt = new Set(db.users.map((u) => u.id))
  db.sessions = db.sessions.filter(
    (s) => bekannt.has(s.userId) && Date.parse(s.lastSeenAt ?? s.createdAt) > grenze,
  )
}

function sessionAus(req) {
  const kopf = String(req.get('authorization') ?? '')
  const token = kopf.startsWith('Bearer ') ? kopf.slice(7) : ''
  if (!token) return null
  const hash = hashToken(token)
  const session = db.sessions.find((s) => s.tokenHash === hash)
  if (!session) return null
  const user = db.users.find((u) => u.id === session.userId)
  if (!user) return null
  // Nur gelegentlich fortschreiben, sonst schreibt jeder Request eine Datei
  const jetzt = new Date()
  if (jetzt - Date.parse(session.lastSeenAt ?? session.createdAt) > 12 * 60 * 60 * 1000) {
    session.lastSeenAt = jetzt.toISOString()
    sichere('sessions')
  }
  return user
}

function auth(req, res, next) {
  const user = sessionAus(req)
  if (!user) return res.status(401).json({ error: 'Bitte neu anmelden.' })
  req.user = user
  next()
}

/** Rad heraussuchen und dabei prüfen, dass es dem Angemeldeten gehört. */
function eigenesRad(req, res, bikeId) {
  const bike = db.bikes.find((b) => b.id === bikeId)
  if (!bike) {
    res.status(404).json({ error: 'Rad nicht gefunden.' })
    return null
  }
  if (bike.ownerId !== req.user.id) {
    res.status(403).json({ error: 'Das Rad gehört jemand anderem.' })
    return null
  }
  return bike
}

// ── Strava ───────────────────────────────────────────────────────────────────
// Jedes Profil verbindet sein eigenes Konto. Die Tokens liegen ausschließlich
// hier auf dem Server (data/strava.json) und gehen nie an den Browser.
const STRAVA_SCOPE = 'read,activity:read_all'
const RIDE_TYPES = new Set([
  'Ride',
  'GravelRide',
  'MountainBikeRide',
  'EBikeRide',
  'VirtualRide',
  'Velomobile',
  'Handcycle',
])

function verbindung(userId) {
  return db.strava.find((c) => c.userId === userId) ?? null
}

/** Holt bei Bedarf ein frisches Access-Token; Strava-Tokens laufen nach sechs
 *  Stunden ab, das Refresh-Token bleibt gültig. */
async function frischesToken(conn) {
  if (conn.expiresAt && Date.parse(conn.expiresAt) > Date.now() + 120_000) return conn.accessToken
  const r = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: conn.refreshToken,
    }),
  })
  if (!r.ok) throw new Error(`Strava-Token abgelaufen (HTTP ${r.status})`)
  const daten = await r.json()
  conn.accessToken = daten.access_token
  conn.refreshToken = daten.refresh_token ?? conn.refreshToken
  conn.expiresAt = new Date(daten.expires_at * 1000).toISOString()
  sichere('strava')
  return conn.accessToken
}

async function stravaGet(conn, pfad) {
  const token = await frischesToken(conn)
  const r = await fetch(`https://www.strava.com/api/v3${pfad}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (r.status === 429) throw new Error('Strava-Limit erreicht – später noch einmal versuchen.')
  if (!r.ok) throw new Error(`Strava antwortet mit HTTP ${r.status}`)
  return r.json()
}

/**
 * Holt die Fahrten eines Profils. Gelesen wird ab dem letzten Sync minus zwei
 * Wochen: Strava erlaubt nachträgliche Änderungen an Aktivitäten (auch am
 * zugeordneten Rad), und nur so kommen die hier auch an. Beim ersten Lauf
 * kommt alles.
 */
async function syncUser(userId) {
  const conn = verbindung(userId)
  if (!conn) throw new Error('Dieses Profil ist nicht mit Strava verbunden.')

  const ab = conn.lastSyncAt
    ? Math.floor(Date.parse(conn.lastSyncAt) / 1000) - 14 * 24 * 60 * 60
    : 0
  const eigene = new Map(db.activities.filter((a) => a.userId === userId).map((a) => [a.id, a]))
  let neu = 0
  let geaendert = 0

  for (let seite = 1; seite <= 40; seite += 1) {
    const liste = await stravaGet(
      conn,
      `/athlete/activities?per_page=200&page=${seite}${ab ? `&after=${ab}` : ''}`,
    )
    if (!Array.isArray(liste) || !liste.length) break

    for (const a of liste) {
      const art = a.sport_type ?? a.type
      if (!RIDE_TYPES.has(art)) continue
      const fahrt = {
        id: String(a.id),
        userId,
        // Ohne Gear in Strava lässt sich die Fahrt keinem Rad zuordnen; sie
        // wird trotzdem gemerkt, damit die App darauf hinweisen kann.
        gearId: a.gear_id ?? null,
        date: String(a.start_date_local ?? a.start_date ?? '').slice(0, 10),
        km: Math.round((Number(a.distance) || 0) / 10) / 100,
        name: text(a.name, 80),
        type: art,
      }
      const alt = eigene.get(fahrt.id)
      if (!alt) {
        db.activities.push(fahrt)
        eigene.set(fahrt.id, fahrt)
        neu += 1
      } else if (alt.gearId !== fahrt.gearId || alt.date !== fahrt.date || alt.km !== fahrt.km) {
        Object.assign(alt, fahrt)
        geaendert += 1
      }
    }
    if (liste.length < 200) break
  }

  conn.lastSyncAt = new Date().toISOString()
  conn.lastSyncError = ''
  sichere('strava', 'activities')
  console.log(`[fahrradtracker] Sync ${userId}: ${neu} neu, ${geaendert} aktualisiert`)
  return { neu, geaendert }
}

/** Räder, die in Strava als „Gear“ gepflegt sind – daraus wählt die
 *  Verwaltung beim Verknüpfen. */
async function stravaGear(userId) {
  const conn = verbindung(userId)
  if (!conn) throw new Error('Dieses Profil ist nicht mit Strava verbunden.')
  const athlet = await stravaGet(conn, '/athlete')
  return (athlet.bikes ?? []).map((b) => ({
    id: String(b.id),
    name: text(b.name, 80),
    km: Math.round((Number(b.distance) || 0) / 1000),
  }))
}

// Regelmäßig im Hintergrund nachfragen – ein Webhook wäre für ein paar Fahrten
// am Tag zu viel Apparat. Geprüft wird stündlich, gesynct nur, was fällig ist.
async function syncFaellige() {
  if (!STRAVA_CONFIGURED) return
  for (const conn of db.strava) {
    const faellig =
      !conn.lastSyncAt ||
      Date.now() - Date.parse(conn.lastSyncAt) > db.settings.syncIntervalHours * 3600_000
    if (!faellig) continue
    try {
      await syncUser(conn.userId)
    } catch (err) {
      conn.lastSyncError = err.message
      sichere('strava')
      console.error(`[fahrradtracker] Sync für ${conn.userId} fehlgeschlagen:`, err.message)
    }
  }
}

setTimeout(syncFaellige, 20_000)
setInterval(syncFaellige, 60 * 60 * 1000)

// ── Verschleißrechnung ───────────────────────────────────────────────────────
// Die Kilometer einer Instanz sind die Summe der Fahrten des Rades über alle
// ihre Nutzungszeiträume. Ein Zeitraum zählt beide Randtage mit: wird an einem
// Tag gewechselt, zählt die Fahrt dieses Tages für das alte *und* das neue
// Teil – das ist die Variante, die nie Kilometer verschluckt.
function kmImZeitraum(bike, von, bis) {
  const ende = bis ?? heute()
  let summe = 0
  for (const a of db.activities) {
    if (a.userId !== bike.ownerId) continue
    if (!a.gearId || a.gearId !== bike.stravaGearId) continue
    if (a.date < von || a.date > ende) continue
    summe += a.km
  }
  return Math.round(summe * 10) / 10
}

/** Grenzwert einer Instanz: eigener Wert → Wert für Rad+Kategorie → Standard
 *  der Kategorie. */
function grenzeFuer(component, bike, typ) {
  if (typeof component.limitKm === 'number' && component.limitKm > 0) {
    return { limitKm: component.limitKm, limitQuelle: 'instanz' }
  }
  const amRad = Number(bike?.limits?.[component.typeId])
  if (amRad > 0) return { limitKm: amRad, limitQuelle: 'rad' }
  return { limitKm: Number(typ?.defaultLimitKm) || 0, limitQuelle: 'standard' }
}

function komponenteMitKm(component) {
  const bike = db.bikes.find((b) => b.id === component.bikeId)
  const typ = db.types.find((t) => t.id === component.typeId)
  const perioden = (component.periods ?? []).map((p) => ({
    ...p,
    km: bike ? kmImZeitraum(bike, p.from, p.to) : 0,
  }))
  const totalKm = Math.round(perioden.reduce((s, p) => s + p.km, 0) * 10) / 10
  const { limitKm, limitQuelle } = grenzeFuer(component, bike, typ)
  return {
    ...component,
    periods: perioden,
    // Der eigene Grenzwert der Instanz bleibt sichtbar; `limitKm` weiter unten
    // ist der, der am Ende gilt
    ownLimitKm: component.limitKm ?? null,
    totalKm,
    limitKm,
    limitQuelle,
    percent: limitKm > 0 ? Math.round((totalKm / limitKm) * 100) : 0,
  }
}

// ── Der Stand für den Browser ────────────────────────────────────────────────
function profil(u) {
  const conn = verbindung(u.id)
  return {
    id: u.id,
    name: u.name,
    color: u.color,
    hasStrava: Boolean(conn),
    athleteName: conn?.athleteName ?? '',
    lastSyncAt: conn?.lastSyncAt ?? '',
    lastSyncError: conn?.lastSyncError ?? '',
  }
}

function publicState(user) {
  // Fahrten ohne Rad-Zuordnung kann die App keinem Teil zurechnen – die
  // Verwaltung weist darauf hin, statt sie stillschweigend zu schlucken.
  const ohneGear = db.activities.filter((a) => a.userId === user.id && !a.gearId).length
  const verknuepft = new Set(
    db.bikes.filter((b) => b.ownerId === user.id).map((b) => b.stravaGearId),
  )
  const fremdesGear = new Set(
    db.activities
      .filter((a) => a.userId === user.id && a.gearId && !verknuepft.has(a.gearId))
      .map((a) => a.gearId),
  )
  return {
    me: profil(user),
    users: db.users.map(profil),
    bikes: db.bikes,
    componentTypes: db.types,
    components: db.components.map(komponenteMitKm),
    settings: db.settings,
    stravaConfigured: STRAVA_CONFIGURED,
    fahrten: db.activities.filter((a) => a.userId === user.id).length,
    ohneGear,
    unbekanntesGear: fremdesGear.size,
  }
}

const app = express()
app.use(express.json({ limit: '1mb' }))
app.use(express.static(join(__dirname, 'dist')))

function antworte(req, res, arbeit) {
  try {
    const ergebnis = arbeit()
    if (ergebnis?.reject) {
      return res.status(ergebnis.reject.status).json({ error: ergebnis.reject.error })
    }
    res.json(publicState(req.user))
  } catch (err) {
    console.error('[fahrradtracker] Änderung fehlgeschlagen:', err.message)
    res.status(500).json({ error: err.message })
  }
}

// ── Profil-Auswahl und Anmeldung ─────────────────────────────────────────────
// Ohne Sitzung gibt es nur diese Liste: Name und Farbe für den Auswahlschirm,
// sonst nichts.
app.get('/api/profiles', (_req, res) => {
  res.json({
    profiles: db.users.map((u) => ({
      id: u.id,
      name: u.name,
      color: u.color,
      hasStrava: Boolean(verbindung(u.id)),
    })),
    stravaConfigured: STRAVA_CONFIGURED,
  })
})

const FARBEN = ['#7c3aed', '#0891b2', '#c2740a', '#15803d', '#be185d', '#4338ca']

app.post('/api/profiles', (req, res) => {
  const name = text(req.body?.name, 40)
  const pin = String(req.body?.pin ?? '')
  if (!name) return res.status(400).json({ error: 'Bitte einen Namen eintragen.' })
  if (!PIN_MUSTER.test(pin)) return res.status(400).json({ error: 'Die PIN sind 4 bis 6 Ziffern.' })
  if (db.users.some((u) => u.name.toLowerCase() === name.toLowerCase())) {
    return res.status(409).json({ error: 'Diesen Namen gibt es schon.' })
  }
  const user = {
    id: createId(),
    name,
    color: FARBEN.includes(req.body?.color)
      ? req.body.color
      : FARBEN[db.users.length % FARBEN.length],
    createdAt: new Date().toISOString(),
    ...hashePin(pin),
  }
  db.users.push(user)
  sichere('users')
  const token = neueSession(user.id)
  res.json({ token, state: publicState(user) })
})

app.post('/api/profiles/:id/login', (req, res) => {
  const user = db.users.find((u) => u.id === req.params.id)
  if (!user) return res.status(404).json({ error: 'Profil nicht gefunden.' })

  const bis = sperreBis(user.id)
  if (bis) {
    const sekunden = Math.ceil((bis - Date.now()) / 1000)
    return res.status(429).json({ error: `Zu viele Versuche – ${sekunden} s warten.` })
  }
  if (!pinStimmt(user, String(req.body?.pin ?? ''))) {
    merkeFehlversuch(user.id)
    return res.status(401).json({ error: 'Falsche PIN.' })
  }

  fehlversuche.delete(user.id)
  const token = neueSession(user.id)
  res.json({ token, state: publicState(user) })
})

app.post('/api/logout', auth, (req, res) => {
  const kopf = String(req.get('authorization') ?? '')
  const hash = hashToken(kopf.slice(7))
  db.sessions = db.sessions.filter((s) => s.tokenHash !== hash)
  sichere('sessions')
  res.json({ ok: true })
})

/** PIN ändern – nur mit der alten. */
app.put('/api/profile/pin', auth, (req, res) => {
  const neu = String(req.body?.pin ?? '')
  if (!pinStimmt(req.user, String(req.body?.alt ?? ''))) {
    return res.status(401).json({ error: 'Die bisherige PIN stimmt nicht.' })
  }
  if (!PIN_MUSTER.test(neu)) return res.status(400).json({ error: 'Die PIN sind 4 bis 6 Ziffern.' })
  antworte(req, res, () => {
    Object.assign(req.user, hashePin(neu))
    sichere('users')
  })
})

app.put('/api/profile', auth, (req, res) => {
  const name = text(req.body?.name, 40)
  antworte(req, res, () => {
    if (!name) return { reject: { status: 400, error: 'Bitte einen Namen eintragen.' } }
    if (db.users.some((u) => u.id !== req.user.id && u.name.toLowerCase() === name.toLowerCase())) {
      return { reject: { status: 409, error: 'Diesen Namen gibt es schon.' } }
    }
    req.user.name = name
    if (FARBEN.includes(req.body?.color)) req.user.color = req.body.color
    sichere('users')
  })
})

app.get('/api/state', auth, (req, res) => {
  res.json(publicState(req.user))
})

// ── Räder ────────────────────────────────────────────────────────────────────
// Sichtbar sind alle Räder für alle; ändern darf sie nur, wem sie gehören.
app.post('/api/bikes', auth, (req, res) => {
  const name = text(req.body?.name, 60)
  antworte(req, res, () => {
    if (!name) return { reject: { status: 400, error: 'Bitte einen Namen eintragen.' } }
    db.bikes.push({
      id: createId(),
      ownerId: req.user.id,
      name,
      // Über die Gear-ID kommen die Fahrten ans Rad; ohne sie bleibt es bei 0 km
      stravaGearId: text(req.body?.stravaGearId, 40) || null,
      limits: {},
      createdAt: new Date().toISOString(),
    })
    sichere('bikes')
  })
})

app.put('/api/bikes/:id', auth, (req, res) => {
  const bike = eigenesRad(req, res, req.params.id)
  if (!bike) return
  antworte(req, res, () => {
    if (req.body?.name !== undefined) {
      const name = text(req.body.name, 60)
      if (!name) return { reject: { status: 400, error: 'Bitte einen Namen eintragen.' } }
      bike.name = name
    }
    if (req.body?.stravaGearId !== undefined) {
      bike.stravaGearId = text(req.body.stravaGearId, 40) || null
    }
    sichere('bikes')
  })
})

app.delete('/api/bikes/:id', auth, (req, res) => {
  const bike = eigenesRad(req, res, req.params.id)
  if (!bike) return
  antworte(req, res, () => {
    db.bikes = db.bikes.filter((b) => b.id !== bike.id)
    db.components = db.components.filter((c) => c.bikeId !== bike.id)
    sichere('bikes', 'components')
  })
})

/** Grenzwert für eine Kategorie an genau diesem Rad; `null` setzt zurück auf
 *  den Standard der Kategorie. */
app.put('/api/bikes/:id/limits/:typeId', auth, (req, res) => {
  const bike = eigenesRad(req, res, req.params.id)
  if (!bike) return
  antworte(req, res, () => {
    const wert = req.body?.limitKm
    if (wert !== null && !(Number(wert) > 0)) {
      return { reject: { status: 400, error: 'Der Grenzwert muss eine Zahl über 0 sein.' } }
    }
    bike.limits ??= {}
    if (wert === null) delete bike.limits[req.params.typeId]
    else bike.limits[req.params.typeId] = Math.round(Number(wert))
    sichere('bikes')
  })
})

// ── Kategorien (ComponentTypes) ──────────────────────────────────────────────
// Gemeinsam für alle Räder und alle Profile – „Kette“ ist an jedem Rad dieselbe
// Kategorie, nur der Grenzwert kann abweichen.
app.post('/api/component-types', auth, (req, res) => {
  antworte(req, res, () => {
    const name = text(req.body?.name, 40)
    if (!name) return { reject: { status: 400, error: 'Bitte einen Namen eintragen.' } }
    if (db.types.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      return { reject: { status: 409, error: 'Diese Kategorie gibt es schon.' } }
    }
    db.types.push({
      id: createId(),
      name,
      emoji: text(req.body?.emoji, 4) || '🔧',
      color: text(req.body?.color, 20) || '#7c3aed',
      defaultLimitKm: Math.max(1, Math.round(Number(req.body?.defaultLimitKm) || 3000)),
    })
    sichere('types')
  })
})

app.put('/api/component-types/:id', auth, (req, res) => {
  antworte(req, res, () => {
    const typ = db.types.find((t) => t.id === req.params.id)
    if (!typ) return { reject: { status: 404, error: 'Kategorie nicht gefunden.' } }
    if (req.body?.name !== undefined) {
      const name = text(req.body.name, 40)
      if (!name) return { reject: { status: 400, error: 'Bitte einen Namen eintragen.' } }
      typ.name = name
    }
    if (req.body?.emoji !== undefined) typ.emoji = text(req.body.emoji, 4) || typ.emoji
    if (req.body?.color !== undefined) typ.color = text(req.body.color, 20) || typ.color
    if (req.body?.defaultLimitKm !== undefined) {
      const wert = Number(req.body.defaultLimitKm)
      if (!(wert > 0))
        return { reject: { status: 400, error: 'Der Grenzwert muss über 0 liegen.' } }
      typ.defaultLimitKm = Math.round(wert)
    }
    sichere('types')
  })
})

app.delete('/api/component-types/:id', auth, (req, res) => {
  antworte(req, res, () => {
    if (db.components.some((c) => c.typeId === req.params.id)) {
      return {
        reject: { status: 409, error: 'Zu dieser Kategorie gibt es noch Teile.' },
      }
    }
    db.types = db.types.filter((t) => t.id !== req.params.id)
    sichere('types')
  })
})

// ── Teile (ComponentInstances) ───────────────────────────────────────────────
function eigenesTeil(req, res) {
  const component = db.components.find((c) => c.id === req.params.id)
  if (!component) {
    res.status(404).json({ error: 'Teil nicht gefunden.' })
    return null
  }
  return eigenesRad(req, res, component.bikeId) ? component : null
}

function offenePeriode(component) {
  return (component.periods ?? []).find((p) => !p.to) ?? null
}

/** Baut ein Teil ein und legt das bisher aktive derselben Kategorie am selben
 *  Rad still – eingelagert, nicht entsorgt: es lässt sich jederzeit wieder
 *  aufziehen. */
function einbauen(component, datum) {
  if (offenePeriode(component)) {
    return { reject: { status: 409, error: 'Das Teil ist bereits eingebaut.' } }
  }
  const vorher = db.components.find(
    (c) =>
      c.id !== component.id &&
      c.bikeId === component.bikeId &&
      c.typeId === component.typeId &&
      c.status === 'aktiv',
  )
  if (vorher) {
    const offen = offenePeriode(vorher)
    // Ein Ausbau vor dem eigenen Einbau ergäbe einen negativen Zeitraum
    if (offen) offen.to = datum < offen.from ? offen.from : datum
    vorher.status = 'eingelagert'
  }
  component.status = 'aktiv'
  component.periods.push({ id: createId(), from: datum, to: null })
  return null
}

app.post('/api/components', auth, (req, res) => {
  const bike = eigenesRad(req, res, text(req.body?.bikeId, 60))
  if (!bike) return
  antworte(req, res, () => {
    const typ = db.types.find((t) => t.id === req.body?.typeId)
    if (!typ) return { reject: { status: 404, error: 'Kategorie nicht gefunden.' } }
    const einbau = req.body?.installedAt ?? heute()
    if (req.body?.installedAt !== undefined && einbau !== null && !istDatum(einbau)) {
      return { reject: { status: 400, error: 'Das Einbaudatum ist kein gültiges Datum.' } }
    }
    const grenze = Number(req.body?.limitKm)

    const component = {
      id: createId(),
      bikeId: bike.id,
      typeId: typ.id,
      label: text(req.body?.label, 60) || naechsterName(bike.id, typ),
      limitKm: grenze > 0 ? Math.round(grenze) : null,
      note: text(req.body?.note, 500),
      status: 'eingelagert',
      periods: [],
      createdAt: new Date().toISOString(),
    }
    db.components.push(component)
    // Ein neues Teil ist normalerweise das, was gerade aufgezogen wird
    if (einbau !== null) {
      const fehler = einbauen(component, einbau)
      if (fehler) return fehler
    }
    sichere('components')
  })
})

/** „Kette 2“, „Kette 3“ … – der Vorschlag zählt weiter, was am Rad schon da
 *  war. */
function naechsterName(bikeId, typ) {
  const anzahl = db.components.filter((c) => c.bikeId === bikeId && c.typeId === typ.id).length
  return anzahl ? `${typ.name} ${anzahl + 1}` : typ.name
}

app.put('/api/components/:id', auth, (req, res) => {
  const component = eigenesTeil(req, res)
  if (!component) return
  antworte(req, res, () => {
    if (req.body?.label !== undefined) {
      const label = text(req.body.label, 60)
      if (!label) return { reject: { status: 400, error: 'Bitte eine Bezeichnung eintragen.' } }
      component.label = label
    }
    if (req.body?.note !== undefined) component.note = text(req.body.note, 500)
    if (req.body?.limitKm !== undefined) {
      const wert = req.body.limitKm
      if (wert !== null && !(Number(wert) > 0)) {
        return { reject: { status: 400, error: 'Der Grenzwert muss eine Zahl über 0 sein.' } }
      }
      component.limitKm = wert === null ? null : Math.round(Number(wert))
    }
    sichere('components')
  })
})

app.delete('/api/components/:id', auth, (req, res) => {
  const component = eigenesTeil(req, res)
  if (!component) return
  antworte(req, res, () => {
    db.components = db.components.filter((c) => c.id !== component.id)
    sichere('components')
  })
})

/** Aufziehen – auch aus dem Lager heraus, so oft wie nötig. */
app.post('/api/components/:id/install', auth, (req, res) => {
  const component = eigenesTeil(req, res)
  if (!component) return
  antworte(req, res, () => {
    const datum = req.body?.date ?? heute()
    if (!istDatum(datum)) return { reject: { status: 400, error: 'Kein gültiges Datum.' } }
    if (component.status === 'entsorgt') {
      return { reject: { status: 409, error: 'Entsorgte Teile lassen sich nicht einbauen.' } }
    }
    const fehler = einbauen(component, datum)
    if (fehler) return fehler
    sichere('components')
  })
})

/** Abziehen: ins Lager (Standard) oder gleich in den Müll. */
app.post('/api/components/:id/remove', auth, (req, res) => {
  const component = eigenesTeil(req, res)
  if (!component) return
  antworte(req, res, () => {
    const datum = req.body?.date ?? heute()
    if (!istDatum(datum)) return { reject: { status: 400, error: 'Kein gültiges Datum.' } }
    const offen = offenePeriode(component)
    if (offen) offen.to = datum < offen.from ? offen.from : datum
    component.status = req.body?.entsorgen ? 'entsorgt' : 'eingelagert'
    sichere('components')
  })
})

/** Endzustand setzen oder zurücknehmen, ohne an den Zeiträumen zu rühren. */
app.post('/api/components/:id/status', auth, (req, res) => {
  const component = eigenesTeil(req, res)
  if (!component) return
  antworte(req, res, () => {
    const status = req.body?.status
    if (!['eingelagert', 'entsorgt'].includes(status)) {
      return { reject: { status: 400, error: 'Unbekannter Status.' } }
    }
    if (offenePeriode(component)) {
      return { reject: { status: 409, error: 'Das Teil ist eingebaut – erst abziehen.' } }
    }
    component.status = status
    sichere('components')
  })
})

// ── Nutzungszeiträume ────────────────────────────────────────────────────────
// Ein Zeitraum ist das Paar aus Ein- und Ausbau. Beide Daten lassen sich
// nachträglich geraderücken; die Kilometer rechnen sich daraufhin von selbst
// neu, weil sie nirgends gespeichert, sondern aus den Fahrten summiert werden.
app.put('/api/components/:id/periods/:periodId', auth, (req, res) => {
  const component = eigenesTeil(req, res)
  if (!component) return
  antworte(req, res, () => {
    const periode = component.periods.find((p) => p.id === req.params.periodId)
    if (!periode) return { reject: { status: 404, error: 'Zeitraum nicht gefunden.' } }

    const von = req.body?.from ?? periode.from
    const bis = req.body?.to === undefined ? periode.to : req.body.to
    if (!istDatum(von)) return { reject: { status: 400, error: 'Kein gültiges Einbaudatum.' } }
    if (bis !== null && !istDatum(bis)) {
      return { reject: { status: 400, error: 'Kein gültiges Ausbaudatum.' } }
    }
    if (bis !== null && bis < von) {
      return { reject: { status: 400, error: 'Der Ausbau liegt vor dem Einbau.' } }
    }
    if (bis === null && periode.to !== null) {
      return { reject: { status: 409, error: 'Zum Wiederaufziehen den Knopf am Teil benutzen.' } }
    }
    periode.from = von
    periode.to = bis
    sichere('components')
  })
})

app.delete('/api/components/:id/periods/:periodId', auth, (req, res) => {
  const component = eigenesTeil(req, res)
  if (!component) return
  antworte(req, res, () => {
    const periode = component.periods.find((p) => p.id === req.params.periodId)
    if (!periode) return { reject: { status: 404, error: 'Zeitraum nicht gefunden.' } }
    component.periods = component.periods.filter((p) => p.id !== periode.id)
    // War es der laufende Zeitraum, ist das Teil danach nicht mehr eingebaut
    if (!periode.to && component.status === 'aktiv') component.status = 'eingelagert'
    sichere('components')
  })
})

// ── Einstellungen ────────────────────────────────────────────────────────────
app.put('/api/settings/thresholds', auth, (req, res) => {
  antworte(req, res, () => {
    const gelb = Number(req.body?.yellow)
    const rot = Number(req.body?.red)
    if (!(gelb > 0) || !(rot > 0) || gelb >= rot) {
      return { reject: { status: 400, error: 'Gelb muss über 0 und unter Rot liegen.' } }
    }
    db.settings.thresholds = { yellow: Math.round(gelb), red: Math.round(rot) }
    sichere('settings')
  })
})

// ── Strava-Verbindung ────────────────────────────────────────────────────────
// Der Browser bekommt nur die Adresse zum Hinspringen; Code und Tokens laufen
// zwischen Server und Strava.
const oauthStates = new Map()

function raeumeStates() {
  const jetzt = Date.now()
  for (const [state, eintrag] of oauthStates) {
    if (eintrag.bis < jetzt) oauthStates.delete(state)
  }
}

app.get('/api/strava/authorize', auth, (req, res) => {
  if (!STRAVA_CONFIGURED) {
    return res.status(503).json({ error: 'Auf dem Server fehlen STRAVA_CLIENT_ID und -SECRET.' })
  }
  raeumeStates()
  const state = randomBytes(16).toString('hex')
  oauthStates.set(state, { userId: req.user.id, bis: Date.now() + 10 * 60 * 1000 })
  const url = new URL('https://www.strava.com/oauth/authorize')
  url.searchParams.set('client_id', STRAVA_CLIENT_ID)
  url.searchParams.set('redirect_uri', `${PUBLIC_URL}/api/strava/callback`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('approval_prompt', 'auto')
  url.searchParams.set('scope', STRAVA_SCOPE)
  url.searchParams.set('state', state)
  res.json({ url: url.toString() })
})

app.get('/api/strava/callback', async (req, res) => {
  const ziel = (ergebnis) => res.redirect(`${PUBLIC_URL}/?strava=${ergebnis}`)
  raeumeStates()
  const eintrag = oauthStates.get(String(req.query.state ?? ''))
  oauthStates.delete(String(req.query.state ?? ''))
  if (!eintrag) return ziel('abgelaufen')
  if (req.query.error || !req.query.code) return ziel('abgelehnt')
  // Ohne activity:read_all sieht die App nur öffentliche Fahrten
  if (!String(req.query.scope ?? '').includes('activity:read')) return ziel('scope')

  try {
    const r = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: STRAVA_CLIENT_ID,
        client_secret: STRAVA_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: String(req.query.code),
      }),
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const daten = await r.json()

    const conn = verbindung(eintrag.userId) ?? { userId: eintrag.userId }
    Object.assign(conn, {
      athleteId: String(daten.athlete?.id ?? ''),
      athleteName: text(
        [daten.athlete?.firstname, daten.athlete?.lastname].filter(Boolean).join(' '),
        60,
      ),
      accessToken: daten.access_token,
      refreshToken: daten.refresh_token,
      expiresAt: new Date(daten.expires_at * 1000).toISOString(),
      lastSyncAt: conn.lastSyncAt ?? '',
      lastSyncError: '',
    })
    if (!db.strava.includes(conn)) db.strava.push(conn)
    sichere('strava')

    // Direkt einmal holen, damit das Dashboard nicht leer bleibt
    syncUser(eintrag.userId).catch((err) => {
      console.error('[fahrradtracker] Erster Sync fehlgeschlagen:', err.message)
    })
    ziel('ok')
  } catch (err) {
    console.error('[fahrradtracker] Strava-Anmeldung fehlgeschlagen:', err.message)
    ziel('fehler')
  }
})

app.delete('/api/strava', auth, (req, res) => {
  antworte(req, res, () => {
    db.strava = db.strava.filter((c) => c.userId !== req.user.id)
    // Die Fahrten gehen mit: ohne Verbindung lassen sie sich nicht mehr
    // auffrischen, und ein alter Stand wäre schlimmer als keiner.
    db.activities = db.activities.filter((a) => a.userId !== req.user.id)
    sichere('strava', 'activities')
  })
})

app.post('/api/strava/sync', auth, async (req, res) => {
  try {
    const ergebnis = await syncUser(req.user.id)
    res.json({ ...ergebnis, state: publicState(req.user) })
  } catch (err) {
    const conn = verbindung(req.user.id)
    if (conn) {
      conn.lastSyncError = err.message
      sichere('strava')
    }
    res.status(502).json({ error: err.message })
  }
})

/** Die Räder, die in Strava als Gear gepflegt sind – Auswahl beim Verknüpfen. */
app.get('/api/strava/gear', auth, async (req, res) => {
  try {
    res.json({ gear: await stravaGear(req.user.id) })
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

// SPA-Fallback (app.use fängt in Express 5 alle übrigen Routen)
app.use((_req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Fahrradtracker läuft auf http://0.0.0.0:${PORT}`)
  if (!STRAVA_CONFIGURED) {
    console.warn('[fahrradtracker] Ohne STRAVA_CLIENT_ID/-SECRET bleibt die Strava-Anbindung aus.')
  }
})
