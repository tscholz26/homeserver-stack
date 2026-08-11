import { computed, reactive, ref } from 'vue'
import { findCatalogMatch, type CatalogEntry } from '@/utils/matching'

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
}

export interface List {
  id: string
  name: string
  type: ListType
  storeProfileId: string | null
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
  ownCatalog: CatalogEntry[]
  unmatched: UnmatchedEntry[]
  storeProfiles: StoreProfile[]
}

export interface CategoryGroup {
  category: Category
  items: Item[]
}

const LIST_KEY = 'einkauf:liste'
const COMPACT_KEY = 'einkauf:kompakt'

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
    ownCatalog: [],
    unmatched: [],
    storeProfiles: [],
  })

  const API_BASE = `${import.meta.env.BASE_URL}api`

  function applyServerState(data: Partial<AppState> | null) {
    if (!data || !Array.isArray(data.lists)) return
    state.lists = data.lists
    state.categories = data.categories ?? []
    state.defaultCategoryOrder = data.defaultCategoryOrder ?? []
    state.catalog = data.catalog ?? []
    state.ownCatalog = data.ownCatalog ?? []
    state.unmatched = data.unmatched ?? []
    state.storeProfiles = data.storeProfiles ?? []
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
      if (document.visibilityState === 'visible') refresh()
    })
    window.addEventListener('focus', refresh)
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

  function setDone(list: List, itemId: string, done: boolean) {
    const item = list.items.find((i) => i.id === itemId)
    if (!item) return
    item.done = done
    return sendChange(`/lists/${list.id}/items/${itemId}/check`, 'POST', { done })
  }

  function removeItem(list: List, itemId: string) {
    list.items = list.items.filter((i) => i.id !== itemId)
    return sendChange(`/lists/${list.id}/items/${itemId}`, 'DELETE')
  }

  /** „Einkauf beenden“: Abgehaktes raus, alles andere bleibt liegen. */
  function finishShopping(list: List) {
    list.items = list.items.filter((i) => !i.done)
    return sendChange(`/lists/${list.id}/finish`, 'POST')
  }

  // ── Märkte (Ladenprofile) ──────────────────────────────────────────────────
  function profilesFor(list: List): StoreProfile[] {
    return state.storeProfiles.filter((p) => p.listId === list.id)
  }

  function addStoreProfile(list: List, name: string) {
    return sendChange('/store-profiles', 'POST', {
      id: createId(),
      name: name.trim(),
      listId: list.id,
      // Startpunkt ist die Standard-Reihenfolge, danach wird sie umsortiert
      categoryOrder: state.defaultCategoryOrder,
    })
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

  /** Flache Liste: eine einzige Reihe ohne Kategorie-Überbau. */
  function flatItems(list: List): Item[] {
    return sortItems(list.items)
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

  /** Eigenen Katalogeintrag überschreiben (Kategorie, Schreibweisen). */
  function saveCatalogEntry(entry: CatalogEntry) {
    return sendChange('/catalog', 'PUT', entry)
  }

  /** Eigenen Eintrag verwerfen – danach gilt wieder der mitgelieferte Katalog. */
  function removeCatalogEntry(name: string) {
    return sendChange('/catalog', 'DELETE', { name })
  }

  /** Notausgang: alle eigenen Einträge auf einmal ersetzen. */
  function replaceOwnCatalog(catalog: CatalogEntry[]) {
    return sendChange('/catalog/raw', 'PUT', { catalog })
  }

  /** Hängt eine Schreibweise an einen bestehenden Katalogartikel. */
  function addAlias(name: string, alias: string) {
    return sendChange('/catalog/alias', 'POST', { name, alias })
  }

  function dismissUnmatched(id: string) {
    return sendChange(`/unmatched/${id}`, 'DELETE')
  }

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
    selectList,
    addList,
    renameList,
    removeList,
    addItem,
    updateItem,
    setDone,
    removeItem,
    finishShopping,
    profilesFor,
    addStoreProfile,
    updateStoreProfile,
    removeStoreProfile,
    selectStoreProfile,
    categoryById,
    categoryOrderFor,
    groupsFor,
    flatItems,
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
    replaceOwnCatalog,
    dismissUnmatched,
    catalogNames,
    refresh,
  }
}

export function useEinkaufStore() {
  if (!singleton) singleton = createStore()
  return singleton
}
