<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from 'vue'
import type { Category, Item } from '@/composables/useEinkaufStore'
import { findCatalogMatch, suggestCatalogEntries, type CatalogEntry } from '@/utils/matching'

const props = defineProps<{
  item: Item
  /** Leer bei flachen Listen: dort gibt es nichts umzusortieren. */
  categories: Category[]
  catalog: CatalogEntry[]
  catalogNames: string[]
  /** Flache Listen lassen sich von Hand sortieren – dann gibt es einen Griff. */
  sortierbar?: boolean
}>()

const emit = defineEmits<{
  check: [done: boolean]
  remove: []
  save: [changes: { name: string; quantity: string; categoryId?: string; merken?: boolean }]
  alias: [artikel: string]
}>()

const offen = ref(false)
const name = ref('')
const quantity = ref('')
const categoryId = ref('')
const aliasOffen = ref(false)
const aliasZiel = ref('')
const nameFeld = useTemplateRef<HTMLInputElement>('nameFeld')

// Vorschläge für „das ist eigentlich …“ – aus dem Namen, wie er dasteht
const vorschlaege = computed(() => suggestCatalogEntries(props.item.name, props.catalog))

function oeffnen() {
  name.value = props.item.name
  quantity.value = props.item.quantity
  categoryId.value = props.item.categoryId
  aliasOffen.value = false
  aliasZiel.value = ''
  offen.value = true
  nextTick(() => nameFeld.value?.focus())
}

function speichern() {
  const sauber = name.value.trim()
  if (!sauber) return

  // Von Hand gewählte Kategorie: gilt und wird im Katalog gemerkt
  if (categoryId.value !== props.item.categoryId) {
    emit('save', {
      name: sauber,
      quantity: quantity.value.trim(),
      categoryId: categoryId.value,
      merken: true,
    })
    offen.value = false
    return
  }

  // Nur der Name geändert: der Katalog wird noch einmal gefragt. Aus „Pizzateif“
  // wird so „Pizzateig“ samt Regal, statt in Sonstiges liegen zu bleiben.
  let neueKategorie: string | undefined
  if (props.categories.length && sauber !== props.item.name) {
    const match = findCatalogMatch(sauber, props.catalog)
    if (match && match.category_id !== props.item.categoryId) {
      const label = props.categories.find((k) => k.id === match.category_id)?.label
      if (confirm(`„${sauber}“ steht im Katalog unter „${label}“. Dorthin verschieben?`)) {
        neueKategorie = match.category_id
      }
    }
  }

  emit('save', {
    name: sauber,
    quantity: quantity.value.trim(),
    categoryId: neueKategorie,
    // Kam aus dem Katalog – da muss nichts dazugelernt werden
    merken: false,
  })
  offen.value = false
}

function alsSchreibweise(artikel: string) {
  if (!artikel.trim()) return
  emit('alias', artikel.trim())
  offen.value = false
}
</script>

<template>
  <li class="zeile" :class="{ erledigt: item.done, aktiv: offen }">
    <!-- Zugeklappt: Haken, Name, Menge. Ein Tipp auf den Namen klappt auf. -->
    <div v-if="!offen" class="haupt">
      <span v-if="sortierbar" class="griff" title="Verschieben">⠿</span>

      <!-- Bewusst kein <input type=checkbox>: dessen Zustand lebt im DOM und
           lief neben SortableJS aus dem Tritt – der Haken blieb grün, obwohl
           der Artikel längst wieder offen war. Ein Knopf hat nur den Zustand,
           den wir ihm geben. -->
      <button
        type="button"
        class="haken"
        role="checkbox"
        :aria-checked="item.done"
        :aria-label="item.done ? `${item.name} wieder offen` : `${item.name} abhaken`"
        @click="emit('check', !item.done)"
      >
        <span class="box" :class="{ an: item.done }" aria-hidden="true"></span>
      </button>

      <button type="button" class="text" @click="oeffnen">
        {{ item.name }}
        <!-- Nicht im Katalog gefunden: unten zuordenbar -->
        <span v-if="!item.matched" class="badge" title="Nicht zugeordnet">◌</span>
      </button>

      <span v-if="item.quantity" class="menge">{{ item.quantity }}</span>

      <button type="button" class="weg" title="Artikel entfernen" @click="emit('remove')">×</button>
    </div>

    <!-- Aufgeklappt: dieselbe Zeile, nur als Eingabe – der Name steht nicht doppelt da -->
    <form v-else class="bearbeiten" @submit.prevent="speichern">
      <div class="felder">
        <input ref="nameFeld" v-model="name" class="name" aria-label="Artikel" />
        <input v-model="quantity" class="anzahl" placeholder="Menge" aria-label="Menge" />
      </div>

      <select v-if="categories.length" v-model="categoryId" aria-label="Kategorie">
        <option v-for="k in categories" :key="k.id" :value="k.id">
          {{ k.emoji }} {{ k.label }}
        </option>
      </select>

      <!-- Woher die Kategorie kommt: erklärt schiefe Treffer, statt sie zu
           verstecken. Selbst gesetzte Kategorien brauchen keine Erklärung. -->
      <p v-if="categories.length && (item.matchedName || !item.matched)" class="herkunft">
        <template v-if="item.matchedName">
          Im Katalog erkannt als <strong>{{ item.matchedName }}</strong>
        </template>
        <template v-else>Nicht im Katalog gefunden</template>
      </p>

      <button
        v-if="categories.length"
        type="button"
        class="schalter"
        @click="aliasOffen = !aliasOffen"
      >
        {{ aliasOffen ? '– ' : '+ ' }}Schreibweise für ein anderes Wort
      </button>

      <div v-if="aliasOffen" class="alias">
        <p class="hinweis">
          „{{ item.name }}“ wird als weitere Schreibweise gemerkt und übernimmt dessen Kategorie.
        </p>
        <div v-if="vorschlaege.length" class="chips">
          <button
            v-for="v in vorschlaege"
            :key="v.name"
            type="button"
            class="chip"
            @click="alsSchreibweise(v.name)"
          >
            {{ v.name }}
          </button>
        </div>
        <div class="zeile-alias">
          <input
            v-model="aliasZiel"
            :list="`katalog-${item.id}`"
            placeholder="Artikel suchen …"
            aria-label="Artikel, zu dem das gehört"
          />
          <datalist :id="`katalog-${item.id}`">
            <option v-for="n in catalogNames" :key="n" :value="n" />
          </datalist>
          <button
            type="button"
            class="ok"
            :disabled="!aliasZiel"
            @click="alsSchreibweise(aliasZiel)"
          >
            Merken
          </button>
        </div>
      </div>

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

.griff {
  flex-shrink: 0;
  margin: -0.2rem -0.3rem -0.2rem -0.2rem;
  padding: 0.4rem 0.35rem;
  color: color-mix(in srgb, var(--muted) 55%, transparent);
  font-size: 1.05rem;
  line-height: 1;
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.griff:active {
  cursor: grabbing;
}

.haken {
  display: inline-flex;
  flex-shrink: 0;
  padding: 0.15rem;
  border: none;
  background: transparent;
  cursor: pointer;
}

.box {
  display: block;
  width: 1.4rem;
  height: 1.4rem;
  border: 2px solid color-mix(in srgb, var(--muted) 45%, transparent);
  border-radius: 999px;
  transition: background 0.15s ease;
}

.box.an {
  border-color: var(--green);
  background: var(--green)
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E")
    center / 0.9rem no-repeat;
}

.haken:focus-visible .box {
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
  /* „anywhere“ erlaubt dem Layout, den Namen auf einen Buchstaben pro Zeile
     zu quetschen. „break-word“ bricht nur, wenn ein Wort allein zu lang ist. */
  overflow-wrap: break-word;
  cursor: pointer;
}

.badge {
  margin-left: 0.25rem;
  color: var(--amber);
  font-size: 0.9rem;
}

.menge {
  /* Zusammengelegte Mengen können lang werden („950 ml + 2 l + nach Bedarf“).
     Sie dürfen dann umbrechen, aber nie mehr als die halbe Zeile nehmen –
     sonst bleibt für den Namen nichts übrig. */
  flex: 0 1 auto;
  max-width: 45%;
  padding: 0.15rem 0.5rem;
  border: 1px solid var(--line);
  border-radius: 0.5rem;
  color: var(--muted);
  font-size: 0.8rem;
  line-height: 1.35;
  font-variant-numeric: tabular-nums;
  overflow-wrap: break-word;
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

.aktiv {
  background: color-mix(in srgb, var(--violet) 5%, transparent);
}

.bearbeiten {
  display: grid;
  gap: 0.5rem;
  padding: 0.7rem 0.9rem 0.8rem;
}

.felder {
  display: flex;
  gap: 0.4rem;
}

.bearbeiten input,
.bearbeiten select {
  min-width: 0;
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--line);
  border-radius: 0.6rem;
  background: white;
}

.felder .name {
  flex: 1;
}

.felder .anzahl {
  width: 6.9rem;
  flex-shrink: 0;
  text-align: center;
}

.schalter {
  justify-self: start;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--violet);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}

.alias {
  display: grid;
  gap: 0.5rem;
}

.hinweis,
.herkunft {
  margin: 0;
  color: var(--muted);
  font-size: 0.78rem;
  line-height: 1.4;
}

.herkunft strong {
  color: var(--text);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.chip {
  padding: 0.3rem 0.65rem;
  border: 1px solid color-mix(in srgb, var(--violet) 30%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--violet) 8%, white);
  color: var(--violet);
  font-size: 0.82rem;
  cursor: pointer;
}

.zeile-alias {
  display: flex;
  gap: 0.5rem;
}

.zeile-alias input {
  flex: 1;
}

.knoepfe {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.ab,
.ok {
  flex-shrink: 0;
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

.ok:disabled {
  background: color-mix(in srgb, var(--muted) 25%, white);
  color: var(--muted);
  cursor: default;
}
</style>
