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

export interface User {
  id: string
  name: string
  createdAt: string
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
  const state = reactive<{ users: User[] }>({ users: [] })

  // The active user survives reloads, so the phone stays "logged in"
  const currentUserId = ref<string | null>(localStorage.getItem('koffer:userId'))

  const API_BASE = `${import.meta.env.BASE_URL}api`

  function applyServerState(data: { users?: User[] } | null) {
    if (data && Array.isArray(data.users)) state.users = data.users
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

  // ── Users ──────────────────────────────────────────────────────────────────
  const currentUser = computed(() => state.users.find((u) => u.id === currentUserId.value) ?? null)

  const sortedUsers = computed(() =>
    [...state.users].sort((a, b) => a.name.localeCompare(b.name, 'de')),
  )

  function login(userId: string) {
    currentUserId.value = userId
    localStorage.setItem('koffer:userId', userId)
  }

  function logout() {
    currentUserId.value = null
    localStorage.removeItem('koffer:userId')
  }

  async function addUser(name: string) {
    const clean = name.trim()
    if (!clean) throw new Error('Der Name darf nicht leer sein.')
    if (state.users.some((u) => u.name.toLowerCase() === clean.toLowerCase())) {
      throw new Error('Diesen Nutzer gibt es bereits.')
    }
    const user = { id: createId(), name: clean, createdAt: new Date().toISOString() }
    const r = await fetch(`${API_BASE}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user),
    })
    const data = await r.json().catch(() => null)
    if (!r.ok) throw new Error(data?.error || 'Nutzer konnte nicht angelegt werden.')
    applyServerState(data)
    login(user.id)
  }

  async function removeUser(userId: string) {
    const r = await fetch(`${API_BASE}/users/${userId}`, { method: 'DELETE' })
    const data = await r.json().catch(() => null)
    if (!r.ok) throw new Error(data?.error || 'Nutzer konnte nicht gelöscht werden.')
    applyServerState(data)
    if (currentUserId.value === userId) logout()
  }

  function userPath(path: string) {
    return `/users/${currentUserId.value}${path}`
  }

  // ── Per-user data ──────────────────────────────────────────────────────────
  const categories = computed(() => currentUser.value?.categories ?? [])
  const items = computed(() => currentUser.value?.items ?? [])

  const sortedTrips = computed(() =>
    [...(currentUser.value?.trips ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  )

  const itemsByCategory = computed(() => {
    const map: Record<string, Item[]> = {}
    for (const item of items.value) {
      ;(map[item.categoryId] ??= []).push(item)
    }
    return map
  })

  // ── Trips ──────────────────────────────────────────────────────────────────
  function addTrip(name: string): Trip {
    const user = currentUser.value
    if (!user) throw new Error('Kein Nutzer angemeldet.')
    const clean = name.trim()
    if (!clean) throw new Error('Der Tripname darf nicht leer sein.')
    const trip: Trip = {
      id: createId(),
      name: clean,
      createdAt: new Date().toISOString(),
      packedItemIds: [],
    }
    user.trips.push(trip)
    sendChange(userPath('/trips'), 'POST', trip)
    return trip
  }

  function removeTrip(tripId: string) {
    const user = currentUser.value
    if (!user) return
    user.trips = user.trips.filter((t) => t.id !== tripId)
    sendChange(userPath(`/trips/${tripId}`), 'DELETE')
  }

  function setPacked(tripId: string, itemId: string, packed: boolean) {
    const trip = currentUser.value?.trips.find((t) => t.id === tripId)
    if (!trip) return
    trip.packedItemIds = trip.packedItemIds.filter((x) => x !== itemId)
    if (packed) trip.packedItemIds.push(itemId)
    sendChange(userPath(`/trips/${tripId}/check`), 'POST', { itemId, packed })
  }

  function setCategoryPacked(tripId: string, categoryId: string, packed: boolean) {
    const trip = currentUser.value?.trips.find((t) => t.id === tripId)
    if (!trip) return
    const categoryItemIds = new Set(
      items.value.filter((i) => i.categoryId === categoryId).map((i) => i.id),
    )
    trip.packedItemIds = trip.packedItemIds.filter((x) => !categoryItemIds.has(x))
    if (packed) trip.packedItemIds.push(...categoryItemIds)
    sendChange(userPath(`/trips/${tripId}/check-category`), 'POST', { categoryId, packed })
  }

  function setTripNotes(tripId: string, notes: string) {
    const trip = currentUser.value?.trips.find((t) => t.id === tripId)
    if (!trip) return
    trip.notes = notes
    sendChange(userPath(`/trips/${tripId}/notes`), 'PUT', { notes })
  }

  // ── Categories ─────────────────────────────────────────────────────────────
  function addCategory(name: string) {
    const user = currentUser.value
    if (!user) throw new Error('Kein Nutzer angemeldet.')
    const clean = name.trim()
    if (!clean) throw new Error('Der Kategoriename darf nicht leer sein.')
    if (user.categories.some((c) => c.name.toLowerCase() === clean.toLowerCase())) {
      throw new Error('Diese Kategorie gibt es bereits.')
    }
    const category: Category = { id: createId(), name: clean }
    user.categories.push(category)
    sendChange(userPath('/categories'), 'POST', category)
  }

  // ── Items ──────────────────────────────────────────────────────────────────
  function addItem(categoryId: string, name: string) {
    const user = currentUser.value
    if (!user) throw new Error('Kein Nutzer angemeldet.')
    const clean = name.trim()
    if (!clean) throw new Error('Der Name darf nicht leer sein.')
    const item: Item = { id: createId(), categoryId, name: clean }
    user.items.push(item)
    sendChange(userPath('/items'), 'POST', item)
  }

  function renameItem(itemId: string, name: string) {
    const clean = name.trim()
    if (!clean) throw new Error('Der Name darf nicht leer sein.')
    const item = currentUser.value?.items.find((i) => i.id === itemId)
    if (!item) return
    item.name = clean
    sendChange(userPath(`/items/${itemId}`), 'PUT', { name: clean })
  }

  function removeItem(itemId: string) {
    const user = currentUser.value
    if (!user) return
    user.items = user.items.filter((i) => i.id !== itemId)
    for (const trip of user.trips) {
      trip.packedItemIds = trip.packedItemIds.filter((x) => x !== itemId)
    }
    sendChange(userPath(`/items/${itemId}`), 'DELETE')
  }

  return {
    loading,
    currentUserId,
    currentUser,
    sortedUsers,
    categories,
    items,
    sortedTrips,
    itemsByCategory,
    login,
    logout,
    addUser,
    removeUser,
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
