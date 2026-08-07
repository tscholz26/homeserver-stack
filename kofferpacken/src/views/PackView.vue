<script setup lang="ts">
import { computed, ref, watch, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { usePackStore, type Trip } from '@/composables/usePackStore'

const store = usePackStore()
const route = useRoute()

// ?trip=… gewinnt (so führt ein Klick in der Verwaltung direkt zum Trip),
// sonst der zuletzt auf diesem Gerät gewählte
const selectedTripId = ref<string | null>(
  (typeof route.query.trip === 'string' ? route.query.trip : null) ??
    localStorage.getItem('koffer:selectedTripId'),
)
const onlyMissing = ref(localStorage.getItem('koffer:onlyMissing') === '1')

watch(selectedTripId, (v) => {
  if (v) localStorage.setItem('koffer:selectedTripId', v)
  else localStorage.removeItem('koffer:selectedTripId')
})
watch(onlyMissing, (v) => localStorage.setItem('koffer:onlyMissing', v ? '1' : '0'))

// Keep a valid trip selected (first one by default, e.g. after deletes);
// don't touch the stored choice while the server state is still loading
watchEffect(() => {
  if (store.loading.value) return
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
  store.categories.value
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

const totalCount = computed(() => store.items.value.length)
const packedCount = computed(
  () => store.items.value.filter((i) => packedSet.value.has(i.id)).length,
)
const progressPercent = computed(() =>
  totalCount.value === 0 ? 0 : Math.round((packedCount.value / totalCount.value) * 100),
)

// Per-trip counter for the chips; ignores checkmarks of meanwhile deleted items
const itemIds = computed(() => new Set(store.items.value.map((i) => i.id)))
function tripPackedCount(trip: Trip): number {
  return trip.packedItemIds.filter((id) => itemIds.value.has(id)).length
}

// Alle Kategorien starten eingeklappt: so sieht man die Übersicht mit allen
// Zählern und das Notizfeld sofort, ohne an 90 Gegenständen vorbeizuscrollen.
const expandedIds = ref(new Set<string>())

function isExpanded(categoryId: string): boolean {
  return onlyMissing.value || expandedIds.value.has(categoryId)
}

function toggleExpanded(categoryId: string) {
  const next = new Set(expandedIds.value)
  if (next.has(categoryId)) next.delete(categoryId)
  else next.add(categoryId)
  expandedIds.value = next
}

// Der Filter „Nur fehlende" wäre sinnlos, wenn alles zugeklappt bliebe –
// er klappt deshalb auf und beim Ausschalten wieder zusammen.
watch(onlyMissing, () => {
  expandedIds.value = new Set()
})

function toggle(itemId: string) {
  if (!selectedTrip.value) return
  store.setPacked(selectedTrip.value.id, itemId, !packedSet.value.has(itemId))
}

function toggleCategory(categoryId: string, allPacked: boolean) {
  if (!selectedTrip.value) return
  store.setCategoryPacked(selectedTrip.value.id, categoryId, !allPacked)
}

// Notes autosave: 3 s after the last keystroke (or on blur), with a status hint
const notesDraft = ref('')
const notesStatus = ref<'idle' | 'pending' | 'saved'>('idle')
let notesTimer: ReturnType<typeof setTimeout> | undefined

watch(
  () => selectedTrip.value?.id,
  () => {
    clearTimeout(notesTimer)
    notesDraft.value = selectedTrip.value?.notes ?? ''
    notesStatus.value = 'idle'
  },
  { immediate: true },
)

// Pick up notes edited on another device, but never while typing here
watch(
  () => selectedTrip.value?.notes,
  (serverNotes) => {
    if (notesStatus.value !== 'pending' && (serverNotes ?? '') !== notesDraft.value) {
      notesDraft.value = serverNotes ?? ''
    }
  },
)

function onNotesInput() {
  notesStatus.value = 'pending'
  clearTimeout(notesTimer)
  notesTimer = setTimeout(saveNotes, 3000)
}

function saveNotes() {
  clearTimeout(notesTimer)
  if (!selectedTrip.value || notesStatus.value !== 'pending') return
  store.setTripNotes(selectedTrip.value.id, notesDraft.value)
  notesStatus.value = 'saved'
}

async function exportPdf() {
  const { exportPackliste } = await import('@/utils/packlistePdf')
  exportPackliste(store.categories.value, store.itemsByCategory.value, {
    packedItemIds: packedSet.value,
    tripName: selectedTrip.value?.name,
  })
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
        <span class="chip-count">{{ tripPackedCount(trip) }}/{{ totalCount }}</span>
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
        <button class="filter-btn" @click="exportPdf">Liste als PDF</button>
      </div>
    </div>

    <div
      v-if="selectedTrip"
      class="progress-bar"
      role="progressbar"
      :aria-valuenow="progressPercent"
    >
      <div
        class="progress-fill"
        :class="{ full: progressPercent === 100 }"
        :style="{ width: progressPercent + '%' }"
      ></div>
    </div>

    <p v-if="selectedTrip && totalCount > 0 && packedCount === totalCount" class="hint done">
      <span class="party">🎉</span> Alles eingepackt – gute Reise! <span class="party">🧳</span>
    </p>

    <section
      v-for="group in groups"
      :key="group.category.id"
      class="card"
      :class="{ done: group.packedCount === group.totalCount }"
    >
      <header
        class="card-head"
        role="button"
        tabindex="0"
        @click="toggleExpanded(group.category.id)"
        @keydown.enter="toggleExpanded(group.category.id)"
      >
        <h2>{{ group.category.name }}</h2>
        <button
          class="bulk-btn"
          type="button"
          @click.stop="toggleCategory(group.category.id, group.packedCount === group.totalCount)"
        >
          {{ group.packedCount === group.totalCount ? 'alle enthaken' : 'alle abhaken' }}
        </button>
        <span class="count">
          <template v-if="group.packedCount === group.totalCount">✓ komplett</template>
          <template v-else>{{ group.packedCount }}/{{ group.totalCount }}</template>
          <span class="chevron" :class="{ collapsed: !isExpanded(group.category.id) }">▾</span>
        </span>
      </header>
      <ul v-show="isExpanded(group.category.id)">
        <li v-for="item in group.items" :key="item.id">
          <label class="row" :class="{ packed: packedSet.has(item.id) }">
            <input type="checkbox" :checked="packedSet.has(item.id)" @change="toggle(item.id)" />
            <span>{{ item.name }}</span>
          </label>
        </li>
      </ul>
    </section>

    <section v-if="selectedTrip" class="card notes-card">
      <div class="notes-head">
        <h2>Notizen</h2>
        <span v-if="notesStatus === 'pending'" class="save-state">wird gespeichert …</span>
        <span v-else-if="notesStatus === 'saved'" class="save-state saved">✓ gespeichert</span>
      </div>
      <textarea
        v-model="notesDraft"
        rows="4"
        placeholder="Freitext zum Trip – Besorgungen, Erinnerungen, Adressen …"
        @input="onNotesInput"
        @blur="saveNotes"
      ></textarea>
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

.party {
  display: inline-block;
  animation: party 1.1s ease-in-out infinite;
}

.party:last-child {
  animation-delay: 0.55s;
}

@keyframes party {
  0%,
  100% {
    transform: rotate(-10deg) scale(1);
  }
  50% {
    transform: rotate(10deg) scale(1.3);
  }
}

@media (prefers-reduced-motion: reduce) {
  .party {
    animation: none;
  }
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

.chip-count {
  font-size: 0.75rem;
  opacity: 0.7;
  font-weight: 400;
  margin-left: 0.15rem;
}

.progress-bar {
  height: 0.45rem;
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
  margin-bottom: 0.8rem;
}

.progress-fill {
  height: 100%;
  border-radius: 1rem;
  background: linear-gradient(90deg, #e0a92e, #f2c14e);
  transition:
    width 0.35s ease,
    background 0.35s ease;
}

.progress-fill.full {
  background: linear-gradient(90deg, #5cc474, #7ed98f);
}

/* Stays visible while scrolling the long list */
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  position: sticky;
  top: 0;
  z-index: 5;
  background: rgba(16, 34, 47, 0.88);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  margin: 0 -0.5rem 0.8rem;
  padding: 0.55rem 0.5rem;
  border-radius: 0 0 0.8rem 0.8rem;
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
  cursor: pointer;
  user-select: none;
}

.chevron {
  display: inline-block;
  margin-left: 0.35rem;
  opacity: 0.7;
  transition: transform 0.2s ease;
}

.chevron.collapsed {
  transform: rotate(-90deg);
}

.card-head h2 {
  margin: 0;
  font-size: 1.05rem;
  flex: 1;
}

.bulk-btn {
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 2rem;
  background: rgba(255, 255, 255, 0.07);
  color: inherit;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.25rem 0.6rem;
  cursor: pointer;
  white-space: nowrap;
  opacity: 0.85;
}

.count {
  font-size: 0.85rem;
  opacity: 0.8;
  white-space: nowrap;
}

.card.done {
  border-color: rgba(126, 217, 143, 0.45);
}

.card.done .count {
  color: #7ed98f;
  opacity: 1;
  font-weight: 600;
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

.notes-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.6rem;
}

.notes-head h2 {
  margin: 0;
  font-size: 1.05rem;
}

.save-state {
  font-size: 0.8rem;
  opacity: 0.75;
}

.save-state.saved {
  color: #7ed98f;
  opacity: 1;
}

.notes-card textarea {
  width: 100%;
  margin-top: 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 0.6rem;
  background: rgba(0, 0, 0, 0.25);
  color: inherit;
  padding: 0.55rem 0.7rem;
  font: inherit;
  resize: vertical;
}

.row span {
  transition: opacity 0.15s ease;
}

.row.packed span {
  text-decoration: line-through;
  opacity: 0.55;
}

/* Phone: swipeable trip chips instead of wrapping, bigger touch targets */
@media (max-width: 600px) {
  .trip-picker {
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
    margin-left: -1rem;
    margin-right: -1rem;
    padding: 0 1rem;
  }

  .trip-picker::-webkit-scrollbar {
    display: none;
  }

  .trip-chip {
    white-space: nowrap;
    flex-shrink: 0;
  }
}

@media (pointer: coarse) {
  .row {
    padding: 0.6rem 0.2rem;
  }

  .row input {
    width: 1.45rem;
    height: 1.45rem;
  }

  .filter-btn,
  .trip-chip {
    padding: 0.55rem 1rem;
  }
}
</style>
