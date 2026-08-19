<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, onUpdated, ref, useTemplateRef } from 'vue'
import Sortable from 'sortablejs'
import { useEinkaufStore, type List } from '@/composables/useEinkaufStore'

const props = defineProps<{ list: List }>()
const emit = defineEmits<{ close: [] }>()

const store = useEinkaufStore()

const markt = computed(() =>
  store.state.storeProfiles.find((p) => p.id === props.list.storeProfileId),
)

// „sonstiges“ steht immer ganz am Ende und wird deshalb nicht mitsortiert
const volleReihenfolge = computed(() =>
  store.categoryOrderFor(props.list).filter((id) => id !== 'sonstiges'),
)

/** Wie viele Artikel dieser Liste gerade in einer Kategorie liegen. */
function anzahl(categoryId: string) {
  return props.list.items.filter((i) => i.categoryId === categoryId).length
}

// Im Laden zählt nur, was heute auf der Liste steht – zwanzig Kategorien am
// Handy durchzuziehen wäre genau die Fummelei, die hier nicht sein soll.
const nurHeute = ref(true)

const angezeigt = computed(() =>
  volleReihenfolge.value.filter((id) => !nurHeute.value || anzahl(id) > 0),
)

/**
 * Verschieben in der (gefilterten) Ansicht: die Kategorie wandert in der vollen
 * Reihenfolge direkt hinter die, die jetzt vor ihr steht. Alles Ausgeblendete
 * dazwischen bleibt liegen, wo es ist.
 */
function schieben(von: number, nach: number) {
  const sichtbar = angezeigt.value
  if (von === nach || von < 0 || nach < 0 || von >= sichtbar.length || nach >= sichtbar.length) {
    return
  }
  const id = sichtbar[von] as string
  const kopie = [...sichtbar]
  kopie.splice(von, 1)
  kopie.splice(nach, 0, id)

  const vorher = nach > 0 ? kopie[nach - 1] : null
  const ohne = volleReihenfolge.value.filter((x) => x !== id)
  const pos = vorher ? ohne.indexOf(vorher) + 1 : 0
  ohne.splice(pos, 0, id)

  if (markt.value) store.updateStoreProfile(markt.value.id, { categoryOrder: ohne })
}

// Angefasst wird nur der Griff – wie in der Verwaltung und der Kofferpackliste
const liste = useTemplateRef<HTMLElement>('liste')
const ziehend = ref(false)
let sortable: Sortable | undefined

function buildSortable() {
  sortable?.destroy()
  sortable = undefined
  if (!liste.value) return
  sortable = new Sortable(liste.value, {
    draggable: '.kat-zeile',
    handle: '.griff',
    animation: 150,
    onStart: () => (ziehend.value = true),
    onEnd: (evt) => {
      ziehend.value = false
      // SortableJS hat den Knoten selbst verschoben – zurücksetzen und Vue aus
      // dem Zustand neu zeichnen lassen
      evt.from.insertBefore(evt.item, evt.from.children[evt.oldIndex ?? 0] ?? null)
      if (evt.oldIndex != null && evt.newIndex != null) schieben(evt.oldIndex, evt.newIndex)
    },
  })
}

onMounted(buildSortable)

onUpdated(() => {
  if (!ziehend.value) buildSortable()
})

onBeforeUnmount(() => {
  sortable?.destroy()
  sortable = undefined
})
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="fenster card" role="dialog" aria-modal="true" aria-label="Reihenfolge der Regale">
      <header>
        <h2>Regale in {{ markt?.name }}</h2>
        <button type="button" class="zu" aria-label="Schließen" @click="emit('close')">✕</button>
      </header>

      <div class="inhalt">
        <p class="hinweis">
          Am Griff ⠿ an die richtige Stelle ziehen – die Liste sortiert sich sofort um und der Markt
          merkt es sich.
        </p>

        <ol ref="liste" class="reihenfolge">
          <li v-for="id in angezeigt" :key="id" class="kat-zeile">
            <span class="griff" title="Verschieben">⠿</span>
            <span class="kat">
              {{ store.categoryById.value[id]?.emoji }}
              {{ store.categoryById.value[id]?.label ?? id }}
            </span>
            <span v-if="anzahl(id)" class="zahl">{{ anzahl(id) }}</span>
          </li>
        </ol>

        <p v-if="!angezeigt.length" class="leer">
          Auf der Liste steht gerade nichts, was sich sortieren ließe.
        </p>

        <button type="button" class="schalter" @click="nurHeute = !nurHeute">
          {{ nurHeute ? 'Alle Kategorien zeigen' : 'Nur die von heute zeigen' }}
        </button>
      </div>
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

.zu {
  flex-shrink: 0;
  padding: 0.3rem 0.5rem;
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 1.1rem;
  cursor: pointer;
}

.inhalt {
  flex: 1;
  overflow-y: auto;
  padding: 0.8rem;
}

.hinweis,
.leer {
  margin: 0 0 0.6rem;
  color: var(--muted);
  font-size: 0.83rem;
}

.reihenfolge {
  list-style: none;
  display: grid;
  gap: 0.25rem;
  margin: 0;
  padding: 0;
}

.kat-zeile {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.1rem;
  border-top: 1px solid var(--line);
}

.kat {
  flex: 1;
  min-width: 0;
  font-size: 0.92rem;
}

.zahl {
  flex-shrink: 0;
  min-width: 1.4rem;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--violet) 10%, transparent);
  color: var(--violet);
  font-size: 0.75rem;
  font-weight: 700;
  text-align: center;
}

.griff {
  flex-shrink: 0;
  padding: 0.4rem 0.5rem;
  color: var(--muted);
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

.schalter {
  margin-top: 0.7rem;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--violet);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}
</style>
