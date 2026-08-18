<script setup lang="ts">
import { computed, ref } from 'vue'
import { useTracker } from '@/composables/useTracker'
import { kmText } from '@/utils/verschleiss'

/**
 * Kilometer-Dashboard. Gerechnet wird alles im Server (über *alle* Fahrten,
 * nicht nur die mitgeschickten) – hier wird nur gezeichnet.
 *
 * Farben: Violett für draußen, Cyan für die Rolle. Die beiden sind gegen den
 * cremefarbenen Hintergrund und für Farbsehschwächen geprüft (ΔE 15 bei
 * Deutan), und sie stehen im ganzen Dashboard für dieselbe Sache.
 */
const store = useTracker()

const stats = computed(() => store.state.stats)

const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

function monatsLabel(monat: string) {
  const [jahr, m] = monat.split('-')
  return { kurz: MONATE[Number(m) - 1] ?? m, jahr }
}

/** Die letzten 13 Monate – so viel passt auf ein Handy, ohne zu quetschen. */
const monate = computed(() => stats.value.monate.slice(-13))
const maxMonat = computed(() => Math.max(1, ...monate.value.map((m) => m.km)))

/** Angetippter Monat; ohne Auswahl steht der letzte im Kopf. */
const gewaehlt = ref('')
const aktiverMonat = computed(
  () => monate.value.find((m) => m.monat === gewaehlt.value) ?? monate.value.at(-1) ?? null,
)

const maxJahr = computed(() => Math.max(1, ...stats.value.jahre.map((j) => j.km)))
const maxWoche = computed(() => Math.max(1, ...stats.value.wochen.map((w) => w.km)))

/** Angetippte Woche; ohne Auswahl steht die letzte im Kopf. */
const gewaehlteWoche = ref('')
const aktiveWoche = computed(
  () =>
    stats.value.wochen.find((w) => w.woche === gewaehlteWoche.value) ??
    stats.value.wochen.at(-1) ??
    null,
)

/** Angetipptes Jahr – die Zahl steht ohnehin daneben, hier zählt der Rest. */
const gewaehltesJahr = ref('')

const anteilDrinnen = computed(() => {
  const gesamt = stats.value.km || 1
  return Math.round((stats.value.indoorKm / gesamt) * 100)
})

/** Höhe eines Balkens in Prozent, mit sichtbarem Sockel für kleine Werte. */
function hoehe(km: number, max: number) {
  if (km <= 0) return 0
  return Math.max(3, Math.round((km / max) * 100))
}

function wochenLabel(woche: string) {
  return `KW ${woche.split('-W')[1]}`
}
</script>

<template>
  <div class="seite">
    <!-- Kopfzahlen: die Antwort auf „wie viel“ braucht kein Diagramm -->
    <section class="kacheln">
      <article class="kachel card">
        <p class="cap">Gesamt</p>
        <p class="zahl">{{ kmText(stats.km) }}</p>
        <p class="dazu">{{ stats.fahrten }} Fahrten · ⌀ {{ kmText(stats.schnitt) }}</p>
      </article>
      <article class="kachel card">
        <p class="cap" style="color: var(--violet)">Draußen</p>
        <p class="zahl">{{ kmText(stats.outdoorKm) }}</p>
        <p class="dazu">{{ 100 - anteilDrinnen }} % der Strecke</p>
      </article>
      <article class="kachel card">
        <p class="cap" style="color: var(--cyan)">Rolle</p>
        <p class="zahl">{{ kmText(stats.indoorKm) }}</p>
        <p class="dazu">{{ anteilDrinnen }} % der Strecke</p>
      </article>
    </section>

    <!-- Monatsbalken: draußen unten, Rolle oben, 2px Fuge dazwischen -->
    <section class="block card">
      <header class="blockkopf">
        <div>
          <p class="cap">Monat für Monat</p>
          <h2 v-if="aktiverMonat">
            {{ monatsLabel(aktiverMonat.monat).kurz }} {{ monatsLabel(aktiverMonat.monat).jahr }} ·
            {{ kmText(aktiverMonat.km) }}
          </h2>
        </div>
        <p v-if="aktiverMonat" class="dazu rechts">
          {{ aktiverMonat.fahrten }} Fahrten<br />
          <span class="klein-drinnen" v-if="aktiverMonat.indoorKm">
            davon {{ kmText(aktiverMonat.indoorKm) }} Rolle
          </span>
        </p>
      </header>

      <div class="balken" role="img" aria-label="Kilometer je Monat">
        <button
          v-for="m in monate"
          :key="m.monat"
          type="button"
          class="saeule"
          :class="{ aktiv: aktiverMonat?.monat === m.monat }"
          :title="`${monatsLabel(m.monat).kurz} ${monatsLabel(m.monat).jahr}: ${kmText(m.km)}`"
          @click="gewaehlt = m.monat"
        >
          <span class="stapel">
            <span
              class="teil drinnen"
              :style="{ height: `${hoehe(m.indoorKm, maxMonat)}%` }"
              aria-hidden="true"
            ></span>
            <span
              class="teil draussen"
              :style="{ height: `${hoehe(m.outdoorKm, maxMonat)}%` }"
              aria-hidden="true"
            ></span>
          </span>
          <span class="fuss">{{ monatsLabel(m.monat).kurz }}</span>
        </button>
      </div>

      <div class="legende">
        <span><i class="punkt draussen"></i> draußen</span>
        <span><i class="punkt drinnen"></i> Rolle</span>
      </div>
    </section>

    <!-- Jahre: wenige Werte, deshalb liegende Balken mit direkter Beschriftung -->
    <section class="block card">
      <p class="cap">Jahresvergleich</p>
      <ul class="jahre">
        <li
          v-for="j in stats.jahre"
          :key="j.jahr"
          :class="{ aktiv: gewaehltesJahr === j.jahr }"
          :title="`${j.jahr}: ${kmText(j.km)} · ${j.fahrten} Fahrten`"
          @click="gewaehltesJahr = gewaehltesJahr === j.jahr ? '' : j.jahr"
        >
          <span class="jahr">{{ j.jahr }}</span>
          <span class="schiene">
            <span
              class="fuellung draussen"
              :style="{ width: `${(j.outdoorKm / maxJahr) * 100}%` }"
            ></span>
            <span
              class="fuellung drinnen"
              :style="{ width: `${(j.indoorKm / maxJahr) * 100}%` }"
            ></span>
          </span>
          <span class="wert">{{ kmText(j.km) }}</span>
        </li>
        <li v-if="gewaehltesJahr" class="jahrdetail">
          <template v-for="j in stats.jahre.filter((x) => x.jahr === gewaehltesJahr)" :key="j.jahr">
            {{ j.fahrten }} Fahrten · {{ kmText(j.outdoorKm) }} draußen ·
            {{ kmText(j.indoorKm) }} Rolle
          </template>
        </li>
      </ul>
    </section>

    <!-- Die letzten Wochen, für das Gefühl der aktuellen Form -->
    <section v-if="stats.wochen.length > 1" class="block card">
      <p class="cap">Die letzten Wochen</p>
      <div class="balken schmal">
        <button
          v-for="w in stats.wochen"
          :key="w.woche"
          type="button"
          class="saeule"
          :class="{ aktiv: aktiveWoche?.woche === w.woche }"
          :title="`${wochenLabel(w.woche)}: ${kmText(w.km)}`"
          @click="gewaehlteWoche = w.woche"
        >
          <span class="stapel">
            <span
              class="teil drinnen"
              :style="{ height: `${hoehe(w.indoorKm, maxWoche)}%` }"
            ></span>
            <span
              class="teil draussen"
              :style="{ height: `${hoehe(w.outdoorKm, maxWoche)}%` }"
            ></span>
          </span>
        </button>
      </div>
      <p v-if="aktiveWoche" class="dazu">
        <strong class="gewaehlt">
          {{ wochenLabel(aktiveWoche.woche) }} · {{ kmText(aktiveWoche.km) }}
        </strong>
        <span v-if="aktiveWoche.fahrten"> · {{ aktiveWoche.fahrten }} Fahrten</span>
        <span v-if="aktiveWoche.indoorKm"> · {{ kmText(aktiveWoche.indoorKm) }} Rolle</span>
      </p>
    </section>

    <div class="paar">
      <!-- Räder -->
      <section v-if="stats.raeder.length" class="block card">
        <p class="cap">Nach Rad</p>
        <ul class="liste">
          <li v-for="r in stats.raeder" :key="r.id">
            <span class="name">{{ r.name }}</span>
            <span class="wert">{{ kmText(r.km) }}</span>
          </li>
        </ul>
      </section>

      <!-- Höhepunkte: drei längste Fahrten, stärkster Monat, stärkste Woche -->
      <section v-if="stats.fahrten" class="block card">
        <p class="cap">Höhepunkte</p>
        <ol class="podest">
          <li v-for="(l, i) in stats.laengste.slice(0, 3)" :key="i">
            <span class="platz" :class="`platz${i + 1}`">{{ i + 1 }}</span>
            <span class="name">
              {{ l.name || 'Fahrt' }}
              <small
                >{{ l.date.split('-').reverse().join('.') }}{{ l.indoor ? ' · Rolle' : '' }}</small
              >
            </span>
            <span class="wert">{{ kmText(l.km) }}</span>
          </li>
        </ol>

        <div class="rekorde">
          <div v-if="stats.besterMonat" class="rekord">
            <p class="cap">Stärkster Monat</p>
            <p class="rekordwert">{{ kmText(stats.besterMonat.km) }}</p>
            <p class="dazu">
              {{ monatsLabel(stats.besterMonat.monat).kurz }}
              {{ monatsLabel(stats.besterMonat.monat).jahr }} ·
              {{ stats.besterMonat.fahrten }} Fahrten
            </p>
          </div>
          <div v-if="stats.besteWoche" class="rekord">
            <p class="cap">Stärkste Woche</p>
            <p class="rekordwert">{{ kmText(stats.besteWoche.km) }}</p>
            <p class="dazu">
              {{ wochenLabel(stats.besteWoche.woche) }} / {{ stats.besteWoche.woche.slice(0, 4) }} ·
              {{ stats.besteWoche.fahrten }} Fahrten
            </p>
          </div>
        </div>
      </section>
    </div>

    <p v-if="!stats.fahrten" class="leer">
      Noch keine Fahrten – verbinde eine Quelle oder trage welche von Hand ein.
    </p>
  </div>
</template>

<style scoped>
.seite {
  padding-top: 0.8rem;
}

.cap {
  margin: 0;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
}

.card {
  background: white;
}

.kacheln {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr));
  gap: 0.5rem;
  margin-bottom: 0.7rem;
}

.kachel {
  padding: 0.8rem 0.9rem;
}

.zahl {
  margin: 0.2rem 0 0;
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.dazu {
  margin: 0.15rem 0 0;
  color: var(--muted);
  font-size: 0.78rem;
}

.rechts {
  text-align: right;
}

.block {
  padding: 0.9rem;
  margin-bottom: 0.7rem;
}

.blockkopf {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.6rem;
  margin-bottom: 0.9rem;
}

.blockkopf h2 {
  margin: 0.15rem 0 0;
  font-size: 1.05rem;
}

.klein-drinnen {
  color: var(--cyan);
  font-weight: 600;
}

/* ── Säulen ─────────────────────────────────────────────────────────────── */
.balken {
  display: flex;
  align-items: flex-end;
  gap: 0.25rem;
  height: 8.5rem;
}

.balken.schmal {
  height: 4.5rem;
  gap: 0.15rem;
}

.saeule {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  height: 100%;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
}

.saeule.stumm {
  cursor: default;
}

.stapel {
  display: flex;
  flex-direction: column-reverse;
  justify-content: flex-start;
  flex: 1;
  gap: 2px; /* Fuge zwischen den Segmenten, damit sie sich nicht berühren */
  min-height: 0;
}

.teil {
  display: block;
  border-radius: 4px 4px 0 0;
}

.teil:first-child {
  border-radius: 0 0 4px 4px;
}

.draussen {
  background: var(--violet);
}

.drinnen {
  background: var(--cyan);
}

.fuss {
  margin-top: 0.35rem;
  color: var(--muted);
  font-size: 0.62rem;
  font-weight: 600;
}

.saeule.aktiv .fuss {
  color: var(--text);
  font-size: 0.72rem;
  font-weight: 800;
}

/* Der gewählte Balken tritt hervor, indem die anderen zurücktreten – ohne
   Rahmen, der die Form zerschneidet. */
.balken:has(.aktiv) .saeule:not(.aktiv) .teil {
  opacity: 0.45;
}

.legende {
  display: flex;
  gap: 0.9rem;
  margin-top: 0.7rem;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 600;
}

.punkt {
  display: inline-block;
  width: 0.6rem;
  height: 0.6rem;
  margin-right: 0.25rem;
  border-radius: 3px;
}

/* ── Jahre ──────────────────────────────────────────────────────────────── */
.jahre {
  list-style: none;
  margin: 0.5rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.45rem;
}

.jahre li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.jahr {
  flex: 0 0 2.6rem;
  font-size: 0.85rem;
  font-weight: 700;
}

.schiene {
  flex: 1;
  display: flex;
  gap: 2px;
  height: 0.7rem;
  border-radius: 4px;
  background: color-mix(in srgb, var(--text) 6%, transparent);
  overflow: hidden;
}

.fuellung {
  display: block;
  height: 100%;
  border-radius: 4px;
}

.wert {
  flex-shrink: 0;
  font-size: 0.82rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

/* ── Listen ─────────────────────────────────────────────────────────────── */
.paar {
  display: grid;
  gap: 0.7rem;
}

.liste {
  list-style: none;
  margin: 0.5rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.4rem;
}

.liste li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.6rem;
  font-size: 0.88rem;
}

.name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.name small {
  margin-left: 0.35rem;
  color: var(--muted);
  font-size: 0.72rem;
}

.gewaehlt {
  color: var(--text);
  font-size: 0.85rem;
}

.jahre li {
  cursor: pointer;
}

.jahre li.aktiv .jahr,
.jahre li.aktiv .wert {
  font-size: 0.92rem;
  font-weight: 800;
}

.jahrdetail {
  padding-left: 3.1rem;
  color: var(--muted);
  font-size: 0.78rem;
  cursor: default;
}

/* ── Höhepunkte ─────────────────────────────────────────────────────────── */
.podest {
  list-style: none;
  margin: 0.5rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.45rem;
}

.podest li {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  font-size: 0.88rem;
}

.platz {
  display: grid;
  place-items: center;
  flex: 0 0 1.5rem;
  height: 1.5rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text) 7%, transparent);
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 800;
}

.platz1 {
  background: color-mix(in srgb, var(--amber) 20%, white);
  color: var(--amber);
}

.platz2 {
  background: color-mix(in srgb, var(--cyan) 16%, white);
  color: var(--cyan);
}

.platz3 {
  background: color-mix(in srgb, var(--violet) 14%, white);
  color: var(--violet);
}

.rekorde {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  margin-top: 0.9rem;
  padding-top: 0.8rem;
  border-top: 1px solid var(--line);
}

.rekordwert {
  margin: 0.15rem 0 0;
  font-size: 1.15rem;
  font-weight: 800;
  letter-spacing: -0.01em;
}

.leer {
  margin-top: 2rem;
  color: var(--muted);
  text-align: center;
}

@media (min-width: 34rem) {
  .paar {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
