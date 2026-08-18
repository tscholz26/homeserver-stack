<script setup lang="ts">
import { computed, ref } from 'vue'
import { useTracker } from '@/composables/useTracker'
import type { Bike } from '@/composables/useTracker'
import { datumText, kmText } from '@/utils/verschleiss'

/**
 * Verwaltung in Reitern statt einer langen Rolle – auf dem Handy sonst kaum zu
 * überblicken. Geändert wird immer nur das eigene Profil und die eigenen
 * Räder; Kategorien und Ampel gelten für alle.
 */
const store = useTracker()

type Reiter = 'raeder' | 'kategorien' | 'wahoo' | 'einstellungen'
const reiter = ref<Reiter>('raeder')

const meineRaeder = computed(() =>
  store.state.bikes.filter((b) => b.ownerId === store.state.me?.id),
)
const fremdeRaeder = computed(() =>
  store.state.bikes.filter((b) => b.ownerId !== store.state.me?.id),
)

// ── Räder ────────────────────────────────────────────────────────────────────
const neuesRad = ref('')

async function radAnlegen() {
  if (!neuesRad.value.trim()) return
  const ok = await store.radAnlegen(neuesRad.value.trim(), [])
  if (ok) neuesRad.value = ''
}

/**
 * Wahoo liefert keine Ausrüstung zur Fahrt, deshalb entscheidet die Sportart,
 * auf welches Rad eine Fahrt geht. Ein Tipp auf die Pille teilt sie zu oder
 * nimmt sie wieder weg – der Server sorgt dafür, dass sie danach nur an einem
 * Rad hängt.
 */
function typUmschalten(bike: Bike, typeId: number) {
  const da = bike.workoutTypeIds.includes(typeId)
  const neu = da
    ? bike.workoutTypeIds.filter((id) => id !== typeId)
    : [...bike.workoutTypeIds, typeId]
  return store.radSpeichern(bike.id, { workoutTypeIds: neu })
}

/** An welchem anderen Rad diese Sportart gerade hängt – für den Hinweis. */
function haengtAn(bike: Bike, typeId: number) {
  return meineRaeder.value.find((b) => b.id !== bike.id && b.workoutTypeIds.includes(typeId))
}

// ── Kategorien ───────────────────────────────────────────────────────────────
const neueKategorie = ref({ name: '', emoji: '🔧', defaultLimitKm: '3000' })

async function kategorieAnlegen() {
  if (!neueKategorie.value.name.trim()) return
  const ok = await store.kategorieAnlegen({
    name: neueKategorie.value.name.trim(),
    emoji: neueKategorie.value.emoji,
    defaultLimitKm: Number(neueKategorie.value.defaultLimitKm) || 3000,
  })
  if (ok) neueKategorie.value = { name: '', emoji: '🔧', defaultLimitKm: '3000' }
}

function teileZuKategorie(typeId: string) {
  return store.state.components.filter((c) => c.typeId === typeId).length
}

// ── Ampel ────────────────────────────────────────────────────────────────────
const gelb = ref(String(store.state.settings.thresholds.yellow))
const rot = ref(String(store.state.settings.thresholds.red))

function schwellenSpeichern() {
  store.schwellenSpeichern(Number(gelb.value), Number(rot.value))
}

// ── Profil ───────────────────────────────────────────────────────────────────
const meinName = ref(store.state.me?.name ?? '')
const altePin = ref('')
const neuePin = ref('')

async function pinAendern() {
  const ok = await store.pinAendern(altePin.value, neuePin.value)
  altePin.value = ''
  neuePin.value = ''
  if (ok) store.hinweis.value = 'PIN geändert.'
}

const FARBEN = ['#7c3aed', '#0891b2', '#c2740a', '#15803d', '#be185d', '#4338ca']
</script>

<template>
  <div class="seite">
    <nav class="reiter">
      <button
        v-for="r in [
          { id: 'raeder', label: 'Räder' },
          { id: 'kategorien', label: 'Kategorien' },
          { id: 'wahoo', label: 'Wahoo' },
          { id: 'einstellungen', label: 'Einstellungen' },
        ]"
        :key="r.id"
        type="button"
        class="chip"
        :class="{ aktiv: reiter === r.id }"
        @click="reiter = r.id as Reiter"
      >
        {{ r.label }}
      </button>
    </nav>

    <!-- ── Räder ─────────────────────────────────────────────────────────── -->
    <section v-if="reiter === 'raeder'" class="block card">
      <p class="cap">Deine Räder</p>
      <h2>Rad und Sportarten</h2>
      <p class="hinweis">
        Wahoo hängt an eine Fahrt kein Rad – deshalb entscheidet die Sportart, wohin die Kilometer
        gehen. Jede Sportart gehört zu genau einem Rad; teilst du sie neu zu, verliert das andere
        Rad sie.
      </p>

      <ul class="liste raeder">
        <li v-for="bike in meineRaeder" :key="bike.id">
          <div class="radzeile">
            <input
              :value="bike.name"
              aria-label="Name des Rades"
              @change="
                store.radSpeichern(bike.id, { name: ($event.target as HTMLInputElement).value })
              "
            />
            <button type="button" class="gefahr" @click="store.radLoeschen(bike.id)">
              Löschen
            </button>
          </div>
          <div class="typen">
            <button
              v-for="typ in store.state.workoutTypes"
              :key="typ.id"
              type="button"
              class="typ"
              :class="{ an: bike.workoutTypeIds.includes(typ.id) }"
              :title="
                haengtAn(bike, typ.id) ? `hängt gerade an ${haengtAn(bike, typ.id)?.name}` : ''
              "
              @click="typUmschalten(bike, typ.id)"
            >
              {{ typ.name }}
            </button>
          </div>
          <p v-if="!bike.workoutTypeIds.length" class="warnzeile">
            Ohne Sportart bekommt dieses Rad keine Kilometer.
          </p>
        </li>
        <li v-if="!meineRaeder.length" class="leer">Noch kein eigenes Rad.</li>
      </ul>

      <form class="neu" @submit.prevent="radAnlegen">
        <input v-model="neuesRad" placeholder="Neues Rad, z. B. Scott Speedster" />
        <button type="submit" class="primaer">Anlegen →</button>
      </form>

      <template v-if="fremdeRaeder.length">
        <p class="cap zwischen">Räder der anderen</p>
        <ul class="liste fremd">
          <li v-for="bike in fremdeRaeder" :key="bike.id">
            <span>{{ bike.name }}</span>
            <span class="besitzer" :style="{ color: store.nutzer(bike.ownerId)?.color }">
              {{ store.nutzer(bike.ownerId)?.name }}
            </span>
          </li>
        </ul>
      </template>
    </section>

    <!-- ── Kategorien ────────────────────────────────────────────────────── -->
    <section v-if="reiter === 'kategorien'" class="block card">
      <p class="cap">Für alle Räder</p>
      <h2>Kategorien und Standard-Grenzen</h2>
      <p class="hinweis">
        Der Standard gilt überall dort, wo weder das Rad noch das einzelne Teil einen eigenen Wert
        hat.
      </p>

      <ul class="liste">
        <li v-for="typ in store.state.componentTypes" :key="typ.id">
          <input
            class="emoji"
            :value="typ.emoji"
            aria-label="Symbol"
            @change="
              store.kategorieSpeichern(typ.id, { emoji: ($event.target as HTMLInputElement).value })
            "
          />
          <input
            :value="typ.name"
            aria-label="Name"
            @change="
              store.kategorieSpeichern(typ.id, { name: ($event.target as HTMLInputElement).value })
            "
          />
          <input
            class="zahl"
            type="number"
            inputmode="numeric"
            min="1"
            step="100"
            :value="typ.defaultLimitKm"
            aria-label="Standard-Grenzwert in km"
            @change="
              store.kategorieSpeichern(typ.id, {
                defaultLimitKm: Number(($event.target as HTMLInputElement).value),
              })
            "
          />
          <button
            type="button"
            class="gefahr"
            :disabled="teileZuKategorie(typ.id) > 0"
            :title="teileZuKategorie(typ.id) ? 'Es gibt noch Teile dieser Kategorie' : 'Löschen'"
            @click="store.kategorieLoeschen(typ.id)"
          >
            Löschen
          </button>
        </li>
      </ul>

      <form class="neu" @submit.prevent="kategorieAnlegen">
        <input v-model="neueKategorie.emoji" class="emoji" maxlength="2" aria-label="Symbol" />
        <input v-model="neueKategorie.name" placeholder="Neue Kategorie" />
        <input
          v-model="neueKategorie.defaultLimitKm"
          class="zahl"
          type="number"
          min="1"
          step="100"
          aria-label="Grenzwert in km"
        />
        <button type="submit" class="primaer">Anlegen →</button>
      </form>
    </section>

    <!-- ── Wahoo ─────────────────────────────────────────────────────────── -->
    <section v-if="reiter === 'wahoo'" class="block card">
      <p class="cap">Dein Konto</p>
      <h2>Wahoo-Verbindung</h2>

      <p v-if="!store.wahooConfigured.value" class="warnbox">
        Auf dem Server fehlen WAHOO_CLIENT_ID und WAHOO_CLIENT_SECRET – bis die eingetragen sind,
        lässt sich kein Konto verbinden.
      </p>

      <template v-else-if="store.state.me?.hasWahoo">
        <p v-if="store.state.me.needsReconnect" class="warnbox">
          Wahoo hat den Zugriff beendet – bis zum Neuverbinden kommen keine Fahrten mehr an.
        </p>
        <p class="hinweis">
          Verbunden als <strong>{{ store.state.me.athleteName || 'Wahoo-Konto' }}</strong
          >. Zuletzt geholt:
          {{ store.state.me.lastSyncAt ? datumText(store.state.me.lastSyncAt) : 'noch nie' }}. Neue
          Fahrten meldet Wahoo per Webhook; zusätzlich fragt der Server alle
          {{ store.state.settings.syncIntervalHours }} Stunden selbst nach.
        </p>
        <p class="zahlen">{{ store.state.fahrten }} Fahrten geholt</p>

        <!-- Sportarten, die an keinem Rad hängen: die zählen nirgends mit -->
        <template v-if="store.state.ohneZuordnung.length">
          <p class="cap zwischen">Ohne Rad</p>
          <ul class="liste luecken">
            <li v-for="l in store.state.ohneZuordnung" :key="l.workoutTypeId">
              <span>{{ l.name }}</span>
              <span class="besitzer">{{ l.anzahl }} Fahrten · {{ kmText(l.km) }}</span>
            </li>
          </ul>
          <p class="hinweis">
            Diese Sportarten sind keinem Rad zugeteilt – im Reiter „Räder“ nachholen, dann zählen
            ihre Kilometer rückwirkend mit.
          </p>
        </template>

        <p v-if="store.state.me.lastSyncError" class="warnbox">
          Letzter Sync-Fehler: {{ store.state.me.lastSyncError }}
        </p>
        <div class="knoepfe">
          <button type="button" class="primaer" @click="store.wahooSync()">Jetzt holen</button>
          <button
            v-if="store.state.me.needsReconnect"
            type="button"
            class="still"
            @click="store.wahooVerbinden()"
          >
            Neu verbinden
          </button>
          <button type="button" class="gefahr" @click="store.wahooTrennen()">Trennen</button>
        </div>
        <p class="hinweis">
          Beim Trennen wird die Freigabe auch bei Wahoo zurückgezogen und die geholten Fahrten gehen
          mit – ein alter, nicht mehr auffrischbarer Stand wäre irreführender als gar keiner.
        </p>
      </template>

      <template v-else>
        <p class="hinweis">
          Ohne Verbindung bleibt jedes Teil bei 0 km. Der Tracker liest nur Workouts, er schreibt
          nichts nach Wahoo.
        </p>
        <button type="button" class="primaer" @click="store.wahooVerbinden()">
          Mit Wahoo verbinden →
        </button>
      </template>
    </section>

    <!-- ── Einstellungen ─────────────────────────────────────────────────── -->
    <section v-if="reiter === 'einstellungen'" class="block card">
      <p class="cap">Für alle</p>
      <h2>Ampel</h2>
      <p class="hinweis">Prozent vom Grenzwert: darunter grün, dazwischen gelb, darüber rot.</p>
      <div class="ampel">
        <label class="klein">
          Gelb ab
          <input v-model="gelb" type="number" min="1" max="99" @change="schwellenSpeichern" />
        </label>
        <label class="klein">
          Rot ab
          <input v-model="rot" type="number" min="2" @change="schwellenSpeichern" />
        </label>
        <span class="einheit">%</span>
      </div>

      <p class="cap zwischen">Dein Profil</p>
      <h2>Name, Farbe und PIN</h2>
      <div class="profilzeile">
        <input v-model="meinName" aria-label="Dein Name" />
        <button type="button" class="still" @click="store.profilSpeichern({ name: meinName })">
          Speichern
        </button>
      </div>
      <div class="farben">
        <button
          v-for="farbe in FARBEN"
          :key="farbe"
          type="button"
          class="farbe"
          :class="{ aktiv: store.state.me?.color === farbe }"
          :style="{ background: farbe }"
          :aria-label="`Farbe ${farbe}`"
          @click="store.profilSpeichern({ color: farbe })"
        ></button>
      </div>

      <form class="pinform" @submit.prevent="pinAendern">
        <input
          v-model="altePin"
          type="password"
          inputmode="numeric"
          maxlength="6"
          placeholder="Bisherige PIN"
          aria-label="Bisherige PIN"
        />
        <input
          v-model="neuePin"
          type="password"
          inputmode="numeric"
          maxlength="6"
          placeholder="Neue PIN"
          aria-label="Neue PIN"
        />
        <button type="submit" class="still" :disabled="neuePin.length < 4">PIN ändern</button>
      </form>
    </section>
  </div>
</template>

<style scoped>
.seite {
  padding-top: 0.8rem;
}

.reiter {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-bottom: 0.8rem;
}

.chip {
  padding: 0.4rem 0.8rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--card);
  color: var(--muted);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.chip.aktiv {
  border-color: color-mix(in srgb, var(--violet) 45%, transparent);
  background: color-mix(in srgb, var(--violet) 12%, white);
  color: var(--violet);
}

.block {
  padding: 1rem;
  background: white;
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
  margin-top: 1.6rem;
}

h2 {
  margin: 0.15rem 0 0.5rem;
  font-size: 1.15rem;
}

.hinweis {
  margin: 0 0 0.8rem;
  color: var(--muted);
  font-size: 0.85rem;
  line-height: 1.45;
}

.liste {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.4rem;
}

.liste li {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

input,
select,
textarea {
  flex: 1;
  min-width: 0;
  padding: 0.5rem 0.7rem;
  border: 1px solid var(--line);
  border-radius: 0.7rem;
  background: white;
}

.emoji {
  flex: 0 0 2.8rem;
  text-align: center;
}

.zahl {
  flex: 0 0 6rem;
}

.raeder > li {
  display: block;
  padding-bottom: 0.6rem;
  border-bottom: 1px solid var(--line);
}

.raeder > li:last-child {
  border-bottom: none;
}

.radzeile {
  display: flex;
  gap: 0.4rem;
}

.typen {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-top: 0.4rem;
}

.typ {
  padding: 0.25rem 0.6rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: white;
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}

.typ.an {
  border-color: color-mix(in srgb, var(--violet) 45%, transparent);
  background: color-mix(in srgb, var(--violet) 12%, white);
  color: var(--violet);
}

.warnzeile {
  margin: 0.4rem 0 0;
  color: var(--amber);
  font-size: 0.78rem;
  font-weight: 600;
}

.luecken li {
  justify-content: space-between;
  font-size: 0.88rem;
}

.neu {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.8rem;
  padding-top: 0.8rem;
  border-top: 1px solid var(--line);
}

.fremd li {
  justify-content: space-between;
  padding: 0.4rem 0.2rem;
  font-size: 0.9rem;
}

.besitzer {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.knoepfe {
  display: flex;
  gap: 0.4rem;
  margin: 0.6rem 0;
}

.primaer,
.still,
.gefahr {
  padding: 0.55rem 1rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: white;
  font-size: 0.87rem;
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

.gefahr:disabled,
.still:disabled {
  opacity: 0.4;
  cursor: default;
}

.warnbox {
  margin: 0 0 0.8rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid color-mix(in srgb, var(--amber) 40%, transparent);
  border-radius: 0.7rem;
  background: color-mix(in srgb, var(--amber) 10%, white);
  color: var(--amber);
  font-size: 0.85rem;
}

.zahlen {
  margin: 0 0 0.6rem;
  font-size: 0.85rem;
  font-weight: 600;
}

.ampel {
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
}

.klein {
  display: block;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.klein input {
  width: 100%;
  margin-top: 0.25rem;
}

.einheit {
  padding-bottom: 0.55rem;
  color: var(--muted);
}

.profilzeile,
.pinform {
  display: flex;
  gap: 0.4rem;
  margin-bottom: 0.6rem;
}

.pinform {
  margin-top: 0.8rem;
}

.farben {
  display: flex;
  gap: 0.4rem;
}

.farbe {
  width: 1.8rem;
  height: 1.8rem;
  border: 2px solid transparent;
  border-radius: 999px;
  cursor: pointer;
}

.farbe.aktiv {
  border-color: var(--text);
}

.leer {
  color: var(--muted);
  font-size: 0.88rem;
}
</style>
