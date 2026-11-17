<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import Sortable from 'sortablejs'
import { useTracker } from '@/composables/useTracker'
import { datumText } from '@/utils/verschleiss'

/**
 * Verwaltung in Reitern statt einer langen Rolle – auf dem Handy sonst kaum zu
 * überblicken. Räder und Fahrten haben eigene Seiten; hier steht, was für alle
 * gilt, und die Verbindung zum Anbieter.
 */
const store = useTracker()

type Reiter = 'kategorien' | 'quellen' | 'einstellungen'
const reiter = ref<Reiter>('kategorien')

/** Die beiden Quellen nebeneinander – verbunden oder nicht. */
const quellen = computed(() => [
  {
    provider: 'wahoo' as const,
    label: 'Wahoo',
    farbe: 'var(--cyan)',
    konfiguriert: store.wahooConfigured.value,
    envHinweis: 'WAHOO_CLIENT_ID und WAHOO_CLIENT_SECRET',
    verbindung: store.verbindung('wahoo'),
    text: 'Dein Gerät lädt direkt zu Wahoo hoch – der kürzeste Weg zu den Kilometern. Gelesen werden nur Workouts, geschrieben wird nichts.',
  },
  {
    provider: 'intervals' as const,
    label: 'Intervals.icu',
    farbe: 'var(--violet)',
    konfiguriert: store.intervalsConfigured.value,
    envHinweis: 'INTERVALS_CLIENT_ID und INTERVALS_CLIENT_SECRET',
    verbindung: store.verbindung('intervals'),
    text: 'Sammelt die Fahrten aus mehreren Quellen. Übernommen wird nur, was dort von Wahoo hochgeladen wurde – Aktivitäten aus Strava sind über die Schnittstelle nur Platzhalter ohne Distanz.',
  },
])

// ── Kategorien ───────────────────────────────────────────────────────────────
const neueKategorie = ref({ name: '', emoji: '🔧', defaultLimitKm: '3000' })

// Reihenfolge der Kategorien: am Griff ziehen, wie in der Einkaufsliste. Der
// Server bekommt danach die vollständige Liste der Ids.
const kategorieListe = useTemplateRef<HTMLElement>('kategorieListe')
let sortable: Sortable | undefined

onMounted(() => {
  // Ein Tab, der seit gestern offen ist, weiß nichts von einer inzwischen
  // eingerichteten Mail-Zustellung
  store.refresh()
  if (!kategorieListe.value) return
  sortable = new Sortable(kategorieListe.value, {
    handle: '.griff',
    animation: 150,
    onEnd: () => {
      const ids = [...(kategorieListe.value?.children ?? [])]
        .map((el) => (el as HTMLElement).dataset.id)
        .filter((id): id is string => Boolean(id))
      store.kategorienSortieren(ids)
    },
  })
})

onBeforeUnmount(() => sortable?.destroy())

async function kategorieAnlegen() {
  if (!neueKategorie.value.name.trim()) return
  const ok = await store.kategorieAnlegen({
    name: neueKategorie.value.name.trim(),
    emoji: neueKategorie.value.emoji,
    defaultLimitKm: Number(neueKategorie.value.defaultLimitKm) || 3000,
  })
  if (ok) neueKategorie.value = { name: '', emoji: '🔧', defaultLimitKm: '3000' }
}

// ── Ampel ────────────────────────────────────────────────────────────────────
const gelb = ref(String(store.state.settings.thresholds.yellow))
const rot = ref(String(store.state.settings.thresholds.red))

function schwellenSpeichern() {
  store.schwellenSpeichern(Number(gelb.value), Number(rot.value))
}

// ── Profil ───────────────────────────────────────────────────────────────────
const meinName = ref(store.state.me?.name ?? '')
const meineMail = ref(store.state.me?.notifyEmail ?? '')

// Der Knopf bleibt anklickbar und sagt selbst, was fehlt – ein grau
// ausgegrauter Knopf ohne Begründung ist keine Antwort.
const probeLaeuft = ref(false)
const probeMeldung = ref('')
const probeOk = ref(true)

async function probeSchicken() {
  probeMeldung.value = ''
  if (!meineMail.value.trim()) {
    probeOk.value = false
    probeMeldung.value = 'Erst eine Adresse eintragen und speichern.'
    return
  }
  probeLaeuft.value = true
  // Die eingetippte Adresse zählt, auch wenn „Speichern“ vergessen wurde
  if (meineMail.value.trim() !== store.state.me?.notifyEmail) {
    await store.profilSpeichern({ notifyEmail: meineMail.value.trim() })
  }
  const ok = await store.probeMail()
  probeLaeuft.value = false
  probeOk.value = ok
  probeMeldung.value = ok
    ? `Ist raus an ${meineMail.value.trim()}.`
    : store.error.value || 'Versand fehlgeschlagen.'
}
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
          { id: 'kategorien', label: 'Kategorien' },
          { id: 'quellen', label: 'Quellen' },
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

    <!-- ── Kategorien ────────────────────────────────────────────────────── -->
    <section v-if="reiter === 'kategorien'" class="block card">
      <p class="cap">Für alle Räder</p>
      <h2>Kategorien und Standard-Grenzen</h2>
      <p class="hinweis">
        Der Standard gilt überall dort, wo weder das Rad noch das einzelne Teil einen eigenen Wert
        hat. Am Griff ⠿ ziehen ändert die Reihenfolge – so liegen die Kacheln auch auf dem
        Dashboard.
      </p>

      <ul ref="kategorieListe" class="liste kategorien">
        <li v-for="typ in store.state.componentTypes" :key="typ.id" :data-id="typ.id">
          <span class="griff" title="Zum Sortieren ziehen">⠿</span>
          <input
            class="emoji"
            :value="typ.emoji"
            aria-label="Symbol"
            @change="
              store.kategorieSpeichern(typ.id, { emoji: ($event.target as HTMLInputElement).value })
            "
          />
          <input
            class="katname"
            :value="typ.name"
            aria-label="Name"
            @change="
              store.kategorieSpeichern(typ.id, { name: ($event.target as HTMLInputElement).value })
            "
          />
          <span class="mitEinheit">
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
            <span class="einheit">km</span>
          </span>
        </li>
      </ul>

      <form class="neu" @submit.prevent="kategorieAnlegen">
        <input v-model="neueKategorie.emoji" class="emoji" maxlength="2" aria-label="Symbol" />
        <input v-model="neueKategorie.name" class="katname" placeholder="Neue Kategorie" />
        <span class="mitEinheit">
          <input
            v-model="neueKategorie.defaultLimitKm"
            class="zahl"
            type="number"
            min="1"
            step="100"
            aria-label="Grenzwert in km"
          />
          <span class="einheit">km</span>
        </span>
        <button type="submit" class="primaer">Anlegen →</button>
      </form>
      <p class="hinweis fuss">
        Das Wechselintervall einer Kette – die Kilometer bis zum nächsten Wachsen – stellst du dort
        ein, wo du es brauchst: auf dem Dashboard auf die Kachel tippen.
      </p>
    </section>

    <!-- ── Quellen ───────────────────────────────────────────────────────── -->
    <section v-if="reiter === 'quellen'" class="block card">
      <p class="cap">Woher die Fahrten kommen</p>
      <h2>Verbindungen</h2>
      <p class="hinweis">
        Wahoo ist der kurze Weg: Dein Gerät lädt direkt dorthin hoch. Intervals.icu liegt als zweite
        Möglichkeit daneben – geholt wird immer nur aus einer Quelle, sonst stünde dieselbe Ausfahrt
        zweimal in der Rechnung.
      </p>

      <article
        v-for="q in quellen"
        :key="q.provider"
        class="quelle"
        :class="{ aktiv: q.verbindung?.active }"
      >
        <header class="quellkopf">
          <div>
            <p class="cap" :style="{ color: q.farbe }">
              {{ q.verbindung ? 'verbunden' : 'offen' }}
            </p>
            <h3>{{ q.label }}</h3>
          </div>
          <span v-if="q.verbindung?.active" class="marke">aktive Quelle</span>
        </header>

        <p v-if="!q.konfiguriert" class="warnbox">
          Auf dem Server fehlen {{ q.envHinweis }} – bis die eingetragen sind, lässt sich diese
          Quelle nicht verbinden.
        </p>

        <template v-else-if="q.verbindung">
          <p v-if="q.verbindung.needsReconnect" class="warnbox">
            Der Zugriff wurde beendet – bis zum Neuverbinden kommen von hier keine Fahrten mehr an.
          </p>
          <p class="hinweis">
            Verbunden als
            <strong>{{ q.verbindung.athleteName || q.verbindung.externalUserId || 'Konto' }}</strong
            >. Zuletzt geholt:
            {{ q.verbindung.lastSyncAt ? datumText(q.verbindung.lastSyncAt) : 'noch nie' }}.
          </p>
          <p v-if="q.verbindung.lastSyncError" class="warnbox">
            Letzter Fehler: {{ q.verbindung.lastSyncError }}
          </p>
          <div class="knoepfe">
            <button
              v-if="!q.verbindung.active"
              type="button"
              class="still"
              @click="store.quelleAktivieren(q.provider)"
            >
              Von hier holen
            </button>
            <button
              v-if="q.verbindung.needsReconnect"
              type="button"
              class="still"
              @click="store.quelleVerbinden(q.provider)"
            >
              Neu verbinden
            </button>
            <button type="button" class="gefahr" @click="store.quelleTrennen(q.provider)">
              Trennen
            </button>
          </div>
        </template>

        <template v-else>
          <p class="hinweis">{{ q.text }}</p>
          <button type="button" class="primaer" @click="store.quelleVerbinden(q.provider)">
            {{ q.label }} verbinden →
          </button>
        </template>
      </article>

      <p class="cap zwischen">Holen</p>
      <p class="zahlen">
        {{ store.state.fahrten }} Fahrten · {{ store.state.ohneZuordnung }} ohne Rad
      </p>
      <p class="hinweis">
        Neue Fahrten meldet die Quelle per Webhook; zusätzlich fragt der Server alle
        {{ store.state.settings.syncIntervalHours }} Stunden selbst nach. „Alles neu holen“ liest ab
        dem ältesten Datum, das die App kennt – dem frühesten „genutzt ab“ deiner Räder, mindestens
        aber ein Jahr zurück. Doppelt zählt dabei nichts: Jede Fahrt wird an ihrer Id beim Anbieter
        wiedererkannt.
      </p>
      <div class="knoepfe">
        <button
          type="button"
          class="primaer"
          :disabled="!store.state.me?.hasQuelle"
          @click="store.sync()"
        >
          Jetzt holen
        </button>
        <button
          type="button"
          class="still"
          :disabled="!store.state.me?.hasQuelle"
          @click="store.sync(true)"
        >
          Alles neu holen
        </button>
      </div>
      <p class="hinweis">
        Fahrten aus der Zeit vor dem Gerät kommen über keine Quelle herein – die trägst du unter
        „Fahrten“ von Hand nach, mit Datum, Distanz und drinnen/draußen.
      </p>
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

      <p class="cap zwischen">Benachrichtigungen</p>
      <h2>E-Mail bei fälligen Teilen</h2>
      <p v-if="!store.state.mailConfigured" class="warnbox">
        Auf dem Server fehlen die SMTP-Zugangsdaten – bis die eingetragen sind, geht nichts raus.
      </p>
      <p class="hinweis">
        Geschickt wird, wenn ein Teil das Wechselintervall erreicht (Kette wachsen), wenn es auf
        <strong>gelb</strong> springt und wenn es <strong>rot</strong> wird. Jede Meldung kommt
        einmal je Einbau – nach dem Wechsel fängt es von vorn an. Feld leeren schaltet ab.
      </p>
      <div class="profilzeile">
        <input
          v-model="meineMail"
          type="email"
          inputmode="email"
          placeholder="name@example.org"
          aria-label="E-Mail für Benachrichtigungen"
        />
        <button
          type="button"
          class="still"
          @click="store.profilSpeichern({ notifyEmail: meineMail })"
        >
          Speichern
        </button>
      </div>
      <div class="probezeile">
        <button type="button" class="still schmal" :disabled="probeLaeuft" @click="probeSchicken">
          {{ probeLaeuft ? 'schickt …' : 'Probemail schicken' }}
        </button>
        <span v-if="probeMeldung" class="probemeldung" :class="{ fehler: !probeOk }">
          {{ probeMeldung }}
        </span>
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
  padding: 1rem 0.85rem;
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

/* Alles in einer Zeile, ohne dass etwas aus der Karte läuft: Der Name nimmt
   den Rest, die Zahl hat feste Breite. */
.kategorien li {
  gap: 0.3rem;
}

.griff {
  flex: 0 0 auto;
  padding: 0 0.1rem;
  color: var(--muted);
  font-size: 1rem;
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.katname {
  flex: 1 1 4rem;
  min-width: 0;
}

.mitEinheit {
  position: relative;
  flex: 0 0 4.5rem;
  display: flex;
  align-items: center;
}

.mitEinheit .zahl {
  flex: 1;
  padding-left: 0.5rem;
  padding-right: 1.6rem;
  min-width: 0;
  text-align: right;
}

.einheit {
  position: absolute;
  right: 0.45rem;
  color: var(--muted);
  font-size: 0.72rem;
  pointer-events: none;
}

.fuss {
  margin: 0.9rem 0 0;
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
  flex: 0 0 2.2rem;
  padding-left: 0.2rem;
  padding-right: 0.2rem;
  text-align: center;
}

.zahl {
  flex: 0 0 5.4rem;
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

.schmal {
  padding: 0.4rem 0.8rem;
  font-size: 0.8rem;
}

.probezeile {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.probemeldung {
  color: var(--green);
  font-size: 0.8rem;
  font-weight: 600;
}

.probemeldung.fehler {
  color: var(--red);
}

.gefahr:disabled,
.still:disabled {
  opacity: 0.4;
  cursor: default;
}

.quelle {
  padding: 0.8rem;
  margin-bottom: 0.7rem;
  border: 1px solid var(--line);
  border-radius: 0.9rem;
  background: var(--bg);
}

.quelle.aktiv {
  border-color: color-mix(in srgb, var(--violet) 40%, transparent);
  background: color-mix(in srgb, var(--violet) 5%, white);
}

.quellkopf {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
}

.quellkopf h3 {
  margin: 0.1rem 0 0;
  font-size: 1.02rem;
}

.marke {
  flex-shrink: 0;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--violet) 12%, white);
  color: var(--violet);
  font-size: 0.7rem;
  font-weight: 700;
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
