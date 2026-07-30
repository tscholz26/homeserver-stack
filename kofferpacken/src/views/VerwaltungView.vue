<script setup lang="ts">
import { computed, ref } from 'vue'
import { usePackStore, type Trip } from '@/composables/usePackStore'

const store = usePackStore()

const tab = ref<'trips' | 'items'>('trips')
const error = ref('')

function run(fn: () => void) {
  error.value = ''
  try {
    fn()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

// ── Trips ──────────────────────────────────────────────────────────────────
const newTripName = ref('')
const itemIds = computed(() => new Set(store.state.items.map((i) => i.id)))

function tripPackedCount(trip: Trip): number {
  return trip.packedItemIds.filter((id) => itemIds.value.has(id)).length
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function addTrip() {
  run(() => {
    store.addTrip(newTripName.value)
    newTripName.value = ''
  })
}

function removeTrip(tripId: string, name: string) {
  if (!confirm(`Trip „${name}“ wirklich löschen?`)) return
  store.removeTrip(tripId)
}

// ── Gegenstände ────────────────────────────────────────────────────────────
const search = ref('')
const searchLower = computed(() => search.value.trim().toLowerCase())
const newCategoryName = ref('')
const newItemNames = ref<Record<string, string>>({})
const editingItemId = ref<string | null>(null)
const editingName = ref('')

// One category open at a time keeps the page short; a search opens all hits
const expandedId = ref<string | null>(null)

function categoryItems(categoryId: string) {
  return store.itemsByCategory.value[categoryId] ?? []
}

function filteredItems(categoryId: string) {
  const items = categoryItems(categoryId)
  if (!searchLower.value) return items
  return items.filter((i) => i.name.toLowerCase().includes(searchLower.value))
}

function isOpen(categoryId: string): boolean {
  if (searchLower.value) return filteredItems(categoryId).length > 0
  return expandedId.value === categoryId
}

function toggleExpanded(categoryId: string) {
  if (searchLower.value) return
  expandedId.value = expandedId.value === categoryId ? null : categoryId
}

function addCategory() {
  run(() => {
    store.addCategory(newCategoryName.value)
    newCategoryName.value = ''
  })
}

function addItem(categoryId: string) {
  run(() => {
    store.addItem(categoryId, newItemNames.value[categoryId] ?? '')
    newItemNames.value[categoryId] = ''
  })
}

function startEdit(itemId: string, name: string) {
  editingItemId.value = itemId
  editingName.value = name
}

function saveEdit() {
  if (!editingItemId.value) return
  run(() => {
    store.renameItem(editingItemId.value!, editingName.value)
    editingItemId.value = null
  })
}

function removeItem(itemId: string, name: string) {
  if (!confirm(`Gegenstand „${name}“ wirklich löschen?`)) return
  store.removeItem(itemId)
}
</script>

<template>
  <p v-if="error" class="error">{{ error }}</p>

  <div class="tabs" role="tablist">
    <button
      role="tab"
      :aria-selected="tab === 'trips'"
      :class="{ active: tab === 'trips' }"
      @click="tab = 'trips'"
    >
      ✈️ Trips
    </button>
    <button
      role="tab"
      :aria-selected="tab === 'items'"
      :class="{ active: tab === 'items' }"
      @click="tab = 'items'"
    >
      🧳 Gegenstände
    </button>
  </div>

  <!-- ── Trips ─────────────────────────────────────────────────────────── -->
  <section v-if="tab === 'trips'">
    <form class="add-form" @submit.prevent="addTrip">
      <input v-model="newTripName" placeholder="Neuer Trip, z. B. Italien 2026" />
      <button type="submit" class="primary">Anlegen</button>
    </form>

    <p v-if="store.sortedTrips.value.length === 0" class="empty">
      Noch keine Trips – leg oben den ersten an.
    </p>

    <ul class="trip-list">
      <li v-for="trip in store.sortedTrips.value" :key="trip.id" class="trip-card">
        <div class="trip-info">
          <strong>{{ trip.name }}</strong>
          <span class="meta">
            {{ formatDate(trip.createdAt) }} · {{ tripPackedCount(trip) }}/{{
              store.state.items.length
            }}
            gepackt
          </span>
        </div>
        <button
          class="icon-btn danger"
          aria-label="Trip löschen"
          @click="removeTrip(trip.id, trip.name)"
        >
          🗑️
        </button>
      </li>
    </ul>
  </section>

  <!-- ── Gegenstände ───────────────────────────────────────────────────── -->
  <section v-else>
    <input v-model="search" type="search" class="search" placeholder="🔍 Gegenstand suchen …" />

    <div
      v-for="category in store.state.categories"
      v-show="!searchLower || filteredItems(category.id).length > 0"
      :key="category.id"
      class="acc"
      :class="{ open: isOpen(category.id) }"
    >
      <button class="acc-head" type="button" @click="toggleExpanded(category.id)">
        <span class="acc-title">{{ category.name }}</span>
        <span class="acc-meta">
          {{ categoryItems(category.id).length }}
          <span class="chevron" :class="{ collapsed: !isOpen(category.id) }">▾</span>
        </span>
      </button>

      <div v-if="isOpen(category.id)" class="acc-body">
        <ul>
          <li v-for="item in filteredItems(category.id)" :key="item.id" class="row">
            <template v-if="editingItemId === item.id">
              <input v-model="editingName" class="edit-input" @keyup.enter="saveEdit" />
              <span class="actions">
                <button class="icon-btn" aria-label="Speichern" @click="saveEdit">✔️</button>
                <button class="icon-btn" aria-label="Abbrechen" @click="editingItemId = null">
                  ✖️
                </button>
              </span>
            </template>
            <template v-else>
              <span class="item-name">{{ item.name }}</span>
              <span class="actions">
                <button
                  class="icon-btn"
                  aria-label="Bearbeiten"
                  @click="startEdit(item.id, item.name)"
                >
                  ✏️
                </button>
                <button
                  class="icon-btn danger"
                  aria-label="Löschen"
                  @click="removeItem(item.id, item.name)"
                >
                  🗑️
                </button>
              </span>
            </template>
          </li>
        </ul>
        <form v-if="!searchLower" class="add-form" @submit.prevent="addItem(category.id)">
          <input v-model="newItemNames[category.id]" placeholder="Neuer Gegenstand" />
          <button type="submit" class="primary">+</button>
        </form>
      </div>
    </div>

    <form class="add-form new-cat" @submit.prevent="addCategory">
      <input v-model="newCategoryName" placeholder="Neue Kategorie" />
      <button type="submit" class="primary">Kategorie anlegen</button>
    </form>
  </section>
</template>

<style scoped>
.error {
  border: 1px solid rgba(255, 120, 120, 0.7);
  border-radius: 0.6rem;
  background: rgba(160, 40, 40, 0.35);
  padding: 0.6rem 0.8rem;
}

/* Segmented tabs */
.tabs {
  display: flex;
  gap: 0.3rem;
  padding: 0.25rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 0.8rem;
  background: rgba(255, 255, 255, 0.06);
  margin-bottom: 1rem;
}

.tabs button {
  flex: 1;
  border: none;
  border-radius: 0.55rem;
  background: transparent;
  color: inherit;
  padding: 0.55rem 0.6rem;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.tabs button.active {
  background: #f2c14e;
  color: #23303b;
}

/* Trips */
.trip-list {
  list-style: none;
  margin: 0.8rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.5rem;
}

.trip-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 0.8rem;
  background: rgba(255, 255, 255, 0.06);
  padding: 0.7rem 0.9rem;
}

.trip-info {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.trip-info strong {
  font-size: 1.05rem;
}

.meta {
  font-size: 0.8rem;
  opacity: 0.7;
}

.empty {
  text-align: center;
  opacity: 0.8;
}

/* Accordion for categories */
.acc {
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 0.8rem;
  background: rgba(255, 255, 255, 0.06);
  margin-bottom: 0.5rem;
  overflow: hidden;
}

.acc.open {
  border-color: rgba(242, 193, 78, 0.55);
}

.acc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  width: 100%;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  padding: 0.7rem 0.9rem;
  cursor: pointer;
  user-select: none;
}

.acc-title {
  font-weight: 700;
  color: #f2c14e;
}

.acc-meta {
  font-size: 0.85rem;
  opacity: 0.8;
  white-space: nowrap;
}

.chevron {
  display: inline-block;
  margin-left: 0.3rem;
  transition: transform 0.2s ease;
}

.chevron.collapsed {
  transform: rotate(-90deg);
}

.acc-body {
  padding: 0 0.9rem 0.7rem;
}

.acc-body ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  padding: 0.4rem 0;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.item-name {
  min-width: 0;
  overflow-wrap: anywhere;
}

.actions {
  display: flex;
  gap: 0.3rem;
  flex-shrink: 0;
}

/* Forms & inputs */
.add-form {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.6rem;
}

.new-cat {
  margin-top: 1rem;
}

input {
  flex: 1;
  min-width: 0;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 0.55rem;
  background: rgba(0, 0, 0, 0.25);
  color: inherit;
  padding: 0.5rem 0.65rem;
  font: inherit;
}

.search {
  width: 100%;
  margin-bottom: 0.8rem;
}

.edit-input {
  flex: 1;
}

button.primary {
  border: 1px solid #f2c14e;
  border-radius: 0.55rem;
  background: #f2c14e;
  color: #23303b;
  padding: 0.5rem 0.9rem;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  flex-shrink: 0;
}

.icon-btn {
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 0.55rem;
  background: rgba(255, 255, 255, 0.08);
  padding: 0.35rem 0.5rem;
  font-size: 0.95rem;
  line-height: 1;
  cursor: pointer;
}

.icon-btn.danger {
  border-color: rgba(255, 120, 120, 0.5);
}

@media (pointer: coarse) {
  .icon-btn {
    padding: 0.5rem 0.6rem;
  }

  .row {
    padding: 0.55rem 0;
  }
}
</style>
