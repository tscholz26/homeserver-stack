<script setup lang="ts">
import { computed, ref } from 'vue'
import { useTracker } from '@/composables/useTracker'
import type { Bike, Kategorie, Teil } from '@/composables/useTracker'
import { ampel, ampelFarbe, heute, kmText, zeitraumText } from '@/utils/verschleiss'

/**
 * Alles zu einer Kategorie an einem Rad – als Fenster über dem Dashboard, damit
 * die Übersicht nicht verloren geht. Hier stehen die Grenze, alle Instanzen mit
 * ihren Nutzungszeiträumen und die Wechsel.
 */
const props = defineProps<{ bike: Bike; typ: Kategorie }>()
const emit = defineEmits<{ close: [] }>()

const store = useTracker()

const darfAendern = computed(() => store.eigenesRad(props.bike))

const RANG = { aktiv: 0, eingelagert: 1, entsorgt: 2 }

const teile = computed(() =>
  [...store.teileAn(props.bike.id, props.typ.id)].sort((a, b) => {
    if (a.status !== b.status) return RANG[a.status] - RANG[b.status]
    const letzteA = a.periods.at(-1)?.from ?? ''
    const letzteB = b.periods.at(-1)?.from ?? ''
    return letzteB.localeCompare(letzteA)
  }),
)

// ── Grenzwert der Kategorie an diesem Rad ────────────────────────────────────
const grenze = ref(String(store.radGrenze(props.bike, props.typ.id)))
const eigeneGrenze = computed(() => props.bike.limits?.[props.typ.id] !== undefined)

async function grenzeSpeichern() {
  const wert = Number(grenze.value)
  if (!(wert > 0)) return
  await store.radGrenzeSetzen(props.bike.id, props.typ.id, Math.round(wert))
}

const wechsel = ref(String(props.typ.rotationKm ?? 0))

async function wechselSpeichern() {
  const wert = Number(wechsel.value)
  if (!(wert >= 0)) return
  await store.kategorieSpeichern(props.typ.id, { rotationKm: Math.round(wert) })
}

async function grenzeZuruecksetzen() {
  await store.radGrenzeSetzen(props.bike.id, props.typ.id, null)
  grenze.value = String(props.typ.defaultLimitKm)
}

// ── Ein Teil aufgeklappt ─────────────────────────────────────────────────────
const offen = ref<string>('')
const datum = ref(heute())

function klappe(id: string) {
  offen.value = offen.value === id ? '' : id
}

function stufe(teil: Teil) {
  return ampel(teil.percent, store.state.settings.thresholds)
}

// ── Aufbauten ────────────────────────────────────────────────────────────────
// An welchen Aufbauten ein Teil mitfährt, entscheidet, welche Fahrten es
// verschleißen: die Kette meist an beiden, jede Kassette nur an ihrem.
const aufbauten = computed(() => store.aufbautenVon(props.bike.id))

function aufbauUmschalten(teil: Teil, setupId: string) {
  const drin = teil.setupIds?.includes(setupId)
  const neu = drin
    ? teil.setupIds.filter((id) => id !== setupId)
    : [...(teil.setupIds ?? []), setupId]
  store.teilSpeichern(teil.id, { setupIds: neu })
}

// ── Neues Teil ───────────────────────────────────────────────────────────────
const neuOffen = ref(false)
const neuName = ref('')
const neuDatum = ref(heute())
const neuEinbauen = ref(true)
const neuAufbauten = ref<string[]>([])

function neuAufbauUmschalten(setupId: string) {
  neuAufbauten.value = neuAufbauten.value.includes(setupId)
    ? neuAufbauten.value.filter((id) => id !== setupId)
    : [...neuAufbauten.value, setupId]
}

const namensVorschlag = computed(() => {
  const anzahl = store.teileAn(props.bike.id, props.typ.id).length
  return anzahl ? `${props.typ.name} ${anzahl + 1}` : props.typ.name
})

async function anlegen() {
  const ok = await store.teilAnlegen({
    bikeId: props.bike.id,
    typeId: props.typ.id,
    label: neuName.value.trim() || namensVorschlag.value,
    installedAt: neuEinbauen.value ? neuDatum.value : null,
    // Ohne Auswahl gilt: an allen Aufbauten des Rades
    setupIds: neuAufbauten.value.length ? neuAufbauten.value : undefined,
  })
  if (!ok) return
  neuOffen.value = false
  neuName.value = ''
  neuDatum.value = heute()
  neuAufbauten.value = []
}

// ── Zeiträume ────────────────────────────────────────────────────────────────
function zeitraumDatum(teil: Teil, periodId: string, feld: 'from' | 'to', wert: string) {
  if (!wert) return
  store.zeitraumSpeichern(teil.id, periodId, { [feld]: wert })
}

function notizSpeichern(teil: Teil, wert: string) {
  if (wert === teil.note) return
  store.teilSpeichern(teil.id, { note: wert })
}

function eigeneGrenzeSpeichern(teil: Teil, wert: string) {
  const zahl = Number(wert)
  store.teilSpeichern(teil.id, { limitKm: wert.trim() && zahl > 0 ? Math.round(zahl) : null })
}
</script>

<template>
  <div class="hintergrund" @click.self="emit('close')">
    <div class="fenster card">
      <header class="kopf">
        <span
          class="badge"
          :style="{ background: `color-mix(in srgb, ${typ.color} 16%, white)`, color: typ.color }"
        >
          {{ typ.emoji }}
        </span>
        <div>
          <p class="cap" :style="{ color: typ.color }">{{ bike.name }}</p>
          <h2>{{ typ.name }}</h2>
        </div>
        <button type="button" class="zu" title="Schließen" @click="emit('close')">✕</button>
      </header>

      <!-- Verschleißgrenze für diese Kategorie an diesem Rad -->
      <section class="grenzblock">
        <label class="klein" for="grenze">Verschleißgrenze</label>
        <div class="zeile">
          <input
            id="grenze"
            v-model="grenze"
            type="number"
            inputmode="numeric"
            min="1"
            step="100"
            :disabled="!darfAendern"
            @change="grenzeSpeichern"
          />
          <span class="einheit">km</span>
          <button
            v-if="darfAendern && eigeneGrenze"
            type="button"
            class="still klein-knopf"
            @click="grenzeZuruecksetzen"
          >
            Zurücksetzen
          </button>
        </div>
        <p class="fussnote">
          Standard der Kategorie: {{ kmText(typ.defaultLimitKm) }}. Ein Teil kann darüber hinaus
          seinen eigenen Wert haben.
        </p>

        <!-- Wechselintervall: bei Ketten das, was häufiger dran ist als die
             Verschleißgrenze – deshalb steht es hier und nicht in der
             Verwaltung. -->
        <label class="klein" for="wechsel">Wechselintervall</label>
        <div class="zeile">
          <input
            id="wechsel"
            v-model="wechsel"
            type="number"
            inputmode="numeric"
            min="0"
            step="50"
            :disabled="!darfAendern"
            @change="wechselSpeichern"
          />
          <span class="einheit">km seit dem Aufziehen</span>
        </div>
        <p class="fussnote">
          Für Teile, die im Wechsel gefahren werden – die Kette alle
          {{ typ.rotationKm || 500 }} km wachsen. 0 schaltet es ab. Gilt für die Kategorie „{{
            typ.name
          }}“ an allen Rädern.
        </p>
      </section>

      <!-- Alle Instanzen dieser Kategorie am Rad -->
      <p v-if="!teile.length" class="leer">Noch kein Teil dieser Art am Rad.</p>

      <ul class="teile">
        <li v-for="teil in teile" :key="teil.id" class="teil">
          <button type="button" class="teilkopf" @click="klappe(teil.id)">
            <div class="links">
              <p class="label">{{ teil.label }}</p>
              <p class="km">
                {{ kmText(teil.totalKm) }} von {{ kmText(teil.limitKm) }}
                <span v-if="teil.limitQuelle === 'instanz'" class="quelle">eigener Wert</span>
                <span v-if="aufbauten.length > 1" class="quelle aufbau">
                  {{ store.aufbauNamen(teil) || 'kein Aufbau' }}
                </span>
              </p>
              <p
                v-if="teil.status === 'aktiv' && teil.rotationKm"
                class="wechsel"
                :class="{ faellig: teil.rotationFaellig }"
              >
                {{ teil.rotationFaellig ? '⚠ wechseln:' : 'seit dem Aufziehen:' }}
                {{ kmText(teil.currentKm) }} von {{ kmText(teil.rotationKm) }}
              </p>
              <div class="balken" aria-hidden="true">
                <span
                  :style="{
                    width: `${Math.min(100, teil.percent)}%`,
                    background: ampelFarbe(stufe(teil)),
                  }"
                ></span>
              </div>
            </div>
            <span class="status" :class="teil.status">{{ teil.status }}</span>
          </button>

          <div v-if="offen === teil.id" class="details">
            <!-- Die Nutzungszeiträume: mehrere Ein- und Ausbauten je Teil -->
            <p class="klein">Zeiträume</p>
            <ul class="perioden">
              <li v-for="p in teil.periods" :key="p.id">
                <template v-if="darfAendern">
                  <input
                    type="date"
                    :value="p.from"
                    @change="
                      zeitraumDatum(teil, p.id, 'from', ($event.target as HTMLInputElement).value)
                    "
                  />
                  <span class="bis">–</span>
                  <input
                    v-if="p.to"
                    type="date"
                    :value="p.to"
                    @change="
                      zeitraumDatum(teil, p.id, 'to', ($event.target as HTMLInputElement).value)
                    "
                  />
                  <span v-else class="laufend">läuft</span>
                </template>
                <span v-else class="laufend">{{ zeitraumText(p.from, p.to) }}</span>
                <span class="pkm">{{ kmText(p.km) }}</span>
                <button
                  v-if="darfAendern"
                  type="button"
                  class="weg"
                  title="Zeitraum löschen"
                  @click="store.zeitraumLoeschen(teil.id, p.id)"
                >
                  ✕
                </button>
              </li>
              <li v-if="!teil.periods.length" class="ohne">noch nie eingebaut</li>
            </ul>

            <template v-if="darfAendern">
              <!-- Woran das Teil mitfährt – hier entscheidet sich, welche
                   Fahrten es verschleißen -->
              <p class="klein">Fährt mit an</p>
              <div class="aufbauwahl">
                <button
                  v-for="auf in aufbauten"
                  :key="auf.id"
                  type="button"
                  class="aufbaupille"
                  :class="{ an: teil.setupIds?.includes(auf.id) }"
                  @click="aufbauUmschalten(teil, auf.id)"
                >
                  {{ auf.kind === 'indoor' ? '🏠' : '🌤' }} {{ auf.name }}
                </button>
              </div>
              <p v-if="!teil.setupIds?.length" class="warnzeile">
                An keinem Aufbau – dieses Teil sammelt keine Kilometer.
              </p>

              <label class="klein" :for="`notiz-${teil.id}`">Notiz</label>
              <textarea
                :id="`notiz-${teil.id}`"
                :value="teil.note"
                rows="2"
                placeholder="z. B. Kettenlehre 0,5 – bald tauschen"
                @change="notizSpeichern(teil, ($event.target as HTMLTextAreaElement).value)"
              ></textarea>

              <label class="klein" :for="`grenze-${teil.id}`">
                Eigene Grenze (leer = {{ kmText(store.radGrenze(bike, typ.id)) }})
              </label>
              <input
                :id="`grenze-${teil.id}`"
                type="number"
                inputmode="numeric"
                min="1"
                step="100"
                :value="teil.ownLimitKm ?? ''"
                @change="eigeneGrenzeSpeichern(teil, ($event.target as HTMLInputElement).value)"
              />

              <div class="aktionen">
                <label class="klein datum">
                  Datum
                  <input v-model="datum" type="date" />
                </label>
                <button
                  v-if="teil.status === 'aktiv'"
                  type="button"
                  class="still"
                  @click="store.teilAusbauen(teil.id, datum)"
                >
                  Einlagern
                </button>
                <button
                  v-else-if="teil.status === 'eingelagert'"
                  type="button"
                  class="primaer"
                  @click="store.teilEinbauen(teil.id, datum)"
                >
                  Wieder aufziehen
                </button>
                <button
                  v-else
                  type="button"
                  class="still"
                  @click="store.teilStatus(teil.id, 'eingelagert')"
                >
                  Zurück ins Lager
                </button>

                <button
                  v-if="teil.status === 'aktiv'"
                  type="button"
                  class="gefahr"
                  @click="store.teilAusbauen(teil.id, datum, true)"
                >
                  Entsorgen
                </button>
                <button
                  v-else-if="teil.status === 'eingelagert'"
                  type="button"
                  class="gefahr"
                  @click="store.teilStatus(teil.id, 'entsorgt')"
                >
                  Entsorgen
                </button>
                <button type="button" class="gefahr" @click="store.teilLoeschen(teil.id)">
                  Löschen
                </button>
              </div>
            </template>
            <p v-else-if="teil.note" class="notizlese">{{ teil.note }}</p>
          </div>
        </li>
      </ul>

      <!-- Neues Teil dieser Kategorie -->
      <template v-if="darfAendern">
        <button v-if="!neuOffen" type="button" class="neu" @click="neuOffen = true">
          + Neues Teil anlegen
        </button>

        <form v-else class="neuform" @submit.prevent="anlegen">
          <input v-model="neuName" :placeholder="namensVorschlag" aria-label="Bezeichnung" />
          <template v-if="aufbauten.length > 1">
            <p class="klein">Fährt mit an</p>
            <div class="aufbauwahl">
              <button
                v-for="auf in aufbauten"
                :key="auf.id"
                type="button"
                class="aufbaupille"
                :class="{ an: !neuAufbauten.length || neuAufbauten.includes(auf.id) }"
                @click="neuAufbauUmschalten(auf.id)"
              >
                {{ auf.kind === 'indoor' ? '🏠' : '🌤' }} {{ auf.name }}
              </button>
            </div>
          </template>
          <label class="klein datum">
            Einbau
            <input v-model="neuDatum" type="date" :disabled="!neuEinbauen" />
          </label>
          <label class="klein haken">
            <input v-model="neuEinbauen" type="checkbox" />
            gleich aufziehen
          </label>
          <div class="aktionen">
            <button type="button" class="still" @click="neuOffen = false">Abbrechen</button>
            <button type="submit" class="primaer">Anlegen →</button>
          </div>
          <p class="fussnote">
            Beim Aufziehen wandert das bisher aktive Teil dieser Kategorie automatisch ins Lager.
          </p>
        </form>
      </template>
      <p v-else class="fussnote">
        Das Rad gehört {{ store.nutzer(bike.ownerId)?.name }} – ändern kann es nur dieses Profil.
      </p>
    </div>
  </div>
</template>

<style scoped>
.hintergrund {
  position: fixed;
  inset: 0;
  z-index: 18;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0.6rem;
  background: rgba(16, 20, 28, 0.35);
}

.fenster {
  width: min(34rem, 100%);
  max-height: 92vh;
  overflow-y: auto;
  padding: 1rem;
  background: white;
}

.kopf {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.9rem;
}

.badge {
  display: grid;
  place-items: center;
  width: 2.4rem;
  height: 2.4rem;
  border-radius: 999px;
  font-size: 1.2rem;
}

.cap {
  margin: 0;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

h2 {
  margin: 0.1rem 0 0;
  font-size: 1.2rem;
}

.zu {
  margin-left: auto;
  width: 2rem;
  height: 2rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: white;
  color: var(--muted);
  cursor: pointer;
}

.klein {
  display: block;
  margin: 0.7rem 0 0.25rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.grenzblock {
  padding: 0.7rem 0.8rem 0.8rem;
  border: 1px solid var(--line);
  border-radius: 0.9rem;
  background: var(--bg);
}

.grenzblock .klein {
  margin-top: 0;
}

.zeile {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.zeile input {
  width: 7rem;
}

input,
textarea,
select {
  padding: 0.55rem 0.7rem;
  border: 1px solid var(--line);
  border-radius: 0.7rem;
  background: white;
  width: 100%;
}

.einheit {
  color: var(--muted);
  font-size: 0.9rem;
}

.fussnote {
  margin: 0.5rem 0 0;
  color: var(--muted);
  font-size: 0.78rem;
  line-height: 1.4;
}

.teile {
  list-style: none;
  margin: 0.9rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.5rem;
}

.teil {
  border: 1px solid var(--line);
  border-radius: 0.9rem;
  overflow: hidden;
}

.teilkopf {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.65rem 0.75rem;
  border: none;
  background: white;
  text-align: left;
  cursor: pointer;
}

.links {
  flex: 1;
  min-width: 0;
}

.label {
  margin: 0;
  font-weight: 600;
}

.km {
  margin: 0.1rem 0 0.35rem;
  color: var(--muted);
  font-size: 0.8rem;
}

.aufbauwahl {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-bottom: 0.2rem;
}

.aufbaupille {
  padding: 0.3rem 0.65rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: white;
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}

.aufbaupille.an {
  border-color: color-mix(in srgb, var(--violet) 45%, transparent);
  background: color-mix(in srgb, var(--violet) 12%, white);
  color: var(--violet);
}

.warnzeile {
  margin: 0.3rem 0 0;
  color: var(--amber);
  font-size: 0.78rem;
  font-weight: 600;
}

.quelle {
  margin-left: 0.3rem;
  padding: 0.05rem 0.4rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--violet) 10%, white);
  color: var(--violet);
  font-size: 0.68rem;
  font-weight: 700;
}

.quelle.aufbau {
  background: color-mix(in srgb, var(--cyan) 10%, white);
  color: var(--cyan);
}

.wechsel {
  margin: 0 0 0.3rem;
  color: var(--cyan);
  font-size: 0.74rem;
  font-weight: 700;
}

.wechsel.faellig {
  color: var(--amber);
}

.balken {
  height: 0.32rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text) 8%, transparent);
  overflow: hidden;
}

.balken span {
  display: block;
  height: 100%;
  border-radius: 999px;
}

.status {
  flex-shrink: 0;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
}

.status.aktiv {
  background: color-mix(in srgb, var(--green) 12%, white);
  color: var(--green);
}

.status.eingelagert {
  background: color-mix(in srgb, var(--cyan) 12%, white);
  color: var(--cyan);
}

.status.entsorgt {
  background: color-mix(in srgb, var(--text) 8%, white);
  color: var(--muted);
}

.details {
  padding: 0.2rem 0.75rem 0.8rem;
  border-top: 1px solid var(--line);
  background: var(--bg);
}

.perioden {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.35rem;
}

.perioden li {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.82rem;
}

.perioden input {
  width: auto;
  flex: 1;
  min-width: 0;
  padding: 0.35rem 0.45rem;
  font-size: 0.8rem;
}

.bis,
.laufend {
  color: var(--muted);
}

.laufend {
  flex: 1;
  font-size: 0.82rem;
}

.pkm {
  margin-left: auto;
  font-weight: 600;
  white-space: nowrap;
}

.weg {
  width: 1.6rem;
  height: 1.6rem;
  flex-shrink: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.ohne {
  color: var(--muted);
}

.aktionen {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.4rem;
  margin-top: 0.8rem;
}

.datum {
  margin: 0;
  flex: 1;
  min-width: 8rem;
}

.datum input {
  margin-top: 0.2rem;
  padding: 0.45rem 0.55rem;
  text-transform: none;
}

.haken {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  text-transform: none;
  letter-spacing: 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text);
}

.haken input {
  width: auto;
}

.primaer,
.still,
.gefahr,
.neu {
  padding: 0.5rem 0.9rem;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: white;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.primaer {
  border-color: color-mix(in srgb, var(--violet) 35%, transparent);
  background: var(--violet);
  color: white;
}

.still {
  color: var(--muted);
}

.klein-knopf {
  padding: 0.4rem 0.7rem;
  font-size: 0.78rem;
  white-space: nowrap;
}

.gefahr {
  border-color: color-mix(in srgb, var(--red) 30%, transparent);
  color: var(--red);
}

.neu {
  width: 100%;
  margin-top: 0.9rem;
  border-style: dashed;
  color: var(--muted);
}

.neuform {
  margin-top: 0.9rem;
  padding: 0.8rem;
  border: 1px solid var(--line);
  border-radius: 0.9rem;
  background: var(--bg);
  display: grid;
  gap: 0.4rem;
}

.notizlese {
  margin: 0.6rem 0 0;
  font-size: 0.85rem;
}

.leer {
  margin: 1rem 0 0;
  color: var(--muted);
  text-align: center;
}

@media (min-width: 40rem) {
  .hintergrund {
    align-items: center;
  }
}
</style>
