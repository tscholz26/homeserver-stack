<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import type { Category, Item } from '@/composables/useEinkaufStore'
import { findCatalogMatch, suggestCatalogEntries, type CatalogEntry } from '@/utils/matching'
import { mengeStufen } from '@/utils/mengen'

const props = defineProps<{
  item: Item
  /** Leer bei flachen Listen: dort gibt es nichts umzusortieren. */
  categories: Category[]
  catalog: CatalogEntry[]
  catalogNames: string[]
  /** Flache Listen lassen sich von Hand sortieren – dann gibt es einen Griff. */
  sortierbar?: boolean
  /** Gerichte, für die der Artikel auf der Liste steht – meist keine */
  gerichte?: string[]
}>()

const emit = defineEmits<{
  check: [done: boolean]
  remove: []
  save: [changes: { name: string; quantity: string; categoryId?: string; merken?: boolean }]
  alias: [artikel: string]
  menge: [neu: string]
}>()

// ── Eine Portion mehr ────────────────────────────────────────────────────────
// Beim Planen fällt auf, dass die Cherrytomaten für zwei Gerichte reichen
// müssen. Ein Tipp auf + soll das erledigen, ohne die Zeile aufzuklappen.
//
// Die Basis ist die Menge, die vor dem ersten Tipp dastand: nur so bleibt der
// Schritt über mehrere Tipps gleich groß (250 → 500 → 750) und ein − landet
// wieder genau am Ausgangspunkt. Sie lebt nur in dieser Zeile – nach einem
// Neuladen ist die Menge, die dann dasteht, die neue Portion.
const basis = ref('')

function portion() {
  if (!basis.value) basis.value = props.item.quantity.trim() || '1'
  return basis.value
}

/** Ohne rechenbare Angabe („nach Geschmack“) gibt es keine Knöpfe. */
const stufbar = computed(
  () => mengeStufen(props.item.quantity, props.item.quantity.trim() || '1', 1) !== null,
)

/** Bei einer einzelnen Portion führt − nirgendwohin und bleibt weg. */
const kannRunter = computed(() => {
  if (!props.item.quantity.trim()) return false
  return (
    mengeStufen(props.item.quantity, basis.value || props.item.quantity, -1) !== props.item.quantity
  )
})

function stufen(richtung: 1 | -1) {
  const neu = mengeStufen(props.item.quantity, portion(), richtung)
  if (neu !== null && neu !== props.item.quantity) emit('menge', neu)
}

const offen = ref(false)

// ── Wofür steht das hier? ─────────────────────────────────────────────────────
// Gehört der Artikel zu Gerichten, zeigt ein Tipp auf den Namen, zu welchen;
// ein zweiter Tipp blendet es wieder aus. Bearbeitet wird dann über den Knopf
// in dieser Zeile oder über die Menge. Ohne Gerichte klappt der Tipp wie
// bisher gleich die Bearbeitung auf.
const fuerOffen = ref(false)
const gerichte = computed(() => props.gerichte ?? [])

function tippAufName() {
  if (gerichte.value.length) fuerOffen.value = !fuerOffen.value
  else oeffnen()
}

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
  fuerOffen.value = false
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
      <span v-if="sortierbar" class="griff" title="Verschieben"><AppIcon name="griff" /></span>

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

      <button
        type="button"
        class="text"
        :aria-expanded="gerichte.length ? fuerOffen : undefined"
        @click="tippAufName"
      >
        {{ item.name }}
        <!-- Nicht im Katalog gefunden: unten zuordenbar -->
        <span v-if="!item.matched" class="badge" title="Nicht zugeordnet">◌</span>
        <!-- Gehört zu einem Gericht: ein Tipp verrät, zu welchem -->
        <span
          v-if="gerichte.length"
          class="gericht-marke"
          :title="`Für ${gerichte.length === 1 ? 'ein Gericht' : `${gerichte.length} Gerichte`}`"
        >
          🍲<sup v-if="gerichte.length > 1">{{ gerichte.length }}</sup>
        </span>
      </button>

      <!-- Menge, Stepper und Entfernen sind ein Bedienfeld: − 250 g + │ ×.
           Ohne Angabe bleibt vom Stepper nur das +, das aus der stillen Eins
           eine Zwei macht. -->
      <div class="leiste">
        <div
          v-if="stufbar && !item.done"
          class="stepper"
          :class="{ leer: !item.quantity, 'ohne-minus': !kannRunter }"
        >
          <button
            v-if="kannRunter"
            type="button"
            class="stufe"
            :aria-label="`Weniger ${item.name}`"
            @click="stufen(-1)"
          >
            <AppIcon name="minus" :groesse="16" />
          </button>
          <!-- Die Zahl selbst gehört zum Artikel, nicht zum Stepper: ein Tipp
             darauf klappt genau wie der Name die Bearbeitung auf. -->
          <button v-if="item.quantity" type="button" class="menge" @click="oeffnen">
            {{ item.quantity }}
          </button>
          <button
            type="button"
            class="stufe"
            :aria-label="`Mehr ${item.name}`"
            title="Eine Portion mehr"
            @click="stufen(1)"
          >
            <AppIcon name="plus" :groesse="16" />
          </button>
        </div>
        <button v-else-if="item.quantity" type="button" class="menge" @click="oeffnen">
          {{ item.quantity }}
        </button>

        <span class="trenner" aria-hidden="true"></span>
        <button type="button" class="weg" title="Artikel entfernen" @click="emit('remove')">
          <AppIcon name="kreuz" :groesse="16" />
        </button>
      </div>
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

    <!-- Steht außerhalb von v-if/v-else der Zeile: sonst hinge das v-else der
         Bearbeitung an dieser Bedingung statt an der Zeile -->
    <div v-if="!offen && fuerOffen && gerichte.length" class="fuer">
      <span class="fuer-text">
        für
        <template v-for="(g, index) in gerichte" :key="index">
          <strong>{{ g }}</strong
          ><template v-if="index < gerichte.length - 1"> · </template>
        </template>
      </span>
      <button type="button" class="schalter" @click="oeffnen">Bearbeiten</button>
    </div>
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
  display: inline-flex;
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

.gericht-marke {
  margin-left: 0.3rem;
  font-size: 0.78rem;
  opacity: 0.75;
}

.gericht-marke sup {
  margin-left: 0.05rem;
  color: var(--muted);
  font-size: 0.68rem;
  font-weight: 700;
}

/* Unter der Zeile, eingerückt bis zum Namen: gehört sichtbar zu diesem Artikel */
.fuer {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  margin-top: -0.3rem;
  padding: 0 0.9rem 0.6rem 3.05rem;
  color: var(--muted);
  font-size: 0.82rem;
  line-height: 1.4;
}

.fuer-text {
  flex: 1;
  min-width: 0;
  overflow-wrap: break-word;
}

.fuer strong {
  color: var(--text);
  font-weight: 600;
}

.fuer .schalter {
  flex-shrink: 0;
}

.erledigt .fuer {
  opacity: 0.6;
}

/* Menge, Knöpfe und Entfernen sind ein Bedienfeld: ein Rahmen um alles,
   ein Strich vor dem ×. So steht in jeder Zeile genau ein Element rechts. */
.leiste {
  display: flex;
  align-items: center;
  flex: 0 1 auto;
  min-width: 0;
  max-width: 55%;
  border: 1px solid var(--line);
  border-radius: 1.1rem;
  background: var(--card);
}

.stepper {
  display: flex;
  align-items: center;
  flex: 0 1 auto;
  min-width: 0;
}

.trenner {
  flex-shrink: 0;
  width: 1px;
  height: 1.2rem;
  background: var(--line);
}

.stufe {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  /* Genug Fläche zum Treffen, ohne die Zeile höher zu machen */
  width: 1.9rem;
  height: 1.9rem;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--violet);
  cursor: pointer;
}

.stepper .menge {
  padding: 0.15rem 0.15rem;
  text-align: center;
}

/* Ohne − klebt die Zahl sonst am Rahmen, während das + seine 2 rem breit ist
   und mitten darin sitzt: links muss dieselbe Luft nachwachsen. */
.stepper.ohne-minus .menge {
  padding-left: 0.65rem;
}

.menge {
  /* Zusammengelegte Mengen können lang werden („950 ml + 2 l + nach Bedarf“).
     Sie dürfen dann umbrechen, aber nie mehr als die halbe Zeile nehmen –
     sonst bleibt für den Namen nichts übrig. */
  flex: 0 1 auto;
  min-width: 0;
  padding: 0.15rem 0.5rem;
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 0.8rem;
  line-height: 1.35;
  font-variant-numeric: tabular-nums;
  /* Umbrochen wird nur an Leerzeichen – „150-200g“ soll nicht mitten in der
     Zahl zerfallen */
  overflow-wrap: normal;
  cursor: pointer;
}

.weg {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 1.9rem;
  height: 1.9rem;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: color-mix(in srgb, var(--muted) 75%, transparent);
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
