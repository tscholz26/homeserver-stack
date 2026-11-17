<script setup lang="ts">
import { computed, ref } from 'vue'
import type { RecipeGroup } from '@/composables/useEinkaufStore'

// Ein Rezept kann in mehreren Kategorien stehen: Rote-Beete-Pasta ist „Nudeln
// & Pasta“ und „Sehr günstig“. Gewählte Kategorien stehen als Chips da, dazu
// kommt eine Auswahl für die nächste. Mindestens eine bleibt immer – sonst
// stünde das Rezept nirgends im Rezeptbuch.
const props = defineProps<{
  gruppen: RecipeGroup[]
  /** Neue Kategorie anlegen (fragt nach dem Namen); gibt deren id zurück */
  anlegen: () => Promise<string | null>
  /** Für die Beschriftung der Auswahl */
  rezeptName?: string
}>()
const gewaehlt = defineModel<string[]>({ required: true })

const NEU = '__neu__'
const auswahl = ref('')

const chips = computed(() =>
  gewaehlt.value
    .map((id) => props.gruppen.find((g) => g.id === id))
    .filter((g): g is RecipeGroup => Boolean(g)),
)
const uebrig = computed(() => props.gruppen.filter((g) => !gewaehlt.value.includes(g.id)))

async function dazu() {
  let id: string | null = auswahl.value
  // Die Auswahl steht gleich wieder auf „＋ Kategorie“, egal was gewählt wurde
  auswahl.value = ''
  if (id === NEU) id = await props.anlegen()
  if (id && !gewaehlt.value.includes(id)) gewaehlt.value = [...gewaehlt.value, id]
}

function weg(id: string) {
  if (gewaehlt.value.length <= 1) return
  gewaehlt.value = gewaehlt.value.filter((x) => x !== id)
}
</script>

<template>
  <div class="kategorien">
    <span v-for="g in chips" :key="g.id" class="chip">
      {{ g.emoji }} {{ g.label }}
      <button
        v-if="chips.length > 1"
        type="button"
        class="raus"
        :title="`Aus „${g.label}“ nehmen`"
        :aria-label="`Aus ${g.label} nehmen`"
        @click="weg(g.id)"
      >
        ×
      </button>
    </span>
    <select
      v-model="auswahl"
      class="dazu"
      :aria-label="rezeptName ? `Kategorie für ${rezeptName} hinzufügen` : 'Kategorie hinzufügen'"
      @change="dazu"
    >
      <option value="" disabled>＋ Kategorie</option>
      <option v-for="g in uebrig" :key="g.id" :value="g.id">{{ g.emoji }} {{ g.label }}</option>
      <option :value="NEU">＋ Kategorie hinzufügen …</option>
    </select>
  </div>
</template>

<style scoped>
.kategorien {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
  min-width: 0;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  max-width: 100%;
  padding: 0.25rem 0.3rem 0.25rem 0.6rem;
  border: 1px solid color-mix(in srgb, var(--violet) 30%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--violet) 8%, white);
  color: var(--text);
  font-size: 0.8rem;
  overflow-wrap: anywhere;
}

.raus {
  width: 1.4rem;
  height: 1.4rem;
  flex-shrink: 0;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
}

.dazu {
  /* Sonst so breit wie die längste Kategorie in der Liste – sichtbar ist
     ohnehin nur „＋ Kategorie“ */
  width: 8.5rem;
  max-width: 100%;
  margin: 0;
  padding: 0.3rem 0.45rem;
  border: 1px dashed color-mix(in srgb, var(--violet) 40%, transparent);
  border-radius: 999px;
  background: transparent;
  color: var(--violet);
  font-size: 0.8rem;
  font-weight: 600;
}
</style>
