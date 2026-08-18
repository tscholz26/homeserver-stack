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
import {
  ANBIETER,
  ausCsv,
  ausIntervals,
  ausWahoo,
  kmFuerAufbau,
  kmFuerRad,
  kmImZeitraum,
  statistik,
  synchronisiereFenster,
  ueberschneidetSich,
  zuordner,
} from './shared/fahrten.js'
import { MAIL_CONFIGURED, schickeMeldungen, schickeProbe } from './mail.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'data')
const SEED_DIR = join(__dirname, 'seed')
const BACKUPS_DIR = join(__dirname, 'backups')
const KEEP_BACKUPS = 30
const PORT = Number(process.env.PORT) || 2609

// Öffentliche Adresse der App – daraus baut sich die Intervals-Rücksprungadresse.
const PUBLIC_URL = (process.env.PUBLIC_URL || 'https://tshomeserv.duckdns.org/fahrrad').replace(
  /\/+$/,
  '',
)
const WAHOO_CLIENT_ID = process.env.WAHOO_CLIENT_ID || ''
const WAHOO_CLIENT_SECRET = process.env.WAHOO_CLIENT_SECRET || ''
const WAHOO_CONFIGURED = Boolean(WAHOO_CLIENT_ID && WAHOO_CLIENT_SECRET)
// Muss mit dem Token in den Webhook-Einstellungen der Wahoo-App übereinstimmen
const WAHOO_WEBHOOK_TOKEN = process.env.WAHOO_WEBHOOK_TOKEN || ''

const ICU_CLIENT_ID = process.env.INTERVALS_CLIENT_ID || ''
const ICU_CLIENT_SECRET = process.env.INTERVALS_CLIENT_SECRET || ''
const ICU_CONFIGURED = Boolean(ICU_CLIENT_ID && ICU_CLIENT_SECRET)
// Muss mit dem Secret in den Webhook-Einstellungen der Intervals-App
// übereinstimmen; ohne ihn wird jeder eingehende Webhook verworfen.
const ICU_WEBHOOK_SECRET = process.env.INTERVALS_WEBHOOK_SECRET || ''

mkdirSync(DATA_DIR, { recursive: true })
mkdirSync(BACKUPS_DIR, { recursive: true })

// ── Die Dateien unter data/ ──────────────────────────────────────────────────
// Ein Modell je Datei, jede eine schlichte JSON-Liste (settings.json ist das
// einzige Objekt). Die Datei *ist* die Wahrheit: es gibt keine zweite Fassung
// im Speicher, die irgendwann nachgezogen würde – geschrieben wird im selben
// Request, in dem die Änderung ankommt.
const USERS_FILE = join(DATA_DIR, 'users.json')
const WAHOO_FILE = join(DATA_DIR, 'wahoo.json')
const ICU_FILE = join(DATA_DIR, 'intervals.json')
const BIKES_FILE = join(DATA_DIR, 'bikes.json')
const SETUPS_FILE = join(DATA_DIR, 'setups.json')
const TYPES_FILE = join(DATA_DIR, 'component-types.json')
const COMPONENTS_FILE = join(DATA_DIR, 'components.json')
const RIDES_FILE = join(DATA_DIR, 'rides.json')
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
  // Wie oft im Hintergrund bei Intervals.icu nachgefragt wird (der Webhook ist
  // der schnelle Weg, dieser Takt der sichere)
  syncIntervalHours: 3,
}

const db = {
  users: [],
  wahoo: [],
  intervals: [],
  bikes: [],
  setups: [],
  types: [],
  components: [],
  rides: [],
  sessions: [],
  settings: { ...DEFAULT_SETTINGS },
}

function ladeAlles() {
  db.users = lies(USERS_FILE, [])
  db.wahoo = lies(WAHOO_FILE, [])
  db.intervals = lies(ICU_FILE, [])
  db.bikes = lies(BIKES_FILE, [])
  db.setups = lies(SETUPS_FILE, [])
  db.types =
    lies(TYPES_FILE, null) ?? JSON.parse(readFileSync(join(SEED_DIR, 'teile.json'), 'utf8'))
  db.components = lies(COMPONENTS_FILE, [])
  db.rides = lies(RIDES_FILE, [])
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
  intervals: ICU_FILE,
  bikes: BIKES_FILE,
  setups: SETUPS_FILE,
  types: TYPES_FILE,
  components: COMPONENTS_FILE,
  rides: RIDES_FILE,
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

/**
 * Zieht ältere Stände auf das aktuelle Modell nach. Läuft bei jedem Start und
 * tut nichts, wenn alles schon passt – billiger als eine Wanderung durch die
 * Versionsgeschichte und robust gegen von Hand editierte Dateien.
 */
function migriere() {
  let geaendert = new Set()

  for (const bike of db.bikes) {
    // Räder haben jetzt einen Nutzungszeitraum statt einer Anbieter-Zuordnung
    if (!bike.from) {
      bike.from = (bike.createdAt ?? new Date().toISOString()).slice(0, 10)
      geaendert.add('bikes')
    }
    if (bike.to === undefined) {
      bike.to = null
      geaendert.add('bikes')
    }
    for (const feld of ['manufacturer', 'model']) {
      if (typeof bike[feld] !== 'string') {
        bike[feld] = ''
        geaendert.add('bikes')
      }
    }
    if ('workoutTypeIds' in bike || 'stravaGearId' in bike) {
      delete bike.workoutTypeIds
      delete bike.stravaGearId
      geaendert.add('bikes')
    }
    // Jedes Rad braucht mindestens den Aufbau „Draußen“, sonst hätte eine
    // Fahrt nichts, woran ihre Teile hängen könnten.
    if (!db.setups.some((auf) => auf.bikeId === bike.id && auf.kind === 'outdoor')) {
      db.setups.push({ id: createId(), bikeId: bike.id, name: 'Draußen', kind: 'outdoor' })
      geaendert.add('setups')
    }
  }

  // Verbindungen ohne Profil sind tote Tokens – die haben hier nichts zu
  // suchen, und benutzen ließen sie sich ohnehin nie mehr.
  const bekannt = new Set(db.users.map((u) => u.id))
  for (const modell of ['wahoo', 'intervals']) {
    const uebrig = db[modell].filter((c) => bekannt.has(c.userId))
    if (uebrig.length !== db[modell].length) {
      console.log(
        `[fahrradtracker] ${db[modell].length - uebrig.length} verwaiste ${modell}-Verbindung(en) entfernt`,
      )
      db[modell] = uebrig
      geaendert.add(modell)
    }
  }

  // Verbindungen aus der Zeit, als es nur eine Quelle gab
  for (const [modell, eintraege] of [
    ['wahoo', db.wahoo],
    ['intervals', db.intervals],
  ]) {
    for (const conn of eintraege) {
      if (!conn.externalUserId && conn.athleteId) {
        conn.externalUserId = String(conn.athleteId)
        geaendert.add(modell)
      }
      if (conn.active === undefined) {
        // Vor den zwei Quellen war die einzige Verbindung immer die aktive
        conn.active = eintraege.length === 1
        geaendert.add(modell)
      }
    }
  }

  for (const aufbau of db.setups) {
    if (typeof aufbau.factor !== 'number') {
      aufbau.factor = 1
      geaendert.add('setups')
    }
  }

  // Wechselintervall: Kategorien aus der Zeit davor kennen das Feld nicht.
  // Ketten werden im Wechsel gefahren und gewachst – dafür ist es gedacht,
  // deshalb bekommen sie einen Startwert; alles andere bleibt ohne Intervall.
  for (const typ of db.types) {
    if (typeof typ.rotationKm !== 'number') {
      // „Kette“ und „Kette 2“ ja, „Kettenblätter“ nicht
      typ.rotationKm = /^kette(\s|$)/i.test((typ.name ?? '').trim()) ? 500 : 0
      geaendert.add('types')
    }
  }

  for (const teil of db.components) {
    // Teile hängen jetzt an Aufbauten, nicht mehr am Rad als Ganzem
    if (!Array.isArray(teil.setupIds)) {
      teil.setupIds = db.setups.filter((auf) => auf.bikeId === teil.bikeId).map((auf) => auf.id)
      geaendert.add('components')
    }
  }

  // Fahrten aus der Zeit der direkten Geräte-Anbindung: Sie stehen in keinem
  // Intervals-Konto und kämen bei keinem Sync wieder, bleiben aber als
  // Kilometer erhalten – als von Hand eingetragene Fahrten.
  const alteDatei = join(DATA_DIR, 'activities.json')
  if (existsSync(alteDatei) && !db.rides.length) {
    try {
      const alt = JSON.parse(readFileSync(alteDatei, 'utf8'))
      const uebernommen = (Array.isArray(alt) ? alt : [])
        // Ohne Profil ließe sich die Fahrt niemandem zurechnen; sie kommt beim
        // nächsten vollen Sync ohnehin wieder aus der Quelle.
        .filter((a) => a?.date && Number(a.km) > 0 && bekannt.has(a.userId))
        .map((a) => ({
          id: createId(),
          ownerId: a.userId,
          date: a.date,
          time: null,
          km: Number(a.km),
          minutes: Number(a.minutes) || 0,
          name: a.name || 'Übernommene Fahrt',
          indoor: false,
          source: 'MANUAL',
          externalProvider: a.externalProvider ?? 'wahoo',
          externalActivityId: a.id ?? null,
          externalSource: null,
          override: null,
          createdAt: new Date().toISOString(),
        }))
      if (uebernommen.length) {
        db.rides.push(...uebernommen)
        geaendert.add('rides')
        console.log(`[fahrradtracker] ${uebernommen.length} Fahrten aus activities.json übernommen`)
      }
      renameSync(alteDatei, `${alteDatei}.alt`)
    } catch (err) {
      console.error('[fahrradtracker] activities.json nicht übernommen:', err.message)
    }
  }

  if (geaendert.size) {
    sichere(...geaendert)
    console.log(`[fahrradtracker] Datenstand nachgezogen: ${[...geaendert].join(', ')}`)
  }
}

migriere()
if (!existsSync(TYPES_FILE)) sichere('types')
console.log(
  `[fahrradtracker] ${db.users.length} Profile, ${db.bikes.length} Räder, ${db.components.length} Teile, ${db.rides.length} Fahrten`,
)

// ── Tägliches Backup ─────────────────────────────────────────────────────────
// Ein Schnappschuss pro Tag in eine einzige Datei, damit backup-sync ihn wie
// bei den anderen Apps in die Nextcloud schieben kann. Die Intervals-Tokens
// bleiben bewusst draußen: das sind echte Zugangsdaten, und nach einer
// Wiederherstellung ist „neu verbinden“ ein Klick.
function runBackup() {
  try {
    if (!db.users.length && !db.components.length && !db.rides.length) return
    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`
    const schnappschuss = {
      erstelltAm: now.toISOString(),
      users: db.users,
      bikes: db.bikes,
      setups: db.setups,
      componentTypes: db.types,
      components: db.components,
      rides: db.rides,
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

// ── Die Anbieter ─────────────────────────────────────────────────────────────
// Zwei Wege, an dieselben Fahrten zu kommen: direkt von Wahoo oder über
// Intervals.icu, das sie von dort bezieht. Beide schreiben in denselben
// Fahrten-Bestand; die Verschleißrechnung merkt davon nichts.
//
// Geholt wird immer nur von *einer* Quelle je Profil – der aktiven. Sonst käme
// dieselbe Ausfahrt zweimal herein, und doppelte Kilometer wären schlimmer als
// gar keine. Beim Verbinden wird die neue Quelle die aktive; umstellen lässt
// sich das in der Verwaltung, und ein Dublettenschutz sitzt zusätzlich im
// Sync.
class AuthWeg extends Error {}

function wahooVerbindung(userId) {
  return db.wahoo.find((c) => c.userId === userId) ?? null
}

function icuVerbindung(userId) {
  return db.intervals.find((c) => c.userId === userId) ?? null
}

/** Alle Verbindungen eines Profils, mit ihrem Anbieter. */
function verbindungen(userId) {
  return [
    { provider: 'wahoo', conn: wahooVerbindung(userId) },
    { provider: 'intervals', conn: icuVerbindung(userId) },
  ].filter((v) => v.conn)
}

/** Die Quelle, aus der gerade geholt wird. */
function aktiveQuelle(userId) {
  const alle = verbindungen(userId)
  return alle.find((v) => v.conn.active) ?? alle[0] ?? null
}

/** Setzt eine Quelle aktiv und die andere still. */
function setzeAktiv(userId, provider) {
  for (const { provider: p, conn } of verbindungen(userId)) {
    conn.active = p === provider
  }
  sichere('wahoo', 'intervals')
}

/** Holt die Fahrten aus der aktiven Quelle des Profils. */
function syncUser(userId, optionen = {}) {
  const aktiv = aktiveQuelle(userId)
  if (!aktiv) throw new Error('Dieses Profil ist mit keiner Quelle verbunden.')
  return aktiv.provider === 'wahoo' ? syncWahoo(userId, optionen) : syncIntervals(userId, optionen)
}

// ── Wahoo ────────────────────────────────────────────────────────────────────
// Die primäre Quelle: Das Gerät lädt dorthin hoch, wir holen es von dort. Die
// Tokens liegen ausschließlich hier auf dem Server (data/wahoo.json) und gehen
// nie an den Browser.
const WAHOO_BASE = 'https://api.wahooligan.com'
// user_read für den Namen, workouts_read für die Fahrten, offline_data, damit
// der Webhook auch feuert, wenn niemand die App offen hat.
const WAHOO_SCOPE = 'user_read workouts_read offline_data'

/**
 * Holt bei Bedarf ein frisches Access-Token. Wahoo-Tokens laufen nach zwei
 * Stunden ab, und mit dem ersten Aufruf auf einem neuen Token verfällt das
 * alte Paar – das neue muss deshalb sofort auf der Platte stehen, sonst ist
 * die Verbindung nach einem Absturz nicht mehr zu retten.
 */
async function wahooToken(conn) {
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
  const token = await wahooToken(conn)
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

/** ISO-Zeitstempel → Kalendertag, so wie ihn der Server (Europe/Berlin) sieht. */
function lokalerTag(zeitpunkt) {
  const d = new Date(zeitpunkt)
  if (Number.isNaN(d.getTime())) return heute()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const WAHOO_SEITE = 50

/**
 * Holt die Workouts eines Profils. Wahoo liefert sie nach Startzeit absteigend
 * und seitenweise; gelesen wird bis zurück zum Fensteranfang.
 */
async function syncWahoo(userId, { voll = false } = {}) {
  const conn = wahooVerbindung(userId)
  if (!conn) throw new Error('Dieses Profil ist nicht mit Wahoo verbunden.')

  // Ohne die Wahoo-User-Id lassen sich eingehende Webhooks nicht zuordnen.
  // Beim Verbinden klappt der Aufruf nicht immer (Wahoo antwortet dann mit
  // 422), deshalb hier bei jedem Lauf noch einmal versuchen – erfolglos ist er
  // kein Grund, den Sync abzubrechen.
  if (!conn.externalUserId) {
    try {
      Object.assign(conn, await wahooProfil(conn))
      sichere('wahoo')
    } catch (err) {
      console.warn('[fahrradtracker] Wahoo-Profil weiterhin nicht lesbar:', err.message)
    }
  }

  const oldest = fensterStart(userId, conn, voll)
  const newest = new Date(Date.now() + 24 * 3600_000).toISOString().slice(0, 10)
  const fahrten = []

  for (let seite = 1; seite <= 100; seite += 1) {
    const antwort = await wahooGet(conn, `/v1/workouts?page=${seite}&per_page=${WAHOO_SEITE}`)
    const workouts = Array.isArray(antwort?.workouts) ? antwort.workouts : []
    if (!workouts.length) break

    let zuAlt = false
    for (const workout of workouts) {
      if (lokalerTag(workout.starts) < oldest) {
        zuAlt = true
        continue
      }
      const fahrt = ausWahoo(workout, userId, lokalerTag)
      if (fahrt) fahrten.push(fahrt)
    }
    // Absteigend sortiert: hinter der ersten zu alten Fahrt kommt nichts mehr
    if (zuAlt || workouts.length < WAHOO_SEITE) break
    const gesamt = Number(antwort.total) || 0
    if (gesamt && seite * WAHOO_SEITE >= gesamt) break
  }

  return schreibeSync(conn, userId, ANBIETER.wahoo, fahrten, oldest, newest)
}

/** Namen und Wahoo-Id des verbundenen Kontos – einmal beim Verbinden. */
async function wahooProfil(conn) {
  const nutzer = await wahooGet(conn, '/v1/user')
  return {
    externalUserId: String(nutzer.id ?? ''),
    athleteName: text([nutzer.first, nutzer.last].filter(Boolean).join(' '), 60),
  }
}

// ── Intervals.icu ────────────────────────────────────────────────────────────
// Die zweite Quelle. Wahoo lädt die Fahrten auch dorthin hoch; wer lieber von
// dort holt (oder Wahoo einmal nicht kann), stellt hier um.
const ICU_BASE = 'https://intervals.icu'
const ICU_SCOPE = 'ACTIVITY:READ'

/**
 * Intervals.icu gibt Tokens ohne Ablaufdatum aus und kennt deshalb auch keine
 * Refresh-Tokens: Ein neues Token entsteht nur, wenn der Nutzer die App erneut
 * autorisiert – dabei verfällt das alte. Es gibt hier also nichts aufzufrischen,
 * wohl aber ein zurückgezogenes Token zu erkennen.
 */
async function icuGet(conn, pfad) {
  const r = await fetch(`${ICU_BASE}${pfad}`, {
    headers: { Authorization: `Bearer ${conn.accessToken}`, Accept: 'application/json' },
  })
  if (r.status === 401 || r.status === 403) {
    conn.needsReconnect = true
    sichere('intervals')
    throw new AuthWeg('Intervals.icu hat den Zugriff abgelehnt – bitte neu verbinden.')
  }
  if (r.status === 429) {
    throw new Error('Intervals.icu-Limit erreicht – später noch einmal versuchen.')
  }
  if (!r.ok) throw new Error(`Intervals.icu antwortet mit HTTP ${r.status}`)
  return r.json()
}

/**
 * Ab wann geholt wird. Für den ersten Lauf gilt „seit dem ältesten Datum, das
 * die App überhaupt kennt“ – ein Teil, das seit 2024 am Rad hängt, braucht die
 * Fahrten seit 2024, und ein fest verdrahtetes Jahr wäre schlicht falsch.
 * Danach genügt der letzte Lauf minus zwei Wochen: So lange kann eine Fahrt
 * noch nachgetragen oder korrigiert werden.
 */
function aeltesterTag(userId) {
  const tage = []
  for (const bike of db.bikes.filter((b) => b.ownerId === userId)) {
    if (bike.from) tage.push(bike.from)
    for (const teil of db.components.filter((c) => c.bikeId === bike.id)) {
      for (const p of teil.periods ?? []) if (p.from) tage.push(p.from)
    }
  }
  const start = new Date()
  start.setFullYear(start.getFullYear() - 1)
  tage.push(start.toISOString().slice(0, 10))
  return tage.sort()[0]
}

const NACHLAUF_TAGE = 14

/**
 * Holt die Fahrten eines Profils von Intervals.icu.
 *
 * Gelesen wird ein Zeitfenster, und innerhalb dieses Fensters wird abgeglichen:
 * Was der Anbieter dort nicht mehr führt, wird auch hier gelöscht. So kommen
 * gelöschte oder umdatierte Aktivitäten mit, ohne dass es dafür eine eigene
 * Meldung bräuchte. Von Hand eingetragene Fahrten fasst das nie an.
 */
function fensterStart(userId, conn, voll) {
  if (voll || !conn.lastSyncAt) return aeltesterTag(userId)
  return new Date(Date.parse(conn.lastSyncAt) - NACHLAUF_TAGE * 24 * 3600_000)
    .toISOString()
    .slice(0, 10)
}

/** Das Ergebnis eines Laufs in den Bestand einarbeiten und festschreiben. */
function schreibeSync(conn, userId, provider, fahrten, oldest, newest) {
  const { rides, neu, geaendert, geloescht, uebersprungen } = synchronisiereFenster(
    db.rides,
    fahrten,
    { ownerId: userId, provider, von: oldest, bis: newest, neueId: createId },
  )
  db.rides = rides

  conn.lastSyncAt = new Date().toISOString()
  conn.lastSyncError = ''
  conn.needsReconnect = false
  sichere('wahoo', 'intervals', 'rides')
  console.log(
    `[fahrradtracker] Sync ${provider} ${userId} ab ${oldest}: ${neu} neu, ${geaendert} aktualisiert, ${geloescht} entfallen, ${uebersprungen} Dubletten`,
  )
  // Frische Kilometer können ein Teil über eine Schwelle geschoben haben
  if (neu || geaendert || geloescht) {
    pruefeMeldungen().catch((err) =>
      console.error('[fahrradtracker] Meldungen nach Sync:', err.message),
    )
  }
  return { neu, geaendert, geloescht, uebersprungen, oldest }
}

async function syncIntervals(userId, { voll = false } = {}) {
  const conn = icuVerbindung(userId)
  if (!conn) throw new Error('Dieses Profil ist nicht mit Intervals.icu verbunden.')

  const oldest = fensterStart(userId, conn, voll)
  const newest = new Date(Date.now() + 24 * 3600_000).toISOString().slice(0, 10)

  const antwort = await icuGet(
    conn,
    `/api/v1/athlete/${encodeURIComponent(conn.athleteId)}/activities?oldest=${oldest}&newest=${newest}`,
  )
  const liste = Array.isArray(antwort) ? antwort : []

  // Keine Radfahrt, nicht von Wahoo hochgeladen, kaputtes Datum: nichts für
  // uns. Auch die Platzhalter, die Intervals.icu für fremd eingespielte
  // Aktivitäten führt, fallen hier heraus – sie tragen keine Distanz.
  const fahrten = liste.map((roh) => ausIntervals(roh, userId)).filter(Boolean)

  return schreibeSync(conn, userId, ANBIETER.intervals, fahrten, oldest, newest)
}

// Der Webhook ist der schnelle Weg; dieser Takt hier ist der sichere. Er fängt
// alles auf, was der Webhook verpasst hat (nicht eingerichtet, Server war aus,
// Zustellung fehlgeschlagen). Geprüft wird stündlich, geholt nur, was fällig
// ist.
async function syncFaellige() {
  for (const user of db.users) {
    const aktiv = aktiveQuelle(user.id)
    if (!aktiv || aktiv.conn.needsReconnect) continue
    const faellig =
      !aktiv.conn.lastSyncAt ||
      Date.now() - Date.parse(aktiv.conn.lastSyncAt) > db.settings.syncIntervalHours * 3600_000
    if (!faellig) continue
    try {
      await syncUser(user.id)
    } catch (err) {
      aktiv.conn.lastSyncError = err.message
      sichere('wahoo', 'intervals')
      console.error(`[fahrradtracker] Sync für ${user.id} fehlgeschlagen:`, err.message)
    }
  }
}

setTimeout(syncFaellige, 20_000)
setInterval(syncFaellige, 60 * 60 * 1000)

// ── Verschleißrechnung ───────────────────────────────────────────────────────
// Gerechnet wird bei jeder Anfrage neu, aus den Fahrten. Gespeichert ist kein
// einziger Kilometerstand: Wer ein Einbaudatum korrigiert, einen
// Nutzungszeitraum verschiebt oder eine Fahrt nachträgt, sieht das Ergebnis
// sofort – ohne Nachrechnen-Knopf und ohne Stand, der schief stehen könnte.
//
// Die Kette steht in shared/fahrten.js: Fahrt → Rad (über das Datum) → Aufbau
// (drinnen/draußen) → die Teile dieses Aufbaus.
function geloesteFahrten() {
  const { loese } = zuordner(db.bikes, db.setups)
  return db.rides.filter((r) => !r.deleted).map(loese)
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

function komponenteMitKm(component, fahrten) {
  const bike = db.bikes.find((b) => b.id === component.bikeId)
  const typ = db.types.find((t) => t.id === component.typeId)
  const setupIds = component.setupIds ?? []
  const perioden = (component.periods ?? []).map((p) => ({
    ...p,
    km: kmImZeitraum(setupIds, fahrten, p.from, p.to ?? heute()),
  }))
  const totalKm = Math.round(perioden.reduce((s, p) => s + p.km, 0) * 10) / 10
  const { limitKm, limitQuelle } = grenzeFuer(component, bike, typ)
  // Kilometer seit dem letzten Aufziehen – daran hängt das Wechselintervall
  // (Ketten, die im Wechsel gefahren und gewachst werden)
  const laufend = perioden.find((p) => !p.to)
  const rotationKm = Math.max(0, Math.round(Number(typ?.rotationKm) || 0))
  return {
    ...component,
    periods: perioden,
    currentKm: laufend?.km ?? 0,
    rotationKm,
    rotationFaellig: Boolean(rotationKm > 0 && laufend && laufend.km >= rotationKm),
    // Der eigene Grenzwert der Instanz bleibt sichtbar; `limitKm` weiter unten
    // ist der, der am Ende gilt
    ownLimitKm: component.limitKm ?? null,
    totalKm,
    limitKm,
    limitQuelle,
    percent: limitKm > 0 ? Math.round((totalKm / limitKm) * 100) : 0,
  }
}

// ── Benachrichtigungen ───────────────────────────────────────────────────────
// Geprüft wird nach jedem Sync und einmal pro Stunde. Verschickt wird nur, was
// neu ist: Jede Meldung wird am Teil vermerkt, sonst käme sie mit jedem Lauf
// wieder. Der Vermerk hängt am laufenden Einbau – nach einem Wechsel fängt
// alles von vorn an.
function meldungenFuer(user, fahrten) {
  const meldungen = []
  const { yellow, red } = db.settings.thresholds

  for (const component of db.components) {
    if (component.status !== 'aktiv') continue
    const bike = db.bikes.find((b) => b.id === component.bikeId)
    if (!bike || bike.ownerId !== user.id) continue

    const gerechnet = komponenteMitKm(component, fahrten)
    const laufend = gerechnet.periods.find((p) => !p.to)
    if (!laufend) continue

    // Der Vermerk gilt für genau diesen Einbau
    if (component.notified?.periodId !== laufend.id) {
      component.notified = { periodId: laufend.id }
    }
    const vermerk = component.notified
    const rad = bike.name

    if (gerechnet.rotationFaellig && !vermerk.wachsen) {
      vermerk.wachsen = true
      meldungen.push({
        art: 'wachsen',
        kurz: `${gerechnet.label} ist bei ${kmText(gerechnet.currentKm)}`,
        teil: gerechnet.label,
        rad,
        text: `${kmText(gerechnet.currentKm)} seit dem Aufziehen – dein Intervall sind ${kmText(gerechnet.rotationKm)}. Zeit zum Wechseln und Wachsen.`,
      })
    }
    if (gerechnet.percent >= red && !vermerk.rot) {
      vermerk.rot = true
      vermerk.gelb = true
      meldungen.push({
        art: 'rot',
        kurz: `${gerechnet.label} ist überfällig`,
        teil: gerechnet.label,
        rad,
        text: `${kmText(gerechnet.totalKm)} von ${kmText(gerechnet.limitKm)} – das sind ${gerechnet.percent} % der Verschleißgrenze.`,
      })
    } else if (gerechnet.percent >= yellow && !vermerk.gelb) {
      vermerk.gelb = true
      meldungen.push({
        art: 'gelb',
        kurz: `${gerechnet.label} wird bald fällig`,
        teil: gerechnet.label,
        rad,
        text: `${kmText(gerechnet.totalKm)} von ${kmText(gerechnet.limitKm)} – das sind ${gerechnet.percent} % der Verschleißgrenze.`,
      })
    }
  }
  return meldungen
}

/** Kilometer, wie sie in der Mail stehen sollen. */
function kmText(km) {
  const wert = Number(km) || 0
  return `${wert.toLocaleString('de-DE', { maximumFractionDigits: wert < 100 ? 1 : 0 })} km`
}

async function pruefeMeldungen() {
  if (!MAIL_CONFIGURED) return
  const fahrten = geloesteFahrten()
  for (const user of db.users) {
    if (!user.notifyEmail) continue
    const meldungen = meldungenFuer(user, fahrten)
    if (!meldungen.length) continue
    try {
      await schickeMeldungen(user.notifyEmail, user.name, meldungen)
      sichere('components')
      console.log(`[fahrradtracker] ${meldungen.length} Meldung(en) an ${user.name} geschickt`)
    } catch (err) {
      // Vermerke zurücknehmen, damit die Meldung beim nächsten Lauf erneut
      // versucht wird
      for (const component of db.components) delete component.notified
      console.error('[fahrradtracker] E-Mail fehlgeschlagen:', err.message)
    }
  }
}

setInterval(pruefeMeldungen, 60 * 60 * 1000)

// ── Der Stand für den Browser ────────────────────────────────────────────────
function verbindungInfo(provider, conn) {
  if (!conn) return null
  return {
    provider,
    athleteName: conn.athleteName ?? '',
    externalUserId: conn.externalUserId ?? '',
    connectedAt: conn.connectedAt ?? '',
    lastSyncAt: conn.lastSyncAt ?? '',
    lastSyncError: conn.lastSyncError ?? '',
    // Zugriff zurückgezogen oder Token verfallen: neu verbinden hilft
    needsReconnect: Boolean(conn.needsReconnect),
    // Nur aus der aktiven Quelle wird geholt
    active: Boolean(conn.active),
  }
}

function profil(u) {
  const wahoo = verbindungInfo('wahoo', wahooVerbindung(u.id))
  const intervals = verbindungInfo('intervals', icuVerbindung(u.id))
  const aktiv = aktiveQuelle(u.id)
  return {
    id: u.id,
    name: u.name,
    color: u.color,
    connections: { wahoo, intervals },
    activeProvider: aktiv?.provider ?? '',
    hasQuelle: Boolean(wahoo || intervals),
    lastSyncAt: aktiv?.conn.lastSyncAt ?? '',
    lastSyncError: aktiv?.conn.lastSyncError ?? '',
    needsReconnect: Boolean(aktiv?.conn.needsReconnect),
    notifyEmail: u.notifyEmail ?? '',
  }
}

// So viele Fahrten gehen an den Browser – der Rest wäre auf dem Handy ohnehin
// niemand, der scrollt. Unzugeordnete kommen immer mit, die will man sehen.
const FAHRTEN_FENSTER = 300

function publicState(user) {
  const fahrten = geloesteFahrten()
  const sortiert = [...fahrten].sort(
    (a, b) => b.date.localeCompare(a.date) || (b.time ?? '').localeCompare(a.time ?? ''),
  )
  const offen = sortiert.filter((f) => f.unassigned)
  const sichtbar = [...new Set([...sortiert.slice(0, FAHRTEN_FENSTER), ...offen])]

  return {
    me: profil(user),
    users: db.users.map(profil),
    bikes: db.bikes.map((b) => ({ ...b, totalKm: kmFuerRad(b.id, fahrten) })),
    setups: db.setups.map((auf) => ({ ...auf, ...kmFuerAufbau(auf.id, fahrten) })),
    componentTypes: db.types,
    components: db.components.map((c) => komponenteMitKm(c, fahrten)),
    rides: sichtbar,
    // Fürs Kilometer-Dashboard – gerechnet über *alle* Fahrten, nicht nur die
    // mitgeschickten
    stats: statistik(fahrten, { bikes: db.bikes, heute: heute() }),
    settings: db.settings,
    wahooConfigured: WAHOO_CONFIGURED,
    intervalsConfigured: ICU_CONFIGURED,
    mailConfigured: MAIL_CONFIGURED,
    fahrten: fahrten.length,
    fahrtenFenster: FAHRTEN_FENSTER,
    ohneZuordnung: offen.length,
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
      hasQuelle: verbindungen(u.id).length > 0,
    })),
    wahooConfigured: WAHOO_CONFIGURED,
    intervalsConfigured: ICU_CONFIGURED,
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
  const name = req.body?.name === undefined ? req.user.name : text(req.body.name, 40)
  antworte(req, res, () => {
    if (req.body?.notifyEmail !== undefined) {
      const adresse = text(req.body.notifyEmail, 120)
      if (adresse && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adresse)) {
        return { reject: { status: 400, error: 'Das sieht nicht nach einer E-Mail-Adresse aus.' } }
      }
      // Leer heißt: keine Benachrichtigungen mehr
      req.user.notifyEmail = adresse
    }
    if (!name) return { reject: { status: 400, error: 'Bitte einen Namen eintragen.' } }
    if (db.users.some((u) => u.id !== req.user.id && u.name.toLowerCase() === name.toLowerCase())) {
      return { reject: { status: 409, error: 'Diesen Namen gibt es schon.' } }
    }
    req.user.name = name
    if (FARBEN.includes(req.body?.color)) req.user.color = req.body.color
    sichere('users')
  })
})

/** Probemail an die hinterlegte Adresse – prüft die Einrichtung. */
app.post('/api/notify/test', auth, async (req, res) => {
  if (!MAIL_CONFIGURED) {
    return res.status(503).json({ error: 'Auf dem Server fehlen die SMTP-Zugangsdaten.' })
  }
  if (!req.user.notifyEmail) {
    return res.status(400).json({ error: 'Erst eine Adresse eintragen.' })
  }
  try {
    await schickeProbe(req.user.notifyEmail, req.user.name)
    res.json({ ok: true })
  } catch (err) {
    console.error('[fahrradtracker] Probemail fehlgeschlagen:', err.message)
    res.status(502).json({ error: `Versand fehlgeschlagen: ${err.message}` })
  }
})

app.get('/api/state', auth, (req, res) => {
  res.json(publicState(req.user))
})

// ── Räder ────────────────────────────────────────────────────────────────────
// Sichtbar sind alle Räder für alle; ändern darf sie nur, wem sie gehören.
//
// Ein Rad hat einen Nutzungszeitraum. Er entscheidet, welche Fahrt auf welches
// Rad geht – deshalb dürfen sich die Zeiträume eines Profils nicht
// überschneiden, sonst wäre die Zuordnung mehrdeutig. `to: null` heißt „das
// fahre ich gerade“.
function radDaten(body, bisher = {}) {
  const daten = {
    name: body?.name !== undefined ? text(body.name, 60) : bisher.name,
    manufacturer:
      body?.manufacturer !== undefined ? text(body.manufacturer, 60) : (bisher.manufacturer ?? ''),
    model: body?.model !== undefined ? text(body.model, 60) : (bisher.model ?? ''),
    from: body?.from !== undefined ? String(body.from ?? '').slice(0, 10) : bisher.from,
    to: body?.to !== undefined ? (body.to ? String(body.to).slice(0, 10) : null) : bisher.to,
  }
  return daten
}

function pruefeRad(daten, bikeId, ownerId) {
  if (!daten.name) return 'Bitte einen Namen eintragen.'
  if (!istDatum(daten.from)) return 'Bitte ein gültiges „genutzt ab“ eintragen.'
  if (daten.to !== null && !istDatum(daten.to)) return 'Das „genutzt bis“ ist kein gültiges Datum.'
  if (daten.to !== null && daten.to < daten.from) return 'Das Ende liegt vor dem Anfang.'

  const kollision = db.bikes.find(
    (b) => b.id !== bikeId && b.ownerId === ownerId && ueberschneidetSich(b, daten),
  )
  if (kollision) {
    return `Der Zeitraum überschneidet sich mit „${kollision.name}“ – ein Tag, ein Rad.`
  }
  return null
}

app.post('/api/bikes', auth, (req, res) => {
  antworte(req, res, () => {
    const daten = radDaten(req.body, { from: heute(), to: null })
    const fehler = pruefeRad(daten, null, req.user.id)
    if (fehler) return { reject: { status: 400, error: fehler } }

    const bike = {
      id: createId(),
      ownerId: req.user.id,
      ...daten,
      limits: {},
      createdAt: new Date().toISOString(),
    }
    db.bikes.push(bike)
    // Ohne Aufbau hätte eine Fahrt nichts, woran ihre Teile hängen könnten
    db.setups.push({ id: createId(), bikeId: bike.id, name: 'Draußen', kind: 'outdoor' })
    sichere('bikes', 'setups')
  })
})

app.put('/api/bikes/:id', auth, (req, res) => {
  const bike = eigenesRad(req, res, req.params.id)
  if (!bike) return
  antworte(req, res, () => {
    const daten = radDaten(req.body, bike)
    const fehler = pruefeRad(daten, bike.id, bike.ownerId)
    if (fehler) return { reject: { status: 400, error: fehler } }
    Object.assign(bike, daten)
    sichere('bikes')
  })
})

app.delete('/api/bikes/:id', auth, (req, res) => {
  const bike = eigenesRad(req, res, req.params.id)
  if (!bike) return
  antworte(req, res, () => {
    const aufbauten = db.setups.filter((auf) => auf.bikeId === bike.id).map((auf) => auf.id)
    db.bikes = db.bikes.filter((b) => b.id !== bike.id)
    db.setups = db.setups.filter((auf) => auf.bikeId !== bike.id)
    db.components = db.components.filter((c) => c.bikeId !== bike.id)
    // Teile anderer Räder verlieren nur diesen Aufbau, nicht sich selbst
    for (const teil of db.components) {
      teil.setupIds = (teil.setupIds ?? []).filter((id) => !aufbauten.includes(id))
    }
    // Fahrten bleiben: sie fallen auf „unzugeordnet“ zurück und lassen sich
    // einem anderen Rad zuweisen, statt still verloren zu gehen.
    for (const fahrt of db.rides) {
      if (fahrt.override?.bikeId === bike.id) fahrt.override = null
    }
    sichere('bikes', 'setups', 'components', 'rides')
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

// ── Aufbauten ────────────────────────────────────────────────────────────────
// Ein Aufbau ist das Rad, wie es an einem Tag zusammengesetzt ist: „Draußen“
// und, wer eine Rolle hat, „Rolle“. Dieselbe Kette hängt an beiden, die
// Kassette meist nicht – genau dafür gibt es sie.
const AUFBAU_ARTEN = new Set(['outdoor', 'indoor'])

app.post('/api/bikes/:id/setups', auth, (req, res) => {
  const bike = eigenesRad(req, res, req.params.id)
  if (!bike) return
  antworte(req, res, () => {
    const kind = String(req.body?.kind ?? '')
    if (!AUFBAU_ARTEN.has(kind)) return { reject: { status: 400, error: 'Unbekannte Art.' } }
    // Zwei Aufbauten derselben Art wären nicht auseinanderzuhalten: eine Fahrt
    // ist entweder drinnen oder draußen.
    if (db.setups.some((auf) => auf.bikeId === bike.id && auf.kind === kind)) {
      return { reject: { status: 409, error: 'Diesen Aufbau gibt es an dem Rad schon.' } }
    }
    db.setups.push({
      id: createId(),
      bikeId: bike.id,
      name: text(req.body?.name, 40) || (kind === 'indoor' ? 'Rolle' : 'Draußen'),
      kind,
      // 1 = eins zu eins; auf der Rolle darf es weniger sein
      factor: faktorAus(req.body?.factor) ?? 1,
    })
    sichere('setups')
  })
})

function eigenerAufbau(req, res) {
  const aufbau = db.setups.find((auf) => auf.id === req.params.setupId)
  if (!aufbau) {
    res.status(404).json({ error: 'Aufbau nicht gefunden.' })
    return null
  }
  return eigenesRad(req, res, aufbau.bikeId) ? aufbau : null
}

/** Verschleißfaktor: eine Zahl über 0 und höchstens 5. */
function faktorAus(wert) {
  const zahl = Number(wert)
  if (!Number.isFinite(zahl) || zahl <= 0 || zahl > 5) return null
  return Math.round(zahl * 1000) / 1000
}

app.put('/api/setups/:setupId', auth, (req, res) => {
  const aufbau = eigenerAufbau(req, res)
  if (!aufbau) return
  antworte(req, res, () => {
    if (req.body?.name !== undefined) {
      const name = text(req.body.name, 40)
      if (!name) return { reject: { status: 400, error: 'Bitte einen Namen eintragen.' } }
      aufbau.name = name
    }
    if (req.body?.factor !== undefined) {
      const faktor = faktorAus(req.body.factor)
      if (faktor === null) {
        return { reject: { status: 400, error: 'Der Faktor muss zwischen 0 und 5 liegen.' } }
      }
      aufbau.factor = faktor
    }
    sichere('setups')
  })
})

app.delete('/api/setups/:setupId', auth, (req, res) => {
  const aufbau = eigenerAufbau(req, res)
  if (!aufbau) return
  antworte(req, res, () => {
    if (aufbau.kind === 'outdoor') {
      return {
        reject: { status: 409, error: 'Der Aufbau „draußen“ bleibt – ohne ihn zählt nichts.' },
      }
    }
    db.setups = db.setups.filter((a) => a.id !== aufbau.id)
    for (const teil of db.components) {
      teil.setupIds = (teil.setupIds ?? []).filter((id) => id !== aufbau.id)
    }
    sichere('setups', 'components')
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
      // Wechsel- oder Wachsintervall: Kilometer, nach denen ein Teil im
      // laufenden Einbau dran ist (0 = kein Intervall)
      rotationKm: Math.max(0, Math.round(Number(req.body?.rotationKm) || 0)),
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

function teiltAufbau(a, b) {
  return (a.setupIds ?? []).some((id) => (b.setupIds ?? []).includes(id))
}

/**
 * Baut ein Teil ein und legt still, was es verdrängt – eingelagert, nicht
 * entsorgt: es lässt sich jederzeit wieder aufziehen.
 *
 * Verdrängt wird nur, was sich einen Aufbau teilt. Zwei Kassetten am selben
 * Rad sind kein Widerspruch, solange die eine draußen und die andere auf der
 * Rolle sitzt – zwei Ketten an *demselben* Aufbau schon.
 */
function einbauen(component, datum) {
  if (offenePeriode(component)) {
    return { reject: { status: 409, error: 'Das Teil ist bereits eingebaut.' } }
  }
  const verdraengt = db.components.filter(
    (c) =>
      c.id !== component.id &&
      c.typeId === component.typeId &&
      c.status === 'aktiv' &&
      teiltAufbau(c, component),
  )
  for (const vorher of verdraengt) {
    const offen = offenePeriode(vorher)
    // Ein Ausbau vor dem eigenen Einbau ergäbe einen negativen Zeitraum
    if (offen) offen.to = datum < offen.from ? offen.from : datum
    vorher.status = 'eingelagert'
  }
  component.status = 'aktiv'
  component.periods.push({ id: createId(), from: datum, to: null })
  return null
}

/** Nur Aufbauten, die dem Angemeldeten gehören – geteilt werden darf auch über
 *  Räder hinweg, aber nicht über Profile. */
function aufbautenFuerTeil(wert, ownerId, bike) {
  const eigene = new Set(
    db.setups
      .filter((auf) => db.bikes.some((b) => b.id === auf.bikeId && b.ownerId === ownerId))
      .map((auf) => auf.id),
  )
  if (!Array.isArray(wert)) {
    // Ohne Angabe zählt das Teil an allen Aufbauten seines Rades: die Kette
    // fährt drinnen wie draußen, und das ist der häufigere Fall.
    return db.setups.filter((auf) => auf.bikeId === bike?.id).map((auf) => auf.id)
  }
  return [...new Set(wert.map(String).filter((id) => eigene.has(id)))]
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
      // An welchen Aufbauten dieses Teil mitfährt
      setupIds: aufbautenFuerTeil(req.body?.setupIds, req.user.id, bike),
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
    if (req.body?.setupIds !== undefined) {
      const bike = db.bikes.find((b) => b.id === component.bikeId)
      component.setupIds = aufbautenFuerTeil(req.body.setupIds, req.user.id, bike)
    }
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

// ── Fahrten ──────────────────────────────────────────────────────────────────
// Importiert oder von Hand – für die Verschleißrechnung sind beide dasselbe.
// Von Hand eingetragen werden vor allem die Fahrten aus der Zeit vor dem
// Wahoo: die stehen in keinem Konto, das wir lesen dürfen.
function eigeneFahrt(req, res) {
  const fahrt = db.rides.find((r) => r.id === req.params.id)
  if (!fahrt) {
    res.status(404).json({ error: 'Fahrt nicht gefunden.' })
    return null
  }
  if (fahrt.ownerId !== req.user.id) {
    res.status(403).json({ error: 'Die Fahrt gehört jemand anderem.' })
    return null
  }
  return fahrt
}

/** Rad und Aufbau von Hand festlegen – schlägt die Zuordnung über das Datum. */
function ueberschreibung(body, ownerId) {
  const bikeId = body?.bikeId ? String(body.bikeId) : null
  const setupId = body?.setupId ? String(body.setupId) : null
  if (!bikeId && !setupId) return { override: null }

  const bike = db.bikes.find((b) => b.id === bikeId && b.ownerId === ownerId)
  if (bikeId && !bike) return { fehler: 'Rad nicht gefunden.' }
  if (setupId) {
    const aufbau = db.setups.find((a) => a.id === setupId)
    if (!aufbau) return { fehler: 'Aufbau nicht gefunden.' }
    if (bike && aufbau.bikeId !== bike.id) {
      return { fehler: 'Der Aufbau gehört nicht zu diesem Rad.' }
    }
    return { override: { bikeId: aufbau.bikeId, setupId } }
  }
  // Nur ein Rad genannt: den passenden Aufbau sucht die Zuordnung selbst
  return { override: { bikeId, setupId: null } }
}

app.post('/api/rides', auth, (req, res) => {
  antworte(req, res, () => {
    const datum = String(req.body?.date ?? '').slice(0, 10)
    const km = Number(req.body?.km)
    if (!istDatum(datum)) return { reject: { status: 400, error: 'Kein gültiges Datum.' } }
    if (!(km > 0)) return { reject: { status: 400, error: 'Bitte eine Distanz über 0 eintragen.' } }

    const { override, fehler } = ueberschreibung(req.body, req.user.id)
    if (fehler) return { reject: { status: 404, error: fehler } }

    const zeit = String(req.body?.time ?? '').slice(0, 5)
    db.rides.push({
      id: createId(),
      ownerId: req.user.id,
      date: datum,
      time: /^\d{2}:\d{2}$/.test(zeit) ? zeit : null,
      km: Math.round(km * 100) / 100,
      minutes: Math.max(0, Math.round(Number(req.body?.minutes) || 0)),
      name: text(req.body?.name, 80) || 'Nachgetragene Fahrt',
      indoor: req.body?.indoor === true,
      source: 'MANUAL',
      externalProvider: null,
      externalActivityId: null,
      externalSource: null,
      override,
      createdAt: new Date().toISOString(),
    })
    sichere('rides')
  })
})

/**
 * Fahrten aus einer Tabelle nachtragen – für die Zeit, aus der keine
 * Schnittstelle mehr etwas hergibt. Erkannt wird der Aufbau
 * `name,date,sport,distance_km`; „Ride“ wird eine Fahrt draußen, „Virtual
 * Ride“ eine auf der Rolle.
 *
 * Zweimal dieselbe Datei einzulesen legt nichts doppelt an: Jede Zeile bekommt
 * aus Datum, Name und Distanz einen Schlüssel, an dem sie wiedererkannt wird.
 */
app.post('/api/rides/import', auth, (req, res) => {
  const { fahrten, ignoriert, verdaechtig, datumsformat, fehler } = ausCsv(
    String(req.body?.csv ?? ''),
    {
      bis: typeof req.body?.bis === 'string' ? req.body.bis : '',
      ownerId: req.user.id,
    },
  )
  if (fehler) return res.status(400).json({ error: fehler })

  const bekannt = new Set(
    db.rides
      .filter((r) => r.ownerId === req.user.id && r.externalProvider === 'csv')
      .map((r) => r.externalActivityId),
  )
  // Was einmal von Hand entfernt wurde, kommt durch dieselbe Datei nicht wieder
  const neue = fahrten.filter((f) => !bekannt.has(f.externalActivityId))
  const bericht = {
    gelesen: fahrten.length,
    angelegt: neue.length,
    schonDa: fahrten.length - neue.length,
    ohneDistanz: neue.filter((f) => f.km <= 0).length,
    km: Math.round(neue.reduce((s, f) => s + f.km, 0) * 10) / 10,
    datumsformat,
    // Mehrfach dasselbe Datum bei derselben Distanz: Zeichen für einen
    // kaputten Export
    verdaechtig,
    ignoriert: ignoriert.slice(0, 20),
    ignoriertGesamt: ignoriert.length,
  }

  // Erst zeigen, dann speichern: Ein Import lässt sich nicht in einem Rutsch
  // rückgängig machen, also soll man vorher sehen, was hereinkäme.
  if (req.body?.dryRun) {
    return res.json({
      ...bericht,
      beispiele: neue.slice(0, 8).map((f) => ({
        date: f.date,
        km: f.km,
        indoor: f.indoor,
        name: f.name,
      })),
    })
  }

  antworte(req, res, () => {
    for (const fahrt of neue) {
      db.rides.push({
        ...fahrt,
        id: createId(),
        note: '',
        kmOverride: null,
        override: null,
        createdAt: new Date().toISOString(),
      })
    }
    sichere('rides')
  })
})

app.put('/api/rides/:id', auth, (req, res) => {
  const fahrt = eigeneFahrt(req, res)
  if (!fahrt) return
  antworte(req, res, () => {
    // Rad und Aufbau lassen sich bei jeder Fahrt geraderücken; die Messwerte
    // nur bei den von Hand eingetragenen – alles andere käme beim nächsten
    // Sync ohnehin wieder zurück.
    if (req.body?.bikeId !== undefined || req.body?.setupId !== undefined) {
      const { override, fehler } = ueberschreibung(req.body, req.user.id)
      if (fehler) return { reject: { status: 404, error: fehler } }
      fahrt.override = override
    }

    if (fahrt.source !== 'MANUAL') {
      // Die Distanz darf auch bei geholten Fahrten von Hand gesetzt werden –
      // für die, zu denen der Anbieter keine kennt. Gespeichert wird sie
      // getrennt vom gemeldeten Wert, damit der nächste Sync sie nicht
      // überschreibt; `null` nimmt die Korrektur wieder zurück.
      if (req.body?.km !== undefined) {
        const km = req.body.km === null ? null : Number(req.body.km)
        if (km !== null && !(km >= 0)) {
          return { reject: { status: 400, error: 'Bitte eine Distanz ab 0 eintragen.' } }
        }
        fahrt.kmOverride = km === null ? null : Math.round(km * 100) / 100
      }
      const verboten = ['date', 'time', 'minutes', 'name', 'indoor'].some(
        (feld) => req.body?.[feld] !== undefined,
      )
      if (verboten) {
        return {
          reject: {
            status: 409,
            error:
              'Datum, Titel und drinnen/draußen kommen vom Anbieter – hier lassen sich nur Rad und Distanz geraderücken.',
          },
        }
      }
      sichere('rides')
      return
    }

    if (req.body?.date !== undefined) {
      const datum = String(req.body.date).slice(0, 10)
      if (!istDatum(datum)) return { reject: { status: 400, error: 'Kein gültiges Datum.' } }
      fahrt.date = datum
    }
    if (req.body?.km !== undefined) {
      const km = Number(req.body.km)
      if (!(km > 0)) return { reject: { status: 400, error: 'Bitte eine Distanz über 0.' } }
      fahrt.km = Math.round(km * 100) / 100
    }
    if (req.body?.time !== undefined) {
      const zeit = String(req.body.time ?? '').slice(0, 5)
      fahrt.time = /^\d{2}:\d{2}$/.test(zeit) ? zeit : null
    }
    if (req.body?.minutes !== undefined) {
      fahrt.minutes = Math.max(0, Math.round(Number(req.body.minutes) || 0))
    }
    if (req.body?.name !== undefined) fahrt.name = text(req.body.name, 80)
    if (req.body?.indoor !== undefined) fahrt.indoor = req.body.indoor === true
    sichere('rides')
  })
})

/**
 * Fahrt löschen.
 *
 * Von Hand eingetragene und eingelesene Fahrten sind danach weg. Geholte
 * bleiben als Grabstein liegen (`deleted`): Sie stehen beim Anbieter weiterhin
 * und kämen beim nächsten Sync sonst sofort wieder. Sichtbar sind sie nirgends
 * mehr und für den Verschleiß zählen sie nicht.
 */
app.delete('/api/rides/:id', auth, (req, res) => {
  const fahrt = eigeneFahrt(req, res)
  if (!fahrt) return
  antworte(req, res, () => {
    entferne(fahrt)
    sichere('rides')
  })
})

function entferne(fahrt) {
  if (fahrt.source === 'MANUAL') {
    db.rides = db.rides.filter((r) => r.id !== fahrt.id)
    return
  }
  fahrt.deleted = true
  fahrt.deletedAt = new Date().toISOString()
}

/**
 * Mehrere auf einmal – für einen Import, der sich als unbrauchbar herausstellt.
 * Verlangt wird immer eine ausdrückliche Auswahl, nie „alles“.
 */
app.delete('/api/rides', auth, (req, res) => {
  const { ids, provider, ohneDistanz } = req.body ?? {}
  antworte(req, res, () => {
    const eigene = db.rides.filter((r) => r.ownerId === req.user.id && !r.deleted)
    let treffer = []
    if (Array.isArray(ids) && ids.length) {
      treffer = eigene.filter((r) => ids.includes(r.id))
    } else if (typeof provider === 'string' && provider) {
      treffer = eigene.filter(
        (r) => r.externalProvider === provider && (!ohneDistanz || !(r.km > 0)),
      )
    } else {
      return { reject: { status: 400, error: 'Bitte angeben, welche Fahrten weg sollen.' } }
    }
    for (const fahrt of treffer) entferne(fahrt)
    sichere('rides')
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

// ── Intervals.icu-Verbindung ─────────────────────────────────────────────────
// Der Browser bekommt nur die Adresse zum Hinspringen; Code und Token laufen
// zwischen Server und Intervals.icu.
const oauthStates = new Map()

function raeumeStates() {
  const jetzt = Date.now()
  for (const [state, eintrag] of oauthStates) {
    if (eintrag.bis < jetzt) oauthStates.delete(state)
  }
}

function redirectUri() {
  return `${PUBLIC_URL}/api/intervals/callback`
}

app.get('/api/intervals/authorize', auth, (req, res) => {
  if (!ICU_CONFIGURED) {
    return res.status(503).json({ error: 'Auf dem Server fehlen INTERVALS_CLIENT_ID und -SECRET.' })
  }
  raeumeStates()
  // Der state schützt den Rücksprung: Ohne ihn könnte jemand einen fremden
  // Code auf dieses Profil buchen.
  const state = randomBytes(16).toString('hex')
  oauthStates.set(state, { userId: req.user.id, bis: Date.now() + 10 * 60 * 1000 })
  const url = new URL(`${ICU_BASE}/oauth/authorize`)
  url.searchParams.set('client_id', ICU_CLIENT_ID)
  url.searchParams.set('redirect_uri', redirectUri())
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', ICU_SCOPE)
  url.searchParams.set('state', state)
  res.json({ url: url.toString() })
})

app.get('/api/intervals/callback', async (req, res) => {
  const ziel = (ergebnis) => res.redirect(`${PUBLIC_URL}/?intervals=${ergebnis}`)
  raeumeStates()
  const eintrag = oauthStates.get(String(req.query.state ?? ''))
  oauthStates.delete(String(req.query.state ?? ''))
  if (!eintrag) return ziel('abgelaufen')
  if (req.query.error || !req.query.code) return ziel('abgelehnt')

  try {
    const r = await fetch(`${ICU_BASE}/api/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: ICU_CLIENT_ID,
        client_secret: ICU_CLIENT_SECRET,
        code: String(req.query.code),
        redirect_uri: redirectUri(),
        grant_type: 'authorization_code',
      }),
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const daten = await r.json()
    if (!daten.access_token || !daten.athlete?.id) throw new Error('Antwort ohne Token oder Athlet')

    // Intervals.icu gibt Tokens ohne Ablauf aus und ersetzt bei jeder neuen
    // Autorisierung das alte – es gibt also nichts aufzufrischen, nur zu
    // überschreiben.
    const conn = icuVerbindung(eintrag.userId) ?? { userId: eintrag.userId }
    Object.assign(conn, {
      athleteId: String(daten.athlete.id),
      externalUserId: String(daten.athlete.id),
      athleteName: text(daten.athlete.name, 60),
      accessToken: daten.access_token,
      scope: String(daten.scope ?? ICU_SCOPE),
      connectedAt: new Date().toISOString(),
      lastSyncError: '',
      needsReconnect: false,
    })
    if (!db.intervals.includes(conn)) db.intervals.push(conn)
    // Die frisch verbundene Quelle ist ab jetzt die, aus der geholt wird
    sichere('intervals')
    setzeAktiv(eintrag.userId, 'intervals')

    // Erster Lauf holt die Geschichte, so weit die App sie braucht
    syncUser(eintrag.userId, { voll: true }).catch((err) => {
      conn.lastSyncError = err.message
      sichere('intervals')
      console.error('[fahrradtracker] Erster Sync fehlgeschlagen:', err.message)
    })
    ziel('ok')
  } catch (err) {
    console.error('[fahrradtracker] Intervals-Anmeldung fehlgeschlagen:', err.message)
    ziel('fehler')
  }
})

app.delete('/api/intervals', auth, async (req, res) => {
  const conn = icuVerbindung(req.user.id)
  // Erst drüben abmelden, dann hier vergessen – andersherum bliebe die
  // Freigabe stehen.
  if (conn) {
    try {
      await fetch(`${ICU_BASE}/api/v1/disconnect-app`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${conn.accessToken}` },
      })
    } catch (err) {
      console.error('[fahrradtracker] Abmelden bei Intervals fehlgeschlagen:', err.message)
    }
  }
  antworte(req, res, () => {
    db.intervals = db.intervals.filter((c) => c.userId !== req.user.id)
    // Nur die Fahrten dieser Quelle gehen mit – ohne Verbindung ließen sie sich
    // nicht mehr auffrischen. Von Hand eingetragene und die der anderen Quelle
    // bleiben.
    db.rides = db.rides.filter(
      (r) => r.ownerId !== req.user.id || r.externalProvider !== ANBIETER.intervals,
    )
    // Bleibt noch eine Quelle übrig, holt ab jetzt die
    const rest = verbindungen(req.user.id)[0]
    if (rest) rest.conn.active = true
    sichere('intervals', 'wahoo', 'rides')
  })
})

app.post('/api/sync', auth, async (req, res) => {
  try {
    const ergebnis = await syncUser(req.user.id, { voll: req.body?.voll === true })
    res.json({ ...ergebnis, state: publicState(req.user) })
  } catch (err) {
    const conn = aktiveQuelle(req.user.id)?.conn
    if (conn) {
      conn.lastSyncError = err.message
      sichere('wahoo', 'intervals')
    }
    res.status(502).json({ error: err.message })
  }
})

/** Aus welcher Quelle geholt wird, wenn beide verbunden sind. */
app.put('/api/provider', auth, (req, res) => {
  const provider = String(req.body?.provider ?? '')
  if (!['wahoo', 'intervals'].includes(provider)) {
    return res.status(400).json({ error: 'Unbekannte Quelle.' })
  }
  antworte(req, res, () => {
    if (!verbindungen(req.user.id).some((v) => v.provider === provider)) {
      return { reject: { status: 409, error: 'Diese Quelle ist nicht verbunden.' } }
    }
    setzeAktiv(req.user.id, provider)
  })
})

/**
 * Intervals.icu meldet neue und fertig ausgewertete Aktivitäten hierher –
 * eingerichtet wird das einmal in der App-Verwaltung bei Intervals (eine
 * Adresse für alle Nutzer, deshalb die Athleten-Id im Rumpf).
 *
 * Der Rumpf trägt das Secret, das die App dort hinterlegt hat; ohne
 * Übereinstimmung wird nichts angefasst. Statt den mitgeschickten Datensatz zu
 * glauben, löst die Meldung einen kleinen Sync aus: derselbe Weg wie sonst,
 * damit es keine zweite Wahrheit gibt.
 */
const webhookLaeuft = new Set()

app.post('/api/intervals/webhook', (req, res) => {
  if (!ICU_WEBHOOK_SECRET || req.body?.secret !== ICU_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unbekanntes Webhook-Secret.' })
  }
  // Immer 200, sonst stellt Intervals.icu wieder und wieder zu
  res.json({ ok: true })

  try {
    const events = Array.isArray(req.body.events) ? req.body.events : []
    const athleten = new Set(
      events
        .filter((e) =>
          ['ACTIVITY_UPLOADED', 'ACTIVITY_ANALYZED', 'ACTIVITY_DELETED'].includes(e?.type),
        )
        .map((e) => String(e.athlete_id ?? '')),
    )
    for (const athleteId of athleten) {
      const conn = db.intervals.find((c) => c.athleteId === athleteId)
      if (!conn || !conn.active || webhookLaeuft.has(conn.userId)) continue
      webhookLaeuft.add(conn.userId)
      syncIntervals(conn.userId)
        .catch((err) => {
          conn.lastSyncError = err.message
          sichere('intervals')
          console.error('[fahrradtracker] Sync nach Webhook fehlgeschlagen:', err.message)
        })
        .finally(() => webhookLaeuft.delete(conn.userId))
    }
  } catch (err) {
    console.error('[fahrradtracker] Webhook nicht verarbeitet:', err.message)
  }
})

// ── Wahoo-Verbindung ─────────────────────────────────────────────────────────
// Dieselbe Mechanik wie bei Intervals.icu: Der Browser bekommt nur die Adresse
// zum Hinspringen, Code und Tokens laufen zwischen Server und Wahoo.
app.get('/api/wahoo/authorize', auth, (req, res) => {
  if (!WAHOO_CONFIGURED) {
    return res.status(503).json({ error: 'Auf dem Server fehlen WAHOO_CLIENT_ID und -SECRET.' })
  }
  raeumeStates()
  const state = randomBytes(16).toString('hex')
  oauthStates.set(state, { userId: req.user.id, bis: Date.now() + 10 * 60 * 1000 })
  const url = new URL(`${WAHOO_BASE}/oauth/authorize`)
  url.searchParams.set('client_id', WAHOO_CLIENT_ID)
  url.searchParams.set('redirect_uri', `${PUBLIC_URL}/api/wahoo/callback`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('approval_prompt', 'auto')
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
        redirect_uri: `${PUBLIC_URL}/api/wahoo/callback`,
      }),
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const daten = await r.json()

    const conn = wahooVerbindung(eintrag.userId) ?? { userId: eintrag.userId }
    Object.assign(conn, {
      externalUserId: String(daten.athlete?.id ?? ''),
      athleteName: text([daten.athlete?.first, daten.athlete?.last].filter(Boolean).join(' '), 60),
      accessToken: daten.access_token,
      refreshToken: daten.refresh_token,
      expiresAt: new Date(Date.now() + (Number(daten.expires_in) || 7200) * 1000).toISOString(),
      connectedAt: new Date().toISOString(),
      lastSyncAt: conn.lastSyncAt ?? '',
      lastSyncError: '',
      needsReconnect: false,
    })
    if (!db.wahoo.includes(conn)) db.wahoo.push(conn)
    sichere('wahoo')
    // Die frisch verbundene Quelle ist ab jetzt die, aus der geholt wird
    setzeAktiv(eintrag.userId, 'wahoo')

    // Wer der Verbundene ist, steht erst nach dem ersten Aufruf fest – und die
    // Wahoo-Id brauchen wir, um die Webhooks zuzuordnen.
    try {
      Object.assign(conn, await wahooProfil(conn))
      sichere('wahoo')
    } catch (err) {
      console.error('[fahrradtracker] Wahoo-Profil nicht lesbar:', err.message)
    }

    syncWahoo(eintrag.userId, { voll: true }).catch((err) => {
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
  const conn = wahooVerbindung(req.user.id)
  // Erst drüben abmelden, dann hier vergessen – andersherum bliebe die
  // Freigabe stehen.
  if (conn) {
    try {
      const token = await wahooToken(conn)
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
    db.rides = db.rides.filter(
      (r) => r.ownerId !== req.user.id || r.externalProvider !== ANBIETER.wahoo,
    )
    const rest = verbindungen(req.user.id)[0]
    if (rest) rest.conn.active = true
    sichere('wahoo', 'intervals', 'rides')
  })
})

/**
 * Wahoo meldet jede fertige Fahrt hierher – eingerichtet wird das einmal in
 * den Webhook-Einstellungen der Wahoo-App (eine Adresse für alle Nutzer,
 * deshalb die Wahoo-User-Id im Rumpf). Ohne den passenden Token wird nichts
 * angefasst.
 */
app.post('/api/wahoo/webhook', (req, res) => {
  if (!WAHOO_WEBHOOK_TOKEN || req.body?.webhook_token !== WAHOO_WEBHOOK_TOKEN) {
    return res.status(401).json({ error: 'Unbekannter Webhook-Token.' })
  }
  // Immer 200, sonst stellt Wahoo stunden- und tagelang neu zu
  res.json({ ok: true })

  try {
    if (req.body.event_type !== 'workout_summary') return
    const externalUserId = String(req.body.user?.id ?? '')
    const aktive = db.wahoo.filter((c) => c.active)
    // Normalfall: über die Wahoo-User-Id. Ist die (noch) nicht bekannt – der
    // Aufruf dafür schlägt bei Wahoo gelegentlich fehl – und es gibt genau
    // eine aktive Verbindung, dann kann es nur die sein. Authentifiziert ist
    // die Meldung durch den Webhook-Token ohnehin.
    const conn =
      db.wahoo.find((c) => c.active && c.externalUserId === externalUserId) ??
      (aktive.length === 1 && !aktive[0].externalUserId ? aktive[0] : null)
    if (!conn) return

    const workout = { ...req.body.workout, workout_summary: req.body.workout_summary }
    const fahrt = ausWahoo(workout, conn.userId, lokalerTag)
    if (!fahrt) return

    const { rides, neu, geaendert } = synchronisiereFenster(db.rides, [fahrt], {
      ownerId: conn.userId,
      provider: ANBIETER.wahoo,
      // Fenster auf genau diesen Tag: Der Webhook meldet eine einzelne Fahrt,
      // er darf nichts anderes aufräumen.
      von: fahrt.date,
      bis: fahrt.date,
      neueId: createId,
    })
    db.rides = rides
    if (neu || geaendert) {
      sichere('rides')
      console.log(`[fahrradtracker] Webhook: Fahrt ${fahrt.externalActivityId} übernommen`)
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
  if (!WAHOO_CONFIGURED && !ICU_CONFIGURED) {
    console.warn('[fahrradtracker] Ohne Zugangsdaten bleibt jede Quelle aus – siehe .env.example.')
  }
  if (WAHOO_CONFIGURED && !WAHOO_WEBHOOK_TOKEN) {
    console.warn('[fahrradtracker] Ohne WAHOO_WEBHOOK_TOKEN werden Wahoo-Webhooks verworfen.')
  }
  if (!MAIL_CONFIGURED) {
    console.warn('[fahrradtracker] Ohne SMTP_HOST/SMTP_FROM gehen keine Benachrichtigungen raus.')
  }
  if (ICU_CONFIGURED && !ICU_WEBHOOK_SECRET) {
    console.warn(
      '[fahrradtracker] Ohne INTERVALS_WEBHOOK_SECRET werden Intervals-Webhooks verworfen.',
    )
  }
})
