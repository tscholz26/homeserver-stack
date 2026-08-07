import { computed, reactive, ref } from 'vue'

export interface Category {
  id: string
  name: string
}

export interface Item {
  id: string
  categoryId: string
  name: string
}

export interface Trip {
  id: string
  name: string
  createdAt: string
  packedItemIds: string[]
  notes?: string
}

interface State {
  categories: Category[]
  items: Item[]
  trips: Trip[]
}

let singleton: ReturnType<typeof createStore> | undefined

function createId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function createStore() {
  const loading = ref(true)
  const state = reactive<State>({ categories: [], items: [], trips: [] })

  const API_BASE = `${import.meta.env.BASE_URL}api`

  function applyServerState(data: Partial<State> | null) {
    if (!data) return
    if (Array.isArray(data.categories)) state.categories = data.categories
    if (Array.isArray(data.items)) state.items = data.items
    if (Array.isArray(data.trips)) state.trips = data.trips
  }

  async function refresh() {
    try {
      const r = await fetch(`${API_BASE}/state`)
      if (r.ok) applyServerState(await r.json())
    } catch {
      /* offline – keep whatever we have */
    }
  }

  refresh().finally(() => {
    loading.value = false
  })

  // Pick up changes made on other devices whenever this tab comes back
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refresh()
    })
  }

  // Sends a single change; the server applies it to its copy and answers with
  // the authoritative state, so this device can never overwrite other devices.
  function sendChange(path: string, method: string, body?: unknown) {
    fetch(`${API_BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => null)
        if (!r.ok) {
          console.error('[kofferpacken] save failed:', data?.error || r.status)
          return refresh()
        }
        applyServerState(data)
      })
      .catch((err) => console.error('[kofferpacken] save failed:', err))
  }

  const sortedTrips = computed(() =>
    [...state.trips].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  )

  const itemsByCategory = computed(() => {
    const map: Record<string, Item[]> = {}
    for (const item of state.items) {
      ;(map[item.categoryId] ??= []).push(item)
    }
    return map
  })

  // ── Trips ──────────────────────────────────────────────────────────────────
  function addTrip(name: string): Trip {
    const clean = name.trim()
    if (!clean) throw new Error('Der Tripname darf nicht leer sein.')
    const trip: Trip = {
      id: createId(),
      name: clean,
      createdAt: new Date().toISOString(),
      packedItemIds: [],
    }
    state.trips.push(trip)
    sendChange('/trips', 'POST', trip)
    return trip
  }

  function removeTrip(tripId: string) {
    state.trips = state.trips.filter((t) => t.id !== tripId)
    sendChange(`/trips/${tripId}`, 'DELETE')
  }

  function setPacked(tripId: string, itemId: string, packed: boolean) {
    const trip = state.trips.find((t) => t.id === tripId)
    if (!trip) return
    trip.packedItemIds = trip.packedItemIds.filter((x) => x !== itemId)
    if (packed) trip.packedItemIds.push(itemId)
    sendChange(`/trips/${tripId}/check`, 'POST', { itemId, packed })
  }

  function setCategoryPacked(tripId: string, categoryId: string, packed: boolean) {
    const trip = state.trips.find((t) => t.id === tripId)
    if (!trip) return
    const categoryItemIds = new Set(
      state.items.filter((i) => i.categoryId === categoryId).map((i) => i.id),
    )
    trip.packedItemIds = trip.packedItemIds.filter((x) => !categoryItemIds.has(x))
    if (packed) trip.packedItemIds.push(...categoryItemIds)
    sendChange(`/trips/${tripId}/check-category`, 'POST', { categoryId, packed })
  }

  function setTripNotes(tripId: string, notes: string) {
    const trip = state.trips.find((t) => t.id === tripId)
    if (!trip) return
    trip.notes = notes
    sendChange(`/trips/${tripId}/notes`, 'PUT', { notes })
  }

  // ── Categories ─────────────────────────────────────────────────────────────
  function addCategory(name: string) {
    const clean = name.trim()
    if (!clean) throw new Error('Der Kategoriename darf nicht leer sein.')
    if (state.categories.some((c) => c.name.toLowerCase() === clean.toLowerCase())) {
      throw new Error('Diese Kategorie gibt es bereits.')
    }
    const category: Category = { id: createId(), name: clean }
    state.categories.push(category)
    sendChange('/categories', 'POST', category)
  }

  // ── Items ──────────────────────────────────────────────────────────────────
  function addItem(categoryId: string, name: string) {
    const clean = name.trim()
    if (!clean) throw new Error('Der Name darf nicht leer sein.')
    const item: Item = { id: createId(), categoryId, name: clean }
    state.items.push(item)
    sendChange('/items', 'POST', item)
  }

  function renameItem(itemId: string, name: string) {
    const clean = name.trim()
    if (!clean) throw new Error('Der Name darf nicht leer sein.')
    const item = state.items.find((i) => i.id === itemId)
    if (!item) return
    item.name = clean
    sendChange(`/items/${itemId}`, 'PUT', { name: clean })
  }

  function removeItem(itemId: string) {
    state.items = state.items.filter((i) => i.id !== itemId)
    for (const trip of state.trips) {
      trip.packedItemIds = trip.packedItemIds.filter((x) => x !== itemId)
    }
    sendChange(`/items/${itemId}`, 'DELETE')
  }

  return {
    state,
    loading,
    sortedTrips,
    itemsByCategory,
    addTrip,
    removeTrip,
    setPacked,
    setCategoryPacked,
    setTripNotes,
    addCategory,
    addItem,
    renameItem,
    removeItem,
  }
}

export function usePackStore() {
  if (!singleton) singleton = createStore()
  return singleton
}
