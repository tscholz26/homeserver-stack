<script setup lang="ts">
import { computed, ref } from 'vue'
import { useTracker } from '@/composables/useTracker'
import type { Bike, Kategorie } from '@/composables/useTracker'
import { datumText, heute, kmText } from '@/utils/verschleiss'
import TeileFenster from '@/components/TeileFenster.vue'

/**
 * Die Räder mit ihren Nutzungszeiträumen und Aufbauten. Der Zeitraum ist hier
 * kein Beiwerk: Er entscheidet, auf welches Rad eine Fahrt gebucht wird, und
 * deshalb dürfen sich zwei Räder desselben Profils nicht überlappen – der
 * Server lehnt das ab.
 */
const store = useTracker()

const teileFenster = ref<{ bike: Bike; typ: Kategorie } | null>(null)
const neuOffen = ref(false)
const neu = ref({ name: '', manufacturer: '', model: '', from: heute() })

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
    neu.value = { name: '', manufacturer: '', model: '', from: heute() }
  }
}

function feld(bike: Bike, feldName: 'name' | 'manufacturer' | 'model' | 'from', wert: string) {
  if (bike[feldName] === wert) return
  store.radSpeichern(bike.id, { [feldName]: wert })
}

/** „genutzt bis“ leer = das Rad fahre ich gerade. */
function bisSetzen(bike: Bike, wert: string) {
  store.radSpeichern(bike.id, { to: wert || null })
}

function inNutzung(bike: Bike) {
  return !bike.to || bike.to >= heute()
}

function teileAm(bike: Bike) {
  return store.state.components.filter((c) => c.bikeId === bike.id)
}

function kategorienAm(bike: Bike) {
  return store.kategorienAm(bike.id)
}
</script>

<template>
  <div class="seite">
    <header class="kopf">
      <div>
        <p class="cap">Deine Räder</p>
        <h2>Was wann gefahren wurde</h2>
      </div>
      <button type="button" class="primaer" @click="neuOffen = !neuOffen">
        {{ neuOffen ? 'Abbrechen' : '+ Rad' }}
      </button>
    </header>

    <p class="hinweis">
      Der Nutzungszeitraum entscheidet, auf welches Rad eine Fahrt gebucht wird – zwei Räder dürfen
      sich deshalb nicht überschneiden. „Genutzt bis“ leer lassen heißt: das fahre ich gerade.
    </p>

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
        <span class="status" :class="{ aktuell: inNutzung(bike) }">
          {{ inNutzung(bike) ? 'aktuell' : 'ausgemustert' }}
        </span>
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

      <div class="reihe">
        <label class="klein">
          Genutzt ab
          <input
            type="date"
            :value="bike.from"
            @change="feld(bike, 'from', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="klein">
          Genutzt bis
          <input
            type="date"
            :value="bike.to ?? ''"
            @change="bisSetzen(bike, ($event.target as HTMLInputElement).value)"
          />
        </label>
      </div>
      <p class="zeitraum">
        {{ datumText(bike.from) }} → {{ bike.to ? datumText(bike.to) : 'heute' }}
      </p>

      <!-- Aufbauten: dasselbe Rad draußen und auf der Rolle -->
      <p class="klein">Aufbauten</p>
      <ul class="aufbauten">
        <li v-for="auf in store.aufbautenVon(bike.id)" :key="auf.id">
          <span class="art" :class="auf.kind">{{ auf.kind === 'indoor' ? '🏠' : '🌤' }}</span>
          <input
            :value="auf.name"
            @change="store.aufbauSpeichern(auf.id, ($event.target as HTMLInputElement).value)"
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
        Fahrten drinnen zählen auf den Rollen-Aufbau. Welche Teile daran hängen, entscheidest du je
        Teil – die Kette meist an beiden, die Kassette nur an einem.
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
            <small>{{ datumText(bike.from) }} → {{ bike.to ? datumText(bike.to) : 'heute' }}</small>
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

.zeitraum {
  margin: 0.35rem 0 0;
  font-size: 0.85rem;
  font-weight: 600;
}

.aufbauten {
  list-style: none;
  margin: 0.3rem 0 0.5rem;
  padding: 0;
  display: grid;
  gap: 0.35rem;
}

.aufbauten li {
  display: flex;
  align-items: center;
  gap: 0.4rem;
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
