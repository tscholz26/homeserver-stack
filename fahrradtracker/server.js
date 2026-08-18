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
import { kmImZeitraum, zugeteilteTypen } from './shared/aktivitaeten.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'data')
const SEED_DIR = join(__dirname, 'seed')
const BACKUPS_DIR = join(__dirname, 'backups')
const KEEP_BACKUPS = 30
const PORT = Number(process.env.PORT) || 2609

// Öffentliche Adresse der App – daraus baut sich die Wahoo-Rücksprungadresse.
const PUBLIC_URL = (process.env.PUBLIC_URL || 'https://tshomeserv.duckdns.org/fahrrad').replace(
  /\/+$/,
  '',
)
const WAHOO_CLIENT_ID = process.env.WAHOO_CLIENT_ID || ''
const WAHOO_CLIENT_SECRET = process.env.WAHOO_CLIENT_SECRET || ''
const WAHOO_CONFIGURED = Boolean(WAHOO_CLIENT_ID && WAHOO_CLIENT_SECRET)
// Muss mit dem Token in den Webhook-Einstellungen der Wahoo-App übereinstimmen;
// ohne ihn wird jeder eingehende Webhook verworfen.
const WAHOO_WEBHOOK_TOKEN = process.env.WAHOO_WEBHOOK_TOKEN || ''

mkdirSync(DATA_DIR, { recursive: true })
mkdirSync(BACKUPS_DIR, { recursive: true })

// ── Die Dateien unter data/ ──────────────────────────────────────────────────
// Ein Modell je Datei, jede eine schlichte JSON-Liste (settings.json ist das
// einzige Objekt). Die Datei *ist* die Wahrheit: es gibt keine zweite Fassung
// im Speicher, die irgendwann nachgezogen würde – geschrieben wird im selben
// Request, in dem die Änderung ankommt.
const USERS_FILE = join(DATA_DIR, 'users.json')
const WAHOO_FILE = join(DATA_DIR, 'wahoo.json')
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
  // Wie oft im Hintergrund bei Wahoo nachgefragt wird (der Webhook ist der
  // schnelle Weg, dieser Takt der sichere)
  syncIntervalHours: 3,
}

const db = {
  users: [],
  wahoo: [],
  bikes: [],
  types: [],
  components: [],
  activities: [],
  sessions: [],
  settings: { ...DEFAULT_SETTINGS },
}

function ladeAlles() {
  db.users = lies(USERS_FILE, [])
  db.wahoo = lies(WAHOO_FILE, [])
  db.bikes = lies(BIKES_FILE, [])
  db.types =
    lies(TYPES_FILE, null) ?? JSON.parse(readFileSync(join(SEED_DIR, 'teile.json'), 'utf8'))
  db.components = lies(COMPONENTS_FILE, [])
  // Ohne Workout-Typ lässt sich eine Fahrt keinem Rad zurechnen; solche
  // Einträge fallen beim Lesen weg, statt später die Rechnung zu verwirren.
  db.activities = lies(ACTIVITIES_FILE, []).filter((a) => typeof a?.workoutTypeId === 'number')
  db.sessions = lies(SESSIONS_FILE, [])
  const s = lies(SETTINGS_FILE, null)
  db.settings = {
    thresholds: { ...DEFAULT_SETTINGS.thresholds, ...s?.thresholds },
    syncIntervalHours: Number(s?.syncIntervalHours) || DEFAULT_SETTINGS.syncIntervalHours,
  }
}

const DATEIEN = {
  users: USERS_FILE,
  wahoo: WAHOO_FILE,
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
// bei den anderen Apps in die Nextcloud schieben kann. Die Wahoo-Tokens
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

// ── Wahoo ────────────────────────────────────────────────────────────────────
// Jedes Profil verbindet sein eigenes Wahoo-Konto über OAuth. Die Tokens liegen
// ausschließlich hier auf dem Server (data/wahoo.json) und gehen nie an den
// Browser – der bekommt nur die Adresse, zu der er springen soll.
const WAHOO_BASE = 'https://api.wahooligan.com'
// user_read für den Namen, workouts_read für die Fahrten, offline_data, damit
// der Webhook auch feuert, wenn niemand die App offen hat.
const WAHOO_SCOPE = 'user_read workouts_read offline_data'

/**
 * Die Workout-Typen, die überhaupt ein Fahrrad verschleißen. Die Wahoo-API
 * kennt keine Ausrüstung an der Fahrt – welche Fahrt zu welchem Rad gehört,
 * entscheidet deshalb die Sportart, die in der Verwaltung je Rad zugeteilt
 * wird. Motorradfahren (17) steht bewusst nicht in der Liste.
 */
const WAHOO_WORKOUT_TYPES = [
  { id: 0, name: 'Radfahren' },
  { id: 11, name: 'Cyclocross' },
  { id: 12, name: 'Indoor' },
  { id: 13, name: 'Mountainbike' },
  { id: 14, name: 'Liegerad' },
  { id: 15, name: 'Rennrad' },
  { id: 16, name: 'Bahn' },
  { id: 21, name: 'Ergometer' },
  { id: 49, name: 'Indoor-Cycling-Kurs' },
  { id: 61, name: 'Indoor-Trainer' },
  { id: 64, name: 'E-Bike' },
  { id: 68, name: 'Indoor virtuell' },
  { id: 70, name: 'Handbike' },
]

const WAHOO_TYPE_IDS = new Set(WAHOO_WORKOUT_TYPES.map((t) => t.id))

function typName(id) {
  return WAHOO_WORKOUT_TYPES.find((t) => t.id === id)?.name ?? `Typ ${id}`
}

function verbindung(userId) {
  return db.wahoo.find((c) => c.userId === userId) ?? null
}

/** Ein Fehler, der bedeutet: Der Nutzer muss die App neu autorisieren. */
class AuthWeg extends Error {}

/**
 * Holt bei Bedarf ein frisches Access-Token. Wahoo-Tokens laufen nach zwei
 * Stunden ab, und mit dem ersten Aufruf auf einem neuen Token verfällt das
 * alte Paar – das neue muss deshalb sofort auf der Platte stehen, sonst ist
 * die Verbindung nach einem Absturz nicht mehr zu retten.
 */
async function frischesToken(conn) {
  if (conn.expiresAt && Date.parse(conn.expiresAt) > Date.now() + 120_000) return conn.accessToken

  const r = await fetch(`${WAHOO_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: WAHOO_CLIENT_ID,
      client_secret: WAHOO_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: conn.refreshToken,
    }),
  })
  if (r.status === 400 || r.status === 401) {
    // Zugriff zurückgezogen oder Refresh-Token verbraucht – hier hilft nur
    // neu verbinden, und das muss die Oberfläche sagen können.
    conn.needsReconnect = true
    sichere('wahoo')
    throw new AuthWeg('Die Verbindung zu Wahoo wurde zurückgezogen – bitte neu verbinden.')
  }
  if (!r.ok) throw new Error(`Wahoo gibt kein neues Token (HTTP ${r.status})`)

  const daten = await r.json()
  conn.accessToken = daten.access_token
  conn.refreshToken = daten.refresh_token ?? conn.refreshToken
  conn.expiresAt = new Date(Date.now() + (Number(daten.expires_in) || 7200) * 1000).toISOString()
  conn.needsReconnect = false
  sichere('wahoo')
  return conn.accessToken
}

async function wahooGet(conn, pfad) {
  const token = await frischesToken(conn)
  const r = await fetch(`${WAHOO_BASE}${pfad}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  if (r.status === 401) {
    conn.needsReconnect = true
    sichere('wahoo')
    throw new AuthWeg('Wahoo hat den Zugriff abgelehnt – bitte neu verbinden.')
  }
  if (r.status === 429) throw new Error('Wahoo-Limit erreicht – später noch einmal versuchen.')
  if (!r.ok) throw new Error(`Wahoo antwortet mit HTTP ${r.status}`)
  return r.json()
}

/**
 * Ein Wahoo-Workout auf das, was die Verschleißrechnung braucht. Ohne
 * `workout_summary` gibt es noch keine Kilometer – Wahoo trägt sie nach, sobald
 * die Fahrt hochgeladen ist, und der nächste Sync holt sie.
 */
function alsFahrt(workout, userId) {
  const summary = workout.workout_summary
  const meter = Number(summary?.distance_accum ?? 0) || 0
  return {
    id: String(workout.id),
    userId,
    // Das Datum in der Zeitzone des Servers (TZ in docker-compose.yml): die
    // Zeiträume der Teile stehen als Kalendertage in der Datei.
    date: lokalerTag(workout.starts),
    km: Math.round(meter / 10) / 100,
    minutes: Math.round(Number(workout.minutes) || 0),
    name: text(workout.name, 80),
    workoutTypeId: Number(workout.workout_type_id),
  }
}

/** ISO-Zeitstempel → Kalendertag, so wie ihn der Server (Europe/Berlin) sieht. */
function lokalerTag(zeitpunkt) {
  const d = new Date(zeitpunkt)
  if (Number.isNaN(d.getTime())) return heute()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Legt eine Fahrt an oder schreibt sie fort; sagt, ob sich etwas geändert hat. */
function uebernehmeFahrt(fahrt) {
  if (!WAHOO_TYPE_IDS.has(fahrt.workoutTypeId)) return 'ignoriert'
  const alt = db.activities.find((a) => a.id === fahrt.id && a.userId === fahrt.userId)
  if (!alt) {
    db.activities.push(fahrt)
    return 'neu'
  }
  if (alt.date === fahrt.date && alt.km === fahrt.km && alt.workoutTypeId === fahrt.workoutTypeId) {
    return 'unveraendert'
  }
  Object.assign(alt, fahrt)
  return 'geaendert'
}

const WAHOO_SEITE = 50
const NACHLAUF_TAGE = 14

/**
 * Holt die Fahrten eines Profils. Wahoo liefert sie nach Startzeit absteigend,
 * seitenweise. Beim ersten Lauf wird alles geholt, danach nur bis zwei Wochen
 * vor den letzten Sync zurück: So lange kann eine Fahrt noch nachträglich
 * hochgeladen, korrigiert oder um ihre Zusammenfassung ergänzt werden.
 */
async function syncUser(userId) {
  const conn = verbindung(userId)
  if (!conn) throw new Error('Dieses Profil ist nicht mit Wahoo verbunden.')

  const grenze = conn.lastSyncAt
    ? new Date(Date.parse(conn.lastSyncAt) - NACHLAUF_TAGE * 24 * 3600_000)
    : null
  let neu = 0
  let geaendert = 0

  for (let seite = 1; seite <= 100; seite += 1) {
    const antwort = await wahooGet(conn, `/v1/workouts?page=${seite}&per_page=${WAHOO_SEITE}`)
    const workouts = Array.isArray(antwort?.workouts) ? antwort.workouts : []
    if (!workouts.length) break

    let zuAlt = false
    for (const workout of workouts) {
      if (grenze && new Date(workout.starts) < grenze) {
        zuAlt = true
        continue
      }
      const ergebnis = uebernehmeFahrt(alsFahrt(workout, userId))
      if (ergebnis === 'neu') neu += 1
      if (ergebnis === 'geaendert') geaendert += 1
    }

    // Absteigend sortiert: hinter der ersten zu alten Fahrt kommt nichts mehr,
    // was uns interessiert.
    if (zuAlt || workouts.length < WAHOO_SEITE) break
    const gesamt = Number(antwort.total) || 0
    if (gesamt && seite * WAHOO_SEITE >= gesamt) break
  }

  conn.lastSyncAt = new Date().toISOString()
  conn.lastSyncError = ''
  conn.needsReconnect = false
  sichere('wahoo', 'activities')
  console.log(`[fahrradtracker] Sync ${userId}: ${neu} neu, ${geaendert} aktualisiert`)
  return { neu, geaendert }
}

/** Namen und Wahoo-Id des verbundenen Kontos – einmal beim Verbinden. */
async function wahooProfil(conn) {
  const nutzer = await wahooGet(conn, '/v1/user')
  return {
    wahooUserId: String(nutzer.id ?? ''),
    athleteName: text([nutzer.first, nutzer.last].filter(Boolean).join(' '), 60),
  }
}

// Der Webhook ist der schnelle Weg; dieser Takt hier ist der sichere. Er fängt
// alles auf, was der Webhook verpasst hat (nicht eingerichtet, Server war aus,
// Zustellung fehlgeschlagen). Geprüft wird stündlich, geholt nur, was fällig
// ist.
async function syncFaellige() {
  if (!WAHOO_CONFIGURED) return
  for (const conn of db.wahoo) {
    if (conn.needsReconnect) continue
    const faellig =
      !conn.lastSyncAt ||
      Date.now() - Date.parse(conn.lastSyncAt) > db.settings.syncIntervalHours * 3600_000
    if (!faellig) continue
    try {
      await syncUser(conn.userId)
    } catch (err) {
      conn.lastSyncError = err.message
      sichere('wahoo')
      console.error(`[fahrradtracker] Sync für ${conn.userId} fehlgeschlagen:`, err.message)
    }
  }
}

setTimeout(syncFaellige, 20_000)
setInterval(syncFaellige, 60 * 60 * 1000)

// ── Verschleißrechnung ───────────────────────────────────────────────────────
// Die Kilometer einer Instanz sind die Summe der Fahrten des Rades über alle
// ihre Nutzungszeiträume – gerechnet in shared/aktivitaeten.js, damit die
// Rechnung nichts davon weiß, woher die Fahrten kommen.
function kmVon(bike, von, bis) {
  return kmImZeitraum(bike, db.activities, von, bis ?? heute())
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
    km: bike ? kmVon(bike, p.from, p.to) : 0,
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
    hasWahoo: Boolean(conn),
    athleteName: conn?.athleteName ?? '',
    lastSyncAt: conn?.lastSyncAt ?? '',
    lastSyncError: conn?.lastSyncError ?? '',
    // Zugriff zurückgezogen oder Token verfallen: neu verbinden hilft
    needsReconnect: Boolean(conn?.needsReconnect),
  }
}

function publicState(user) {
  // Fahrten, deren Workout-Typ an keinem Rad hängt, kann die App niemandem
  // zurechnen – die Verwaltung zeigt sie an, statt sie stillschweigend zu
  // schlucken.
  const eigene = db.activities.filter((a) => a.userId === user.id)
  const zugeteilt = zugeteilteTypen(db.bikes, user.id)
  const luecken = new Map()
  for (const a of eigene) {
    if (zugeteilt.has(a.workoutTypeId)) continue
    const eintrag = luecken.get(a.workoutTypeId) ?? {
      workoutTypeId: a.workoutTypeId,
      name: typName(a.workoutTypeId),
      anzahl: 0,
      km: 0,
    }
    eintrag.anzahl += 1
    eintrag.km = Math.round((eintrag.km + a.km) * 10) / 10
    luecken.set(a.workoutTypeId, eintrag)
  }

  return {
    me: profil(user),
    users: db.users.map(profil),
    bikes: db.bikes,
    componentTypes: db.types,
    components: db.components.map(komponenteMitKm),
    settings: db.settings,
    wahooConfigured: WAHOO_CONFIGURED,
    // Welche Sportarten sich einem Rad zuteilen lassen
    workoutTypes: WAHOO_WORKOUT_TYPES,
    fahrten: eigene.length,
    ohneZuordnung: [...luecken.values()].sort((a, b) => b.anzahl - a.anzahl),
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
      hasWahoo: Boolean(verbindung(u.id)),
    })),
    wahooConfigured: WAHOO_CONFIGURED,
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

/** Nur bekannte Workout-Typen, jeder höchstens einmal. */
function typenFuerRad(wert) {
  if (!Array.isArray(wert)) return []
  return [...new Set(wert.map(Number).filter((id) => WAHOO_TYPE_IDS.has(id)))]
}

/**
 * Ein Workout-Typ gehört immer nur zu einem Rad eines Profils – sonst zählte
 * dieselbe Fahrt an zwei Rädern. Wer einen Typ neu zuteilt, nimmt ihn damit
 * den anderen Rädern weg.
 */
function loeseDoppelteTypen(bike) {
  for (const anderes of db.bikes) {
    if (anderes.id === bike.id || anderes.ownerId !== bike.ownerId) continue
    anderes.workoutTypeIds = (anderes.workoutTypeIds ?? []).filter(
      (id) => !bike.workoutTypeIds.includes(id),
    )
  }
}

app.post('/api/bikes', auth, (req, res) => {
  const name = text(req.body?.name, 60)
  antworte(req, res, () => {
    if (!name) return { reject: { status: 400, error: 'Bitte einen Namen eintragen.' } }
    const bike = {
      id: createId(),
      ownerId: req.user.id,
      name,
      // Über die Workout-Typen kommen die Fahrten ans Rad; ohne sie bleibt es
      // bei 0 km
      workoutTypeIds: typenFuerRad(req.body?.workoutTypeIds),
      limits: {},
      createdAt: new Date().toISOString(),
    }
    db.bikes.push(bike)
    loeseDoppelteTypen(bike)
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
    if (req.body?.workoutTypeIds !== undefined) {
      bike.workoutTypeIds = typenFuerRad(req.body.workoutTypeIds)
      loeseDoppelteTypen(bike)
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

// ── Wahoo-Verbindung ─────────────────────────────────────────────────────────
// Der Browser bekommt nur die Adresse zum Hinspringen; Code und Tokens laufen
// zwischen Server und Wahoo.
const oauthStates = new Map()

function raeumeStates() {
  const jetzt = Date.now()
  for (const [state, eintrag] of oauthStates) {
    if (eintrag.bis < jetzt) oauthStates.delete(state)
  }
}

function redirectUri() {
  return `${PUBLIC_URL}/api/wahoo/callback`
}

app.get('/api/wahoo/authorize', auth, (req, res) => {
  if (!WAHOO_CONFIGURED) {
    return res.status(503).json({ error: 'Auf dem Server fehlen WAHOO_CLIENT_ID und -SECRET.' })
  }
  raeumeStates()
  const state = randomBytes(16).toString('hex')
  oauthStates.set(state, { userId: req.user.id, bis: Date.now() + 10 * 60 * 1000 })
  const url = new URL(`${WAHOO_BASE}/oauth/authorize`)
  url.searchParams.set('client_id', WAHOO_CLIENT_ID)
  url.searchParams.set('redirect_uri', redirectUri())
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', WAHOO_SCOPE)
  url.searchParams.set('state', state)
  res.json({ url: url.toString() })
})

app.get('/api/wahoo/callback', async (req, res) => {
  const ziel = (ergebnis) => res.redirect(`${PUBLIC_URL}/?wahoo=${ergebnis}`)
  raeumeStates()
  const eintrag = oauthStates.get(String(req.query.state ?? ''))
  oauthStates.delete(String(req.query.state ?? ''))
  if (!eintrag) return ziel('abgelaufen')
  if (req.query.error || !req.query.code) return ziel('abgelehnt')

  try {
    const r = await fetch(`${WAHOO_BASE}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: WAHOO_CLIENT_ID,
        client_secret: WAHOO_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: String(req.query.code),
        redirect_uri: redirectUri(),
      }),
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const daten = await r.json()

    const conn = verbindung(eintrag.userId) ?? { userId: eintrag.userId }
    Object.assign(conn, {
      accessToken: daten.access_token,
      refreshToken: daten.refresh_token,
      expiresAt: new Date(Date.now() + (Number(daten.expires_in) || 7200) * 1000).toISOString(),
      lastSyncAt: conn.lastSyncAt ?? '',
      lastSyncError: '',
      needsReconnect: false,
    })
    if (!db.wahoo.includes(conn)) db.wahoo.push(conn)
    sichere('wahoo')

    // Wer der Verbundene ist, steht erst nach dem ersten Aufruf fest – und die
    // Wahoo-Id brauchen wir, um die Webhooks zuzuordnen.
    try {
      Object.assign(conn, await wahooProfil(conn))
      sichere('wahoo')
    } catch (err) {
      console.error('[fahrradtracker] Wahoo-Profil nicht lesbar:', err.message)
    }

    // Direkt einmal holen, damit das Dashboard nicht leer bleibt
    syncUser(eintrag.userId).catch((err) => {
      conn.lastSyncError = err.message
      sichere('wahoo')
      console.error('[fahrradtracker] Erster Sync fehlgeschlagen:', err.message)
    })
    ziel('ok')
  } catch (err) {
    console.error('[fahrradtracker] Wahoo-Anmeldung fehlgeschlagen:', err.message)
    ziel('fehler')
  }
})

app.delete('/api/wahoo', auth, async (req, res) => {
  const conn = verbindung(req.user.id)
  // Erst bei Wahoo abmelden, dann hier vergessen – andersherum bliebe die
  // Freigabe dort stehen.
  if (conn) {
    try {
      const token = await frischesToken(conn)
      await fetch(`${WAHOO_BASE}/v1/permissions`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch (err) {
      console.error('[fahrradtracker] Abmelden bei Wahoo fehlgeschlagen:', err.message)
    }
  }
  antworte(req, res, () => {
    db.wahoo = db.wahoo.filter((c) => c.userId !== req.user.id)
    // Die Fahrten gehen mit: ohne Verbindung lassen sie sich nicht mehr
    // auffrischen, und ein alter Stand wäre schlimmer als keiner.
    db.activities = db.activities.filter((a) => a.userId !== req.user.id)
    sichere('wahoo', 'activities')
  })
})

app.post('/api/wahoo/sync', auth, async (req, res) => {
  try {
    const ergebnis = await syncUser(req.user.id)
    res.json({ ...ergebnis, state: publicState(req.user) })
  } catch (err) {
    const conn = verbindung(req.user.id)
    if (conn) {
      conn.lastSyncError = err.message
      sichere('wahoo')
    }
    res.status(502).json({ error: err.message })
  }
})

/**
 * Wahoo meldet jede fertige Fahrt hierher – eingerichtet wird das einmal in
 * den Webhook-Einstellungen der Wahoo-App (eine Adresse für alle Nutzer,
 * deshalb die Wahoo-User-Id im Rumpf). Ohne den passenden Token wird nichts
 * angefasst; wer nicht verbunden ist, wird still ignoriert.
 */
app.post('/api/wahoo/webhook', (req, res) => {
  if (!WAHOO_WEBHOOK_TOKEN || req.body?.webhook_token !== WAHOO_WEBHOOK_TOKEN) {
    return res.status(401).json({ error: 'Unbekannter Webhook-Token.' })
  }
  // Immer 200, sonst stellt Wahoo stunden- und tagelang neu zu
  res.json({ ok: true })

  try {
    if (req.body.event_type !== 'workout_summary') return
    const wahooUserId = String(req.body.user?.id ?? '')
    const conn = db.wahoo.find((c) => c.wahooUserId === wahooUserId)
    if (!conn) return

    const workout = { ...req.body.workout, workout_summary: req.body.workout_summary }
    if (!workout.id) return
    const ergebnis = uebernehmeFahrt(alsFahrt(workout, conn.userId))
    if (ergebnis === 'neu' || ergebnis === 'geaendert') {
      sichere('activities')
      console.log(`[fahrradtracker] Webhook: Fahrt ${workout.id} ${ergebnis}`)
    }
  } catch (err) {
    console.error('[fahrradtracker] Webhook nicht verarbeitet:', err.message)
  }
})

// SPA-Fallback (app.use fängt in Express 5 alle übrigen Routen)
app.use((_req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Fahrradtracker läuft auf http://0.0.0.0:${PORT}`)
  if (!WAHOO_CONFIGURED) {
    console.warn('[fahrradtracker] Ohne WAHOO_CLIENT_ID/-SECRET bleibt die Wahoo-Anbindung aus.')
  }
  if (WAHOO_CONFIGURED && !WAHOO_WEBHOOK_TOKEN) {
    console.warn('[fahrradtracker] Ohne WAHOO_WEBHOOK_TOKEN werden Webhooks verworfen.')
  }
})
