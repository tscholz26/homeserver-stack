<script setup lang="ts">
import { nextTick, ref, useTemplateRef } from 'vue'
import type { Category, Item } from '@/composables/useEinkaufStore'

const props = defineProps<{
  item: Item
  /** Leer bei flachen Listen: dort gibt es nichts umzusortieren. */
  categories: Category[]
}>()

const emit = defineEmits<{
  check: [done: boolean]
  remove: []
  save: [changes: { name: string; categoryId?: string }, merken: boolean]
}>()

const offen = ref(false)
const name = ref('')
const categoryId = ref('')
const merken = ref(true)
const nameFeld = useTemplateRef<HTMLInputElement>('nameFeld')

function bearbeiten() {
  name.value = props.item.name
  categoryId.value = props.item.categoryId
  merken.value = true
  offen.value = true
  nextTick(() => nameFeld.value?.focus())
}

function speichern() {
  const sauber = name.value.trim()
  if (!sauber) return
  const kategorieGeaendert =
    props.categories.length > 0 && categoryId.value !== props.item.categoryId
  emit(
    'save',
    { name: sauber, categoryId: kategorieGeaendert ? categoryId.value : undefined },
    // Merken lohnt nur, wenn eine Kategorie wirklich korrigiert wurde
    merken.value && kategorieGeaendert,
  )
  offen.value = false
}
</script>

<template>
  <li class="zeile" :class="{ erledigt: item.done, offen }">
    <div class="haupt">
      <label class="haken">
        <input
          type="checkbox"
          :checked="item.done"
          @change="emit('check', ($event.target as HTMLInputElement).checked)"
        />
        <span class="box" aria-hidden="true"></span>
      </label>

      <!-- Tippen auf den Namen öffnet die Korrektur (falsche Kategorie, Tippfehler) -->
      <button type="button" class="text" @click="offen ? (offen = false) : bearbeiten()">
        {{ item.name }}
        <!-- Nicht im Katalog gefunden: in der Verwaltung nachpflegbar -->
        <span v-if="!item.matched" class="badge" title="Nicht zugeordnet">◌</span>
      </button>

      <span v-if="item.quantity" class="menge">{{ item.quantity }}</span>

      <button type="button" class="weg" title="Artikel entfernen" @click="emit('remove')">×</button>
    </div>

    <form v-if="offen" class="bearbeiten" @submit.prevent="speichern">
      <input ref="nameFeld" v-model="name" aria-label="Name" />
      <select v-if="categories.length" v-model="categoryId" aria-label="Kategorie">
        <option v-for="k in categories" :key="k.id" :value="k.id">
          {{ k.emoji }} {{ k.label }}
        </option>
      </select>
      <label v-if="categories.length" class="merken">
        <input v-model="merken" type="checkbox" />
        Kategorie fürs nächste Mal merken
      </label>
      <div class="knoepfe">
        <button type="button" class="ab" @click="offen = false">Abbrechen</button>
        <button type="submit" class="ok">Speichern</button>
      </div>
    </form>
  </li>
</template>

<style scoped>
.zeile {
  border-top: 1px solid var(--line);
}

.haupt {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.65rem 0.9rem;
}

.haken {
  display: inline-flex;
  padding: 0.15rem;
  cursor: pointer;
}

.haken input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.box {
  display: block;
  width: 1.4rem;
  height: 1.4rem;
  border: 2px solid color-mix(in srgb, var(--muted) 45%, transparent);
  border-radius: 999px;
  transition: background 0.15s ease;
}

.haken input:checked + .box {
  border-color: var(--green);
  background: var(--green)
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E")
    center / 0.9rem no-repeat;
}

.haken input:focus-visible + .box {
  outline: 2px solid var(--violet);
  outline-offset: 2px;
}

.text {
  flex: 1;
  min-width: 0;
  padding: 0.15rem 0;
  border: none;
  background: transparent;
  color: inherit;
  font-size: 1.02rem;
  text-align: left;
  overflow-wrap: anywhere;
  cursor: pointer;
}

.badge {
  margin-left: 0.25rem;
  color: var(--amber);
  font-size: 0.9rem;
}

.menge {
  flex-shrink: 0;
  padding: 0.15rem 0.5rem;
  border: 1px solid var(--line);
  border-radius: 0.5rem;
  color: var(--muted);
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
}

.weg {
  flex-shrink: 0;
  width: 1.9rem;
  height: 1.9rem;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: color-mix(in srgb, var(--muted) 60%, transparent);
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
}

.erledigt .text {
  color: var(--muted);
  text-decoration: line-through;
}

.erledigt .menge {
  opacity: 0.6;
}

.offen {
  background: color-mix(in srgb, var(--violet) 5%, transparent);
}

.bearbeiten {
  display: grid;
  gap: 0.5rem;
  padding: 0 0.9rem 0.8rem;
}

.bearbeiten input:not([type='checkbox']),
.bearbeiten select {
  width: 100%;
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--line);
  border-radius: 0.6rem;
  background: white;
}

.merken {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--muted);
  font-size: 0.82rem;
}

.knoepfe {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.ab,
.ok {
  padding: 0.45rem 0.9rem;
  border-radius: 0.6rem;
  font-weight: 700;
  cursor: pointer;
}

.ab {
  border: 1px solid var(--line);
  background: transparent;
  color: var(--muted);
}

.ok {
  border: none;
  background: var(--violet);
  color: white;
}
</style>
