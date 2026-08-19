<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, onUpdated, ref, useTemplateRef } from 'vue'
import Sortable from 'sortablejs'
import { useEinkaufStore } from '@/composables/useEinkaufStore'
import { vervollstaendige } from '@/utils/matching'
import ArtikelZeile from '@/components/ArtikelZeile.vue'
import RezeptFenster from '@/components/RezeptFenster.vue'
import LadenFenster from '@/components/LadenFenster.vue'

const store = useEinkaufStore()

const menge = ref('')
const name = ref('')
const rezepteOffen = ref(false)
const ladenOffen = ref(false)
const nameFeld = useTemplateRef<HTMLInputElement>('nameFeld')

const liste = computed(() => store.activeList.value)
const gruppen = computed(() => (liste.value ? store.groupsFor(liste.value) : []))
const flach = computed(() => (liste.value ? store.flatItems(liste.value) : []))
// Ohne Kategorie-Überschriften: eine Reihe, weiter in Laden-Reihenfolge
const kompaktListe = computed(() => (liste.value ? store.compactItems(liste.value) : []))
const mitKategorien = computed(() => liste.value?.type === 'kategorisiert' && !store.kompakt.value)
const offen = computed(() => liste.value?.items.filter((i) => !i.done).length ?? 0)
const erledigt = computed(() => liste.value?.items.filter((i) => i.done).length ?? 0)

function eintragen(artikel: string) {
  if (!liste.value || !artikel.trim()) return
  store.addItem(liste.value, artikel, menge.value)
  name.value = ''
  menge.value = ''
  // Auf dem Handy bleibt die Tastatur so für den nächsten Artikel offen
  nextTick(() => nameFeld.value?.focus())
}

function hinzufuegen() {
  eintragen(name.value)
}

/**
 * Vorschläge aus dem Katalog, während getippt wird. Der Katalog liegt ohnehin
 * komplett im Browser – das kostet also keinen Request und spart auf dem Handy
 * die halbe Eingabe. Ein Tipp auf den Vorschlag trägt gleich ein: Der Umweg
 * über „Feld füllen, dann + drücken“ wäre genau ein Tipp zu viel.
 */
const vorschlaege = computed(() => vervollstaendige(name.value, store.state.catalog))

function haken(itemId: string, done: boolean) {
  if (liste.value) store.setDone(liste.value, itemId, done)
}

function entfernen(itemId: string) {
  if (liste.value) store.removeItem(liste.value, itemId)
}

/** Stepper an der Zeile: „noch eine Portion“ beim Planen. */
function mengeSetzen(itemId: string, neu: string) {
  if (liste.value) store.setQuantity(liste.value, itemId, neu)
}

/**
 * Korrektur aus der Zeile heraus. Eine geänderte Kategorie wandert immer auch
 * in den Katalog, damit derselbe Artikel beim nächsten Mal gleich richtig
 * landet – nacheinander, damit die zweite Antwort nicht die erste überholt.
 */
async function speichern(
  itemId: string,
  changes: { name: string; quantity: string; categoryId?: string; merken?: boolean },
) {
  if (!liste.value) return
  const { merken, ...rest } = changes
  await store.updateItem(liste.value, itemId, rest)
  // Nur eine von Hand gewählte Kategorie ist etwas Neues für den Katalog
  if (merken && rest.categoryId) await store.assignCategory(rest.name, rest.categoryId)
}

/** „Das ist eigentlich …“: der Name wird Schreibweise eines Katalogartikels. */
function schreibweise(name: string, artikel: string) {
  store.addAlias(artikel, name)
}

// Nur kategorisierte Listen dürfen umsortiert werden
const kategorienZurAuswahl = computed(() =>
  liste.value?.type === 'kategorisiert' ? store.state.categories : [],
)

// Während des Einkaufs steht unten „Einkauf beenden“, sonst „Einkauf starten“.
const einkaufLaeuft = computed(() => liste.value?.shopping === true)

/**
 * Los geht es mit der Frage, in welchem Laden – danach richtet sich die
 * Reihenfolge der Kategorien. Flache Listen kennen keine Märkte, dort wäre die
 * Frage nur ein Tipp zu viel.
 */
function einkaufStarten() {
  if (!liste.value) return
  if (liste.value.type !== 'kategorisiert') store.startShopping(liste.value, null)
  else ladenOffen.value = true
}

function einkaufBeenden() {
  if (liste.value) store.finishShopping(liste.value)
}

// Flache Listen lassen sich von Hand sortieren: angefasst wird nur der Griff.
const flacheListe = useTemplateRef<HTMLElement>('flacheListe')
const ziehend = ref(false)
let sortable: Sortable | undefined

function buildSortable() {
  sortable?.destroy()
  sortable = undefined
  if (!flacheListe.value || liste.value?.type !== 'flach') return
  sortable = new Sortable(flacheListe.value, {
    draggable: '.zeile',
    handle: '.griff',
    animation: 150,
    onStart: () => (ziehend.value = true),
    onEnd: (evt) => {
      ziehend.value = false
      // SortableJS hat den Knoten selbst verschoben – zurücksetzen und Vue neu
      // zeichnen lassen, damit DOM und Zustand nicht auseinanderlaufen.
      evt.from.insertBefore(evt.item, evt.from.children[evt.oldIndex ?? 0] ?? null)
      if (liste.value && evt.oldIndex != null && evt.newIndex != null) {
        store.moveItem(liste.value, evt.oldIndex, evt.newIndex)
      }
    },
  })
}

onUpdated(() => {
  if (!ziehend.value) buildSortable()
})

onBeforeUnmount(() => {
  sortable?.destroy()
  sortable = undefined
})

// Die Kategorie-Überschriften kleben unter der Kopfzeile aus Tabs und
// Eingabezeile – deren Höhe wächst mit der Zahl der Listen, also gemessen
// statt geraten.
const kopf = useTemplateRef<HTMLElement>('kopf')
const kopfHoehe = ref(0)
let beobachter: ResizeObserver | undefined

onMounted(() => {
  buildSortable()
  if (!kopf.value || typeof ResizeObserver === 'undefined') return
  beobachter = new ResizeObserver(([eintrag]) => {
    kopfHoehe.value = eintrag?.contentRect.height ?? 0
  })
  beobachter.observe(kopf.value)
})

onBeforeUnmount(() => beobachter?.disconnect())
</script>

<template>
  <div class="seite" :style="{ '--kopf-hoehe': `${kopfHoehe}px` }">
    <div ref="kopf" class="kopf">
      <nav class="tabs">
        <button
          v-for="(l, index) in store.state.lists"
          :key="l.id"
          type="button"
          class="tab"
          :class="{ aktiv: l.id === liste?.id }"
          :style="{ '--farbe': ['var(--violet)', 'var(--cyan)', 'var(--amber)'][index % 3] }"
          @click="store.selectList(l.id)"
        >
          <span class="punkt" aria-hidden="true"></span>
          {{ l.name }}
        </button>
      </nav>

      <form class="eingabe" @submit.prevent="hinzufuegen">
        <input
          v-model="menge"
          class="menge"
          placeholder="Menge"
          aria-label="Menge (optional)"
          enterkeyhint="done"
        />
        <input
          ref="nameFeld"
          v-model="name"
          class="artikel"
          placeholder="Artikel hinzufügen …"
          aria-label="Artikel"
          enterkeyhint="done"
        />
        <button type="submit" class="plus" title="Hinzufügen">+</button>
      </form>

      <!-- Was der Katalog zum Angetippten kennt: ein Tipp trägt es ein -->
      <div v-if="vorschlaege.length" class="vorschlaege">
        <button
          v-for="v in vorschlaege"
          :key="v"
          type="button"
          class="vorschlag"
          @click="eintragen(v)"
        >
          {{ v }}
        </button>
      </div>

      <!-- Ganze Rezepte kommen über ein eigenes Fenster dazu -->
      <button
        v-if="liste?.type === 'kategorisiert'"
        type="button"
        class="rezepte"
        @click="rezepteOffen = true"
      >
        🍲 Rezept zum Einkauf hinzufügen
      </button>
    </div>

    <RezeptFenster v-if="rezepteOffen && liste" :list="liste" @close="rezepteOffen = false" />

    <LadenFenster v-if="ladenOffen && liste" :list="liste" @close="ladenOffen = false" />

    <p v-if="!liste" class="leer">Noch keine Liste vorhanden – anlegen in der Verwaltung.</p>

    <p v-else-if="!liste.items.length" class="leer">
      {{ liste.name }} ist leer. Oben eintragen, was mit soll.
    </p>

    <!-- Kategorisiert: Gruppen in Laden-Reihenfolge, Überschrift bleibt kleben -->
    <template v-else-if="mitKategorien">
      <section v-for="gruppe in gruppen" :key="gruppe.category.id" class="gruppe">
        <h2 class="kategorie">
          <span aria-hidden="true">{{ gruppe.category.emoji }}</span>
          {{ gruppe.category.label }}
        </h2>
        <ul class="artikel-liste card">
          <ArtikelZeile
            v-for="item in gruppe.items"
            :key="item.id"
            :item="item"
            :categories="kategorienZurAuswahl"
            :catalog="store.state.catalog"
            :catalog-names="store.catalogNames.value"
            @check="haken(item.id, $event)"
            @remove="entfernen(item.id)"
            @save="speichern(item.id, $event)"
            @alias="schreibweise(item.name, $event)"
            @menge="mengeSetzen(item.id, $event)"
          />
        </ul>
      </section>
    </template>

    <!-- Flach oder kompakt: eine Reihe ohne Kategorie-Überbau -->
    <ul v-else ref="flacheListe" class="artikel-liste card einzeln">
      <ArtikelZeile
        v-for="item in liste.type === 'kategorisiert' ? kompaktListe : flach"
        :key="item.id"
        :item="item"
        :sortierbar="liste.type === 'flach' && !item.done"
        :categories="kategorienZurAuswahl"
        :catalog="store.state.catalog"
        :catalog-names="store.catalogNames.value"
        @check="haken(item.id, $event)"
        @remove="entfernen(item.id)"
        @save="speichern(item.id, $event)"
        @alias="schreibweise(item.name, $event)"
        @menge="mengeSetzen(item.id, $event)"
      />
    </ul>

    <footer v-if="liste" class="fuss">
      <span class="zaehler">
        {{ offen }} übrig · {{ erledigt }} erledigt
        <!-- Ohne Netz gesetzte Haken: gelten hier schon, gehen raus sobald es geht -->
        <span
          v-if="store.offeneHaken.value"
          class="wartet"
          title="Haken warten auf die Verbindung"
          @click="store.flushOutbox()"
        >
          · {{ store.offeneHaken.value }} ⟳
        </span>
      </span>
      <button
        v-if="liste.type === 'kategorisiert'"
        type="button"
        class="kompakt"
        :class="{ an: store.kompakt.value }"
        :title="store.kompakt.value ? 'Kategorien einblenden' : 'Kategorien ausblenden'"
        :aria-pressed="store.kompakt.value"
        @click="store.toggleKompakt()"
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <button v-if="!einkaufLaeuft" type="button" class="starten" @click="einkaufStarten">
        Einkauf starten
      </button>
      <!-- Läuft der Einkauf, geht der Knopf immer: ohne Haken beendet er ihn nur -->
      <button v-else type="button" class="beenden" @click="einkaufBeenden">Einkauf beenden</button>
    </footer>
  </div>
</template>

<style scoped>
.seite {
  padding-bottom: 1rem;
}

.kopf {
  position: sticky;
  top: 0;
  z-index: 5;
  padding: 0.6rem 0 0.5rem;
  background: linear-gradient(var(--bg) 78%, transparent);
}

.tabs {
  display: flex;
  gap: 0.35rem;
  overflow-x: auto;
  scrollbar-width: none;
  padding-bottom: 0.15rem;
}

.tabs::-webkit-scrollbar {
  display: none;
}

.tab {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
  padding: 0.4rem 0.8rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--card);
  color: var(--muted);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.punkt {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 999px;
  background: var(--farbe);
}

.tab.aktiv {
  border-color: color-mix(in srgb, var(--farbe) 45%, transparent);
  background: color-mix(in srgb, var(--farbe) 10%, white);
  color: var(--text);
}

.eingabe {
  display: flex;
  gap: 0.4rem;
  margin-top: 0.5rem;
}

.eingabe input {
  padding: 0.7rem 0.8rem;
  border: 1px solid var(--line);
  border-radius: 0.8rem;
  background: white;
  box-shadow: var(--shadow);
}

.menge {
  width: 6.9rem;
  flex-shrink: 0;
  text-align: center;
}

.artikel {
  flex: 1;
  min-width: 0;
}

.plus {
  flex-shrink: 0;
  width: 3rem;
  border: 1px solid color-mix(in srgb, var(--violet) 35%, transparent);
  border-radius: 0.8rem;
  background: color-mix(in srgb, var(--violet) 12%, white);
  color: var(--violet);
  font-size: 1.4rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
}

/* Eine Reihe, die zur Seite scrollt: die Liste darunter soll nicht bei jedem
   Buchstaben um mehrere Zeilen springen. */
.vorschlaege {
  display: flex;
  gap: 0.35rem;
  margin-top: 0.4rem;
  overflow-x: auto;
  scrollbar-width: none;
  padding-bottom: 0.1rem;
}

.vorschlaege::-webkit-scrollbar {
  display: none;
}

.vorschlag {
  flex-shrink: 0;
  padding: 0.35rem 0.7rem;
  border: 1px solid color-mix(in srgb, var(--cyan) 30%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--cyan) 8%, white);
  color: var(--cyan);
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}

.rezepte {
  width: 100%;
  margin-top: 0.4rem;
  padding: 0.5rem;
  border: 1px dashed color-mix(in srgb, var(--violet) 35%, transparent);
  border-radius: 0.8rem;
  background: color-mix(in srgb, var(--violet) 6%, transparent);
  color: var(--violet);
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
}

.gruppe {
  margin-top: 0.9rem;
}

.kategorie {
  position: sticky;
  top: var(--kopf-hoehe);
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  padding: 0.35rem 0.3rem;
  background: linear-gradient(var(--bg) 75%, transparent);
  color: var(--muted);
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.artikel-liste {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow: hidden;
}

.artikel-liste :deep(.zeile:first-child) {
  border-top: none;
}

.artikel-liste :deep(.sortable-ghost) {
  opacity: 0.4;
}

.artikel-liste :deep(.sortable-chosen) {
  background: color-mix(in srgb, var(--violet) 8%, transparent);
}

.einzeln {
  margin-top: 0.9rem;
}

.leer {
  margin: 2.5rem 0.4rem;
  color: var(--muted);
  text-align: center;
}

.fuss {
  position: sticky;
  bottom: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  margin-top: 1rem;
  padding: 0.6rem 0;
  padding-bottom: max(0.6rem, env(safe-area-inset-bottom));
  background: linear-gradient(transparent, var(--bg) 32%);
}

.zaehler {
  color: var(--muted);
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}

.wartet {
  color: var(--amber);
  cursor: pointer;
}

.kompakt {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.6rem;
  height: 2.6rem;
  margin-left: auto;
  flex-shrink: 0;
  border: 1px solid var(--line);
  border-radius: 0.9rem;
  background: var(--card);
  color: var(--muted);
  cursor: pointer;
}

.kompakt.an {
  border-color: color-mix(in srgb, var(--violet) 45%, transparent);
  background: color-mix(in srgb, var(--violet) 12%, white);
  color: var(--violet);
}

.beenden {
  padding: 0.7rem 1.1rem;
  border: none;
  border-radius: 0.9rem;
  background: var(--green);
  color: white;
  font-weight: 700;
  box-shadow: var(--shadow);
  cursor: pointer;
}

.starten {
  padding: 0.7rem 1.1rem;
  border: none;
  border-radius: 0.9rem;
  background: var(--violet);
  color: white;
  font-weight: 700;
  box-shadow: var(--shadow);
  cursor: pointer;
}
</style>
