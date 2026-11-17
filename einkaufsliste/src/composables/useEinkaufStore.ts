import { computed, reactive, ref } from 'vue'
import { findCatalogMatch, type CatalogEntry } from '@/utils/matching'
import { mengeZusammenfassen } from '@/utils/mengen'
import type { Haltbarkeit } from '@/utils/haltbarkeit'

export type ListType = 'kategorisiert' | 'flach'

export interface Item {
  id: string
  name: string
  quantity: string
  categoryId: string
  /** false = beim Hinzufügen nicht im Katalog gefunden (◌-Badge) */
  matched: boolean
  /** Katalogartikel, über den die Kategorie kam – leer, wenn von Hand gesetzt */
  matchedName: string
  done: boolean
  addedAt: string
  /** Für welche Gerichte der Artikel gebraucht wird – meist leer */
  rezepte: { id: string; name: string }[]
}

export interface List {
  id: string
  name: string
  type: ListType
  storeProfileId: string | null
  /** Läuft gerade ein Einkauf? Steht im Serverstand, gilt also auf beiden Handys */
  shopping: boolean
  items: Item[]
}

export interface Category {
  id: string
  emoji: string
  label: string
}

/** Kategorie-Reihenfolge einer Filiale. Noch ohne UI – siehe README. */
export interface StoreProfile {
  id: string
  name: string
  listId: string
  categoryOrder: string[]
}

export interface RecipeIngredient {
  name: string
  quantity: string
}

export interface Recipe {
  id: string
  name: string
  /** Kategorien des Rezepts – mindestens eine, gern mehrere */
  groups: string[]
  /** Unabhängig von der Gruppe: wie schnell die Zutaten verbraucht sein müssen */
  haltbarkeit: Haltbarkeit
  /** Freitext: Zubereitung, Portionen, Link zur Quelle */
  notes: string
  ingredients: RecipeIngredient[]
}

export interface RecipeGroup {
  id: string
  emoji: string
  label: string
}

/** Ein geplantes Gericht in „Diese Woche“ */
export interface WochenEintrag {
  id: string
  /** Leer oder ins Leere zeigend, wenn das Rezept inzwischen gelöscht ist */
  recipeId: string
  name: string
  /** Wann es auf die Liste kam */
  addedAt: string
}

export interface UnmatchedEntry {
  id: string
  name: string
  count: number
  lastAddedAt: string
}

export interface AppState {
  lists: List[]
  categories: Category[]
  defaultCategoryOrder: string[]
  catalog: CatalogEntry[]
  recipes: Recipe[]
  recipeGroups: RecipeGroup[]
  unmatched: UnmatchedEntry[]
  storeProfiles: StoreProfile[]
  /** Rezept-id → wann es zuletzt auf die Liste kam (ISO) */
  zuletzt: Record<string, string>
  woche: WochenEintrag[]
}

export interface CategoryGroup {
  category: Category
  items: Item[]
}

const LIST_KEY = 'einkauf:liste'
const COMPACT_KEY = 'einkauf:kompakt'
const OUTBOX_KEY = 'einkauf:offene-haken'

let singleton: ReturnType<typeof createStore> | undefined

export function createId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/** Offen zuerst, danach das Abgehakte – beides in der Reihenfolge des Eintragens. */
function sortItems(items: Item[]): Item[] {
  return [...items].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    return a.addedAt.localeCompare(b.addedAt)
  })
}

function createStore() {
  const loading = ref(true)
  const error = ref('')
  const state = reactive<AppState>({
    lists: [],
    categories: [],
    defaultCategoryOrder: [],
    catalog: [],
    recipes: [],
    recipeGroups: [],
    unmatched: [],
    storeProfiles: [],
    zuletzt: {},
    woche: [],
  })

  const API_BASE = `${import.meta.env.BASE_URL}api`

  function applyServerState(data: Partial<AppState> | null) {
    if (!data || !Array.isArray(data.lists)) return
    state.lists = data.lists
    state.categories = data.categories ?? []
    state.defaultCategoryOrder = data.defaultCategoryOrder ?? []
    state.catalog = data.catalog ?? []
    state.recipes = data.recipes ?? []
    state.recipeGroups = data.recipeGroups ?? []
    state.unmatched = data.unmatched ?? []
    state.storeProfiles = data.storeProfiles ?? []
    state.zuletzt = data.zuletzt ?? {}
    state.woche = data.woche ?? []
    // Der Serverstand weiß noch nichts von Haken, die hier auf Netz warten
    applyOutbox()
  }

  // ── Offene Haken ───────────────────────────────────────────────────────────
  // Hinten im Laden ist kein Netz. Ein gesetzter Haken bleibt deshalb hier
  // liegen, bis der Server ihn bestätigt hat – und wird jedem eintreffenden
  // Serverstand wieder aufgedrückt, sonst würde er beim Reconnect verschwinden.
  //
  // Bewusst nur die Haken: alles andere (anlegen, umbenennen, Katalog) braucht
  // im Laden niemand, und jede Warteschlange mehr wäre eine Quelle für
  // Änderungen, die sich gegenseitig überholen.
  interface OffenerHaken {
    listId: string
    itemId: string
    done: boolean
  }

  function ladeOutbox(): Record<string, OffenerHaken> {
    try {
      const roh = JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? '{}')
      return roh && typeof roh === 'object' ? roh : {}
    } catch {
      return {}
    }
  }

  const outbox = reactive<Record<string, OffenerHaken>>(ladeOutbox())
  const offeneHaken = computed(() => Object.keys(outbox).length)

  function merkeOutbox() {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox))
  }

  /** Wartende Haken über den frisch eingetroffenen Serverstand legen. */
  function applyOutbox() {
    for (const eintrag of Object.values(outbox)) {
      const item = state.lists
        .find((l) => l.id === eintrag.listId)
        ?.items.find((i) => i.id === eintrag.itemId)
      if (item) item.done = eintrag.done
    }
  }

  let sendetGerade = false

  /**
   * Schickt die wartenden Haken der Reihe nach. Beim ersten Fehlschlag Schluss –
   * dann ist das Netz weg und der Rest bleibt für den nächsten Versuch liegen.
   */
  async function flushOutbox() {
    if (sendetGerade) return
    sendetGerade = true
    try {
      for (const [key, eintrag] of Object.entries(outbox)) {
        try {
          const r = await fetch(
            `${API_BASE}/lists/${eintrag.listId}/items/${eintrag.itemId}/check`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ done: eintrag.done }),
            },
          )
          if (r.ok) {
            delete outbox[key]
            merkeOutbox()
            applyServerState(await r.json().catch(() => null))
          } else if (r.status === 404) {
            // Artikel gibt es nicht mehr – „Einkauf beenden“ auf dem anderen
            // Gerät. Der Haken hat sich damit erledigt.
            delete outbox[key]
            merkeOutbox()
          } else {
            break
          }
        } catch {
          break
        }
      }
    } finally {
      sendetGerade = false
    }
  }

  async function refresh() {
    try {
      const r = await fetch(`${API_BASE}/state`)
      if (r.ok) applyServerState(await r.json())
    } catch {
      /* offline – der bisherige Stand bleibt stehen */
    }
  }

  refresh().finally(() => {
    loading.value = false
  })

  // Live-Sync: der Server schickt nach jeder Änderung den kompletten Stand an
  // alle offenen Geräte. Der Browser verbindet bei Abbrüchen selbst neu.
  if (typeof window !== 'undefined') {
    const events = new EventSource(`${API_BASE}/events`)
    events.onmessage = (e) => applyServerState(JSON.parse(e.data))

    // Handys kappen die Verbindung im Hintergrund; beim Zurückkommen einmal
    // den vollen Stand holen, statt auf das Reconnect zu warten.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        refresh()
        flushOutbox()
      }
    })
    window.addEventListener('focus', () => {
      refresh()
      flushOutbox()
    })

    // Jede Gelegenheit nutzen, bei der wieder Netz da sein könnte
    window.addEventListener('online', flushOutbox)
    events.onopen = () => flushOutbox()
    setInterval(() => {
      if (offeneHaken.value) flushOutbox()
    }, 10_000)
  }

  // Schickt eine einzelne Änderung; der Server wendet sie auf seinen Stand an
  // und antwortet mit dem autoritativen State – dieses Gerät kann also nie den
  // Stand des anderen überschreiben.
  async function sendChange(path: string, method: string, body?: unknown) {
    try {
      const r = await fetch(`${API_BASE}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const data = await r.json().catch(() => null)
      if (!r.ok) {
        error.value = data?.error || 'Speichern fehlgeschlagen.'
        await refresh()
        return false
      }
      applyServerState(data)
      return true
    } catch {
      error.value = 'Keine Verbindung zum Server.'
      return false
    }
  }

  // ── Listen ─────────────────────────────────────────────────────────────────
  const activeListId = ref<string>(localStorage.getItem(LIST_KEY) ?? '')

  const activeList = computed(
    () => state.lists.find((l) => l.id === activeListId.value) ?? state.lists[0] ?? null,
  )

  /**
   * Wohin ein Rezept aus dem Rezeptbuch geht: auf die gerade gewählte Liste,
   * wenn sie Kategorien hat – sonst auf die erste, die welche hat. Rezepte
   * gehören zu den Lebensmitteln, nicht in die Drogerie.
   */
  const einkaufsListe = computed(() =>
    activeList.value?.type === 'kategorisiert'
      ? activeList.value
      : (state.lists.find((l) => l.type === 'kategorisiert') ?? null),
  )

  function selectList(listId: string) {
    activeListId.value = listId
    localStorage.setItem(LIST_KEY, listId)
  }

  function addList(name: string, type: ListType) {
    const list = { id: createId(), name: name.trim(), type }
    return sendChange('/lists', 'POST', list)
  }

  function renameList(listId: string, name: string) {
    return sendChange(`/lists/${listId}`, 'PUT', { name })
  }

  function removeList(listId: string) {
    return sendChange(`/lists/${listId}`, 'DELETE')
  }

  // ── Artikel ────────────────────────────────────────────────────────────────
  /**
   * Neuer Artikel: In kategorisierten Listen entscheidet das Fuzzy-Matching
   * gegen den Katalog über die Kategorie; ohne Treffer „Sonstiges“ plus Badge.
   * Flache Listen haben gar keine Kategorien, dort wird nichts gematcht.
   */
  function addItem(list: List, name: string, quantity: string) {
    const clean = name.trim()
    if (!clean) return false

    const match = list.type === 'kategorisiert' ? findCatalogMatch(clean, state.catalog) : null
    const item: Item = {
      id: createId(),
      name: clean,
      quantity: quantity.trim(),
      categoryId: match?.category_id ?? 'sonstiges',
      matched: list.type === 'flach' || match !== null,
      // Wofür der Katalog den Namen gehalten hat – erklärt in der Zeile, warum
      // ein Artikel dort liegt, wo er liegt
      matchedName: match?.name ?? '',
      done: false,
      addedAt: new Date().toISOString(),
      rezepte: [],
    }

    list.items.push(item)
    return sendChange(`/lists/${list.id}/items`, 'POST', item)
  }

  /**
   * Korrektur direkt in der Liste: Name und/oder Kategorie. Eine von Hand
   * gesetzte Kategorie gilt als zugeordnet, der ◌-Badge geht damit weg.
   */
  function updateItem(
    list: List,
    itemId: string,
    changes: { name?: string; quantity?: string; categoryId?: string },
  ) {
    const item = list.items.find((i) => i.id === itemId)
    if (!item) return
    if (changes.name !== undefined) item.name = changes.name.trim()
    if (changes.quantity !== undefined) item.quantity = changes.quantity.trim()
    if (changes.categoryId !== undefined) {
      item.categoryId = changes.categoryId
      item.matched = true
      item.matchedName = ''
    }
    return sendChange(`/lists/${list.id}/items/${itemId}`, 'PUT', changes)
  }

  /**
   * Menge aus dem Stepper in der Zeile. Jeder Tipp gilt sofort, aber erst der
   * letzte geht raus: Wer von 250 g auf 1 kg tippt, soll nicht vier Requests
   * auslösen. Verschluckte Zwischenstände fehlen niemandem, weil der Server
   * einen absoluten Wert bekommt und keine Rechnung.
   */
  const mengeTimer = new Map<string, ReturnType<typeof setTimeout>>()

  function setQuantity(list: List, itemId: string, quantity: string) {
    const item = list.items.find((i) => i.id === itemId)
    if (!item || item.quantity === quantity) return
    item.quantity = quantity

    const key = `${list.id}:${itemId}`
    clearTimeout(mengeTimer.get(key))
    mengeTimer.set(
      key,
      setTimeout(() => {
        mengeTimer.delete(key)
        sendChange(`/lists/${list.id}/items/${itemId}`, 'PUT', { quantity })
      }, 450),
    )
  }

  /**
   * Haken setzen: gilt sofort auf diesem Gerät und wandert in die Outbox, bis
   * der Server ihn bestätigt hat. Gesetzt wird ein absoluter Wert, kein
   * Umschalten – ein später nachgeholter Haken kann also nichts verdrehen.
   */
  function setDone(list: List, itemId: string, done: boolean) {
    const item = list.items.find((i) => i.id === itemId)
    if (!item) return
    item.done = done
    outbox[`${list.id}:${itemId}`] = { listId: list.id, itemId, done }
    merkeOutbox()
    return flushOutbox()
  }

  function removeItem(list: List, itemId: string) {
    list.items = list.items.filter((i) => i.id !== itemId)
    return sendChange(`/lists/${list.id}/items/${itemId}`, 'DELETE')
  }

  /**
   * „Einkauf starten“: hält fest, in welchem Laden gerade eingekauft wird –
   * davon hängt die Reihenfolge der Kategorien ab. `profileId` null heißt
   * Standard-Reihenfolge.
   */
  function startShopping(list: List, profileId: string | null) {
    list.shopping = true
    list.storeProfileId = profileId
    return sendChange(`/lists/${list.id}/shopping`, 'PUT', {
      shopping: true,
      storeProfileId: profileId,
    })
  }

  /** „Einkauf beenden“: Abgehaktes raus, alles andere bleibt liegen. */
  async function finishShopping(list: List) {
    // Erst müssen die wartenden Haken durch, sonst löscht der Server nur die
    // Hälfte und die anderen Artikel tauchen gleich wieder auf.
    await flushOutbox()
    if (offeneHaken.value > 0) {
      error.value = 'Es warten noch Haken auf Verbindung – gleich noch einmal versuchen.'
      return false
    }
    list.items = list.items.filter((i) => !i.done)
    list.shopping = false
    return sendChange(`/lists/${list.id}/finish`, 'POST')
  }

  // ── Märkte (Ladenprofile) ──────────────────────────────────────────────────
  function profilesFor(list: List): StoreProfile[] {
    return state.storeProfiles.filter((p) => p.listId === list.id)
  }

  /** Legt einen Markt an und gibt seine id zurück – null, wenn es schiefging. */
  async function addStoreProfile(list: List, name: string): Promise<string | null> {
    const id = createId()
    const ok = await sendChange('/store-profiles', 'POST', {
      id,
      name: name.trim(),
      listId: list.id,
      // Startpunkt ist die Standard-Reihenfolge, danach wird sie umsortiert
      categoryOrder: state.defaultCategoryOrder,
    })
    return ok ? id : null
  }

  function updateStoreProfile(
    profileId: string,
    changes: { name?: string; categoryOrder?: string[] },
  ) {
    return sendChange(`/store-profiles/${profileId}`, 'PUT', changes)
  }

  function removeStoreProfile(profileId: string) {
    return sendChange(`/store-profiles/${profileId}`, 'DELETE')
  }

  /** Welcher Markt für eine Liste gilt; null = Standard-Reihenfolge. */
  function selectStoreProfile(list: List, profileId: string | null) {
    list.storeProfileId = profileId
    return sendChange(`/lists/${list.id}/store-profile`, 'PUT', { storeProfileId: profileId })
  }

  // ── Rezepte ────────────────────────────────────────────────────────────────
  /**
   * Ein Rezept innerhalb seiner Gruppe verschieben. Die anderen Gruppen bleiben
   * stehen, wo sie sind: die Plätze der Gruppe werden neu belegt.
   */
  function addRecipeGroup(label: string, emoji: string) {
    return sendChange('/recipe-groups', 'POST', { label: label.trim(), emoji: emoji.trim() })
  }

  function saveRecipeGroup(id: string, changes: { label?: string; emoji?: string }) {
    return sendChange(`/recipe-groups/${id}`, 'PUT', changes)
  }

  function removeRecipeGroup(id: string) {
    return sendChange(`/recipe-groups/${id}`, 'DELETE')
  }

  /** Wie viele Rezepte in einer Gruppe liegen – die Verwaltung zeigt es an. */
  function recipeCount(groupId: string) {
    return state.recipes.filter((r) => r.groups.includes(groupId)).length
  }

  /** Rezepte, die nur in dieser Kategorie stehen – sie verhindern das Löschen. */
  function recipeCountOnly(groupId: string) {
    return state.recipes.filter((r) => r.groups.length === 1 && r.groups[0] === groupId).length
  }

  function moveRecipe(groupId: string, from: number, to: number) {
    const inGruppe = state.recipes.filter((r) => r.groups.includes(groupId))
    if (from === to || from < 0 || to < 0 || from >= inGruppe.length || to >= inGruppe.length) {
      return
    }
    const [raus] = inGruppe.splice(from, 1)
    inGruppe.splice(to, 0, raus!)

    let n = 0
    const neu = state.recipes.map((r) => (r.groups.includes(groupId) ? inGruppe[n++]! : r))
    state.recipes = neu
    return sendChange('/recipes/order', 'PUT', { ids: neu.map((r) => r.id) })
  }

  function addRecipe(rezept: Omit<Recipe, 'id'>) {
    return sendChange('/recipes', 'POST', { ...rezept, id: createId(), name: rezept.name.trim() })
  }

  function saveRecipe(id: string, changes: Partial<Omit<Recipe, 'id'>>) {
    return sendChange(`/recipes/${id}`, 'PUT', changes)
  }

  function removeRecipe(id: string) {
    return sendChange(`/recipes/${id}`, 'DELETE')
  }

  /**
   * Ein Rezept auf die Liste. `zeilen` kommt aus dem Fenster davor und enthält
   * nur, was wirklich mitsoll – mit der Entscheidung, ob eine Zutat in einen
   * vorhandenen Artikel wandert oder eine eigene Zeile bekommt.
   */
  function addRecipeToList(
    list: List,
    zeilen: {
      name: string
      quantity: string
      categoryId: string
      matchedName: string
      mergeIn: string | null
    }[],
    /** Kam das von einem Rezept? Dann gilt es ab jetzt als zuletzt gewählt. */
    recipeId?: string,
  ) {
    const items = []
    const quantities = []
    // Sofort sichtbar, wofür die Artikel da sind; der Server macht dasselbe
    const rezept = state.recipes.find((r) => r.id === recipeId)
    const verweis = rezept ? { id: rezept.id, name: rezept.name } : null

    for (const zeile of zeilen) {
      const vorhanden = zeile.mergeIn
        ? list.items.find((i) => i.id === zeile.mergeIn && !i.done)
        : undefined
      if (vorhanden) {
        // Erst hier zusammenrechnen: die Menge auf der Liste kann sich
        // geändert haben, während das Fenster offen war.
        const zusammen = mengeZusammenfassen(vorhanden.quantity, zeile.quantity)
        vorhanden.quantity = zusammen
        if (verweis && !vorhanden.rezepte.some((r) => r.id === verweis.id)) {
          vorhanden.rezepte.push(verweis)
        }
        quantities.push({ itemId: vorhanden.id, quantity: zusammen })
      } else {
        const item: Item = {
          id: createId(),
          name: zeile.name.trim(),
          quantity: zeile.quantity.trim(),
          categoryId: list.type === 'flach' ? 'sonstiges' : zeile.categoryId,
          matched: list.type === 'flach' || Boolean(zeile.matchedName),
          matchedName: zeile.matchedName,
          done: false,
          addedAt: new Date().toISOString(),
          rezepte: verweis ? [verweis] : [],
        }
        list.items.push(item)
        items.push(item)
      }
    }

    if (recipeId) state.zuletzt[recipeId] = new Date().toISOString()
    return sendChange(`/lists/${list.id}/add-batch`, 'POST', { items, quantities, recipeId })
  }

  /**
   * Die Gerichte zu einem Artikel, mit dem heutigen Namen des Rezepts. Ist es
   * inzwischen gelöscht, bleibt der Name von damals stehen.
   */
  function gerichteFuer(item: Item): string[] {
    return (item.rezepte ?? []).map((v) => state.recipes.find((r) => r.id === v.id)?.name ?? v.name)
  }

  // ── Diese Woche ────────────────────────────────────────────────────────────
  /** Gekocht (oder doch nicht): raus aus der Woche. */
  function removeWochenEintrag(id: string) {
    state.woche = state.woche.filter((e) => e.id !== id)
    return sendChange(`/woche/${id}`, 'DELETE')
  }

  /** „Rückgängig“: derselbe Eintrag mit seiner id und seinem Datum zurück. */
  function restoreWochenEintrag(eintrag: WochenEintrag) {
    if (!state.woche.some((e) => e.id === eintrag.id)) state.woche.push(eintrag)
    return sendChange('/woche', 'POST', eintrag)
  }

  // ── Kategorien & Reihenfolge ───────────────────────────────────────────────
  const categoryById = computed(() => {
    const map: Record<string, Category> = {}
    for (const c of state.categories) map[c.id] = c
    return map
  })

  /**
   * Reihenfolge der Kategorien für eine Liste. Ohne Ladenprofil gilt die
   * Standard-Reihenfolge vom Server; ein Profil schiebt seine Kategorien nach
   * vorn, alles nicht Genannte folgt in Standard-Reihenfolge. „sonstiges“ steht
   * immer ganz am Ende.
   */
  function categoryOrderFor(list: List): string[] {
    const profile = state.storeProfiles.find(
      (p) => p.id === list.storeProfileId && p.listId === list.id,
    )
    const front = profile?.categoryOrder ?? []
    const rest = state.defaultCategoryOrder.filter((id) => !front.includes(id))
    return [...front, ...rest, 'sonstiges']
  }

  /** Kategorisierte Liste: Gruppen in Laden-Reihenfolge, leere fallen weg. */
  function groupsFor(list: List): CategoryGroup[] {
    const byCategory: Record<string, Item[]> = {}
    for (const item of list.items) {
      ;(byCategory[item.categoryId] ??= []).push(item)
    }
    return categoryOrderFor(list)
      .filter((id) => byCategory[id]?.length)
      .map((id) => ({
        category: categoryById.value[id] ?? { id, emoji: '❓', label: id },
        items: sortItems(byCategory[id]!),
      }))
  }

  /**
   * Flache Liste: eine einzige Reihe ohne Kategorie-Überbau, in der von Hand
   * gezogenen Reihenfolge. Abgehaktes rutscht trotzdem ans Ende.
   */
  function flatItems(list: List): Item[] {
    return [...list.items].sort((a, b) => Number(a.done) - Number(b.done))
  }

  /** Neue Reihenfolge nach dem Ziehen (nur flache Listen). */
  function moveItem(list: List, from: number, to: number) {
    const sichtbar = flatItems(list)
    if (from === to || from < 0 || to < 0 || from >= sichtbar.length || to >= sichtbar.length) {
      return
    }
    const [raus] = sichtbar.splice(from, 1)
    sichtbar.splice(to, 0, raus!)
    list.items = sichtbar
    return sendChange(`/lists/${list.id}/order`, 'PUT', { itemIds: sichtbar.map((i) => i.id) })
  }

  // Kompakte Ansicht: keine Kategorie-Überschriften, aber weiter in
  // Laden-Reihenfolge sortiert. Abgehaktes sammelt sich am Ende der ganzen
  // Liste statt am Fuß jeder Kategorie.
  const kompakt = ref(localStorage.getItem(COMPACT_KEY) === '1')

  function toggleKompakt() {
    kompakt.value = !kompakt.value
    localStorage.setItem(COMPACT_KEY, kompakt.value ? '1' : '0')
  }

  function compactItems(list: List): Item[] {
    const rang = new Map(categoryOrderFor(list).map((id, index) => [id, index]))
    return [...list.items].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1
      const ka = rang.get(a.categoryId) ?? 99
      const kb = rang.get(b.categoryId) ?? 99
      if (ka !== kb) return ka - kb
      return a.addedAt.localeCompare(b.addedAt)
    })
  }

  // ── Nicht zugeordnete Artikel ──────────────────────────────────────────────
  const unmatched = computed(() =>
    [...state.unmatched].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'de')),
  )

  /** Ordnet einen Namen dauerhaft einer Kategorie zu (nur für neue Einträge). */
  function assignCategory(name: string, categoryId: string) {
    return sendChange('/catalog', 'POST', { name, category_id: categoryId })
  }

  /** Artikel, die noch unter „Sonstiges“ liegen (über alle Listen). */
  const sonstigesItems = computed(() =>
    state.lists
      .filter((l) => l.type === 'kategorisiert')
      .flatMap((l) => l.items.filter((i) => !i.matched).map((i) => ({ list: l, item: i }))),
  )

  /**
   * Nach einer Katalog-Erweiterung noch einmal über alles laufen, was in
   * „Sonstiges“ hängen geblieben ist. Nacheinander, damit sich die Antworten
   * nicht überholen.
   */
  async function rematchAll(): Promise<number> {
    let getroffen = 0
    // Kopie: updateItem setzt `matched`, die berechnete Liste würde sich sonst
    // unter dem Iterator verkürzen
    const offen = sonstigesItems.value.slice()
    for (const { list, item } of offen) {
      const match = findCatalogMatch(item.name, state.catalog)
      if (!match) continue
      item.matchedName = match.name
      await updateItem(list, item.id, { categoryId: match.category_id })
      getroffen += 1
    }
    return getroffen
  }

  /** Katalogeintrag anlegen oder überschreiben (Kategorie, Schreibweisen). */
  function saveCatalogEntry(entry: CatalogEntry) {
    return sendChange('/catalog', 'PUT', entry)
  }

  /** Artikel aus dem Katalog werfen; kam er aus dem Seed, bleibt er weg. */
  function removeCatalogEntry(name: string) {
    return sendChange('/catalog', 'DELETE', { name })
  }

  /** Hängt eine Schreibweise an einen bestehenden Katalogartikel. */
  function addAlias(name: string, alias: string) {
    return sendChange('/catalog/alias', 'POST', { name, alias })
  }

  function dismissUnmatched(id: string) {
    return sendChange(`/unmatched/${id}`, 'DELETE')
  }

  /** Der Katalog alphabetisch – so steht er in der Verwaltung. */
  const sortedCatalog = computed(() =>
    [...state.catalog].sort((a, b) => a.name.localeCompare(b.name, 'de')),
  )

  /** Alle Artikelnamen für die Auswahl beim Anlegen einer Schreibweise. */
  const catalogNames = computed(() =>
    [...new Set(state.catalog.map((e) => e.name))].sort((a, b) => a.localeCompare(b, 'de')),
  )

  return {
    loading,
    error,
    state,
    activeList,
    activeListId,
    einkaufsListe,
    selectList,
    addList,
    renameList,
    removeList,
    addItem,
    updateItem,
    setQuantity,
    setDone,
    removeItem,
    startShopping,
    finishShopping,
    profilesFor,
    addStoreProfile,
    updateStoreProfile,
    removeStoreProfile,
    selectStoreProfile,
    addRecipe,
    saveRecipe,
    moveRecipe,
    addRecipeGroup,
    saveRecipeGroup,
    removeRecipeGroup,
    recipeCount,
    recipeCountOnly,
    removeRecipe,
    addRecipeToList,
    gerichteFuer,
    removeWochenEintrag,
    restoreWochenEintrag,
    categoryById,
    categoryOrderFor,
    groupsFor,
    flatItems,
    moveItem,
    offeneHaken,
    flushOutbox,
    kompakt,
    toggleKompakt,
    compactItems,
    unmatched,
    assignCategory,
    addAlias,
    sonstigesItems,
    rematchAll,
    saveCatalogEntry,
    removeCatalogEntry,
    dismissUnmatched,
    catalogNames,
    sortedCatalog,
    refresh,
  }
}

export function useEinkaufStore() {
  if (!singleton) singleton = createStore()
  return singleton
}
