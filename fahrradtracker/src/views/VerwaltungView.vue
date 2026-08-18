<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useTracker } from '@/composables/useTracker'
import type { Gear } from '@/composables/useTracker'
import { datumText, kmText } from '@/utils/verschleiss'

/**
 * Verwaltung in Reitern statt einer langen Rolle – auf dem Handy sonst kaum zu
 * überblicken. Geändert wird immer nur das eigene Profil und die eigenen
 * Räder; Kategorien und Ampel gelten für alle.
 */
const store = useTracker()

type Reiter = 'raeder' | 'kategorien' | 'strava' | 'einstellungen'
const reiter = ref<Reiter>('raeder')

const meineRaeder = computed(() =>
  store.state.bikes.filter((b) => b.ownerId === store.state.me?.id),
)
const fremdeRaeder = computed(() =>
  store.state.bikes.filter((b) => b.ownerId !== store.state.me?.id),
)

// ── Räder ────────────────────────────────────────────────────────────────────
const gear = ref<Gear[]>([])
const gearLaedt = ref(false)
const neuesRad = ref('')
const neuesGear = ref('')

/** Die Gear-Liste kommt live von Strava – ohne Verbindung bleibt sie leer. */
async function ladeGear() {
  if (!store.state.me?.hasStrava || gearLaedt.value) return
  gearLaedt.value = true
  gear.value = await store.stravaGear()
  gearLaedt.value = false
}

onMounted(ladeGear)

async function radAnlegen() {
  if (!neuesRad.value.trim()) return
  const ok = await store.radAnlegen(neuesRad.value.trim(), neuesGear.value || null)
  if (ok) {
    neuesRad.value = ''
    neuesGear.value = ''
  }
}

function gearName(id: string | null) {
  if (!id) return ''
  return gear.value.find((g) => g.id === id)?.name ?? id
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
          { id: 'strava', label: 'Strava' },
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
      <h2>Rad und Strava-Gear</h2>
      <p class="hinweis">
        Die Fahrten kommen über die Gear-ID ans Rad: In Strava jedes Rad als „Gear“ pflegen und der
        Fahrt zuordnen, hier verknüpfen.
      </p>

      <ul class="liste">
        <li v-for="bike in meineRaeder" :key="bike.id">
          <input
            :value="bike.name"
            aria-label="Name des Rades"
            @change="
              store.radSpeichern(bike.id, { name: ($event.target as HTMLInputElement).value })
            "
          />
          <select
            v-if="gear.length"
            :value="bike.stravaGearId ?? ''"
            aria-label="Strava-Gear"
            @change="
              store.radSpeichern(bike.id, {
                stravaGearId: ($event.target as HTMLSelectElement).value || null,
              })
            "
          >
            <option value="">ohne Gear</option>
            <option v-for="g in gear" :key="g.id" :value="g.id">
              {{ g.name }} ({{ kmText(g.km) }})
            </option>
          </select>
          <span v-else class="gearid">{{ gearName(bike.stravaGearId) || 'ohne Gear' }}</span>
          <button type="button" class="gefahr" @click="store.radLoeschen(bike.id)">Löschen</button>
        </li>
        <li v-if="!meineRaeder.length" class="leer">Noch kein eigenes Rad.</li>
      </ul>

      <form class="neu" @submit.prevent="radAnlegen">
        <input v-model="neuesRad" placeholder="Neues Rad, z. B. Scott Speedster" />
        <select v-if="gear.length" v-model="neuesGear" aria-label="Strava-Gear">
          <option value="">ohne Gear</option>
          <option v-for="g in gear" :key="g.id" :value="g.id">{{ g.name }}</option>
        </select>
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

    <!-- ── Strava ────────────────────────────────────────────────────────── -->
    <section v-if="reiter === 'strava'" class="block card">
      <p class="cap">Dein Konto</p>
      <h2>Strava-Verbindung</h2>

      <p v-if="!store.stravaConfigured.value" class="warnbox">
        Auf dem Server fehlen STRAVA_CLIENT_ID und STRAVA_CLIENT_SECRET – bis die eingetragen sind,
        lässt sich kein Konto verbinden.
      </p>

      <template v-else-if="store.state.me?.hasStrava">
        <p class="hinweis">
          Verbunden als <strong>{{ store.state.me.athleteName || 'Strava-Konto' }}</strong
          >. Zuletzt geholt:
          {{ store.state.me.lastSyncAt ? datumText(store.state.me.lastSyncAt) : 'noch nie' }}. Im
          Hintergrund fragt der Server alle {{ store.state.settings.syncIntervalHours }} Stunden
          nach.
        </p>
        <p class="zahlen">
          {{ store.state.fahrten }} Fahrten · {{ store.state.ohneGear }} ohne Rad-Zuordnung ·
          {{ store.state.unbekanntesGear }} fremde Gear-IDs
        </p>
        <p v-if="store.state.me.lastSyncError" class="warnbox">
          Letzter Sync-Fehler: {{ store.state.me.lastSyncError }}
        </p>
        <div class="knoepfe">
          <button type="button" class="primaer" @click="store.stravaSync()">Jetzt holen</button>
          <button type="button" class="gefahr" @click="store.stravaTrennen()">Trennen</button>
        </div>
        <p class="hinweis">
          Beim Trennen gehen auch die geholten Fahrten weg – ein alter, nicht mehr auffrischbarer
          Stand wäre irreführender als gar keiner.
        </p>
      </template>

      <template v-else>
        <p class="hinweis">
          Ohne Verbindung bleibt jedes Teil bei 0 km. Der Tracker liest nur Aktivitäten, er schreibt
          nichts nach Strava.
        </p>
        <button type="button" class="primaer" @click="store.stravaVerbinden()">
          Mit Strava verbinden →
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

.gearid {
  flex: 1;
  color: var(--muted);
  font-size: 0.82rem;
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
