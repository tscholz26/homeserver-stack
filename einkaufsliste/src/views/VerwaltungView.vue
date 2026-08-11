<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useEinkaufStore, type ListType } from '@/composables/useEinkaufStore'
import { suggestCatalogEntries, type CatalogEntry } from '@/utils/matching'

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

// Nach einer Katalog-Erweiterung: was noch unter „Sonstiges“ liegt, neu prüfen
const rematchLaeuft = ref(false)
const rematchErgebnis = ref('')

async function nochmalPruefen() {
  rematchLaeuft.value = true
  const treffer = await store.rematchAll()
  rematchLaeuft.value = false
  rematchErgebnis.value =
    treffer === 0 ? 'Nichts Neues gefunden.' : `${treffer} Artikel neu einsortiert.`
}

// ── Katalog ───────────────────────────────────────────────────────────────────
// Nur die eigenen Ergänzungen; der mitgelieferte Katalog bleibt, wie er ist.
const neueSchreibweise = reactive<Record<string, string>>({})

function kategorieSetzen(eintrag: CatalogEntry, categoryId: string) {
  store.saveCatalogEntry({ ...eintrag, category_id: categoryId })
}

function schreibweiseEntfernen(eintrag: CatalogEntry, alias: string) {
  store.saveCatalogEntry({ ...eintrag, aliases: eintrag.aliases.filter((a) => a !== alias) })
}

function schreibweiseHinzufuegen(eintrag: CatalogEntry) {
  const neu = (neueSchreibweise[eintrag.name] ?? '').trim()
  if (!neu) return
  store.saveCatalogEntry({ ...eintrag, aliases: [...eintrag.aliases, neu] })
  neueSchreibweise[eintrag.name] = ''
}

function eintragVerwerfen(name: string) {
  if (!confirm(`„${name}“ aus den eigenen Ergänzungen entfernen?`)) return
  store.removeCatalogEntry(name)
}

// Notausgang für alles, was die Knöpfe oben nicht hergeben
const rohOffen = ref(false)
const rohText = ref('')
const rohFehler = ref('')

function rohOeffnen() {
  rohText.value = JSON.stringify(store.state.ownCatalog, null, 2)
  rohFehler.value = ''
  rohOffen.value = !rohOffen.value
}

async function rohSpeichern() {
  let daten: unknown
  try {
    daten = JSON.parse(rohText.value)
  } catch (err) {
    rohFehler.value = `Kein gültiges JSON: ${(err as Error).message}`
    return
  }
  if (!Array.isArray(daten)) {
    rohFehler.value = 'Erwartet wird eine Liste von Einträgen.'
    return
  }
  rohFehler.value = ''
  if ((await store.replaceOwnCatalog(daten as CatalogEntry[])) === true) rohOffen.value = false
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

      <div v-if="store.sonstigesItems.value.length" class="card offen nachtraeglich">
        <p class="hinweis">
          {{ store.sonstigesItems.value.length }} Artikel in den Listen liegen unter „Sonstiges“.
          Seit sie eingetragen wurden, ist der Katalog gewachsen – ein Durchlauf holt nach, was
          inzwischen bekannt ist.
        </p>
        <div class="zeile">
          <button type="button" class="primaer" :disabled="rematchLaeuft" @click="nochmalPruefen">
            {{ rematchLaeuft ? 'Läuft …' : 'Nochmal zuordnen' }}
          </button>
          <span v-if="rematchErgebnis" class="ok">{{ rematchErgebnis }}</span>
        </div>
      </div>

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

    <!-- ── Katalog ─────────────────────────────────────────────────────────── -->
    <section>
      <h2>Katalog: eigene Ergänzungen</h2>
      <p class="hinweis">
        Alles, was hier steht, überlagert den mitgelieferten Katalog. Ein Eintrag lässt sich
        entfernen – dann gilt wieder die Auslieferung.
      </p>

      <p v-if="!store.state.ownCatalog.length" class="leer">
        Noch nichts ergänzt – es gilt überall der mitgelieferte Katalog.
      </p>

      <ul v-else class="karten">
        <li v-for="eintrag in store.state.ownCatalog" :key="eintrag.name" class="card offen">
          <div class="kopf">
            <span class="name">{{ eintrag.name }}</span>
            <button
              type="button"
              class="weg"
              title="Eigenen Eintrag verwerfen"
              @click="eintragVerwerfen(eintrag.name)"
            >
              ×
            </button>
          </div>

          <select
            :value="eintrag.category_id"
            :aria-label="`Kategorie von ${eintrag.name}`"
            @change="kategorieSetzen(eintrag, ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="k in waehlbareKategorien" :key="k.id" :value="k.id">
              {{ k.emoji }} {{ k.label }}
            </option>
          </select>

          <div v-if="eintrag.aliases.length" class="chips">
            <span v-for="alias in eintrag.aliases" :key="alias" class="alias">
              {{ alias }}
              <button
                type="button"
                :title="`„${alias}“ entfernen`"
                @click="schreibweiseEntfernen(eintrag, alias)"
              >
                ×
              </button>
            </span>
          </div>

          <div class="zeile">
            <input
              :value="neueSchreibweise[eintrag.name] ?? ''"
              placeholder="Schreibweise ergänzen"
              :aria-label="`Schreibweise für ${eintrag.name}`"
              @input="neueSchreibweise[eintrag.name] = ($event.target as HTMLInputElement).value"
              @keyup.enter="schreibweiseHinzufuegen(eintrag)"
            />
            <button
              type="button"
              class="primaer"
              :disabled="!neueSchreibweise[eintrag.name]"
              @click="schreibweiseHinzufuegen(eintrag)"
            >
              Merken
            </button>
          </div>
        </li>
      </ul>

      <button type="button" class="schalter" @click="rohOeffnen">
        {{ rohOffen ? '– ' : '+ ' }}Notfall: Rohdaten bearbeiten
      </button>

      <div v-if="rohOffen" class="card offen">
        <p class="hinweis">
          Die eigenen Einträge als JSON. Eine leere Liste (<code>[]</code>) setzt alles auf den
          mitgelieferten Katalog zurück.
        </p>
        <textarea v-model="rohText" rows="12" spellcheck="false" aria-label="Katalog als JSON" />
        <p v-if="rohFehler" class="fehler">{{ rohFehler }}</p>
        <div class="zeile rechts">
          <button type="button" class="loeschen" @click="rohOffen = false">Abbrechen</button>
          <button type="button" class="primaer" @click="rohSpeichern">Speichern</button>
        </div>
      </div>
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

.nachtraeglich {
  margin-top: 0.6rem;
}

.ok {
  color: var(--green);
  font-size: 0.83rem;
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

.nachtraeglich {
  margin-top: 0.6rem;
}

.ok {
  color: var(--green);
  font-size: 0.83rem;
}

.alias {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.2rem 0.3rem 0.2rem 0.6rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: white;
  font-size: 0.82rem;
}

.alias button {
  width: 1.3rem;
  height: 1.3rem;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  line-height: 1;
  cursor: pointer;
}

textarea {
  width: 100%;
  padding: 0.6rem;
  border: 1px solid var(--line);
  border-radius: 0.6rem;
  background: white;
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', monospace;
  font-size: 0.78rem;
  line-height: 1.45;
  resize: vertical;
}

.rechts {
  justify-content: flex-end;
}

.fehler {
  margin: 0;
  color: var(--red);
  font-size: 0.82rem;
}

.fuss {
  margin: 1.8rem 0 0;
  color: var(--muted);
  font-size: 0.8rem;
  text-align: center;
}
</style>
