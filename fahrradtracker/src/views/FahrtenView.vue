<script setup lang="ts">
import { computed, ref } from 'vue'
import { useTracker } from '@/composables/useTracker'
import type { Fahrt, ImportBericht } from '@/composables/useTracker'
import { datumText, heute, kmText } from '@/utils/verschleiss'

/**
 * Alle Fahrten – die von Intervals.icu geholten und die von Hand
 * nachgetragenen. Von Hand gebraucht werden vor allem die aus der Zeit vor dem
 * Wahoo: die stehen in keinem Konto, das wir lesen dürfen, und wären sonst für
 * die Verschleißrechnung verloren.
 */
const store = useTracker()

type Filter = 'alle' | 'manuell' | 'importiert' | 'offen' | 'csv' | 'ohneKm'
const filter = ref<Filter>('alle')

const neuOffen = ref(false)
const bearbeitet = ref<string>('')

const leereFahrt = () => ({
  date: heute(),
  time: '',
  km: '',
  name: '',
  indoor: false,
  bikeId: '',
})
const neu = ref(leereFahrt())

const meineRaeder = computed(() =>
  store.state.bikes.filter((b) => b.ownerId === store.state.me?.id),
)

const fahrten = computed(() => {
  const alle = store.state.rides
  if (filter.value === 'manuell') return alle.filter((f) => f.source === 'MANUAL')
  if (filter.value === 'importiert') return alle.filter((f) => f.source !== 'MANUAL')
  if (filter.value === 'offen') return alle.filter((f) => f.unassigned)
  if (filter.value === 'csv') return alle.filter((f) => f.externalProvider === 'csv')
  if (filter.value === 'ohneKm') return alle.filter((f) => !(f.km > 0))
  return alle
})

const summe = computed(() => fahrten.value.reduce((s, f) => s + f.km, 0))

/** Fahrten, für die der Anbieter keine Kilometer führt und die noch niemand
 *  von Hand nachgetragen hat. */
const ohneDistanz = computed(
  () => fahrten.value.filter((f) => f.ohneDistanz && !f.kmKorrigiert).length,
)

const ohneKm = computed(() => store.state.rides.filter((f) => !(f.km > 0)).length)
const ausCsv = computed(() => store.state.rides.filter((f) => f.externalProvider === 'csv').length)

// ── Tabelle einlesen ─────────────────────────────────────────────────────────
// Für Fahrten aus der Zeit vor dem Gerät, die als CSV vorliegen
// (name,date,sport,distance_km). Erst Vorschau, dann übernehmen.
const importOffen = ref(false)
const importText = ref('')
const importBis = ref('')
const importDatei = ref('')
const bericht = ref<ImportBericht | null>(null)
const laeuft = ref(false)

async function dateiGewaehlt(ereignis: Event) {
  const datei = (ereignis.target as HTMLInputElement).files?.[0]
  if (!datei) return
  importDatei.value = datei.name
  importText.value = await datei.text()
  bericht.value = null
  await vorschau()
}

async function vorschau() {
  if (!importText.value) return
  laeuft.value = true
  bericht.value = await store.csvImport(importText.value, importBis.value)
  laeuft.value = false
}

async function uebernehmen() {
  if (!importText.value || laeuft.value) return
  laeuft.value = true
  const ergebnis = await store.csvImport(importText.value, importBis.value, true)
  laeuft.value = false
  if (!ergebnis) return
  store.hinweis.value = `${ergebnis.angelegt} Fahrten übernommen, davon ${ergebnis.ohneDistanz} ohne Distanz.`
  importOffen.value = false
  importText.value = ''
  importDatei.value = ''
  bericht.value = null
}

const sammelFrage = ref(false)

/** Löscht genau das, was der aktive Filter gerade zeigt. */
async function sammelLoeschen() {
  const ids = fahrten.value.filter((f) => f.ownerId === store.state.me?.id).map((f) => f.id)
  sammelFrage.value = false
  if (!ids.length) return
  const ok = await store.fahrtenLoeschen({ ids })
  if (ok) store.hinweis.value = `${ids.length} Fahrten gelöscht.`
}

async function anlegen() {
  const km = Number(String(neu.value.km).replace(',', '.'))
  if (!(km > 0)) return
  const ok = await store.fahrtAnlegen({
    date: neu.value.date,
    km,
    time: neu.value.time || undefined,
    name: neu.value.name.trim() || undefined,
    indoor: neu.value.indoor,
    bikeId: neu.value.bikeId || undefined,
  })
  if (ok) {
    neuOffen.value = false
    neu.value = leereFahrt()
  }
}

function feldSpeichern(fahrt: Fahrt, feld: 'date' | 'name', wert: string) {
  store.fahrtSpeichern(fahrt.id, { [feld]: wert })
}

function kmSpeichern(fahrt: Fahrt, wert: string) {
  const km = Number(String(wert).replace(',', '.'))
  if (km > 0) store.fahrtSpeichern(fahrt.id, { km })
}

/** Rad von Hand setzen; leer heißt „wieder nach Datum entscheiden“. */
function radSetzen(fahrt: Fahrt, bikeId: string) {
  store.fahrtSpeichern(fahrt.id, { bikeId: bikeId || null, setupId: null })
}

function darfAendern(fahrt: Fahrt) {
  return fahrt.ownerId === store.state.me?.id
}

/** Woher die Fahrt kam – steht als Marke in der Zeile. */
const QUELLEN: Record<string, string> = {
  WAHOO: 'Wahoo',
  INTERVALS_WAHOO: 'Intervals.icu',
  MANUAL: 'von Hand',
}

function quelle(fahrt: Fahrt) {
  return QUELLEN[fahrt.source] ?? fahrt.externalProvider ?? 'geholt'
}

/**
 * Distanz einer geholten Fahrt von Hand setzen. Manche Rollenfahrten kommen
 * ohne Kilometer an – der Anbieter kennt schlicht keine. Der korrigierte Wert
 * wird getrennt gespeichert und überlebt den nächsten Sync.
 */
function distanzKorrigieren(fahrt: Fahrt, wert: string) {
  const roh = String(wert).trim().replace(',', '.')
  if (!roh) return store.fahrtSpeichern(fahrt.id, { km: null })
  const km = Number(roh)
  if (km >= 0) store.fahrtSpeichern(fahrt.id, { km })
}
</script>

<template>
  <div class="seite">
    <header class="kopf">
      <div>
        <p class="cap">Fahrten</p>
        <h2>{{ store.state.fahrten }} insgesamt</h2>
      </div>
      <div class="kopfknoepfe">
        <button type="button" class="still" @click="importOffen = !importOffen">
          {{ importOffen ? 'Abbrechen' : 'CSV' }}
        </button>
        <button type="button" class="primaer" @click="neuOffen = !neuOffen">
          {{ neuOffen ? 'Abbrechen' : '+ Fahrt' }}
        </button>
      </div>
    </header>

    <!-- Nachtragen, was vor dem Wahoo liegt -->
    <form v-if="neuOffen" class="neuform card" @submit.prevent="anlegen">
      <p class="fussnote">
        Für Fahrten, die nirgends automatisch ankommen – etwa aus der Zeit vor dem Wahoo. Sie zählen
        genauso wie geholte Fahrten.
      </p>
      <div class="reihe">
        <label class="klein">
          Datum
          <input v-model="neu.date" type="date" required />
        </label>
        <label class="klein">
          Uhrzeit
          <input v-model="neu.time" type="time" />
        </label>
      </div>
      <div class="reihe">
        <label class="klein">
          Distanz (km)
          <input v-model="neu.km" inputmode="decimal" placeholder="72,4" required />
        </label>
        <label class="klein">
          Rad
          <select v-model="neu.bikeId">
            <option value="">nach Datum</option>
            <option v-for="b in meineRaeder" :key="b.id" :value="b.id">{{ b.name }}</option>
          </select>
        </label>
      </div>
      <label class="klein">
        Titel
        <input v-model="neu.name" maxlength="80" placeholder="z. B. Hausrunde" />
      </label>
      <label class="haken">
        <input v-model="neu.indoor" type="checkbox" />
        auf der Rolle gefahren
      </label>
      <button type="submit" class="primaer">Eintragen →</button>
    </form>

    <!-- Tabelle einlesen -->
    <section v-if="importOffen" class="neuform card">
      <p class="fussnote">
        Erwartet wird eine Tabelle mit den Spalten <code>name,date,sport,distance_km</code>,
        US-Datum und „Ride“ bzw. „Virtual Ride“ als Sportart – daraus wird draußen bzw. Rolle.
        Zweimal einlesen legt nichts doppelt an.
      </p>
      <div class="reihe">
        <label class="klein">
          Datei
          <input type="file" accept=".csv,text/csv" @change="dateiGewaehlt" />
        </label>
        <label class="klein">
          Nur vor dem
          <input v-model="importBis" type="date" @change="vorschau" />
        </label>
      </div>

      <template v-if="bericht">
        <p class="summe">
          {{ bericht.angelegt }} neue Fahrten · {{ kmText(bericht.km) }}
          <template v-if="bericht.schonDa"> · {{ bericht.schonDa }} schon vorhanden</template>
        </p>
        <p v-if="bericht.hundertstel" class="fussnote">
          Die Spalte <code>distance_km</code> enthält Hundertstel-Kilometer (17057 → 170,57 km) – so
          wird sie gelesen.
        </p>
        <p v-if="bericht.ohneDistanz" class="warnzeile">
          {{ bericht.ohneDistanz }} davon ohne Distanz: Dort stehen Datum und Distanz im Export für
          mehrere Fahrten gleich, das sind keine echten Werte. Die Kilometer trägst du bei Bedarf
          von Hand nach.
        </p>
        <ul v-if="bericht.beispiele?.length" class="beispiele">
          <li v-for="(b, i) in bericht.beispiele" :key="i">
            {{ datumText(b.date) }} · {{ b.km ? kmText(b.km) : 'ohne Distanz' }} ·
            {{ b.indoor ? 'Rolle' : 'draußen' }} · {{ b.name }}
          </li>
        </ul>
        <p v-if="bericht.ignoriertGesamt" class="fussnote">
          {{ bericht.ignoriertGesamt }} Zeilen übersprungen (fremde Sportart oder außerhalb des
          Zeitraums).
        </p>
        <button
          type="button"
          class="primaer"
          :disabled="!bericht.angelegt || laeuft"
          @click="uebernehmen"
        >
          {{ bericht.angelegt }} Fahrten übernehmen →
        </button>
      </template>
      <p v-else-if="importDatei" class="fussnote">{{ importDatei }} wird gelesen …</p>
    </section>

    <nav class="filter">
      <button
        v-for="f in [
          { id: 'alle', label: 'Alle' },
          { id: 'importiert', label: 'Geholt' },
          { id: 'manuell', label: 'Von Hand' },
          { id: 'offen', label: `Ohne Rad (${store.state.ohneZuordnung})` },
          { id: 'ohneKm', label: `Ohne km (${ohneKm})` },
          ...(ausCsv ? [{ id: 'csv', label: `Aus CSV (${ausCsv})` }] : []),
        ]"
        :key="f.id"
        type="button"
        class="chip"
        :class="{ aktiv: filter === f.id }"
        @click="filter = f.id as Filter"
      >
        {{ f.label }}
      </button>
    </nav>

    <div class="summenzeile">
      <p class="summe">
        {{ fahrten.length }} Fahrten · {{ kmText(summe) }}
        <template v-if="ohneDistanz"> · {{ ohneDistanz }} ohne Distanz</template>
      </p>
      <!-- Ganze Auswahl wegräumen – zweistufig, das ist nicht rückgängig zu machen -->
      <template v-if="fahrten.length && filter !== 'alle'">
        <button v-if="!sammelFrage" type="button" class="still schmal" @click="sammelFrage = true">
          Angezeigte löschen
        </button>
        <span v-else class="sammelfrage">
          {{ fahrten.length }} Fahrten löschen?
          <button type="button" class="still schmal" @click="sammelFrage = false">Nein</button>
          <button type="button" class="gefahr schmal" @click="sammelLoeschen">Ja</button>
        </span>
      </template>
    </div>

    <ul class="liste">
      <li
        v-for="fahrt in fahrten"
        :key="fahrt.id"
        class="fahrt card"
        :class="{ offen: fahrt.unassigned }"
      >
        <button
          type="button"
          class="zeile"
          @click="bearbeitet = bearbeitet === fahrt.id ? '' : fahrt.id"
        >
          <div class="links">
            <p class="titel">
              {{ fahrt.name || 'Fahrt' }}
              <span class="quelle" :class="fahrt.source === 'MANUAL' ? 'manuell' : 'geholt'">
                {{ quelle(fahrt) }}
              </span>
              <span v-if="fahrt.indoor" class="quelle drinnen">Rolle</span>
              <span v-if="fahrt.ohneDistanz && !fahrt.kmKorrigiert" class="quelle fehlt">
                ohne Distanz
              </span>
              <span v-else-if="fahrt.kmKorrigiert" class="quelle korrigiert">km von Hand</span>
            </p>
            <p class="meta">
              {{ datumText(fahrt.date) }}{{ fahrt.time ? `, ${fahrt.time} Uhr` : '' }} ·
              <template v-if="fahrt.bikeId">
                {{ fahrt.bikeName
                }}<template v-if="fahrt.setupName"> / {{ fahrt.setupName }}</template>
              </template>
              <template v-else>kein Rad für dieses Datum</template>
              <span v-if="fahrt.override" class="hand">von Hand zugeordnet</span>
            </p>
          </div>
          <span class="km">{{ kmText(fahrt.km) }}</span>
        </button>

        <div v-if="bearbeitet === fahrt.id && darfAendern(fahrt)" class="details">
          <label class="klein">
            Rad
            <select
              :value="fahrt.override?.bikeId ?? ''"
              @change="radSetzen(fahrt, ($event.target as HTMLSelectElement).value)"
            >
              <option value="">nach Datum ({{ fahrt.bikeName || 'keins' }})</option>
              <option v-for="b in meineRaeder" :key="b.id" :value="b.id">{{ b.name }}</option>
            </select>
          </label>

          <template v-if="fahrt.source === 'MANUAL'">
            <div class="reihe">
              <label class="klein">
                Datum
                <input
                  type="date"
                  :value="fahrt.date"
                  @change="feldSpeichern(fahrt, 'date', ($event.target as HTMLInputElement).value)"
                />
              </label>
              <label class="klein">
                Distanz (km)
                <input
                  inputmode="decimal"
                  :value="fahrt.km"
                  @change="kmSpeichern(fahrt, ($event.target as HTMLInputElement).value)"
                />
              </label>
            </div>
            <label class="klein">
              Titel
              <input
                :value="fahrt.name"
                maxlength="80"
                @change="feldSpeichern(fahrt, 'name', ($event.target as HTMLInputElement).value)"
              />
            </label>
            <label class="haken">
              <input
                type="checkbox"
                :checked="fahrt.indoor"
                @change="
                  store.fahrtSpeichern(fahrt.id, {
                    indoor: ($event.target as HTMLInputElement).checked,
                  })
                "
              />
              auf der Rolle gefahren
            </label>
          </template>
          <template v-else>
            <!-- Für Fahrten, zu denen der Anbieter keine Kilometer kennt -->
            <label class="klein">
              Distanz (km) – leer heißt: Wert vom Anbieter ({{ kmText(fahrt.kmGemeldet) }})
              <input
                inputmode="decimal"
                :value="fahrt.kmKorrigiert ? fahrt.km : ''"
                :placeholder="String(fahrt.kmGemeldet)"
                @change="distanzKorrigieren(fahrt, ($event.target as HTMLInputElement).value)"
              />
            </label>
            <p class="fussnote">
              Geholt von {{ quelle(fahrt) }} (Aktivität {{ fahrt.externalActivityId }}). Datum,
              Titel und drinnen/draußen stehen dort; Rad und Distanz lassen sich hier geraderücken,
              ohne dass der nächste Sync es wieder überschreibt.
            </p>
          </template>
        </div>
      </li>
    </ul>

    <p v-if="!fahrten.length" class="leer">
      {{
        filter === 'offen'
          ? 'Jede Fahrt hängt an einem Rad – nichts offen.'
          : 'Noch keine Fahrten. Verbinde Intervals.icu oder trage eine von Hand ein.'
      }}
    </p>

    <p v-if="store.state.fahrten > store.state.rides.length" class="fussnote mitte">
      Angezeigt werden die letzten {{ store.state.fahrtenFenster }} Fahrten (plus alle ohne Rad).
      Gerechnet wird immer mit allen {{ store.state.fahrten }}.
    </p>
  </div>
</template>

<style scoped>
.seite {
  padding-top: 0.8rem;
}

.kopf {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.6rem;
  margin-bottom: 0.8rem;
}

.cap {
  margin: 0;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--violet);
}

h2 {
  margin: 0.1rem 0 0;
  font-size: 1.2rem;
}

.card {
  background: white;
}

.neuform {
  display: grid;
  gap: 0.4rem;
  padding: 0.9rem;
  margin-bottom: 0.9rem;
}

.reihe {
  display: flex;
  gap: 0.4rem;
}

.reihe > * {
  flex: 1;
  min-width: 0;
}

input,
select {
  width: 100%;
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--line);
  border-radius: 0.7rem;
  background: white;
}

.klein {
  display: block;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.klein input,
.klein select {
  margin-top: 0.2rem;
}

.haken {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.88rem;
  font-weight: 600;
}

.haken input {
  width: auto;
}

.filter {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.chip {
  padding: 0.35rem 0.75rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--card);
  color: var(--muted);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}

.chip.aktiv {
  border-color: color-mix(in srgb, var(--violet) 45%, transparent);
  background: color-mix(in srgb, var(--violet) 12%, white);
  color: var(--violet);
}

.kopfknoepfe {
  display: flex;
  gap: 0.35rem;
}

.beispiele {
  list-style: none;
  margin: 0.4rem 0;
  padding: 0;
  display: grid;
  gap: 0.2rem;
  color: var(--muted);
  font-size: 0.78rem;
}

.warnzeile {
  margin: 0.3rem 0;
  color: var(--amber);
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1.4;
}

.summenzeile {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0.6rem 0;
}

.summe {
  margin: 0;
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 600;
}

.sammelfrage {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--red);
}

.liste {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.4rem;
}

.fahrt {
  overflow: hidden;
}

.fahrt.offen {
  border-color: color-mix(in srgb, var(--amber) 45%, transparent);
}

.zeile {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.6rem 0.75rem;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.links {
  flex: 1;
  min-width: 0;
}

.titel {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin: 0;
  font-weight: 600;
}

.quelle {
  padding: 0.05rem 0.45rem;
  border-radius: 999px;
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.quelle.geholt {
  background: color-mix(in srgb, var(--cyan) 12%, white);
  color: var(--cyan);
}

.quelle.manuell {
  background: color-mix(in srgb, var(--violet) 12%, white);
  color: var(--violet);
}

.quelle.drinnen {
  background: color-mix(in srgb, var(--amber) 14%, white);
  color: var(--amber);
}

.quelle.fehlt {
  background: color-mix(in srgb, var(--red) 10%, white);
  color: var(--red);
}

.quelle.korrigiert {
  background: color-mix(in srgb, var(--green) 12%, white);
  color: var(--green);
}

.meta {
  margin: 0.15rem 0 0;
  color: var(--muted);
  font-size: 0.78rem;
}

.hand {
  margin-left: 0.35rem;
  font-style: italic;
}

.km {
  flex-shrink: 0;
  font-weight: 700;
}

.details {
  display: grid;
  gap: 0.4rem;
  padding: 0.6rem 0.75rem 0.8rem;
  border-top: 1px solid var(--line);
  background: var(--bg);
}

.primaer,
.still,
.gefahr {
  padding: 0.5rem 0.9rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: white;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.primaer {
  border-color: color-mix(in srgb, var(--violet) 35%, transparent);
  background: var(--violet);
  color: white;
}

.gefahr {
  border-color: color-mix(in srgb, var(--red) 30%, transparent);
  color: var(--red);
}

.schmal {
  justify-self: start;
  padding: 0.35rem 0.7rem;
  font-size: 0.78rem;
}

.fussnote {
  margin: 0;
  color: var(--muted);
  font-size: 0.78rem;
  line-height: 1.4;
}

.mitte {
  margin-top: 0.8rem;
  text-align: center;
}

.leer {
  margin-top: 1.5rem;
  color: var(--muted);
  text-align: center;
}
</style>
