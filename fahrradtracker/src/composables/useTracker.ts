import { computed, reactive, ref } from 'vue'
import type { Thresholds } from '@/utils/verschleiss'

export type Status = 'aktiv' | 'eingelagert' | 'entsorgt'

export type Anbieter = 'wahoo' | 'intervals'

/** Eine Verbindung zu einer Fahrten-Quelle. Tokens sieht der Browser nie. */
export interface Verbindung {
  provider: Anbieter
  athleteName: string
  externalUserId: string
  connectedAt: string
  lastSyncAt: string
  lastSyncError: string
  /** Zugriff zurückgezogen – hilft nur neu verbinden */
  needsReconnect: boolean
  /** Nur aus der aktiven Quelle wird geholt */
  active: boolean
}

export interface Profil {
  id: string
  name: string
  color: string
  connections: { wahoo: Verbindung | null; intervals: Verbindung | null }
  activeProvider: Anbieter | ''
  hasQuelle: boolean
  /** Wohin Benachrichtigungen gehen; leer = keine */
  notifyEmail?: string
  lastSyncAt?: string
  lastSyncError?: string
  needsReconnect?: boolean
}

export interface Bike {
  id: string
  ownerId: string
  name: string
  manufacturer: string
  model: string
  /** Nutzungszeitraum – er entscheidet, welche Fahrt auf welches Rad geht */
  from: string
  to: string | null
  /** Grenzwerte für dieses Rad je Kategorie – schlägt den Standard der Kategorie */
  limits: Record<string, number>
  /** Kilometer über alle Aufbauten, kommt gerechnet vom Server */
  totalKm: number
}

/** Ein Rad, wie es an einem Tag zusammengesetzt ist: draußen oder auf der Rolle. */
export interface Aufbau {
  id: string
  bikeId: string
  name: string
  kind: 'outdoor' | 'indoor'
  /** Wie stark eine Fahrt hier auf den Verschleiß zählt; 1 = eins zu eins */
  factor: number
  /** Vom Server gerechnet: gefahren und daraus gewichtet */
  gefahren: number
  verschleiss: number
}

export interface Fahrt {
  id: string
  ownerId: string
  date: string
  time: string | null
  km: number
  minutes: number
  name: string
  indoor: boolean
  source: 'WAHOO' | 'INTERVALS_WAHOO' | 'MANUAL'
  externalProvider: string | null
  externalActivityId: string | null
  externalSource: string | null
  override: { bikeId: string | null; setupId: string | null } | null
  /** Von Hand gesetzte Distanz – überlebt jeden Sync */
  kmOverride?: number | null
  /** Warum diese Fahrt ist, wie sie ist – etwa woher eine Distanz stammt */
  note?: string
  /** Der Anbieter führt für diese Fahrt keine Distanz */
  ohneDistanz?: boolean
  /** Vom Server aufgelöst – nichts davon steht in der Datei */
  bikeId: string | null
  bikeName: string
  setupId: string | null
  setupName: string
  unassigned: boolean
  /** Faktor des Aufbaus und die daraus gewichteten Kilometer */
  faktor: number
  verschleissKm: number
  /** Was der Anbieter gemeldet hat, vor einer Korrektur von Hand */
  kmGemeldet: number
  kmKorrigiert: boolean
}

export interface Kategorie {
  id: string
  name: string
  emoji: string
  color: string
  defaultLimitKm: number
  /** Kilometer bis zum nächsten Wechsel im laufenden Einbau (0 = kein Intervall) */
  rotationKm: number
}

export interface Zeitraum {
  id: string
  from: string
  to: string | null
  km: number
}

export interface Teil {
  id: string
  bikeId: string
  typeId: string
  /** An welchen Aufbauten dieses Teil mitfährt – so verschleißt eine Kette
   *  drinnen wie draußen, während jede Kassette nur an ihrem Aufbau zählt */
  setupIds: string[]
  label: string
  note: string
  status: Status
  periods: Zeitraum[]
  totalKm: number
  /** Eigener Grenzwert dieser Instanz, falls gesetzt */
  ownLimitKm: number | null
  /** Der Grenzwert, der am Ende gilt */
  limitKm: number
  limitQuelle: 'instanz' | 'rad' | 'standard'
  percent: number
  /** Kilometer seit dem letzten Aufziehen */
  currentKm: number
  /** Wechselintervall der Kategorie und ob es erreicht ist */
  rotationKm: number
  rotationFaellig: boolean
}

/** Bericht eines CSV-Imports – erst als Vorschau, dann als Ergebnis. */
export interface ImportBericht {
  gelesen: number
  angelegt: number
  schonDa: number
  ohneDistanz: number
  km: number
  datumsformat: string
  verdaechtig: number
  ignoriert: { name: string; grund: string }[]
  ignoriertGesamt: number
  beispiele?: { date: string; km: number; indoor: boolean; name: string }[]
}

export type RadDaten = {
  name?: string
  manufacturer?: string
  model?: string
  from?: string
  to?: string | null
}

/** Vom Server gerechnet – Grundlage des Kilometer-Dashboards. */
export interface Stats {
  km: number
  fahrten: number
  indoorKm: number
  outdoorKm: number
  schnitt: number
  jahre: { jahr: string; km: number; indoorKm: number; outdoorKm: number; fahrten: number }[]
  monate: { monat: string; km: number; indoorKm: number; outdoorKm: number; fahrten: number }[]
  wochen: { woche: string; km: number; indoorKm: number; outdoorKm: number; fahrten: number }[]
  raeder: { id: string; name: string; km: number; fahrten: number }[]
  laengste: { date: string; name: string; km: number; indoor: boolean }[]
  besterMonat: { monat: string; km: number; fahrten: number } | null
  besteWoche: { woche: string; km: number; fahrten: number } | null
}

export interface AppState {
  me: Profil | null
  users: Profil[]
  bikes: Bike[]
  setups: Aufbau[]
  componentTypes: Kategorie[]
  components: Teil[]
  rides: Fahrt[]
  stats: Stats
  settings: { thresholds: Thresholds; syncIntervalHours: number }
  wahooConfigured: boolean
  intervalsConfigured: boolean
  /** Ob der Server überhaupt Mails verschicken kann */
  mailConfigured: boolean
  /** Fahrten gesamt; `rides` enthält nur die letzten `fahrtenFenster` */
  fahrten: number
  fahrtenFenster: number
  ohneZuordnung: number
}

const TOKEN_KEY = 'fahrrad:token'
const FILTER_KEY = 'fahrrad:filter'
const API_BASE = `${import.meta.env.BASE_URL}api`

let singleton: ReturnType<typeof createStore> | undefined

function createStore() {
  const loading = ref(true)
  const error = ref('')
  const hinweis = ref('')
  /** Profile für den Auswahlschirm – das Einzige, was es ohne Sitzung gibt. */
  const profiles = ref<Profil[]>([])
  const wahooConfigured = ref(true)
  const intervalsConfigured = ref(true)
  const token = ref(localStorage.getItem(TOKEN_KEY) ?? '')

  const state = reactive<AppState>({
    me: null,
    users: [],
    bikes: [],
    componentTypes: [],
    components: [],
    setups: [],
    rides: [],
    stats: {
      km: 0,
      fahrten: 0,
      indoorKm: 0,
      outdoorKm: 0,
      schnitt: 0,
      jahre: [],
      monate: [],
      wochen: [],
      raeder: [],
      laengste: [],
      besterMonat: null,
      besteWoche: null,
    },
    settings: { thresholds: { yellow: 70, red: 100 }, syncIntervalHours: 3 },
    wahooConfigured: true,
    intervalsConfigured: true,
    mailConfigured: false,
    fahrten: 0,
    fahrtenFenster: 300,
    ohneZuordnung: 0,
  })

  const angemeldet = computed(() => state.me !== null)

  function uebernehmen(daten: AppState | null) {
    if (!daten?.me) return
    Object.assign(state, daten)
    wahooConfigured.value = daten.wahooConfigured
    intervalsConfigured.value = daten.intervalsConfigured
  }

  function abmeldenLokal() {
    token.value = ''
    localStorage.removeItem(TOKEN_KEY)
    state.me = null
    ladeProfile()
  }

  /**
   * Ein Request mit Sitzungs-Token. Antwortet der Server mit dem neuen Stand,
   * ersetzt der ihn hier – jede Änderung geht einzeln raus, damit zwei Geräte
   * sich nicht gegenseitig überschreiben.
   */
  async function api<T = AppState>(
    pfad: string,
    method = 'GET',
    body?: unknown,
  ): Promise<T | null> {
    try {
      const r = await fetch(`${API_BASE}${pfad}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token.value ? { Authorization: `Bearer ${token.value}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      const daten = await r.json().catch(() => null)
      if (r.status === 401) {
        abmeldenLokal()
        return null
      }
      if (!r.ok) {
        error.value = daten?.error || 'Das hat nicht geklappt.'
        return null
      }
      return daten as T
    } catch {
      error.value = 'Keine Verbindung zum Server.'
      return null
    }
  }

  /** Für alles, was mit dem kompletten Stand antwortet. */
  async function aendern(pfad: string, method: string, body?: unknown) {
    const daten = await api<AppState>(pfad, method, body)
    if (daten) uebernehmen(daten)
    return Boolean(daten)
  }

  async function ladeProfile() {
    const daten = await api<{
      profiles: Profil[]
      wahooConfigured: boolean
      intervalsConfigured: boolean
    }>('/profiles')
    if (daten) {
      profiles.value = daten.profiles
      wahooConfigured.value = daten.wahooConfigured
      intervalsConfigured.value = daten.intervalsConfigured
    }
  }

  async function refresh() {
    if (!token.value) {
      await ladeProfile()
      return
    }
    const daten = await api<AppState>('/state')
    if (daten) uebernehmen(daten)
  }

  refresh().finally(() => {
    loading.value = false
  })

  // Es gibt keinen Live-Sync wie bei der Einkaufsliste: hier ändert selten
  // jemand etwas, während ein anderer zuschaut. Ein frischer Stand beim
  // Zurückkommen auf die Seite reicht – und die Kilometer wachsen ohnehin nur
  // im Takt der Fahrten, die Intervals.icu meldet.
  if (typeof window !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && angemeldet.value) refresh()
    })
  }

  // ── Anmelden ───────────────────────────────────────────────────────────────
  async function anmelden(profilId: string, pin: string) {
    const daten = await api<{ token: string; state: AppState }>(
      `/profiles/${profilId}/login`,
      'POST',
      { pin },
    )
    if (!daten) return false
    token.value = daten.token
    localStorage.setItem(TOKEN_KEY, daten.token)
    uebernehmen(daten.state)
    return true
  }

  async function profilAnlegen(name: string, pin: string, color?: string) {
    const daten = await api<{ token: string; state: AppState }>('/profiles', 'POST', {
      name,
      pin,
      color,
    })
    if (!daten) return false
    token.value = daten.token
    localStorage.setItem(TOKEN_KEY, daten.token)
    uebernehmen(daten.state)
    return true
  }

  async function abmelden() {
    await api('/logout', 'POST')
    abmeldenLokal()
  }

  function pinAendern(alt: string, pin: string) {
    return aendern('/profile/pin', 'PUT', { alt, pin })
  }

  function profilSpeichern(changes: { name?: string; color?: string; notifyEmail?: string }) {
    return aendern('/profile', 'PUT', changes)
  }

  /** Probemail an die hinterlegte Adresse. */
  async function probeMail() {
    const daten = await api<{ ok: boolean }>('/notify/test', 'POST')
    if (daten?.ok) hinweis.value = 'Probemail ist raus – schau in dein Postfach.'
    return Boolean(daten?.ok)
  }

  // ── Räder ──────────────────────────────────────────────────────────────────
  function radAnlegen(daten: RadDaten) {
    return aendern('/bikes', 'POST', daten)
  }

  function radSpeichern(id: string, changes: RadDaten) {
    return aendern(`/bikes/${id}`, 'PUT', changes)
  }

  // ── Aufbauten ──────────────────────────────────────────────────────────────
  function aufbauAnlegen(bikeId: string, kind: 'outdoor' | 'indoor', name?: string) {
    return aendern(`/bikes/${bikeId}/setups`, 'POST', { kind, name })
  }

  function aufbauSpeichern(setupId: string, changes: { name?: string; factor?: number }) {
    return aendern(`/setups/${setupId}`, 'PUT', changes)
  }

  function aufbauLoeschen(setupId: string) {
    return aendern(`/setups/${setupId}`, 'DELETE')
  }

  function aufbautenVon(bikeId: string) {
    return state.setups.filter((a) => a.bikeId === bikeId)
  }

  // ── Fahrten ────────────────────────────────────────────────────────────────
  /** Von Hand nachtragen – vor allem die Zeit, aus der keine Daten kommen. */
  function fahrtAnlegen(daten: {
    date: string
    km: number
    time?: string
    minutes?: number
    name?: string
    indoor?: boolean
    bikeId?: string
    setupId?: string
  }) {
    return aendern('/rides', 'POST', daten)
  }

  function fahrtSpeichern(
    id: string,
    changes: {
      date?: string
      km?: number | null
      time?: string
      minutes?: number
      name?: string
      indoor?: boolean
      bikeId?: string | null
      setupId?: string | null
    },
  ) {
    return aendern(`/rides/${id}`, 'PUT', changes)
  }

  function fahrtLoeschen(id: string) {
    return aendern(`/rides/${id}`, 'DELETE')
  }

  /** Mehrere auf einmal – etwa ein Import, der nichts taugte. */
  function fahrtenLoeschen(auswahl: { ids?: string[]; provider?: string; ohneDistanz?: boolean }) {
    return aendern('/rides', 'DELETE', auswahl)
  }

  /**
   * Fahrten aus einer Tabelle nachtragen. Ohne `speichern` ist es nur eine
   * Vorschau – ein Import lässt sich nicht in einem Rutsch zurücknehmen.
   */
  async function csvImport(csv: string, bis: string, speichern = false) {
    const daten = await api<ImportBericht & { me?: unknown }>('/rides/import', 'POST', {
      csv,
      bis,
      dryRun: !speichern,
    })
    if (daten && speichern) await refresh()
    return daten
  }

  function radLoeschen(id: string) {
    return aendern(`/bikes/${id}`, 'DELETE')
  }

  /** Grenzwert für eine Kategorie an diesem Rad; `null` stellt den Standard
   *  der Kategorie wieder her. */
  function radGrenzeSetzen(bikeId: string, typeId: string, limitKm: number | null) {
    return aendern(`/bikes/${bikeId}/limits/${typeId}`, 'PUT', { limitKm })
  }

  // ── Kategorien ─────────────────────────────────────────────────────────────
  function kategorieAnlegen(werte: Partial<Kategorie>) {
    return aendern('/component-types', 'POST', werte)
  }

  function kategorieSpeichern(id: string, changes: Partial<Kategorie>) {
    return aendern(`/component-types/${id}`, 'PUT', changes)
  }

  function kategorieLoeschen(id: string) {
    return aendern(`/component-types/${id}`, 'DELETE')
  }

  /** Neue Reihenfolge der Kategorien nach dem Ziehen. */
  function kategorienSortieren(ids: string[]) {
    return aendern('/component-types/order', 'PUT', { ids })
  }

  // ── Teile ──────────────────────────────────────────────────────────────────
  function teilAnlegen(werte: {
    bikeId: string
    typeId: string
    label?: string
    note?: string
    limitKm?: number | null
    installedAt?: string | null
    setupIds?: string[]
  }) {
    return aendern('/components', 'POST', werte)
  }

  function teilSpeichern(
    id: string,
    changes: { label?: string; note?: string; limitKm?: number | null; setupIds?: string[] },
  ) {
    return aendern(`/components/${id}`, 'PUT', changes)
  }

  function teilLoeschen(id: string) {
    return aendern(`/components/${id}`, 'DELETE')
  }

  /** Aufziehen – das bisher aktive Teil derselben Kategorie wandert dabei
   *  automatisch ins Lager. */
  function teilEinbauen(id: string, date: string) {
    return aendern(`/components/${id}/install`, 'POST', { date })
  }

  function teilAusbauen(id: string, date: string, entsorgen = false) {
    return aendern(`/components/${id}/remove`, 'POST', { date, entsorgen })
  }

  function teilStatus(id: string, status: Status) {
    return aendern(`/components/${id}/status`, 'POST', { status })
  }

  function zeitraumSpeichern(
    id: string,
    periodId: string,
    changes: { from?: string; to?: string },
  ) {
    return aendern(`/components/${id}/periods/${periodId}`, 'PUT', changes)
  }

  function zeitraumLoeschen(id: string, periodId: string) {
    return aendern(`/components/${id}/periods/${periodId}`, 'DELETE')
  }

  // ── Einstellungen ──────────────────────────────────────────────────────────
  function schwellenSpeichern(yellow: number, red: number) {
    return aendern('/settings/thresholds', 'PUT', { yellow, red })
  }

  // ── Quellen ────────────────────────────────────────────────────────────────
  // Zwei Wege zu denselben Fahrten: direkt von Wahoo (das ist der kurze) oder
  // über Intervals.icu. Geholt wird immer nur aus der aktiven Quelle, sonst
  // stünde dieselbe Ausfahrt zweimal in der Rechnung.
  /** Schickt den Browser zur Quelle; von dort kommt er auf /?wahoo=… zurück. */
  async function quelleVerbinden(provider: Anbieter) {
    const daten = await api<{ url: string }>(`/${provider}/authorize`)
    if (daten?.url) window.location.href = daten.url
  }

  function quelleTrennen(provider: Anbieter) {
    return aendern(`/${provider}`, 'DELETE')
  }

  /** Aus welcher Quelle geholt wird, wenn beide verbunden sind. */
  function quelleAktivieren(provider: Anbieter) {
    return aendern('/provider', 'PUT', { provider })
  }

  async function sync(voll = false) {
    const daten = await api<{
      neu: number
      geaendert: number
      geloescht: number
      uebersprungen: number
      oldest: string
      state: AppState
    }>('/sync', 'POST', { voll })
    if (!daten) return false
    uebernehmen(daten.state)
    const teile = [
      daten.neu ? `${daten.neu} neu` : '',
      daten.geaendert ? `${daten.geaendert} aktualisiert` : '',
      daten.geloescht ? `${daten.geloescht} entfallen` : '',
      daten.uebersprungen ? `${daten.uebersprungen} Dubletten übersprungen` : '',
    ].filter(Boolean)
    hinweis.value = teile.length
      ? `Fahrten geholt: ${teile.join(', ')}.`
      : 'Alles auf Stand – keine neuen Fahrten.'
    return true
  }

  /** Die Verbindung eines Anbieters am eigenen Profil. */
  function verbindung(provider: Anbieter) {
    return state.me?.connections?.[provider] ?? null
  }

  // ── Ableitungen fürs Dashboard ─────────────────────────────────────────────
  /** Auf welches Profil das Dashboard gerade schaut; leer = alle. */
  const filter = ref(localStorage.getItem(FILTER_KEY) ?? '')

  function setzeFilter(userId: string) {
    filter.value = userId
    localStorage.setItem(FILTER_KEY, userId)
  }

  const sichtbareRaeder = computed(() =>
    state.bikes.filter((b) => !filter.value || b.ownerId === filter.value),
  )

  function eigenesRad(bike: Bike) {
    return bike.ownerId === state.me?.id
  }

  function nutzer(id: string) {
    return state.users.find((u) => u.id === id) ?? null
  }

  function kategorie(id: string) {
    return state.componentTypes.find((t) => t.id === id) ?? null
  }

  function teileAn(bikeId: string, typeId: string) {
    return state.components.filter((c) => c.bikeId === bikeId && c.typeId === typeId)
  }

  /**
   * Das Teil, das die Kachel bestimmt. An einem Rad können mehrere Teile
   * derselben Kategorie gleichzeitig aktiv sein (Kassette draußen, Kassette auf
   * der Rolle) – dann zeigt die Kachel das am weitesten verschlissene, denn das
   * ist das, was als Nächstes fällig wird.
   */
  function aktivesTeil(bikeId: string, typeId: string) {
    const aktive = teileAn(bikeId, typeId).filter((c) => c.status === 'aktiv')
    return aktive.sort((a, b) => b.percent - a.percent)[0] ?? null
  }

  /** Wie viele Teile dieser Kategorie gerade gleichzeitig laufen. */
  function aktiveTeile(bikeId: string, typeId: string) {
    return teileAn(bikeId, typeId).filter((c) => c.status === 'aktiv')
  }

  /** Die Aufbauten eines Teils als Namen – „Draußen, Rolle“. */
  function aufbauNamen(teil: Teil) {
    return state.setups
      .filter((a) => teil.setupIds?.includes(a.id))
      .map((a) => a.name)
      .join(', ')
  }

  /** Kategorien, zu denen es an diesem Rad überhaupt Teile gibt – in der
   *  Reihenfolge der Kategorienliste. */
  function kategorienAm(bikeId: string) {
    const vorhanden = new Set(
      state.components.filter((c) => c.bikeId === bikeId).map((c) => c.typeId),
    )
    return state.componentTypes.filter((t) => vorhanden.has(t.id))
  }

  /** Grenzwert, der an diesem Rad für eine Kategorie gilt (ohne Instanz-Wert). */
  function radGrenze(bike: Bike, typeId: string) {
    return bike.limits?.[typeId] ?? kategorie(typeId)?.defaultLimitKm ?? 0
  }

  return {
    loading,
    error,
    hinweis,
    profiles,
    wahooConfigured,
    intervalsConfigured,
    state,
    angemeldet,
    refresh,
    ladeProfile,
    anmelden,
    profilAnlegen,
    abmelden,
    pinAendern,
    profilSpeichern,
    probeMail,
    radAnlegen,
    radSpeichern,
    radLoeschen,
    radGrenzeSetzen,
    kategorieAnlegen,
    kategorieSpeichern,
    kategorieLoeschen,
    kategorienSortieren,
    teilAnlegen,
    teilSpeichern,
    teilLoeschen,
    teilEinbauen,
    teilAusbauen,
    teilStatus,
    zeitraumSpeichern,
    zeitraumLoeschen,
    schwellenSpeichern,
    aufbauAnlegen,
    aufbauSpeichern,
    aufbauLoeschen,
    aufbautenVon,
    fahrtAnlegen,
    fahrtSpeichern,
    fahrtLoeschen,
    fahrtenLoeschen,
    csvImport,
    quelleVerbinden,
    quelleTrennen,
    quelleAktivieren,
    verbindung,
    sync,
    filter,
    setzeFilter,
    sichtbareRaeder,
    eigenesRad,
    nutzer,
    kategorie,
    teileAn,
    aktivesTeil,
    kategorienAm,
    radGrenze,
    aktiveTeile,
    aufbauNamen,
  }
}

export function useTracker() {
  if (!singleton) singleton = createStore()
  return singleton
}
