<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useEinkaufStore, type ListType } from '@/composables/useEinkaufStore'

const store = useEinkaufStore()

// Kategorien zum Zuordnen: „Sonstiges“ ist keine Zuordnung, sondern ihr Fehlen
const waehlbareKategorien = computed(() =>
  store.state.categories.filter((c) => c.id !== 'sonstiges'),
)

// Auswahl pro nicht zugeordnetem Artikel, bis auf „Speichern“ getippt wird
const auswahl = reactive<Record<string, string>>({})

function zuordnen(id: string, name: string) {
  const categoryId = auswahl[id]
  if (!categoryId) return
  store.assignCategory(name, categoryId)
  delete auswahl[id]
}

// ── Listen ────────────────────────────────────────────────────────────────────
const namen = reactive<Record<string, string>>({})
const neuerName = ref('')
const neuerTyp = ref<ListType>('kategorisiert')

function umbenennen(listId: string, alterName: string) {
  const neu = (namen[listId] ?? '').trim()
  if (!neu || neu === alterName) return
  store.renameList(listId, neu)
}

function loeschen(listId: string, name: string) {
  if (!confirm(`„${name}“ mit allen Artikeln löschen?`)) return
  store.removeList(listId)
}

function anlegen() {
  if (!neuerName.value.trim()) return
  store.addList(neuerName.value, neuerTyp.value)
  neuerName.value = ''
  neuerTyp.value = 'kategorisiert'
}

// ── Namen ─────────────────────────────────────────────────────────────────────
const nutzer = ref<string[]>([])
const nutzerGespeichert = ref(false)

function nutzerFeld(index: number): string {
  return nutzer.value[index] ?? store.state.settings.users[index] ?? ''
}

function setzeNutzer(index: number, wert: string) {
  const kopie = [...store.state.settings.users]
  kopie[index] = wert
  nutzer.value = kopie
  nutzerGespeichert.value = false
}

async function nutzerSpeichern() {
  const werte = [nutzerFeld(0), nutzerFeld(1)]
  if (werte.some((w) => !w.trim())) return
  nutzerGespeichert.value = (await store.setUserNames(werte)) === true
  nutzer.value = []
}
</script>

<template>
  <div class="seite">
    <!-- ── Nicht zugeordnete Artikel ───────────────────────────────────────── -->
    <section>
      <h2>Nicht zugeordnete Artikel</h2>
      <p class="hinweis">
        Alles, was beim Hinzufügen nicht im Katalog stand. Einmal zugeordnet, landet der Name
        künftig automatisch in der passenden Kategorie – bereits eingetragene Artikel bleiben, wo
        sie sind.
      </p>

      <p v-if="!store.unmatched.value.length" class="leer">
        Nichts offen – alles ließ sich zuordnen.
      </p>

      <ul v-else class="karten">
        <li v-for="eintrag in store.unmatched.value" :key="eintrag.id" class="card offen">
          <div class="kopf">
            <span class="name">{{ eintrag.name }}</span>
            <span class="anzahl" :title="`${eintrag.count}× eingegeben`">{{ eintrag.count }}×</span>
            <button
              type="button"
              class="weg"
              title="Verwerfen (z. B. Vertipper)"
              @click="store.dismissUnmatched(eintrag.id)"
            >
              ×
            </button>
          </div>
          <div class="zeile">
            <select v-model="auswahl[eintrag.id]" :aria-label="`Kategorie für ${eintrag.name}`">
              <option value="">Kategorie wählen …</option>
              <option v-for="k in waehlbareKategorien" :key="k.id" :value="k.id">
                {{ k.emoji }} {{ k.label }}
              </option>
            </select>
            <button
              type="button"
              class="primaer"
              :disabled="!auswahl[eintrag.id]"
              @click="zuordnen(eintrag.id, eintrag.name)"
            >
              Speichern
            </button>
          </div>
        </li>
      </ul>
    </section>

    <!-- ── Listen ──────────────────────────────────────────────────────────── -->
    <section>
      <h2>Listen</h2>
      <ul class="karten">
        <li v-for="l in store.state.lists" :key="l.id" class="card offen">
          <div class="zeile">
            <input
              :value="namen[l.id] ?? l.name"
              :aria-label="`Name von ${l.name}`"
              @input="namen[l.id] = ($event.target as HTMLInputElement).value"
              @blur="umbenennen(l.id, l.name)"
              @keyup.enter="umbenennen(l.id, l.name)"
            />
            <button type="button" class="loeschen" @click="loeschen(l.id, l.name)">Löschen</button>
          </div>
          <p class="typ">
            {{ l.type === 'kategorisiert' ? 'Nach Kategorien sortiert' : 'Einfache Liste' }}
            · {{ l.items.length }} Artikel
          </p>
        </li>
      </ul>

      <form class="card offen" @submit.prevent="anlegen">
        <div class="zeile">
          <input v-model="neuerName" placeholder="Neue Liste" aria-label="Name der neuen Liste" />
          <button type="submit" class="primaer">Anlegen</button>
        </div>
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
      </form>
    </section>

    <!-- ── Namen ───────────────────────────────────────────────────────────── -->
    <section>
      <h2>Namen</h2>
      <p class="hinweis">
        Die beiden Namen zur Auswahl beim ersten Öffnen. Sie stehen später an jedem Artikel, der
        eingetragen wird.
      </p>
      <form class="card offen" @submit.prevent="nutzerSpeichern">
        <div class="zeile">
          <input
            :value="nutzerFeld(0)"
            aria-label="Erster Name"
            @input="setzeNutzer(0, ($event.target as HTMLInputElement).value)"
          />
          <input
            :value="nutzerFeld(1)"
            aria-label="Zweiter Name"
            @input="setzeNutzer(1, ($event.target as HTMLInputElement).value)"
          />
        </div>
        <div class="zeile">
          <button type="submit" class="primaer">Namen speichern</button>
          <span v-if="nutzerGespeichert" class="ok">gespeichert</span>
        </div>
      </form>

      <p class="hinweis">
        Angemeldet als <strong>{{ store.userName.value || '—' }}</strong>
        <button type="button" class="wechseln" @click="store.forgetUser()">wechseln</button>
      </p>
    </section>
  </div>
</template>

<style scoped>
.seite {
  padding: 0.8rem 0 2rem;
}

section + section {
  margin-top: 1.8rem;
}

h2 {
  margin: 0 0 0.3rem;
  font-size: 1.05rem;
}

.hinweis {
  margin: 0 0 0.7rem;
  color: var(--muted);
  font-size: 0.83rem;
  line-height: 1.45;
}

.leer {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
}

.karten {
  list-style: none;
  display: grid;
  gap: 0.6rem;
  margin: 0 0 0.6rem;
  padding: 0;
}

.offen {
  display: grid;
  gap: 0.5rem;
  padding: 0.75rem;
}

.kopf {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.name {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.anzahl {
  padding: 0.1rem 0.45rem;
  border: 1px solid var(--line);
  border-radius: 0.5rem;
  color: var(--muted);
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
}

.weg {
  width: 1.8rem;
  height: 1.8rem;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: color-mix(in srgb, var(--muted) 60%, transparent);
  font-size: 1.2rem;
  line-height: 1;
  cursor: pointer;
}

.zeile {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

input,
select {
  flex: 1;
  min-width: 0;
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--line);
  border-radius: 0.6rem;
  background: white;
}

input[type='radio'] {
  flex: none;
  min-width: 0;
  padding: 0;
}

.typen {
  display: flex;
  gap: 0.9rem;
  color: var(--muted);
  font-size: 0.83rem;
}

.typen label {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.typ {
  margin: 0;
  color: var(--muted);
  font-size: 0.78rem;
}

.primaer {
  flex-shrink: 0;
  padding: 0.5rem 0.9rem;
  border: none;
  border-radius: 0.6rem;
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

.loeschen {
  flex-shrink: 0;
  padding: 0.5rem 0.8rem;
  border: 1px solid color-mix(in srgb, var(--red) 30%, transparent);
  border-radius: 0.6rem;
  background: transparent;
  color: var(--red);
  font-size: 0.85rem;
  cursor: pointer;
}

.wechseln {
  margin-left: 0.4rem;
  border: none;
  background: transparent;
  color: var(--violet);
  font-size: 0.83rem;
  text-decoration: underline;
  cursor: pointer;
}

.ok {
  color: var(--green);
  font-size: 0.83rem;
}
</style>
