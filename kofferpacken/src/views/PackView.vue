<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { usePackStore } from '@/composables/usePackStore'

const store = usePackStore()

const selectedTripId = ref<string | null>(null)
const onlyMissing = ref(false)

// Keep a valid trip selected (first one by default, e.g. after deletes)
watchEffect(() => {
  const trips = store.sortedTrips.value
  if (!trips.some((t) => t.id === selectedTripId.value)) {
    selectedTripId.value = trips[0]?.id ?? null
  }
})

const selectedTrip = computed(
  () => store.sortedTrips.value.find((t) => t.id === selectedTripId.value) ?? null,
)

const packedSet = computed(() => new Set(selectedTrip.value?.packedItemIds ?? []))

const groups = computed(() =>
  store.state.categories
    .map((category) => {
      const items = store.itemsByCategory.value[category.id] ?? []
      const missing = items.filter((i) => !packedSet.value.has(i.id))
      return {
        category,
        packedCount: items.length - missing.length,
        totalCount: items.length,
        items: onlyMissing.value ? missing : items,
      }
    })
    .filter((g) => g.items.length > 0),
)

const totalCount = computed(() => store.state.items.length)
const packedCount = computed(
  () => store.state.items.filter((i) => packedSet.value.has(i.id)).length,
)

function toggle(itemId: string) {
  if (!selectedTrip.value) return
  store.setPacked(selectedTrip.value.id, itemId, !packedSet.value.has(itemId))
}

async function exportPdf() {
  const { exportEmptyPackliste } = await import('@/utils/packlistePdf')
  exportEmptyPackliste(store.state.categories, store.itemsByCategory.value)
}
</script>

<template>
  <p v-if="store.loading.value" class="hint">Lade Daten …</p>

  <p v-else-if="store.sortedTrips.value.length === 0" class="hint">
    Noch kein Trip angelegt – lege unter „Verwaltung“ einen Trip an.
  </p>

  <template v-else>
    <div class="trip-picker">
      <button
        v-for="trip in store.sortedTrips.value"
        :key="trip.id"
        class="trip-chip"
        :class="{ active: trip.id === selectedTripId }"
        @click="selectedTripId = trip.id"
      >
        {{ trip.name }}
      </button>
    </div>

    <div v-if="selectedTrip" class="toolbar">
      <p class="progress">{{ packedCount }} von {{ totalCount }} eingepackt</p>
      <div class="toolbar-buttons">
        <button
          class="filter-btn"
          :class="{ active: onlyMissing }"
          @click="onlyMissing = !onlyMissing"
        >
          {{ onlyMissing ? 'Alle anzeigen' : 'Nur fehlende anzeigen' }}
        </button>
        <button class="filter-btn" @click="exportPdf">Leere Liste als PDF</button>
      </div>
    </div>

    <p v-if="selectedTrip && onlyMissing && groups.length === 0" class="hint done">
      Alles eingepackt – gute Reise! 🎉
    </p>

    <section v-for="group in groups" :key="group.category.id" class="card">
      <header class="card-head">
        <h2>{{ group.category.name }}</h2>
        <span class="count">{{ group.packedCount }}/{{ group.totalCount }}</span>
      </header>
      <ul>
        <li v-for="item in group.items" :key="item.id">
          <label class="row" :class="{ packed: packedSet.has(item.id) }">
            <input
              type="checkbox"
              :checked="packedSet.has(item.id)"
              @change="toggle(item.id)"
            />
            <span>{{ item.name }}</span>
          </label>
        </li>
      </ul>
    </section>
  </template>
</template>

<style scoped>
.hint {
  text-align: center;
  opacity: 0.85;
}

.hint.done {
  font-size: 1.2rem;
  font-weight: 600;
}

.trip-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.8rem;
}

.trip-chip {
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 2rem;
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
  padding: 0.4rem 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.trip-chip.active {
  background: #f2c14e;
  border-color: #f2c14e;
  color: #23303b;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  margin-bottom: 0.8rem;
}

.progress {
  margin: 0;
  font-weight: 600;
}

.toolbar-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.filter-btn {
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 0.6rem;
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
  padding: 0.45rem 0.8rem;
  font-weight: 600;
  cursor: pointer;
}

.filter-btn.active {
  background: #f2c14e;
  border-color: #f2c14e;
  color: #23303b;
}

.card {
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 0.8rem;
  background: rgba(255, 255, 255, 0.06);
  padding: 0.8rem 1rem;
  margin-bottom: 0.8rem;
}

.card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.6rem;
}

.card-head h2 {
  margin: 0;
  font-size: 1.05rem;
}

.count {
  font-size: 0.85rem;
  opacity: 0.8;
}

ul {
  list-style: none;
  margin: 0.5rem 0 0;
  padding: 0;
}

.row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.45rem 0.2rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  cursor: pointer;
}

.row input {
  width: 1.2rem;
  height: 1.2rem;
  accent-color: #f2c14e;
  flex-shrink: 0;
}

.row.packed span {
  text-decoration: line-through;
  opacity: 0.55;
}
</style>
