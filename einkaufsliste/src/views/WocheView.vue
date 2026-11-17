<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useEinkaufStore, type WochenEintrag } from '@/composables/useEinkaufStore'
import { wocheNachHaltbarkeit } from '@/utils/woche'
import RezeptFenster from '@/components/RezeptFenster.vue'

const store = useEinkaufStore()
const router = useRouter()

// Frisch/Vorrat kommt aus dem Rezept, wie es heute ist: wird es umgestellt,
// wandert das Gericht hier gleich mit.
function rezeptVon(e: WochenEintrag) {
  return store.state.recipes.find((r) => r.id === e.recipeId)
}

const abschnitte = computed(() =>
  wocheNachHaltbarkeit(store.state.woche, (e) => rezeptVon(e)?.haltbarkeit ?? ''),
)

function oeffne(e: WochenEintrag) {
  if (rezeptVon(e)) router.push(`/rezepte/${e.recipeId}`)
}

// ── Gekocht ───────────────────────────────────────────────────────────────────
// Entfernt wird ohne Rückfrage, dafür steht ein paar Sekunden „Rückgängig“ da –
// ein Fehltipp beim Kochen soll nichts kosten, aber auch nicht nachfragen.
const entfernt = ref<WochenEintrag | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined

function gekocht(e: WochenEintrag) {
  store.removeWochenEintrag(e.id)
  entfernt.value = e
  clearTimeout(timer)
  timer = setTimeout(() => (entfernt.value = null), 6000)
}

function rueckgaengig() {
  if (!entfernt.value) return
  store.restoreWochenEintrag(entfernt.value)
  entfernt.value = null
  clearTimeout(timer)
}

onBeforeUnmount(() => clearTimeout(timer))

// Derselbe Weg wie auf der Einkaufsseite: ein Rezept auf die Liste ist ein
// Gericht mehr im Wochenplan
const rezepteOffen = ref(false)
</script>

<template>
  <div class="woche">
    <!-- Ohne Datum: alles, was geplant und noch nicht gekocht ist -->
    <p v-if="!store.state.woche.length" class="leer">
      Noch nichts geplant. Gerichte landen hier, sobald ein Rezept auf die Einkaufsliste kommt – und
      bleiben, bis sie als gekocht abgehakt werden.
    </p>

    <section v-for="a in abschnitte" :key="a.id" class="abschnitt">
      <h2>
        <span aria-hidden="true">{{ a.emoji }}</span>
        {{ a.label }}
        <span class="anzahl">{{ a.eintraege.length }}</span>
      </h2>
      <ul class="card">
        <li v-for="e in a.eintraege" :key="e.id">
          <button type="button" class="gericht" :disabled="!rezeptVon(e)" @click="oeffne(e)">
            <span class="name">{{ rezeptVon(e)?.name ?? e.name }}</span>
            <small v-if="!rezeptVon(e)">Rezept gelöscht</small>
          </button>
          <button
            type="button"
            class="gekocht"
            :title="`${e.name} als gekocht entfernen`"
            @click="gekocht(e)"
          >
            ✓ Gekocht
          </button>
        </li>
      </ul>
    </section>

    <button
      v-if="store.einkaufsListe.value"
      type="button"
      class="rezepte"
      @click="rezepteOffen = true"
    >
      🍲 Rezept zum Einkauf hinzufügen
    </button>

    <p v-if="store.state.woche.length" class="hinweis">
      Ein Tipp auf das Gericht schlägt das Rezept auf. Was gekocht ist, verschwindet nur über
      „Gekocht“.
    </p>

    <RezeptFenster
      v-if="rezepteOffen && store.einkaufsListe.value"
      :list="store.einkaufsListe.value"
      @close="rezepteOffen = false"
    />

    <div v-if="entfernt" class="rueck" role="status">
      <span>„{{ entfernt.name }}“ ist raus.</span>
      <button type="button" @click="rueckgaengig">Rückgängig</button>
    </div>
  </div>
</template>

<style scoped>
.woche {
  padding: 0.4rem 0 5rem;
}

.leer {
  margin: 2.5rem 0.4rem;
  color: var(--muted);
  line-height: 1.5;
  text-align: center;
}

.leer strong {
  color: var(--text);
  font-weight: 600;
}

/* Wie auf der Einkaufsseite */
.rezepte {
  width: 100%;
  margin-top: 1.2rem;
  padding: 0.5rem;
  border: 1px dashed color-mix(in srgb, var(--violet) 35%, transparent);
  border-radius: 0.8rem;
  background: color-mix(in srgb, var(--violet) 6%, transparent);
  color: var(--violet);
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
}

.abschnitt {
  margin-top: 0.9rem;
}

h2 {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  padding: 0.35rem 0.3rem;
  color: var(--muted);
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h2 .anzahl {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow: hidden;
}

li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.6rem 0.25rem 0.2rem;
  border-top: 1px solid var(--line);
}

li:first-child {
  border-top: none;
}

.gericht {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 0.1rem;
  padding: 0.55rem 0.7rem;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.gericht:disabled {
  cursor: default;
}

.name {
  font-size: 1.02rem;
  overflow-wrap: break-word;
}

small {
  color: var(--muted);
  font-size: 0.76rem;
}

.gekocht {
  flex-shrink: 0;
  padding: 0.45rem 0.75rem;
  border: 1px solid color-mix(in srgb, var(--green) 35%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--green) 8%, white);
  color: var(--green);
  font-size: 0.82rem;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
}

.hinweis {
  margin: 1rem 0.4rem 0;
  color: var(--muted);
  font-size: 0.78rem;
  text-align: center;
}

.rueck {
  position: fixed;
  left: 50%;
  bottom: max(1rem, env(safe-area-inset-bottom));
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 0.8rem;
  width: max-content;
  max-width: calc(100% - 2rem);
  padding: 0.6rem 0.6rem 0.6rem 1rem;
  border-radius: 0.9rem;
  background: var(--text);
  color: white;
  font-size: 0.88rem;
  box-shadow: var(--shadow);
  transform: translateX(-50%);
}

.rueck span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.rueck button {
  flex-shrink: 0;
  padding: 0.35rem 0.7rem;
  border: none;
  border-radius: 0.6rem;
  background: color-mix(in srgb, white 18%, transparent);
  color: white;
  font-weight: 700;
  cursor: pointer;
}
</style>
