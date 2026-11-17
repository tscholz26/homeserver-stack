<script setup lang="ts">
import { computed, ref } from 'vue'
import { useTracker } from '@/composables/useTracker'
import type { Art, Bike, Kategorie, Standard } from '@/composables/useTracker'
import { datumText, heute, kmText } from '@/utils/verschleiss'
import TeileFenster from '@/components/TeileFenster.vue'

/**
 * Die Räder mit ihren Aufbauten – und darüber die Standardräder: welches Rad ab
 * wann für draußen und für die Rolle gilt. Daran hängt, auf welches Rad eine
 * Fahrt gebucht wird; Ausnahmen werden an der Fahrt selbst umgestellt.
 */
const store = useTracker()

const ARTEN: { kind: Art; label: string; icon: string }[] = [
  { kind: 'outdoor', label: 'Draußen', icon: '🌤' },
  { kind: 'indoor', label: 'Rolle', icon: '🏠' },
]

const teileFenster = ref<{ bike: Bike; typ: Kategorie } | null>(null)
const neuOffen = ref(false)
const leeresRad = () => ({
  name: '',
  manufacturer: '',
  model: '',
  from: heute(),
  standard: ['outdoor'] as Art[],
})
const neu = ref(leeresRad())

const meine = computed(() =>
  [...store.state.bikes]
    .filter((b) => b.ownerId === store.state.me?.id)
    .sort((a, b) => b.from.localeCompare(a.from)),
)
const fremde = computed(() =>
  [...store.state.bikes]
    .filter((b) => b.ownerId !== store.state.me?.id)
    .sort((a, b) => b.from.localeCompare(a.from)),
)

const loeschFrage = ref('')

async function loeschen(bike: Bike) {
  loeschFrage.value = ''
  await store.radLoeschen(bike.id)
}

async function anlegen() {
  if (!neu.value.name.trim()) return
  const ok = await store.radAnlegen({ ...neu.value, name: neu.value.name.trim() })
  if (ok) {
    neuOffen.value = false
    neu.value = leeresRad()
  }
}

function feld(bike: Bike, feldName: 'name' | 'manufacturer' | 'model' | 'from', wert: string) {
  if (bike[feldName] === wert) return
  store.radSpeichern(bike.id, { [feldName]: wert })
}

function teileAm(bike: Bike) {
  return store.state.components.filter((c) => c.bikeId === bike.id)
}

function kategorienAm(bike: Bike) {
  return store.kategorienAm(bike.id)
}

// ── Standardräder ────────────────────────────────────────────────────────────
const ich = computed(() => store.state.me?.id ?? '')

function radName(id: string) {
  return store.state.bikes.find((b) => b.id === id)?.name ?? '?'
}

/** Wofür dieses Rad heute das Standardrad ist – die Pillen am Rad. */
function standardHeuteFuer(bike: Bike) {
  return ARTEN.filter((a) => store.standardHeute(bike.ownerId, a.kind)?.bikeId === bike.id)
}

/** Einträge, die noch kommen, sind schon gültig – nur eben erst ab ihrem Tag. */
function zukunft(eintrag: Standard) {
  return eintrag.from > heute()
}

const verlaufOffen = ref(false)
const wechsel = ref<{ kind: Art; bikeId: string; from: string }>({
  kind: 'outdoor',
  bikeId: '',
  from: heute(),
})

async function wechselEintragen() {
  if (!wechsel.value.bikeId) return
  const ok = await store.standardSetzen(wechsel.value)
  if (ok) wechsel.value = { ...wechsel.value, bikeId: '', from: heute() }
}

function eintragAendern(eintrag: Standard, changes: { bikeId?: string; from?: string }) {
  if (changes.from === '' || changes.bikeId === '') return
  store.standardSpeichern(eintrag.id, changes)
}
</script>

<template>
  <div class="seite">
    <header class="kopf">
      <div>
        <p class="cap">Deine Räder</p>
        <h2>Welches Rad wofür</h2>
      </div>
      <button type="button" class="primaer" @click="neuOffen = !neuOffen">
        {{ neuOffen ? 'Abbrechen' : '+ Rad' }}
      </button>
    </header>

    <!-- Standardräder: je Art eine Zeitleiste, der jüngste Eintrag gilt -->
    <section v-if="meine.length" class="standard card">
      <p class="klein oben">Standardräder</p>
      <ul class="jetzt">
        <li v-for="a in ARTEN" :key="a.kind">
          <span class="art" :class="a.kind">{{ a.icon }}</span>
          <span class="artname">{{ a.label }}</span>
          <template v-if="store.standardHeute(ich, a.kind)">
            <strong>{{ radName(store.standardHeute(ich, a.kind)!.bikeId) }}</strong>
            <small>seit {{ datumText(store.standardHeute(ich, a.kind)!.from) }}</small>
          </template>
          <em v-else>keins – solche Fahrten bleiben ohne Rad</em>
        </li>
      </ul>

      <button type="button" class="still schmal" @click="verlaufOffen = !verlaufOffen">
        {{ verlaufOffen ? 'Zuklappen' : 'Wechsel & Verlauf' }}
      </button>

      <div v-if="verlaufOffen" class="verlauf">
        <form class="wechsel" @submit.prevent="wechselEintragen">
          <div class="schalter">
            <button
              v-for="a in ARTEN"
              :key="a.kind"
              type="button"
              :class="{ an: wechsel.kind === a.kind }"
              @click="wechsel.kind = a.kind"
            >
              {{ a.icon }} {{ a.label }}
            </button>
          </div>
          <div class="reihe">
            <label class="klein">
              ab
              <input v-model="wechsel.from" type="date" required />
            </label>
            <label class="klein">
              Rad
              <select v-model="wechsel.bikeId" required>
                <option value="" disabled>wählen …</option>
                <option
                  v-for="b in meine"
                  :key="b.id"
                  :value="b.id"
                  :disabled="b.from > wechsel.from"
                >
                  {{ b.name }}{{ b.from > wechsel.from ? ` (erst ab ${datumText(b.from)})` : '' }}
                </option>
              </select>
            </label>
          </div>
          <button type="submit" class="primaer schmal" :disabled="!wechsel.bikeId">
            Wechsel eintragen
          </button>
        </form>

        <div v-for="a in ARTEN" :key="a.kind" class="leiste">
          <p class="klein">{{ a.icon }} {{ a.label }}</p>
          <ul>
            <li
              v-for="e in store.standardsVon(ich, a.kind)"
              :key="e.id"
              :class="{ gilt: store.standardHeute(ich, a.kind)?.id === e.id, kommt: zukunft(e) }"
            >
              <input
                type="date"
                :value="e.from"
                @change="eintragAendern(e, { from: ($event.target as HTMLInputElement).value })"
              />
              <select
                :value="e.bikeId"
                @change="eintragAendern(e, { bikeId: ($event.target as HTMLSelectElement).value })"
              >
                <option v-for="b in meine" :key="b.id" :value="b.id">{{ b.name }}</option>
              </select>
              <button
                type="button"
                class="weg"
                title="Eintrag löschen"
                @click="store.standardLoeschen(e.id)"
              >
                ✕
              </button>
            </li>
            <li v-if="!store.standardsVon(ich, a.kind).length" class="leerzeile">
              noch kein Eintrag
            </li>
          </ul>
        </div>

        <p class="fussnote">
          Es gilt immer der jüngste Eintrag vor einer Fahrt. Für eine Tour mit dem anderen Rad –
          Bikepacking etwa – zwei Wechsel eintragen: ab dem ersten Tag das andere Rad, ab dem Tag
          danach wieder das gewohnte. Für einzelne Fahrten (ein Regentag) stellst du das Rad direkt
          an der Fahrt um.
        </p>
      </div>
    </section>

    <form v-if="neuOffen" class="neuform card" @submit.prevent="anlegen">
      <input v-model="neu.name" placeholder="Name, z. B. Scott Speedster" />
      <div class="reihe">
        <input v-model="neu.manufacturer" placeholder="Hersteller (optional)" />
        <input v-model="neu.model" placeholder="Modell (optional)" />
      </div>
      <label class="klein">
        Genutzt ab
        <input v-model="neu.from" type="date" />
      </label>
      <div class="haken">
        <label v-for="a in ARTEN" :key="a.kind">
          <input v-model="neu.standard" type="checkbox" :value="a.kind" />
          ab dann Standard {{ a.kind === 'indoor' ? 'auf der Rolle' : 'draußen' }}
        </label>
      </div>
      <button type="submit" class="primaer">Anlegen →</button>
    </form>

    <section v-for="bike in meine" :key="bike.id" class="rad card">
      <header class="radkopf">
        <div class="titel">
          <input
            class="name"
            :value="bike.name"
            @change="feld(bike, 'name', ($event.target as HTMLInputElement).value)"
          />
          <p class="km">{{ kmText(bike.totalKm) }} gefahren</p>
        </div>
        <div class="pillen">
          <span v-for="a in standardHeuteFuer(bike)" :key="a.kind" class="status aktuell">
            Standard {{ a.label.toLowerCase() }}
          </span>
        </div>
      </header>

      <div class="reihe">
        <label class="klein">
          Hersteller
          <input
            :value="bike.manufacturer"
            @change="feld(bike, 'manufacturer', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="klein">
          Modell
          <input
            :value="bike.model"
            @change="feld(bike, 'model', ($event.target as HTMLInputElement).value)"
          />
        </label>
      </div>

      <label class="klein">
        Genutzt ab
        <input
          type="date"
          :value="bike.from"
          @change="feld(bike, 'from', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <p class="fussnote">Davor bekommt das Rad keine Fahrt – auch nicht von Hand.</p>

      <!-- Aufbauten: dasselbe Rad draußen und auf der Rolle -->
      <p class="klein">Aufbauten</p>
      <ul class="aufbauten">
        <li v-for="auf in store.aufbautenVon(bike.id)" :key="auf.id" class="aufbau">
          <div class="aufbauzeile">
            <span class="art" :class="auf.kind">{{ auf.kind === 'indoor' ? '🏠' : '🌤' }}</span>
            <input
              :value="auf.name"
              @change="
                store.aufbauSpeichern(auf.id, { name: ($event.target as HTMLInputElement).value })
              "
            />
            <!-- Faktor: auf der Rolle verschleißt ein Kilometer anders als
                 draußen. Wirkt sofort auf alle Fahrten, auch rückwirkend. -->
            <input
              class="faktor"
              type="number"
              min="0.05"
              max="5"
              step="0.05"
              :value="auf.factor"
              :title="`Verschleißfaktor von „${auf.name}“`"
              @change="
                store.aufbauSpeichern(auf.id, {
                  factor: Number(($event.target as HTMLInputElement).value),
                })
              "
            />
            <button
              v-if="auf.kind === 'indoor'"
              type="button"
              class="weg"
              title="Aufbau löschen"
              @click="store.aufbauLoeschen(auf.id)"
            >
              ✕
            </button>
          </div>
          <p class="aufbaukm">
            ×{{ auf.factor }} ·
            <template v-if="auf.factor === 1">
              {{ kmText(auf.gefahren) }} gefahren, zählt eins zu eins
            </template>
            <template v-else>
              {{ kmText(auf.gefahren) }} gefahren → {{ kmText(auf.verschleiss) }} Verschleiß
            </template>
          </p>
        </li>
      </ul>
      <button
        v-if="!store.aufbautenVon(bike.id).some((a) => a.kind === 'indoor')"
        type="button"
        class="still schmal"
        @click="store.aufbauAnlegen(bike.id, 'indoor')"
      >
        + Aufbau „Rolle“
      </button>
      <p class="fussnote">
        Rollenfahrten dieses Rades zählen auf den Rollen-Aufbau. Welche Teile daran hängen,
        entscheidest du je Teil – die Kette meist an beiden, die Kassette nur an einem. Der Faktor
        rechts gewichtet den Verschleiß: 0,95 heißt, 100 km auf der Rolle zählen als 95 km. Er wirkt
        sofort auf alle Fahrten, auch auf die schon eingetragenen.
      </p>

      <!-- Teile dieses Rades, Einstieg wie auf dem Dashboard -->
      <p class="klein">Teile</p>
      <div v-if="kategorienAm(bike).length" class="teilchips">
        <button
          v-for="typ in kategorienAm(bike)"
          :key="typ.id"
          type="button"
          class="chip"
          :style="{ '--farbe': typ.color }"
          @click="teileFenster = { bike, typ }"
        >
          {{ typ.emoji }} {{ typ.name }}
          <span class="anzahl">{{ store.teileAn(bike.id, typ.id).length }}</span>
        </button>
      </div>
      <p v-else class="fussnote">
        Noch keine Teile – auf der Übersicht „Teile“ lassen sie sich anlegen.
      </p>

      <!-- Zweistufig: ein Rad zu löschen nimmt seine Teile mit -->
      <template v-if="loeschFrage === bike.id">
        <p class="warnzeile">
          Löscht auch {{ teileAm(bike).length }} Teile und alle Aufbauten. Die Fahrten bleiben und
          werden „ohne Rad“.
        </p>
        <div class="reihe">
          <button type="button" class="still schmal" @click="loeschFrage = ''">Abbrechen</button>
          <button type="button" class="gefahr schmal" @click="loeschen(bike)">
            Ja, Rad löschen
          </button>
        </div>
      </template>
      <button v-else type="button" class="gefahr schmal" @click="loeschFrage = bike.id">
        Rad löschen
      </button>
    </section>

    <p v-if="!meine.length" class="leer">Noch kein Rad angelegt.</p>

    <template v-if="fremde.length">
      <p class="cap zwischen">Räder der anderen</p>
      <ul class="fremd card">
        <li v-for="bike in fremde" :key="bike.id">
          <span>
            {{ bike.name }}
            <small>seit {{ datumText(bike.from) }}</small>
          </span>
          <span class="besitzer" :style="{ color: store.nutzer(bike.ownerId)?.color }">
            {{ store.nutzer(bike.ownerId)?.name }}
          </span>
        </li>
      </ul>
    </template>

    <TeileFenster
      v-if="teileFenster"
      :bike="teileFenster.bike"
      :typ="teileFenster.typ"
      @close="teileFenster = null"
    />
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
}

.cap {
  margin: 0;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--violet);
}

.zwischen {
  margin-top: 1.4rem;
}

h2 {
  margin: 0.1rem 0 0;
  font-size: 1.2rem;
}

.hinweis {
  margin: 0.5rem 0 0.9rem;
  color: var(--muted);
  font-size: 0.85rem;
  line-height: 1.45;
}

.card {
  padding: 0.9rem;
  background: white;
}

.rad {
  margin-bottom: 0.9rem;
}

.radkopf {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.6rem;
}

.titel {
  flex: 1;
  min-width: 0;
}

.name {
  width: 100%;
  font-size: 1.05rem;
  font-weight: 700;
}

.km {
  margin: 0.2rem 0 0;
  color: var(--muted);
  font-size: 0.82rem;
}

.status {
  flex-shrink: 0;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text) 8%, white);
  color: var(--muted);
  font-size: 0.7rem;
  font-weight: 700;
}

.status.aktuell {
  background: color-mix(in srgb, var(--green) 12%, white);
  color: var(--green);
}

.reihe {
  display: flex;
  gap: 0.4rem;
}

.reihe > * {
  flex: 1;
  min-width: 0;
}

input {
  width: 100%;
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--line);
  border-radius: 0.7rem;
  background: white;
}

.klein {
  display: block;
  margin: 0.6rem 0 0;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.klein input {
  margin-top: 0.2rem;
}

.pillen {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.25rem;
}

.standard {
  margin: 0.8rem 0 0.9rem;
}

.klein.oben {
  margin-top: 0;
}

.jetzt {
  list-style: none;
  margin: 0.45rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.4rem;
}

.jetzt li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.92rem;
}

.artname {
  width: 4.2rem;
  flex-shrink: 0;
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 600;
}

.jetzt strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.jetzt small {
  margin-left: auto;
  flex-shrink: 0;
  color: var(--muted);
  font-size: 0.75rem;
}

.jetzt em {
  color: var(--muted);
  font-size: 0.8rem;
}

.verlauf {
  margin-top: 0.7rem;
  padding-top: 0.7rem;
  border-top: 1px solid var(--line);
}

.wechsel {
  display: grid;
  gap: 0.2rem;
}

.schalter {
  display: flex;
  gap: 0.35rem;
}

.schalter button {
  flex: 1;
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: white;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}

.schalter button.an {
  border-color: var(--violet);
  background: color-mix(in srgb, var(--violet) 10%, white);
  color: var(--violet);
}

.leiste ul {
  list-style: none;
  margin: 0.25rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.3rem;
}

.leiste li {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding-left: 0.5rem;
  border-left: 3px solid transparent;
}

.leiste li.gilt {
  border-left-color: var(--green);
}

.leiste li.kommt {
  border-left-color: var(--amber);
}

.leiste li input {
  flex: 0 0 9.5rem;
}

.leiste li select {
  flex: 1;
  min-width: 0;
}

.leerzeile {
  color: var(--muted);
  font-size: 0.8rem;
}

select {
  width: 100%;
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--line);
  border-radius: 0.7rem;
  background: white;
  font: inherit;
}

.klein select {
  margin-top: 0.2rem;
}

.haken {
  display: grid;
  gap: 0.3rem;
  margin: 0.3rem 0;
  font-size: 0.85rem;
}

.haken label {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.haken input {
  width: auto;
}

.aufbauten {
  list-style: none;
  margin: 0.3rem 0 0.5rem;
  padding: 0;
  display: grid;
  gap: 0.35rem;
}

.aufbau {
  padding-bottom: 0.15rem;
}

.aufbauzeile {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.faktor {
  flex: 0 0 4.4rem;
  text-align: center;
}

.aufbaukm {
  margin: 0.15rem 0 0 2.3rem;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 600;
}

.art {
  display: grid;
  place-items: center;
  width: 1.9rem;
  height: 1.9rem;
  flex-shrink: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--cyan) 12%, white);
}

.art.indoor {
  background: color-mix(in srgb, var(--amber) 14%, white);
}

.teilchips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.35rem;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.7rem;
  border: 1px solid color-mix(in srgb, var(--farbe) 35%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--farbe) 8%, white);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.anzahl {
  padding: 0 0.35rem;
  border-radius: 999px;
  background: white;
  font-size: 0.72rem;
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

.still {
  color: var(--muted);
}

.gefahr {
  border-color: color-mix(in srgb, var(--red) 30%, transparent);
  color: var(--red);
}

.schmal {
  margin-top: 0.6rem;
  padding: 0.35rem 0.7rem;
  font-size: 0.78rem;
}

.weg {
  width: 1.8rem;
  height: 1.8rem;
  flex-shrink: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.warnzeile {
  margin: 0.6rem 0 0.3rem;
  color: var(--red);
  font-size: 0.8rem;
  font-weight: 600;
}

.fussnote {
  margin: 0.4rem 0 0;
  color: var(--muted);
  font-size: 0.78rem;
  line-height: 1.4;
}

.neuform {
  display: grid;
  gap: 0.4rem;
  margin-bottom: 0.9rem;
}

.fremd {
  list-style: none;
  margin: 0;
  padding: 0.7rem 0.9rem;
  display: grid;
  gap: 0.4rem;
}

.fremd li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.fremd small {
  display: block;
  color: var(--muted);
  font-size: 0.75rem;
}

.besitzer {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.leer {
  margin-top: 1.5rem;
  color: var(--muted);
  text-align: center;
}
</style>
