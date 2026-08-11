<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import { useEinkaufStore, type ListType } from '@/composables/useEinkaufStore'
import ArtikelZeile from '@/components/ArtikelZeile.vue'

const store = useEinkaufStore()

const menge = ref('')
const name = ref('')
const nameFeld = useTemplateRef<HTMLInputElement>('nameFeld')

const neueListeOffen = ref(false)
const neuerName = ref('')
const neuerTyp = ref<ListType>('kategorisiert')

const liste = computed(() => store.activeList.value)
const gruppen = computed(() => (liste.value ? store.groupsFor(liste.value) : []))
const flach = computed(() => (liste.value ? store.flatItems(liste.value) : []))
const offen = computed(() => liste.value?.items.filter((i) => !i.done).length ?? 0)
const erledigt = computed(() => liste.value?.items.filter((i) => i.done).length ?? 0)

function hinzufuegen() {
  if (!liste.value || !name.value.trim()) return
  store.addItem(liste.value, name.value, menge.value)
  name.value = ''
  menge.value = ''
  // Auf dem Handy bleibt die Tastatur so für den nächsten Artikel offen
  nextTick(() => nameFeld.value?.focus())
}

function haken(itemId: string, done: boolean) {
  if (liste.value) store.setDone(liste.value, itemId, done)
}

function entfernen(itemId: string) {
  if (liste.value) store.removeItem(liste.value, itemId)
}

/**
 * Korrektur aus der Zeile heraus. „Merken“ schreibt die Kategorie zusätzlich in
 * den Katalog, damit derselbe Artikel beim nächsten Mal gleich richtig landet –
 * nacheinander, damit die zweite Antwort nicht die erste überholt.
 */
async function speichern(
  itemId: string,
  changes: { name: string; categoryId?: string },
  merken: boolean,
) {
  if (!liste.value) return
  await store.updateItem(liste.value, itemId, changes)
  if (merken && changes.categoryId) await store.assignCategory(changes.name, changes.categoryId)
}

// Nur kategorisierte Listen dürfen umsortiert werden
const kategorienZurAuswahl = computed(() =>
  liste.value?.type === 'kategorisiert' ? store.state.categories : [],
)

function einkaufBeenden() {
  if (liste.value) store.finishShopping(liste.value)
}

function listeAnlegen() {
  if (!neuerName.value.trim()) return
  store.addList(neuerName.value, neuerTyp.value)
  neuerName.value = ''
  neuerTyp.value = 'kategorisiert'
  neueListeOffen.value = false
}

// Die Kategorie-Überschriften kleben unter der Kopfzeile aus Tabs und
// Eingabezeile – deren Höhe wächst mit der Zahl der Listen, also gemessen
// statt geraten.
const kopf = useTemplateRef<HTMLElement>('kopf')
const kopfHoehe = ref(0)
let beobachter: ResizeObserver | undefined

onMounted(() => {
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
        <button type="button" class="tab neu" @click="neueListeOffen = !neueListeOffen">
          + Liste
        </button>
      </nav>

      <form v-if="neueListeOffen" class="neue-liste card" @submit.prevent="listeAnlegen">
        <input v-model="neuerName" placeholder="Name der Liste" aria-label="Name der Liste" />
        <div class="typen">
          <label>
            <input v-model="neuerTyp" type="radio" value="kategorisiert" />
            nach Kategorien
          </label>
          <label>
            <input v-model="neuerTyp" type="radio" value="flach" />
            einfache Liste
          </label>
        </div>
        <button type="submit" class="anlegen">Anlegen</button>
      </form>

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
    </div>

    <p v-if="!liste" class="leer">Noch keine Liste vorhanden – oben mit „+ Liste“ eine anlegen.</p>

    <p v-else-if="!liste.items.length" class="leer">
      {{ liste.name }} ist leer. Oben eintragen, was mit soll.
    </p>

    <!-- Kategorisiert: Gruppen in Laden-Reihenfolge, Überschrift bleibt kleben -->
    <template v-else-if="liste.type === 'kategorisiert'">
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
            @check="haken(item.id, $event)"
            @remove="entfernen(item.id)"
            @save="(changes, merken) => speichern(item.id, changes, merken)"
          />
        </ul>
      </section>
    </template>

    <!-- Flach: eine Reihe ohne Kategorie-Überbau -->
    <ul v-else class="artikel-liste card einzeln">
      <ArtikelZeile
        v-for="item in flach"
        :key="item.id"
        :item="item"
        :categories="kategorienZurAuswahl"
        @check="haken(item.id, $event)"
        @remove="entfernen(item.id)"
        @save="(changes, merken) => speichern(item.id, changes, merken)"
      />
    </ul>

    <footer v-if="liste" class="fuss">
      <span class="zaehler">{{ offen }} übrig · {{ erledigt }} erledigt</span>
      <button type="button" class="beenden" :disabled="!erledigt" @click="einkaufBeenden">
        Einkauf beenden
      </button>
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

.tab.neu {
  border-style: dashed;
}

.neue-liste {
  display: grid;
  gap: 0.5rem;
  margin-top: 0.5rem;
  padding: 0.7rem;
}

.neue-liste input[type='text'],
.neue-liste input:not([type]) {
  padding: 0.55rem 0.7rem;
  border: 1px solid var(--line);
  border-radius: 0.6rem;
  background: white;
}

.typen {
  display: flex;
  gap: 0.9rem;
  color: var(--muted);
  font-size: 0.85rem;
}

.typen label {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.anlegen {
  padding: 0.55rem;
  border: none;
  border-radius: 0.6rem;
  background: var(--violet);
  color: white;
  font-weight: 700;
  cursor: pointer;
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
  width: 4.6rem;
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

.beenden:disabled {
  background: color-mix(in srgb, var(--muted) 25%, white);
  color: var(--muted);
  box-shadow: none;
  cursor: default;
}
</style>
