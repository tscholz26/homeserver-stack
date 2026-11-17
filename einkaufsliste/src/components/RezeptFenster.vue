<script setup lang="ts">
import { computed, onBeforeUnmount, onUpdated, reactive, ref, useTemplateRef, watch } from 'vue'
import Sortable from 'sortablejs'
import {
  useEinkaufStore,
  type List,
  type Recipe,
  type RecipeIngredient,
} from '@/composables/useEinkaufStore'
import HaltbarkeitWahl from '@/components/HaltbarkeitWahl.vue'
import KategorienWahl from '@/components/KategorienWahl.vue'
import NotizText from '@/components/NotizText.vue'
import { planeRezept, zerlegeKategorie } from '@/utils/rezept'
import { HALTBARKEITEN, haltbarkeitInfo, type Haltbarkeit } from '@/utils/haltbarkeit'
import { nachZuletzt, wieLangeHer } from '@/utils/zuletzt'
import { mengeZusammenfassen } from '@/utils/mengen'

const props = defineProps<{
  /** Liste, auf die die Zutaten wandern – null, wenn es keine mit Kategorien gibt */
  list: List | null
  /** Als Seite statt als Fenster: das Rezeptbuch zum Nachschlagen und Pflegen */
  eingebettet?: boolean
  /** Nur auf der Seite: das aufgeschlagene Rezept, wie es in der Adresse steht */
  rezeptId?: string | null
}>()
const emit = defineEmits<{ close: []; zeige: [rezeptId: string | null] }>()

const store = useEinkaufStore()

type Modus = 'auswahl' | 'ansehen' | 'einkauf' | 'bearbeiten'
const modus = ref<Modus>('auswahl')
// Gemerkt wird die id: nach jeder Änderung schickt der Server den ganzen Stand
// neu, ein festgehaltenes Rezept-Objekt wäre dann das von vorhin.
const aktivId = ref<string | null>(null)
const aktiv = computed(() => store.state.recipes.find((r) => r.id === aktivId.value) ?? null)
// Kurze Rückmeldung auf der Seite – das Fenster schließt sich stattdessen
const meldung = ref('')

// Auf dem anderen Gerät gelöscht: dann gibt es nichts mehr anzusehen
watch(aktiv, (rezept) => {
  if (rezept || (modus.value !== 'ansehen' && modus.value !== 'einkauf')) return
  modus.value = 'auswahl'
  if (props.eingebettet) emit('zeige', null)
})

// Auf der Seite bestimmt die Adresse, welches Rezept aufgeschlagen ist
watch(
  () => props.rezeptId,
  (id) => {
    if (!props.eingebettet) return
    const gibtEs = Boolean(id) && store.state.recipes.some((r) => r.id === id)
    aktivId.value = gibtEs ? id! : null
    modus.value = gibtEs ? 'ansehen' : 'auswahl'
  },
  { immediate: true },
)

const aktivGruppen = computed(() =>
  store.state.recipeGroups.filter((g) => aktiv.value?.groups.includes(g.id)),
)
const suche = ref('')
// Im Verwaltungsmodus wird sortiert und gelöscht statt eingekauft
const verwalten = ref(false)

// ── Schritt 1: welches Rezept? ────────────────────────────────────────────────
// Frisch oder Vorrat als Filter: beim Planen der Woche will man oft genau
// eines davon. „Offen“ hilft beim Einsortieren und taucht nur auf, solange es
// Rezepte ohne Angabe gibt.
type Filter = 'alle' | Haltbarkeit
const filter = ref<Filter>('alle')

const filterWahl = computed(() => {
  const zahl = (h: Haltbarkeit) => store.state.recipes.filter((r) => r.haltbarkeit === h).length
  const wahl: { id: Filter; label: string; anzahl: number }[] = [
    { id: 'alle', label: 'Alle', anzahl: store.state.recipes.length },
    ...HALTBARKEITEN.map((h) => ({ id: h.id, label: `${h.emoji} ${h.label}`, anzahl: zahl(h.id) })),
  ]
  if (zahl('') > 0 || filter.value === '') wahl.push({ id: '', label: 'Offen', anzahl: zahl('') })
  return wahl
})

// Ziehen geht nur über das ganze Rezeptbuch: gefiltert passen die Plätze in
// der Anzeige nicht zu denen im Buch
const ungefiltert = computed(() => !suche.value.trim() && filter.value === 'alle')

// Innerhalb jeder Kategorie steht oben, was am längsten nicht auf der Liste
// war – beim Planen der Woche fällt der Blick so zuerst auf das, was man
// vergessen hätte. Beim Ordnen gilt die Reihenfolge des Rezeptbuchs, sonst
// würde das Ziehen am Griff nichts sichtbar ändern. Leere Kategorien zeigt
// nur das Ordnen – dort lassen sie sich umbenennen oder löschen.
const gruppen = computed(() => {
  const q = suche.value.trim().toLowerCase()
  return store.state.recipeGroups
    .map((group) => {
      const passend = store.state.recipes.filter(
        (r) =>
          r.groups.includes(group.id) &&
          (!q || r.name.toLowerCase().includes(q)) &&
          (filter.value === 'alle' || r.haltbarkeit === filter.value),
      )
      return {
        group,
        recipes: verwalten.value ? passend : nachZuletzt(passend, store.state.zuletzt),
      }
    })
    .filter((g) => g.recipes.length > 0 || (verwalten.value && ungefiltert.value))
})

function zuletztText(rezeptId: string) {
  const wann = store.state.zuletzt[rezeptId]
  return wann ? `zuletzt ${wieLangeHer(wann)}` : ''
}

// ── Schritt 2: was davon soll auf die Liste? ──────────────────────────────────
interface Zeile {
  name: string
  menge: string
  categoryId: string
  matchedName: string
  vorhandenId: string | null
  vorhandenMenge: string
  mit: boolean
  getrennt: boolean
}

const zeilen = ref<Zeile[]>([])

/** Im Fenster geht es gleich an die Zutaten, auf der Seite erst zum Rezept. */
function waehle(rezept: Recipe) {
  meldung.value = ''
  if (props.eingebettet) emit('zeige', rezept.id)
  else oeffneEinkauf(rezept)
}

function oeffneEinkauf(rezept: Recipe) {
  if (!props.list) return
  aktivId.value = rezept.id
  zeilen.value = planeRezept(rezept.ingredients, props.list.items, store.state.catalog).map(
    (z) => ({
      name: z.name,
      menge: z.quantity,
      categoryId: z.categoryId,
      matchedName: z.matchedName,
      vorhandenId: z.vorhandenId,
      vorhandenMenge: z.vorhandenMenge,
      mit: true,
      getrennt: false,
    }),
  )
  modus.value = 'einkauf'
}

const anzahlMit = computed(() => zeilen.value.filter((z) => z.mit).length)

function vorschau(zeile: Zeile) {
  return mengeZusammenfassen(zeile.vorhandenMenge, zeile.menge)
}

async function hinzufuegen() {
  const gewaehlt = zeilen.value.filter((z) => z.mit)
  if (!props.list || !gewaehlt.length) return
  const rezeptName = aktiv.value?.name ?? ''
  const ok = await store.addRecipeToList(
    props.list,
    gewaehlt.map((z) => ({
      name: z.name,
      quantity: z.menge,
      categoryId: z.categoryId,
      matchedName: z.matchedName,
      mergeIn: z.getrennt ? null : z.vorhandenId,
    })),
    aktiv.value?.id,
  )
  if (!props.eingebettet) {
    emit('close')
    return
  }
  if (ok) {
    const anzahl = gewaehlt.length === 1 ? '1 Zutat steht' : `${gewaehlt.length} Zutaten stehen`
    meldung.value = `✓ ${anzahl} für „${rezeptName}“ auf „${props.list.name}“.`
  }
  zurAuswahl()
}

// ── Schritt 3: das Rezept selbst ──────────────────────────────────────────────
const entwurf = reactive<{
  id: string | null
  name: string
  groups: string[]
  haltbarkeit: Haltbarkeit
  notes: string
  zutaten: RecipeIngredient[]
}>({ id: null, name: '', groups: [], haltbarkeit: '', notes: '', zutaten: [] })

function bearbeiten(rezept: Recipe) {
  entwurf.id = rezept.id
  entwurf.name = rezept.name
  entwurf.groups = [...rezept.groups]
  entwurf.haltbarkeit = rezept.haltbarkeit
  entwurf.notes = rezept.notes
  entwurf.zutaten = rezept.ingredients.map((z) => ({ ...z }))
  aktivId.value = rezept.id
  modus.value = 'bearbeiten'
}

function neuesRezept() {
  entwurf.id = null
  entwurf.name = ''
  entwurf.groups = store.state.recipeGroups[0] ? [store.state.recipeGroups[0].id] : []
  entwurf.haltbarkeit = ''
  entwurf.notes = ''
  entwurf.zutaten = [{ name: '', quantity: '' }]
  aktivId.value = null
  meldung.value = ''
  modus.value = 'bearbeiten'
}

function zutatDazu() {
  entwurf.zutaten.push({ name: '', quantity: '' })
}

function zutatWeg(index: number) {
  entwurf.zutaten.splice(index, 1)
}

// Gezogen wird an zwei Stellen: die Zutaten eines Rezepts beim Bearbeiten und
// die Rezepte selbst im Verwaltungsmodus. Angefasst wird jeweils nur der Griff.
const zutatenListe = useTemplateRef<HTMLElement>('zutatenListe')
const gruppenListen = new Map<string, HTMLElement>()
const ziehend = ref(false)
let sortables: Sortable[] = []

function setGruppenListe(groupId: string, el: unknown) {
  if (el instanceof HTMLElement) gruppenListen.set(groupId, el)
  else gruppenListen.delete(groupId)
}

// SortableJS verschiebt den Knoten selbst; wir setzen ihn zurück und lassen Vue
// aus dem Zustand neu zeichnen, damit beides nicht auseinanderläuft.
function undoDomMove(evt: Sortable.SortableEvent) {
  evt.from.insertBefore(evt.item, evt.from.children[evt.oldIndex ?? 0] ?? null)
}

function buildSortables() {
  for (const s of sortables) s.destroy()
  sortables = []

  if (modus.value === 'bearbeiten' && zutatenListe.value) {
    sortables.push(
      new Sortable(zutatenListe.value, {
        draggable: '.zutat-zeile',
        handle: '.griff',
        animation: 150,
        onStart: () => (ziehend.value = true),
        onEnd: (evt) => {
          ziehend.value = false
          undoDomMove(evt)
          const { oldIndex, newIndex } = evt
          if (oldIndex == null || newIndex == null || oldIndex === newIndex) return
          const [raus] = entwurf.zutaten.splice(oldIndex, 1)
          if (raus) entwurf.zutaten.splice(newIndex, 0, raus)
        },
      }),
    )
  }

  if (modus.value === 'auswahl' && verwalten.value) {
    for (const [groupId, el] of gruppenListen) {
      sortables.push(
        new Sortable(el, {
          draggable: '.rezept-zeile',
          handle: '.griff',
          animation: 150,
          onStart: () => (ziehend.value = true),
          onEnd: (evt) => {
            ziehend.value = false
            undoDomMove(evt)
            if (evt.oldIndex != null && evt.newIndex != null) {
              store.moveRecipe(groupId, evt.oldIndex, evt.newIndex)
            }
          },
        }),
      )
    }
  }
}

onUpdated(() => {
  if (!ziehend.value) buildSortables()
})

onBeforeUnmount(() => {
  for (const s of sortables) s.destroy()
  sortables = []
})

async function rezeptSpeichern() {
  const name = entwurf.name.trim()
  if (!name) return
  const zutaten = entwurf.zutaten
    .map((z) => ({ name: z.name.trim(), quantity: z.quantity.trim() }))
    .filter((z) => z.name)

  const rezept = {
    name,
    groups: entwurf.groups,
    haltbarkeit: entwurf.haltbarkeit,
    notes: entwurf.notes.trim(),
    ingredients: zutaten,
  }
  const ok = entwurf.id ? await store.saveRecipe(entwurf.id, rezept) : await store.addRecipe(rezept)
  if (ok !== true) return
  // Auf der Seite zurück zum Rezept, das gerade geändert wurde
  modus.value = props.eingebettet && entwurf.id ? 'ansehen' : 'auswahl'
}

// ── Kategorien ────────────────────────────────────────────────────────────────
// Ein Rezept steht in einer oder mehreren Kategorien. Angelegt wird direkt aus
// jeder Kategorie-Auswahl heraus („＋ Kategorie hinzufügen …“), umbenannt und
// gelöscht über den Stift an der Überschrift.

/** Fragt nach dem Namen, legt an und gibt die id zurück – null bei Abbruch. */
async function kategorieAnlegen(): Promise<string | null> {
  const eingabe = prompt(
    'Name der neuen Kategorie (ein Emoji vorne wird ihr Zeichen, z. B. „🌮 Mexikanisch“):',
  )
  if (!eingabe?.trim()) return null
  const { emoji, label } = zerlegeKategorie(eingabe)
  if (!label) return null
  if (!(await store.addRecipeGroup(label, emoji))) return null
  const neu = store.state.recipeGroups.find(
    (g) => g.label.trim().toLowerCase() === label.toLowerCase(),
  )
  return neu?.id ?? null
}

const kategorieOffen = ref<string | null>(null)
const kategorieEmoji = ref('')
const kategorieName = ref('')

function kategorieBearbeiten(id: string) {
  const g = store.state.recipeGroups.find((x) => x.id === id)
  if (!g) return
  kategorieEmoji.value = g.emoji
  kategorieName.value = g.label
  kategorieOffen.value = id
}

async function kategorieSpeichern(id: string) {
  const label = kategorieName.value.trim()
  if (!label) return
  const ok = await store.saveRecipeGroup(id, { label, emoji: kategorieEmoji.value.trim() })
  if (ok) kategorieOffen.value = null
}

async function kategorieLoeschen(id: string, label: string) {
  const drin = store.recipeCount(id)
  const frage = drin
    ? `Kategorie „${label}“ löschen? Die ${drin} Rezepte darin bleiben in ihren anderen Kategorien.`
    : `Kategorie „${label}“ löschen?`
  if (!confirm(frage)) return
  if (await store.removeRecipeGroup(id)) kategorieOffen.value = null
}

async function rezeptWeg(rezept: Recipe) {
  if (
    !confirm(`Rezept „${rezept.name}“ endgültig löschen? Das lässt sich nicht rückgängig machen.`)
  ) {
    return
  }
  await store.removeRecipe(rezept.id)
}

async function rezeptLoeschen() {
  if (!entwurf.id || !confirm(`Rezept „${entwurf.name}“ löschen?`)) return
  await store.removeRecipe(entwurf.id)
  zurAuswahl()
}

function zurAuswahl() {
  modus.value = 'auswahl'
  aktivId.value = null
  if (props.eingebettet) emit('zeige', null)
}

function zurueck() {
  // Auf der Seite führt der Weg zurück über das Rezept, im Fenster zur Auswahl
  if (props.eingebettet && aktiv.value && modus.value !== 'ansehen') {
    modus.value = 'ansehen'
    return
  }
  zurAuswahl()
}
</script>

<template>
  <div
    :class="eingebettet ? 'rezeptbuch-seite' : 'overlay'"
    @click.self="eingebettet || emit('close')"
  >
    <div
      class="fenster card"
      :role="eingebettet ? undefined : 'dialog'"
      :aria-modal="eingebettet ? undefined : 'true'"
    >
      <!-- ── Schritt 1: Rezept aussuchen ───────────────────────────────────── -->
      <template v-if="modus === 'auswahl'">
        <header>
          <h2>
            {{
              verwalten ? 'Rezeptbuch ordnen' : eingebettet ? 'Rezeptbuch' : 'Rezept zum Einkauf'
            }}
          </h2>
          <button
            type="button"
            class="stift"
            :class="{ an: verwalten }"
            :title="verwalten ? 'Fertig' : 'Rezepte sortieren und löschen'"
            :aria-pressed="verwalten"
            @click="verwalten = !verwalten"
          >
            ⠿
          </button>
          <button
            v-if="!eingebettet"
            type="button"
            class="zu"
            title="Schließen"
            @click="emit('close')"
          >
            ×
          </button>
        </header>

        <div class="inhalt">
          <input
            v-model="suche"
            type="search"
            placeholder="Rezept suchen …"
            aria-label="Rezept suchen"
          />

          <div class="filter" role="group" aria-label="Nach Frisch oder Vorrat filtern">
            <button
              v-for="f in filterWahl"
              :key="f.id"
              type="button"
              :class="{ an: filter === f.id }"
              :aria-pressed="filter === f.id"
              @click="filter = f.id"
            >
              {{ f.label }} <span class="zahl">{{ f.anzahl }}</span>
            </button>
          </div>

          <p v-if="meldung" class="meldung">{{ meldung }}</p>

          <p v-if="!gruppen.length" class="leer">
            {{ store.state.recipes.length ? 'Nichts gefunden.' : 'Noch keine Rezepte angelegt.' }}
          </p>

          <p v-if="verwalten" class="hinweis ordnen-hinweis">
            Unter jedem Rezept stehen seine Kategorien und ob es frisch gekocht wird oder aus dem
            Vorrat kommt – beides gilt sofort. Kategorien werden über den Stift ✎ an der Überschrift
            umbenannt oder gelöscht.
            <template v-if="ungefiltert">Am Griff ⠿ in die gewünschte Reihenfolge ziehen.</template>
            <template v-else>Sortieren am Griff geht nur ohne Suche und Filter.</template>
            Gelöschte Rezepte sind weg – es gibt keine Vorlage, aus der sie zurückkämen.
          </p>

          <section v-for="g in gruppen" :key="g.group.id">
            <!-- Kategorie umbenennen oder löschen: auf der Seite immer, im
                 Fenster beim Einkauf nur beim Ordnen -->
            <form
              v-if="kategorieOffen === g.group.id"
              class="kategorie-form"
              @submit.prevent="kategorieSpeichern(g.group.id)"
            >
              <div class="kategorie-felder">
                <input
                  v-model="kategorieEmoji"
                  class="emoji"
                  :aria-label="`Zeichen für ${g.group.label}`"
                />
                <input
                  v-model="kategorieName"
                  class="kategorie-name"
                  :aria-label="`Name von ${g.group.label}`"
                />
              </div>
              <div class="kategorie-knoepfe">
                <!-- Gelöscht wird, solange jedes Rezept noch eine andere
                     Kategorie hat – aus denen wird sie dann nur herausgenommen -->
                <button
                  v-if="store.recipeCountOnly(g.group.id) === 0"
                  type="button"
                  class="loeschen klein"
                  @click="kategorieLoeschen(g.group.id, g.group.label)"
                >
                  🗑 Löschen
                </button>
                <span v-else class="hinweis klein">
                  {{
                    store.recipeCountOnly(g.group.id) === 1
                      ? '1 Rezept steht'
                      : `${store.recipeCountOnly(g.group.id)} Rezepte stehen`
                  }}
                  nur hier – Löschen geht, sobald sie auch in einer anderen Kategorie stehen.
                </span>
                <button type="button" class="ab" @click="kategorieOffen = null">Abbrechen</button>
                <button type="submit" class="ok" :disabled="!kategorieName.trim()">
                  Speichern
                </button>
              </div>
            </form>
            <h3 v-else class="kategorie">
              <span>{{ g.group.emoji }} {{ g.group.label }}</span>
              <button
                v-if="eingebettet || verwalten"
                type="button"
                class="stift klein"
                :title="`Kategorie „${g.group.label}“ umbenennen oder löschen`"
                @click="kategorieBearbeiten(g.group.id)"
              >
                ✎
              </button>
            </h3>
            <p v-if="!g.recipes.length" class="hinweis leer-kategorie">Noch keine Rezepte.</p>
            <ul :ref="(el) => setGruppenListe(g.group.id, el)">
              <li
                v-for="r in g.recipes"
                :key="r.id"
                class="rezept-zeile"
                :class="{ ordnen: verwalten }"
              >
                <span v-if="verwalten && ungefiltert" class="griff" title="Rezept verschieben">
                  ⠿
                </span>

                <button type="button" class="rezept" :disabled="verwalten" @click="waehle(r)">
                  <span class="name">
                    {{ r.name }}
                    <small v-if="!verwalten && zuletztText(r.id)" class="zuletzt">
                      {{ zuletztText(r.id) }}
                    </small>
                  </span>
                  <span
                    v-if="!verwalten && haltbarkeitInfo(r.haltbarkeit)"
                    class="haltbar"
                    :title="haltbarkeitInfo(r.haltbarkeit)?.lang"
                  >
                    {{ haltbarkeitInfo(r.haltbarkeit)?.emoji }}
                  </span>
                  <span v-if="r.notes && !verwalten" class="haltbar" title="Mit Notizen">📝</span>
                  <span class="anzahl">{{ r.ingredients.length }} Zutaten</span>
                </button>

                <button
                  type="button"
                  class="stift"
                  title="Rezept bearbeiten"
                  @click="bearbeiten(r)"
                >
                  ✎
                </button>
                <button
                  v-if="verwalten"
                  type="button"
                  class="muell"
                  :title="`${r.name} löschen`"
                  @click="rezeptWeg(r)"
                >
                  🗑
                </button>

                <!-- Einsortieren ohne Umweg über das Bearbeiten: bei sechzig
                     Rezepten wäre jeder zusätzliche Tipp einer zu viel -->
                <div v-if="verwalten" class="einordnen">
                  <KategorienWahl
                    :model-value="r.groups"
                    :gruppen="store.state.recipeGroups"
                    :anlegen="kategorieAnlegen"
                    :rezept-name="r.name"
                    class="kategorien-wahl"
                    @update:model-value="store.saveRecipe(r.id, { groups: $event })"
                  />
                  <HaltbarkeitWahl
                    :model-value="r.haltbarkeit"
                    @update:model-value="store.saveRecipe(r.id, { haltbarkeit: $event })"
                  />
                </div>
              </li>
            </ul>
          </section>
          <button
            v-if="verwalten"
            type="button"
            class="ghost neue-kategorie"
            @click="kategorieAnlegen"
          >
            ＋ Kategorie hinzufügen
          </button>
        </div>

        <footer>
          <button type="button" class="ghost" @click="neuesRezept">+ Neues Rezept</button>
        </footer>
      </template>

      <!-- ── Das Rezept zum Nachlesen (nur auf der Seite) ───────────────────── -->
      <template v-else-if="modus === 'ansehen' && aktiv">
        <header>
          <button type="button" class="zurueck" title="Zurück" @click="zurueck">←</button>
          <h2>{{ aktiv.name }}</h2>
          <button type="button" class="stift" title="Rezept bearbeiten" @click="bearbeiten(aktiv)">
            ✎
          </button>
        </header>

        <div class="inhalt">
          <p class="meta">
            <template v-for="(g, index) in aktivGruppen" :key="g.id"
              ><template v-if="index > 0"> · </template>{{ g.emoji }} {{ g.label }}</template
            >
            <template v-if="haltbarkeitInfo(aktiv.haltbarkeit)">
              · {{ haltbarkeitInfo(aktiv.haltbarkeit)?.emoji }}
              {{ haltbarkeitInfo(aktiv.haltbarkeit)?.lang }}
            </template>
          </p>

          <h3>Zutaten</h3>
          <ul class="zutaten lesen">
            <li v-for="(z, index) in aktiv.ingredients" :key="index">
              <span class="zutat-name">{{ z.name }}</span>
              <span class="zutat-menge">{{ z.quantity }}</span>
            </li>
          </ul>
          <p v-if="!aktiv.ingredients.length" class="hinweis">Noch keine Zutaten eingetragen.</p>

          <h3>Notizen</h3>
          <NotizText v-if="aktiv.notes" :text="aktiv.notes" />
          <p v-else class="hinweis">
            Noch keine Notizen. Über den Stift ✎ lassen sich Zubereitung, Portionen oder ein Link
            zum Original ergänzen.
          </p>
        </div>

        <footer v-if="list">
          <button type="button" class="primaer" @click="oeffneEinkauf(aktiv)">
            Zum Einkauf hinzufügen
          </button>
        </footer>
      </template>

      <!-- ── Schritt 2: Zutaten für diesen Einkauf ──────────────────────────── -->
      <template v-else-if="modus === 'einkauf' && aktiv">
        <header>
          <button type="button" class="zurueck" @click="zurueck">←</button>
          <h2>{{ aktiv.name }}</h2>
          <button type="button" class="stift" title="Rezept bearbeiten" @click="bearbeiten(aktiv)">
            ✎
          </button>
          <button
            v-if="!eingebettet"
            type="button"
            class="zu"
            title="Schließen"
            @click="emit('close')"
          >
            ×
          </button>
        </header>

        <div class="inhalt">
          <p class="hinweis">
            Abwählen, was schon zu Hause ist. Das ändert nur diesen Einkauf, nicht das Rezept.
          </p>

          <!-- Steht in den Notizen „reicht für zwei“, hilft das genau hier -->
          <details v-if="aktiv.notes" class="notiz-klappe">
            <summary>📝 Notizen zum Rezept</summary>
            <NotizText :text="aktiv.notes" />
          </details>

          <ul class="zutaten">
            <li v-for="(z, index) in zeilen" :key="index" :class="{ aus: !z.mit }">
              <label class="mit">
                <input v-model="z.mit" type="checkbox" />
                <span>{{ z.name }}</span>
              </label>
              <input
                v-model="z.menge"
                class="menge"
                placeholder="Menge"
                :aria-label="`Menge für ${z.name}`"
              />

              <!-- Steht schon auf der Liste: zusammenlegen oder eigene Zeile -->
              <p v-if="z.mit && z.vorhandenId" class="konflikt">
                <template v-if="z.getrennt">
                  kommt als eigene Zeile dazu
                  <button type="button" @click="z.getrennt = false">zusammenlegen</button>
                </template>
                <template v-else>
                  steht schon drauf ({{ z.vorhandenMenge || 'ohne Menge' }}) → wird
                  <strong>{{ vorschau(z) || 'ohne Menge' }}</strong>
                  <button type="button" @click="z.getrennt = true">getrennt</button>
                </template>
              </p>
            </li>
          </ul>
        </div>

        <footer>
          <button type="button" class="primaer" :disabled="!anzahlMit" @click="hinzufuegen">
            {{ anzahlMit }} Zutaten hinzufügen
          </button>
        </footer>
      </template>

      <!-- ── Schritt 3: Rezept anlegen oder ändern ──────────────────────────── -->
      <template v-else>
        <header>
          <button type="button" class="zurueck" @click="zurueck">←</button>
          <h2>{{ entwurf.id ? 'Rezept bearbeiten' : 'Neues Rezept' }}</h2>
          <button
            v-if="!eingebettet"
            type="button"
            class="zu"
            title="Schließen"
            @click="emit('close')"
          >
            ×
          </button>
        </header>

        <div class="inhalt">
          <input
            v-model="entwurf.name"
            placeholder="Name des Rezepts"
            aria-label="Name des Rezepts"
          />
          <KategorienWahl
            v-model="entwurf.groups"
            :gruppen="store.state.recipeGroups"
            :anlegen="kategorieAnlegen"
            class="kategorien-entwurf"
          />
          <!-- Unabhängig von der Gruppe: auch Pasta kann aus dem Vorrat kommen -->
          <HaltbarkeitWahl v-model="entwurf.haltbarkeit" class="haltbarkeit" />

          <ul ref="zutatenListe" class="zutaten">
            <li v-for="(z, index) in entwurf.zutaten" :key="index" class="zutat-zeile">
              <span class="griff" title="Zutat verschieben">⠿</span>
              <input
                v-model="z.name"
                class="zutat"
                placeholder="Zutat"
                :aria-label="`Zutat ${index + 1}`"
              />
              <input
                v-model="z.quantity"
                class="menge"
                placeholder="Menge"
                :aria-label="`Menge ${index + 1}`"
              />
              <button type="button" class="zu" title="Zutat entfernen" @click="zutatWeg(index)">
                ×
              </button>
            </li>
          </ul>
          <button type="button" class="ghost" @click="zutatDazu">+ Zutat</button>

          <textarea
            v-model="entwurf.notes"
            rows="5"
            placeholder="Notizen: Zubereitung, Portionen, Link zum Original …"
            aria-label="Notizen"
          ></textarea>
        </div>

        <footer class="zwei">
          <button v-if="entwurf.id" type="button" class="loeschen" @click="rezeptLoeschen">
            Löschen
          </button>
          <button
            type="button"
            class="primaer"
            :disabled="!entwurf.name.trim()"
            @click="rezeptSpeichern"
          >
            Speichern
          </button>
        </footer>
      </template>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0.6rem;
  padding-bottom: max(0.6rem, env(safe-area-inset-bottom));
  background: color-mix(in srgb, var(--text) 35%, transparent);
  backdrop-filter: blur(3px);
}

.fenster {
  display: flex;
  flex-direction: column;
  width: min(34rem, 100%);
  max-height: 86vh;
  overflow: hidden;
}

/* Als Fenster deckend: durch das halbtransparente .card schimmerten sonst die
   Liste und der Knopf „Einkauf starten“ hindurch */
.overlay .fenster {
  background: var(--bg);
}

/* Als Seite: kein Schleier, keine eigene Scrollfläche – die Seite scrollt, und
   die Fußleiste mit dem nächsten Schritt bleibt am unteren Rand stehen.
   Der Klassenname muss einmalig sein: scoped gilt nur für das letzte Glied
   eines Selektors, ein „.seite“ traf deshalb auch die Einkaufsseite, in der
   das Fenster steckt – dort verlor es Höhe und Scrollfläche. */
.rezeptbuch-seite {
  margin-top: 0.8rem;
  padding-bottom: 1rem;
}

.rezeptbuch-seite .fenster {
  width: 100%;
  max-height: none;
  overflow: visible;
}

.rezeptbuch-seite .inhalt {
  overflow: visible;
}

.rezeptbuch-seite footer {
  position: sticky;
  bottom: 0;
  padding-bottom: max(0.7rem, env(safe-area-inset-bottom));
  border-radius: 0 0 1.1rem 1.1rem;
  background: white;
}

.meta {
  margin: 0;
  color: var(--muted);
  font-size: 0.83rem;
}

.meldung {
  margin: 0.6rem 0 0;
  padding: 0.5rem 0.7rem;
  border-radius: 0.7rem;
  background: color-mix(in srgb, var(--green) 10%, white);
  color: var(--green);
  font-size: 0.85rem;
}

.zutaten.lesen li {
  justify-content: space-between;
  flex-wrap: nowrap;
}

.zutat-name {
  min-width: 0;
  overflow-wrap: anywhere;
}

.zutat-menge {
  flex-shrink: 0;
  max-width: 50%;
  color: var(--muted);
  font-size: 0.85rem;
  text-align: right;
}

.notiz-klappe {
  margin: 0.2rem 0 0.6rem;
}

.notiz-klappe summary {
  padding: 0.2rem 0;
  color: var(--violet);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.7rem 0.8rem;
  border-bottom: 1px solid var(--line);
}

h2 {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 1.05rem;
  overflow-wrap: anywhere;
}

h3 {
  margin: 0.9rem 0 0.3rem;
  color: var(--muted);
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.inhalt {
  flex: 1;
  overflow-y: auto;
  padding: 0.8rem;
}

footer {
  display: flex;
  padding: 0.7rem 0.8rem;
  border-top: 1px solid var(--line);
}

footer.zwei {
  justify-content: space-between;
  gap: 0.5rem;
}

footer .primaer {
  flex: 1;
}

input,
select,
textarea {
  width: 100%;
  min-width: 0;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--line);
  border-radius: 0.6rem;
  background: white;
}

textarea {
  display: block;
  min-height: 6rem;
  margin-top: 0.7rem;
  line-height: 1.45;
  resize: vertical;
}

select {
  margin-top: 0.5rem;
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

section ul li {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  border-top: 1px solid var(--line);
}

.rezept:disabled {
  cursor: default;
}

section ul li.ordnen {
  flex-wrap: wrap;
}

.einordnen {
  flex-basis: 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
  padding: 0 0 0.6rem;
}

.kategorien-wahl {
  flex: 1 1 12rem;
}

.kategorien-entwurf {
  margin-top: 0.5rem;
}

.einordnen select {
  flex: 1;
  margin-top: 0;
  padding: 0.4rem 0.5rem;
  font-size: 0.85rem;
}

.haltbarkeit {
  margin-top: 0.5rem;
}

.haltbar {
  flex-shrink: 0;
  font-size: 0.85rem;
}

.filter {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.6rem;
}

.filter button {
  padding: 0.35rem 0.7rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--card);
  color: var(--muted);
  font-size: 0.83rem;
  font-weight: 600;
  cursor: pointer;
}

.filter button.an {
  border-color: color-mix(in srgb, var(--violet) 45%, transparent);
  background: color-mix(in srgb, var(--violet) 12%, white);
  color: var(--violet);
}

.filter .zahl {
  margin-left: 0.15rem;
  opacity: 0.7;
  font-variant-numeric: tabular-nums;
}

h3.kategorie {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

h3.kategorie span {
  flex: 1;
  min-width: 0;
}

.stift.klein {
  width: 1.7rem;
  height: 1.7rem;
  font-size: 0.95rem;
  letter-spacing: 0;
  text-transform: none;
}

.kategorie-form {
  display: grid;
  gap: 0.45rem;
  margin: 0.9rem 0 0.4rem;
  padding: 0.6rem;
  border: 1px solid color-mix(in srgb, var(--violet) 30%, transparent);
  border-radius: 0.8rem;
  background: color-mix(in srgb, var(--violet) 5%, transparent);
}

.kategorie-felder {
  display: flex;
  gap: 0.4rem;
}

.kategorie-felder .emoji {
  width: 3.2rem;
  flex: 0 0 auto;
  text-align: center;
}

.kategorie-knoepfe {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.4rem;
}

.kategorie-knoepfe .loeschen.klein {
  margin-right: auto;
  padding: 0.45rem 0.7rem;
}

.kategorie-knoepfe .hinweis.klein {
  flex: 1 1 10rem;
  margin: 0;
  font-size: 0.76rem;
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

.ordnen-hinweis {
  margin-top: 0.7rem;
}

.leer-kategorie {
  padding: 0.5rem 0.2rem;
  border-top: 1px solid var(--line);
}

.neue-kategorie {
  width: 100%;
  margin-top: 1.2rem;
}

.muell {
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  border: none;
  border-radius: 999px;
  background: transparent;
  font-size: 0.95rem;
  line-height: 1;
  cursor: pointer;
}

.stift.an {
  background: color-mix(in srgb, var(--violet) 14%, transparent);
  color: var(--violet);
}

.rezept {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.7rem 0.2rem;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.rezept .name {
  flex: 1;
  min-width: 0;
  font-size: 1rem;
  overflow-wrap: anywhere;
}

.zuletzt {
  display: block;
  margin-top: 0.1rem;
  color: var(--muted);
  font-size: 0.74rem;
}

.anzahl {
  flex-shrink: 0;
  color: var(--muted);
  font-size: 0.76rem;
}

.zutaten li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0;
  border-top: 1px solid var(--line);
}

.zutaten .mit {
  flex: 1 1 9rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  cursor: pointer;
}

.zutaten .mit input {
  width: 1.15rem;
  height: 1.15rem;
  flex-shrink: 0;
}

.zutaten .zutat {
  flex: 1 1 7rem;
}

.griff {
  flex-shrink: 0;
  padding: 0.35rem 0.2rem;
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

.sortable-ghost {
  opacity: 0.4;
}

.zutaten .menge {
  width: 6.9rem;
  flex: 0 0 auto;
  text-align: center;
}

.zutaten li.aus {
  opacity: 0.45;
}

.konflikt {
  flex-basis: 100%;
  margin: 0;
  color: var(--amber);
  font-size: 0.76rem;
  line-height: 1.4;
}

.konflikt strong {
  color: var(--text);
}

.konflikt button {
  margin-left: 0.35rem;
  border: none;
  background: transparent;
  color: var(--violet);
  font-size: 0.76rem;
  text-decoration: underline;
  cursor: pointer;
}

.hinweis,
.leer {
  margin: 0 0 0.4rem;
  color: var(--muted);
  font-size: 0.83rem;
  line-height: 1.45;
}

.leer {
  margin-top: 1rem;
  text-align: center;
}

.zu,
.zurueck,
.stift {
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
}

.primaer {
  padding: 0.65rem 1rem;
  border: none;
  border-radius: 0.7rem;
  background: var(--violet);
  color: white;
  font-weight: 700;
  cursor: pointer;
}

.primaer:disabled {
  background: color-mix(in srgb, var(--muted) 25%, white);
  color: var(--muted);
  cursor: default;
}

.ghost {
  padding: 0.5rem 0.9rem;
  border: 1px dashed var(--line);
  border-radius: 0.7rem;
  background: transparent;
  color: var(--violet);
  font-weight: 600;
  cursor: pointer;
}

.loeschen {
  padding: 0.65rem 0.9rem;
  border: 1px solid color-mix(in srgb, var(--red) 30%, transparent);
  border-radius: 0.7rem;
  background: transparent;
  color: var(--red);
  cursor: pointer;
}
</style>
