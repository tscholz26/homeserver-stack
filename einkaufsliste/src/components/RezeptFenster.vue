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
import NotizText from '@/components/NotizText.vue'
import { planeRezept } from '@/utils/rezept'
import { haltbarkeitInfo, type Haltbarkeit } from '@/utils/haltbarkeit'
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

const aktivGruppe = computed(() =>
  store.state.recipeGroups.find((g) => g.id === aktiv.value?.group),
)
const suche = ref('')
// Im Verwaltungsmodus wird sortiert und gelöscht statt eingekauft
const verwalten = ref(false)

// ── Schritt 1: welches Rezept? ────────────────────────────────────────────────
const gruppen = computed(() => {
  const q = suche.value.trim().toLowerCase()
  if (!q) return store.recipesByGroup.value
  return store.recipesByGroup.value
    .map((g) => ({ ...g, recipes: g.recipes.filter((r) => r.name.toLowerCase().includes(q)) }))
    .filter((g) => g.recipes.length > 0)
})

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
  group: string
  haltbarkeit: Haltbarkeit
  notes: string
  zutaten: RecipeIngredient[]
}>({ id: null, name: '', group: '', haltbarkeit: '', notes: '', zutaten: [] })

function bearbeiten(rezept: Recipe) {
  entwurf.id = rezept.id
  entwurf.name = rezept.name
  entwurf.group = rezept.group
  entwurf.haltbarkeit = rezept.haltbarkeit
  entwurf.notes = rezept.notes
  entwurf.zutaten = rezept.ingredients.map((z) => ({ ...z }))
  aktivId.value = rezept.id
  modus.value = 'bearbeiten'
}

function neuesRezept() {
  entwurf.id = null
  entwurf.name = ''
  entwurf.group = store.state.recipeGroups[0]?.id ?? ''
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
    group: entwurf.group,
    haltbarkeit: entwurf.haltbarkeit,
    notes: entwurf.notes.trim(),
    ingredients: zutaten,
  }
  const ok = entwurf.id ? await store.saveRecipe(entwurf.id, rezept) : await store.addRecipe(rezept)
  if (ok !== true) return
  // Auf der Seite zurück zum Rezept, das gerade geändert wurde
  modus.value = props.eingebettet && entwurf.id ? 'ansehen' : 'auswahl'
}

// ── Gruppen ───────────────────────────────────────────────────────────────────
const gruppenNamen = reactive<Record<string, string>>({})
const gruppenEmoji = reactive<Record<string, string>>({})
const neueGruppe = ref('')
const neuesEmoji = ref('')

function gruppeUmbenennen(id: string, alt: string) {
  const neu = (gruppenNamen[id] ?? '').trim()
  if (!neu || neu === alt) return
  store.saveRecipeGroup(id, { label: neu })
}

function gruppeEmoji(id: string, alt: string) {
  const neu = (gruppenEmoji[id] ?? '').trim()
  if (!neu || neu === alt) return
  store.saveRecipeGroup(id, { emoji: neu })
}

function gruppeAnlegen() {
  if (!neueGruppe.value.trim()) return
  store.addRecipeGroup(neueGruppe.value, neuesEmoji.value || '❓')
  neueGruppe.value = ''
  neuesEmoji.value = ''
}

function gruppeWeg(id: string, label: string) {
  if (!confirm(`Gruppe „${label}“ löschen?`)) return
  store.removeRecipeGroup(id)
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
  <div :class="eingebettet ? 'seite' : 'overlay'" @click.self="eingebettet || emit('close')">
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

          <p v-if="meldung" class="meldung">{{ meldung }}</p>

          <p v-if="!gruppen.length" class="leer">
            {{ store.state.recipes.length ? 'Nichts gefunden.' : 'Noch keine Rezepte angelegt.' }}
          </p>

          <p v-if="verwalten" class="hinweis">
            Unter jedem Rezept stehen seine Gruppe und ob es frisch gekocht wird oder aus dem Vorrat
            kommt – beides gilt sofort. Am Griff ⠿ in die gewünschte Reihenfolge ziehen. Gelöschte
            Rezepte sind weg – es gibt keine Vorlage, aus der sie zurückkämen.
          </p>

          <section v-for="g in gruppen" :key="g.group.id">
            <h3>{{ g.group.emoji }} {{ g.group.label }}</h3>
            <ul :ref="(el) => setGruppenListe(g.group.id, el)">
              <li
                v-for="r in g.recipes"
                :key="r.id"
                class="rezept-zeile"
                :class="{ ordnen: verwalten }"
              >
                <span v-if="verwalten" class="griff" title="Rezept verschieben">⠿</span>

                <button type="button" class="rezept" :disabled="verwalten" @click="waehle(r)">
                  <span class="name">{{ r.name }}</span>
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
                  <select
                    :value="r.group"
                    :aria-label="`Gruppe von ${r.name}`"
                    @change="
                      store.saveRecipe(r.id, { group: ($event.target as HTMLSelectElement).value })
                    "
                  >
                    <option v-for="gr in store.state.recipeGroups" :key="gr.id" :value="gr.id">
                      {{ gr.emoji }} {{ gr.label }}
                    </option>
                  </select>
                  <HaltbarkeitWahl
                    :model-value="r.haltbarkeit"
                    @update:model-value="store.saveRecipe(r.id, { haltbarkeit: $event })"
                  />
                </div>
              </li>
            </ul>
          </section>
          <!-- Gruppen: das Gerüst des Rezeptbuchs, nur im Verwaltungsmodus -->
          <section v-if="verwalten" class="gruppen">
            <h3>Gruppen</h3>
            <ul>
              <li v-for="g in store.state.recipeGroups" :key="g.id" class="gruppe-zeile">
                <input
                  :value="gruppenEmoji[g.id] ?? g.emoji"
                  class="emoji"
                  :aria-label="`Zeichen für ${g.label}`"
                  @input="gruppenEmoji[g.id] = ($event.target as HTMLInputElement).value"
                  @blur="gruppeEmoji(g.id, g.emoji)"
                  @keyup.enter="gruppeEmoji(g.id, g.emoji)"
                />
                <input
                  :value="gruppenNamen[g.id] ?? g.label"
                  class="gruppe-name"
                  :aria-label="`Name von ${g.label}`"
                  @input="gruppenNamen[g.id] = ($event.target as HTMLInputElement).value"
                  @blur="gruppeUmbenennen(g.id, g.label)"
                  @keyup.enter="gruppeUmbenennen(g.id, g.label)"
                />
                <span class="anzahl">{{ store.recipeCount(g.id) }}</span>
                <button
                  type="button"
                  class="muell"
                  :title="`${g.label} löschen`"
                  @click="gruppeWeg(g.id, g.label)"
                >
                  🗑
                </button>
              </li>
            </ul>

            <form class="gruppe-zeile neu" @submit.prevent="gruppeAnlegen">
              <input v-model="neuesEmoji" class="emoji" placeholder="❓" aria-label="Zeichen" />
              <input
                v-model="neueGruppe"
                class="gruppe-name"
                placeholder="Neue Gruppe"
                aria-label="Name der neuen Gruppe"
              />
              <button type="submit" class="ok" :disabled="!neueGruppe.trim()">Anlegen</button>
            </form>
          </section>
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
            <template v-if="aktivGruppe">{{ aktivGruppe.emoji }} {{ aktivGruppe.label }}</template>
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
          <select v-model="entwurf.group" aria-label="Gruppe">
            <option v-for="g in store.state.recipeGroups" :key="g.id" :value="g.id">
              {{ g.emoji }} {{ g.label }}
            </option>
          </select>
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

/* Als Seite: kein Schleier, keine eigene Scrollfläche – die Seite scrollt, und
   die Fußleiste mit dem nächsten Schritt bleibt am unteren Rand stehen. */
.seite {
  margin-top: 0.8rem;
  padding-bottom: 1rem;
}

.seite .fenster {
  width: 100%;
  max-height: none;
  overflow: visible;
}

.seite .inhalt {
  overflow: visible;
}

.seite footer {
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
  align-items: center;
  gap: 0.4rem;
  padding: 0 0 0.6rem;
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

.gruppen {
  margin-top: 1.4rem;
  padding-top: 0.4rem;
  border-top: 2px solid var(--line);
}

.gruppe-zeile {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0;
  border-top: 1px solid var(--line);
}

.gruppe-zeile.neu {
  border-top: none;
  margin-top: 0.4rem;
}

.gruppe-zeile .emoji {
  width: 3.2rem;
  flex: 0 0 auto;
  text-align: center;
}

.gruppe-zeile .gruppe-name {
  flex: 1 1 6rem;
  min-width: 0;
}

.gruppe-zeile .anzahl {
  min-width: 1.5rem;
  text-align: right;
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
