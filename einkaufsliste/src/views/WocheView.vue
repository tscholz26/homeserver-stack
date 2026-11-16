<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useEinkaufStore, type WochenEintrag } from '@/composables/useEinkaufStore'
import { wocheNachHaltbarkeit } from '@/utils/woche'
import { wieLangeHer } from '@/utils/zuletzt'

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

function seit(e: WochenEintrag) {
  return `eingeplant ${wieLangeHer(e.addedAt)}`
}
</script>

<template>
  <div class="woche">
    <p v-if="!store.state.woche.length" class="leer">
      Noch nichts geplant. Gerichte landen hier, sobald ein Rezept über
      <strong>„🍲 Rezept zum Einkauf hinzufügen“</strong> auf die Liste kommt – und bleiben, bis sie
      als gekocht abgehakt werden.
      <RouterLink to="/rezepte" class="zum-buch">Zum Rezeptbuch</RouterLink>
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
            <small>
              {{ seit(e) }}
              <template v-if="!rezeptVon(e)"> · Rezept gelöscht</template>
            </small>
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

    <p v-if="store.state.woche.length" class="hinweis">
      Ein Tipp auf das Gericht schlägt das Rezept auf. Was gekocht ist, verschwindet nur über
      „Gekocht“.
    </p>

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

.zum-buch {
  display: block;
  width: fit-content;
  margin: 1rem auto 0;
  padding: 0.55rem 1rem;
  border-radius: 0.8rem;
  background: var(--violet);
  color: white;
  font-weight: 700;
  text-decoration: none;
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
