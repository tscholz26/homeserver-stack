<script setup lang="ts">
import { computed, ref } from 'vue'
import type { RecipeGroup } from '@/composables/useEinkaufStore'

// Mehrfachauswahl der Kategorien eines Rezepts: zugeklappt steht da, was
// gewählt ist, aufgeklappt jede Kategorie mit Häkchen. Ein Häkchen gilt sofort
// und lässt sich genauso wieder wegnehmen. Mindestens eine Kategorie bleibt –
// sonst stünde das Rezept nirgends im Rezeptbuch.
const props = defineProps<{
  gruppen: RecipeGroup[]
  /** Neue Kategorie anlegen (fragt nach dem Namen); gibt deren id zurück */
  anlegen: () => Promise<string | null>
  /** Für die Beschriftung */
  rezeptName?: string
}>()
const gewaehlt = defineModel<string[]>({ required: true })

const offen = ref(false)

const zusammenfassung = computed(() => {
  const namen = props.gruppen
    .filter((g) => gewaehlt.value.includes(g.id))
    .map((g) => `${g.emoji} ${g.label}`)
  return namen.length ? namen.join(' · ') : 'Keine Kategorie'
})

/** Die einzige gewählte Kategorie lässt sich nicht abwählen. */
function gesperrt(id: string) {
  return gewaehlt.value.length === 1 && gewaehlt.value[0] === id
}

// Immer in der Reihenfolge des Rezeptbuchs – dann steht vorn, wo das Rezept
// in „Jedes nur 1×“ einsortiert wird
function setze(ids: string[]) {
  gewaehlt.value = props.gruppen.filter((g) => ids.includes(g.id)).map((g) => g.id)
}

function umschalten(id: string) {
  if (gewaehlt.value.includes(id)) {
    if (!gesperrt(id)) setze(gewaehlt.value.filter((x) => x !== id))
  } else {
    setze([...gewaehlt.value, id])
  }
}

async function neu() {
  const id = await props.anlegen()
  if (id && !gewaehlt.value.includes(id)) gewaehlt.value = [...gewaehlt.value, id]
}
</script>

<template>
  <div class="kategorien" :class="{ offen }">
    <button
      type="button"
      class="kopf"
      :aria-expanded="offen"
      :aria-label="rezeptName ? `Kategorien von ${rezeptName}` : 'Kategorien'"
      @click="offen = !offen"
    >
      <span class="gewaehlt">{{ zusammenfassung }}</span>
      <span class="pfeil" aria-hidden="true">{{ offen ? '▴' : '▾' }}</span>
    </button>

    <div v-if="offen" class="liste">
      <label v-for="g in gruppen" :key="g.id" :class="{ an: gewaehlt.includes(g.id) }">
        <input
          type="checkbox"
          :checked="gewaehlt.includes(g.id)"
          :disabled="gesperrt(g.id)"
          @change="umschalten(g.id)"
        />
        <span>{{ g.emoji }} {{ g.label }}</span>
      </label>
      <div class="unten">
        <button type="button" class="neu" @click="neu">＋ Kategorie hinzufügen …</button>
        <button type="button" class="fertig" @click="offen = false">Fertig</button>
      </div>
      <p v-if="gewaehlt.length === 1" class="hinweis">Eine Kategorie bleibt immer.</p>
    </div>
  </div>
</template>

<style scoped>
.kategorien {
  min-width: 0;
}

.kopf {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  width: 100%;
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--line);
  border-radius: 0.6rem;
  background: white;
  color: var(--text);
  font-size: 0.85rem;
  text-align: left;
  cursor: pointer;
}

.offen .kopf {
  border-color: color-mix(in srgb, var(--violet) 45%, transparent);
}

.gewaehlt {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.pfeil {
  flex-shrink: 0;
  color: var(--muted);
}

.liste {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
  gap: 0.25rem;
  margin-top: 0.3rem;
  padding: 0.4rem;
  border: 1px solid color-mix(in srgb, var(--violet) 30%, transparent);
  border-radius: 0.7rem;
  background: color-mix(in srgb, var(--violet) 4%, white);
}

label {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
  padding: 0.35rem 0.45rem;
  border-radius: 0.5rem;
  font-size: 0.85rem;
  cursor: pointer;
}

label.an {
  background: color-mix(in srgb, var(--violet) 10%, white);
}

label input {
  width: 1.05rem;
  height: 1.05rem;
  flex-shrink: 0;
  margin: 0;
  padding: 0;
  accent-color: var(--violet);
}

label span {
  min-width: 0;
  /* Nur ein zu langes Einzelwort darf brechen – „Familienkochbuch“ blieb
     sonst mit einem verwaisten h stehen */
  overflow-wrap: break-word;
  hyphens: auto;
}

.unten {
  grid-column: 1 / -1;
  display: flex;
  justify-content: space-between;
  gap: 0.4rem;
  margin-top: 0.2rem;
}

.neu,
.fertig {
  padding: 0.4rem 0.7rem;
  border-radius: 0.6rem;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
}

.neu {
  border: 1px dashed color-mix(in srgb, var(--violet) 40%, transparent);
  background: transparent;
  color: var(--violet);
}

.fertig {
  border: none;
  background: var(--violet);
  color: white;
}

.hinweis {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--muted);
  font-size: 0.74rem;
}
</style>
