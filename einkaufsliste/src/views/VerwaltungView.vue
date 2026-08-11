<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useEinkaufStore, type ListType } from '@/composables/useEinkaufStore'
import { suggestCatalogEntries } from '@/utils/matching'

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

// ── Schreibweisen ─────────────────────────────────────────────────────────────
// Zweiter Weg für einen unbekannten Namen: statt eines neuen Artikels wird er
// eine weitere Schreibweise eines vorhandenen („Zuchini“ → Zucchini).
const aliasOffen = reactive<Record<string, boolean>>({})
const aliasZiel = reactive<Record<string, string>>({})

function vorschlaege(name: string) {
  return suggestCatalogEntries(name, store.state.catalog)
}

function alsSchreibweise(id: string, name: string, ziel: string) {
  if (!ziel.trim()) return
  store.addAlias(ziel, name)
  delete aliasOffen[id]
  delete aliasZiel[id]
}

// ── Märkte ────────────────────────────────────────────────────────────────────
// Kategorie-Reihenfolge pro Filiale. Beim Einkaufen taucht davon nichts auf,
// dort zählt nur, was hier als aktiv eingestellt ist.
const kategorisierteListen = computed(() =>
  store.state.lists.filter((l) => l.type === 'kategorisiert'),
)

const marktOffen = reactive<Record<string, boolean>>({})
const marktNamen = reactive<Record<string, string>>({})
const neuerMarkt = reactive<Record<string, string>>({})

/** Reihenfolge des Profils, ergänzt um alles, was noch nicht drinsteht. */
function reihenfolge(profileId: string): string[] {
  const profil = store.state.storeProfiles.find((p) => p.id === profileId)
  const front = (profil?.categoryOrder ?? []).filter((id) => id !== 'sonstiges')
  return [...front, ...store.state.defaultCategoryOrder.filter((id) => !front.includes(id))]
}

function schieben(profileId: string, index: number, richtung: -1 | 1) {
  const order = reihenfolge(profileId)
  const ziel = index + richtung
  if (ziel < 0 || ziel >= order.length) return
  const [raus] = order.splice(index, 1)
  order.splice(ziel, 0, raus as string)
  store.updateStoreProfile(profileId, { categoryOrder: order })
}

function marktAnlegen(listId: string) {
  const liste = store.state.lists.find((l) => l.id === listId)
  const name = (neuerMarkt[listId] ?? '').trim()
  if (!liste || !name) return
  store.addStoreProfile(liste, name)
  neuerMarkt[listId] = ''
}

function marktUmbenennen(profileId: string, alterName: string) {
  const neu = (marktNamen[profileId] ?? '').trim()
  if (!neu || neu === alterName) return
  store.updateStoreProfile(profileId, { name: neu })
}

function marktLoeschen(profileId: string, name: string) {
  if (!confirm(`Markt „${name}“ löschen?`)) return
  store.removeStoreProfile(profileId)
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
</script>

<template>
  <div class="seite">
    <!-- ── Nicht zugeordnete Artikel ───────────────────────────────────────── -->
    <section>
      <h2>Nicht zugeordnete Artikel</h2>
      <p class="hinweis">
        Alles, was beim Hinzufügen nicht im Katalog stand. Entweder als eigener Artikel in eine
        Kategorie – oder als weitere Schreibweise eines Artikels, den es schon gibt. Was deswegen
        gerade unter „Sonstiges“ liegt, rutscht dabei gleich mit.
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

          <button
            type="button"
            class="schalter"
            @click="aliasOffen[eintrag.id] = !aliasOffen[eintrag.id]"
          >
            {{ aliasOffen[eintrag.id] ? '– ' : '+ ' }}Schreibweise eines vorhandenen Artikels
          </button>

          <div v-if="aliasOffen[eintrag.id]" class="alias">
            <!-- Vorschläge aus dem Katalog: ein Tipp genügt -->
            <div v-if="vorschlaege(eintrag.name).length" class="chips">
              <button
                v-for="v in vorschlaege(eintrag.name)"
                :key="v.name"
                type="button"
                class="chip"
                @click="alsSchreibweise(eintrag.id, eintrag.name, v.name)"
              >
                {{ v.name }}
              </button>
            </div>
            <div class="zeile">
              <input
                v-model="aliasZiel[eintrag.id]"
                :list="`katalog-${eintrag.id}`"
                placeholder="Artikel suchen …"
                :aria-label="`Artikel, zu dem ${eintrag.name} gehört`"
              />
              <datalist :id="`katalog-${eintrag.id}`">
                <option v-for="n in store.catalogNames.value" :key="n" :value="n" />
              </datalist>
              <button
                type="button"
                class="primaer"
                :disabled="!aliasZiel[eintrag.id]"
                @click="alsSchreibweise(eintrag.id, eintrag.name, aliasZiel[eintrag.id] ?? '')"
              >
                Merken
              </button>
            </div>
          </div>
        </li>
      </ul>
    </section>

    <!-- ── Märkte ──────────────────────────────────────────────────────────── -->
    <section v-for="liste in kategorisierteListen" :key="liste.id">
      <h2>Märkte für {{ liste.name }}</h2>
      <p class="hinweis">
        Jede Filiale hat ihren eigenen Weg durch den Laden. Der aktive Markt bestimmt, in welcher
        Reihenfolge die Kategorien beim Einkaufen stehen.
      </p>

      <div class="card offen">
        <label class="aktiv">
          <span>Ich kaufe gerade ein bei</span>
          <select
            :value="liste.storeProfileId ?? ''"
            @change="
              store.selectStoreProfile(liste, ($event.target as HTMLSelectElement).value || null)
            "
          >
            <option value="">Standard-Reihenfolge</option>
            <option v-for="p in store.profilesFor(liste)" :key="p.id" :value="p.id">
              {{ p.name }}
            </option>
          </select>
        </label>
      </div>

      <ul class="karten">
        <li v-for="p in store.profilesFor(liste)" :key="p.id" class="card offen">
          <div class="zeile">
            <input
              :value="marktNamen[p.id] ?? p.name"
              :aria-label="`Name von ${p.name}`"
              @input="marktNamen[p.id] = ($event.target as HTMLInputElement).value"
              @blur="marktUmbenennen(p.id, p.name)"
              @keyup.enter="marktUmbenennen(p.id, p.name)"
            />
            <button type="button" class="loeschen" @click="marktLoeschen(p.id, p.name)">
              Löschen
            </button>
          </div>

          <button type="button" class="schalter" @click="marktOffen[p.id] = !marktOffen[p.id]">
            {{ marktOffen[p.id] ? '– ' : '+ ' }}Reihenfolge der Kategorien
          </button>

          <ol v-if="marktOffen[p.id]" class="reihenfolge">
            <li v-for="(id, index) in reihenfolge(p.id)" :key="id">
              <span class="kat">
                {{ store.categoryById.value[id]?.emoji }}
                {{ store.categoryById.value[id]?.label ?? id }}
              </span>
              <button
                type="button"
                :disabled="index === 0"
                :aria-label="`${store.categoryById.value[id]?.label} nach oben`"
                @click="schieben(p.id, index, -1)"
              >
                ▲
              </button>
              <button
                type="button"
                :disabled="index === reihenfolge(p.id).length - 1"
                :aria-label="`${store.categoryById.value[id]?.label} nach unten`"
                @click="schieben(p.id, index, 1)"
              >
                ▼
              </button>
            </li>
          </ol>
        </li>
      </ul>

      <form class="card offen" @submit.prevent="marktAnlegen(liste.id)">
        <div class="zeile">
          <input
            :value="neuerMarkt[liste.id] ?? ''"
            placeholder="Neuer Markt, z. B. Rewe Felsenkeller"
            aria-label="Name des neuen Marktes"
            @input="neuerMarkt[liste.id] = ($event.target as HTMLInputElement).value"
          />
          <button type="submit" class="primaer">Anlegen</button>
        </div>
      </form>
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

    <p class="fuss">
      Kategorie, Menge und Schreibweise eines einzelnen Artikels lassen sich auch direkt in der
      Liste ändern: auf den Namen tippen.
    </p>
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

.schalter {
  justify-self: start;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--violet);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}

.alias {
  display: grid;
  gap: 0.5rem;
  padding-top: 0.1rem;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.chip {
  padding: 0.3rem 0.65rem;
  border: 1px solid color-mix(in srgb, var(--violet) 30%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--violet) 8%, white);
  color: var(--violet);
  font-size: 0.82rem;
  cursor: pointer;
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

.aktiv {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  color: var(--muted);
  font-size: 0.85rem;
}

.reihenfolge {
  list-style: none;
  display: grid;
  gap: 0.25rem;
  margin: 0;
  padding: 0;
  counter-reset: schritt;
}

.reihenfolge li {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.1rem;
  border-top: 1px solid var(--line);
}

.reihenfolge .kat {
  flex: 1;
  min-width: 0;
  font-size: 0.88rem;
}

.reihenfolge button {
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  border: 1px solid var(--line);
  border-radius: 0.5rem;
  background: white;
  color: var(--muted);
  line-height: 1;
  cursor: pointer;
}

.reihenfolge button:disabled {
  opacity: 0.35;
  cursor: default;
}

.fuss {
  margin: 1.8rem 0 0;
  color: var(--muted);
  font-size: 0.8rem;
  text-align: center;
}
</style>
