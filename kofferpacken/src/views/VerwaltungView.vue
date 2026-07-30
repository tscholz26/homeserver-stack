<script setup lang="ts">
import { computed, ref } from 'vue'
import { usePackStore } from '@/composables/usePackStore'

const store = usePackStore()

const search = ref('')
const searchLower = computed(() => search.value.trim().toLowerCase())

function filteredItems(categoryId: string) {
  const items = store.itemsByCategory.value[categoryId] ?? []
  if (!searchLower.value) return items
  return items.filter((i) => i.name.toLowerCase().includes(searchLower.value))
}

const newTripName = ref('')
const newCategoryName = ref('')
const newItemNames = ref<Record<string, string>>({})
const editingItemId = ref<string | null>(null)
const editingName = ref('')
const error = ref('')

function run(fn: () => void) {
  error.value = ''
  try {
    fn()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
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

  <section class="card">
    <h2>Trips</h2>
    <form class="inline-form" @submit.prevent="addTrip">
      <input v-model="newTripName" placeholder="Name des Trips, z.B. Italien 2026" />
      <button type="submit">Trip anlegen</button>
    </form>
    <ul>
      <li v-for="trip in store.sortedTrips.value" :key="trip.id" class="row">
        <span>{{ trip.name }}</span>
        <button class="danger" @click="removeTrip(trip.id, trip.name)">Löschen</button>
      </li>
    </ul>
  </section>

  <section class="card">
    <h2>Gegenstände</h2>
    <form class="inline-form" @submit.prevent="addCategory">
      <input v-model="newCategoryName" placeholder="Neue Kategorie" />
      <button type="submit">Kategorie hinzufügen</button>
    </form>

    <input v-model="search" class="search" type="search" placeholder="🔍 Gegenstand suchen …" />

    <div
      v-for="category in store.state.categories"
      v-show="!searchLower || filteredItems(category.id).length > 0"
      :key="category.id"
      class="category"
    >
      <h3>{{ category.name }}</h3>
      <ul>
        <li v-for="item in filteredItems(category.id)" :key="item.id" class="row">
          <template v-if="editingItemId === item.id">
            <input v-model="editingName" class="edit-input" @keyup.enter="saveEdit" />
            <button @click="saveEdit">Speichern</button>
            <button @click="editingItemId = null">Abbrechen</button>
          </template>
          <template v-else>
            <span>{{ item.name }}</span>
            <span class="actions">
              <button @click="startEdit(item.id, item.name)">Bearbeiten</button>
              <button class="danger" @click="removeItem(item.id, item.name)">Löschen</button>
            </span>
          </template>
        </li>
      </ul>
      <form v-if="!searchLower" class="inline-form" @submit.prevent="addItem(category.id)">
        <input v-model="newItemNames[category.id]" placeholder="Neuer Gegenstand" />
        <button type="submit">Hinzufügen</button>
      </form>
    </div>
  </section>
</template>

<style scoped>
.error {
  border: 1px solid rgba(255, 120, 120, 0.7);
  border-radius: 0.6rem;
  background: rgba(160, 40, 40, 0.35);
  padding: 0.6rem 0.8rem;
}

.card {
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 0.8rem;
  background: rgba(255, 255, 255, 0.06);
  padding: 0.8rem 1rem;
  margin-bottom: 0.8rem;
}

.card h2 {
  margin: 0 0 0.6rem;
  font-size: 1.15rem;
}

.search {
  width: 100%;
  margin-top: 0.6rem;
}

.category {
  margin-top: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.15);
  padding-top: 0.6rem;
}

.category h3 {
  margin: 0 0 0.3rem;
  font-size: 1rem;
  color: #f2c14e;
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  padding: 0.35rem 0;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.actions {
  display: flex;
  gap: 0.4rem;
  flex-shrink: 0;
}

.inline-form {
  display: flex;
  gap: 0.5rem;
  margin: 0.5rem 0;
  flex-wrap: wrap;
}

input {
  flex: 1;
  min-width: 10rem;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 0.5rem;
  background: rgba(0, 0, 0, 0.25);
  color: inherit;
  padding: 0.45rem 0.6rem;
  font: inherit;
}

.edit-input {
  min-width: 6rem;
}

button {
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 0.5rem;
  background: rgba(255, 255, 255, 0.1);
  color: inherit;
  padding: 0.4rem 0.7rem;
  font-weight: 600;
  cursor: pointer;
}

button[type='submit'] {
  background: #f2c14e;
  border-color: #f2c14e;
  color: #23303b;
}

button.danger {
  border-color: rgba(255, 120, 120, 0.7);
  color: #ffb0b0;
}
</style>
