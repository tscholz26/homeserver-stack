import { computed, reactive, ref } from 'vue'
import type { Thresholds } from '@/utils/verschleiss'

export type Status = 'aktiv' | 'eingelagert' | 'entsorgt'

export interface Profil {
  id: string
  name: string
  color: string
  hasStrava: boolean
  athleteName?: string
  lastSyncAt?: string
  lastSyncError?: string
}

export interface Bike {
  id: string
  ownerId: string
  name: string
  stravaGearId: string | null
  /** Grenzwerte für dieses Rad je Kategorie – schlägt den Standard der Kategorie */
  limits: Record<string, number>
}

export interface Kategorie {
  id: string
  name: string
  emoji: string
  color: string
  defaultLimitKm: number
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
}

export interface AppState {
  me: Profil | null
  users: Profil[]
  bikes: Bike[]
  componentTypes: Kategorie[]
  components: Teil[]
  settings: { thresholds: Thresholds; syncIntervalHours: number }
  stravaConfigured: boolean
  fahrten: number
  ohneGear: number
  unbekanntesGear: number
}

export interface Gear {
  id: string
  name: string
  km: number
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
  const stravaConfigured = ref(true)
  const token = ref(localStorage.getItem(TOKEN_KEY) ?? '')

  const state = reactive<AppState>({
    me: null,
    users: [],
    bikes: [],
    componentTypes: [],
    components: [],
    settings: { thresholds: { yellow: 70, red: 100 }, syncIntervalHours: 3 },
    stravaConfigured: true,
    fahrten: 0,
    ohneGear: 0,
    unbekanntesGear: 0,
  })

  const angemeldet = computed(() => state.me !== null)

  function uebernehmen(daten: AppState | null) {
    if (!daten?.me) return
    Object.assign(state, daten)
    stravaConfigured.value = daten.stravaConfigured
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
    const daten = await api<{ profiles: Profil[]; stravaConfigured: boolean }>('/profiles')
    if (daten) {
      profiles.value = daten.profiles
      stravaConfigured.value = daten.stravaConfigured
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
  // im Takt des Strava-Syncs.
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

  function profilSpeichern(changes: { name?: string; color?: string }) {
    return aendern('/profile', 'PUT', changes)
  }

  // ── Räder ──────────────────────────────────────────────────────────────────
  function radAnlegen(name: string, stravaGearId: string | null) {
    return aendern('/bikes', 'POST', { name, stravaGearId })
  }

  function radSpeichern(id: string, changes: { name?: string; stravaGearId?: string | null }) {
    return aendern(`/bikes/${id}`, 'PUT', changes)
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

  // ── Teile ──────────────────────────────────────────────────────────────────
  function teilAnlegen(werte: {
    bikeId: string
    typeId: string
    label?: string
    note?: string
    limitKm?: number | null
    installedAt?: string | null
  }) {
    return aendern('/components', 'POST', werte)
  }

  function teilSpeichern(
    id: string,
    changes: { label?: string; note?: string; limitKm?: number | null },
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

  // ── Strava ─────────────────────────────────────────────────────────────────
  /** Schickt den Browser zu Strava; von dort kommt er auf /?strava=… zurück. */
  async function stravaVerbinden() {
    const daten = await api<{ url: string }>('/strava/authorize')
    if (daten?.url) window.location.href = daten.url
  }

  function stravaTrennen() {
    return aendern('/strava', 'DELETE')
  }

  async function stravaSync() {
    const daten = await api<{ neu: number; geaendert: number; state: AppState }>(
      '/strava/sync',
      'POST',
    )
    if (!daten) return false
    uebernehmen(daten.state)
    hinweis.value = daten.neu
      ? `${daten.neu} neue Fahrten geholt.`
      : 'Alles auf Stand – keine neuen Fahrten.'
    return true
  }

  async function stravaGear(): Promise<Gear[]> {
    const daten = await api<{ gear: Gear[] }>('/strava/gear')
    return daten?.gear ?? []
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

  /** Das gerade aufgezogene Teil einer Kategorie – es bestimmt die Kachel. */
  function aktivesTeil(bikeId: string, typeId: string) {
    return teileAn(bikeId, typeId).find((c) => c.status === 'aktiv') ?? null
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
    stravaConfigured,
    state,
    angemeldet,
    refresh,
    ladeProfile,
    anmelden,
    profilAnlegen,
    abmelden,
    pinAendern,
    profilSpeichern,
    radAnlegen,
    radSpeichern,
    radLoeschen,
    radGrenzeSetzen,
    kategorieAnlegen,
    kategorieSpeichern,
    kategorieLoeschen,
    teilAnlegen,
    teilSpeichern,
    teilLoeschen,
    teilEinbauen,
    teilAusbauen,
    teilStatus,
    zeitraumSpeichern,
    zeitraumLoeschen,
    schwellenSpeichern,
    stravaVerbinden,
    stravaTrennen,
    stravaSync,
    stravaGear,
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
  }
}

export function useTracker() {
  if (!singleton) singleton = createStore()
  return singleton
}
