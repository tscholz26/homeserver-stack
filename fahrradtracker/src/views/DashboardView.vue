<script setup lang="ts">
import { computed, ref } from 'vue'
import { useTracker } from '@/composables/useTracker'
import { ampel, ampelFarbe, ampelWort, kmText } from '@/utils/verschleiss'
import type { Bike, Kategorie } from '@/composables/useTracker'
import RingFortschritt from '@/components/RingFortschritt.vue'
import TeileFenster from '@/components/TeileFenster.vue'

/**
 * Die Startansicht: pro Rad eine Kachel je Kategorie – nicht je Teil. Die
 * Kachel zeigt, wie weit das gerade aufgezogene Teil ist; alles Weitere steckt
 * im Fenster dahinter.
 */
const store = useTracker()

const offen = ref<{ bike: Bike; typ: Kategorie } | null>(null)
const kategorieWahl = ref<Bike | null>(null)

const raeder = computed(() => store.sichtbareRaeder.value)

function kacheln(bike: Bike) {
  return store.kategorienAm(bike.id).map((typ) => {
    const aktiv = store.aktivesTeil(bike.id, typ.id)
    const prozent = aktiv?.percent ?? 0
    const stufe = ampel(prozent, store.state.settings.thresholds)
    return { typ, aktiv, prozent, stufe }
  })
}

/** Kategorien, die an diesem Rad noch fehlen – Auswahl hinter „+ Teil“. */
function fehlendeKategorien(bike: Bike) {
  const da = new Set(store.kategorienAm(bike.id).map((t) => t.id))
  return store.state.componentTypes.filter((t) => !da.has(t.id))
}

function oeffne(bike: Bike, typ: Kategorie) {
  kategorieWahl.value = null
  offen.value = { bike, typ }
}
</script>

<template>
  <div class="seite">
    <!-- Profil-Filter: die Räder aller sind für alle sichtbar -->
    <nav v-if="store.state.users.length > 1" class="filter">
      <button
        type="button"
        class="chip"
        :class="{ aktiv: !store.filter.value }"
        @click="store.setzeFilter('')"
      >
        Alle
      </button>
      <button
        v-for="u in store.state.users"
        :key="u.id"
        type="button"
        class="chip"
        :class="{ aktiv: store.filter.value === u.id }"
        :style="{ '--farbe': u.color }"
        @click="store.setzeFilter(u.id)"
      >
        <span class="punkt" aria-hidden="true"></span>
        {{ u.name }}
      </button>
    </nav>

    <p v-if="!store.state.bikes.length" class="leer">
      Noch kein Rad angelegt. In der Verwaltung anlegen und die Wahoo-Sportarten zuteilen.
    </p>

    <p v-else-if="!raeder.length" class="leer">Für dieses Profil ist noch kein Rad angelegt.</p>

    <section v-for="bike in raeder" :key="bike.id" class="rad">
      <header class="radkopf">
        <div>
          <p class="cap" :style="{ color: store.nutzer(bike.ownerId)?.color }">
            {{ store.nutzer(bike.ownerId)?.name ?? 'Unbekannt' }}
          </p>
          <h2>{{ bike.name }}</h2>
        </div>
        <span v-if="!bike.workoutTypeIds.length" class="warnung">keine Sportart</span>
      </header>

      <div class="kacheln">
        <button
          v-for="k in kacheln(bike)"
          :key="k.typ.id"
          type="button"
          class="kachel card"
          @click="oeffne(bike, k.typ)"
        >
          <div class="kopf">
            <span
              class="badge"
              :style="{
                background: `color-mix(in srgb, ${k.typ.color} 16%, white)`,
                color: k.typ.color,
              }"
            >
              {{ k.typ.emoji }}
            </span>
            <div class="titel">
              <p class="cap" :style="{ color: ampelFarbe(k.stufe) }">{{ ampelWort(k.stufe) }}</p>
              <h3>{{ k.typ.name }}</h3>
            </div>
          </div>

          <RingFortschritt :percent="k.prozent" :farbe="ampelFarbe(k.stufe)" />

          <p class="zahlen">
            <template v-if="k.aktiv">
              {{ kmText(k.aktiv.totalKm) }} von {{ kmText(k.aktiv.limitKm) }}
            </template>
            <template v-else>kein Teil eingebaut</template>
          </p>
          <p class="aktuell">
            <template v-if="k.aktiv">aktuell: {{ k.aktiv.label }}</template>
            <template v-else>{{ store.teileAn(bike.id, k.typ.id).length }} im Lager</template>
          </p>
        </button>

        <button
          v-if="store.eigenesRad(bike) && fehlendeKategorien(bike).length"
          type="button"
          class="kachel neu"
          @click="kategorieWahl = bike"
        >
          <span class="plus">+</span>
          <span>Teil hinzufügen</span>
        </button>
      </div>
    </section>

    <!-- Welche Kategorie soll es sein? Danach übernimmt das Teile-Fenster -->
    <div v-if="kategorieWahl" class="hintergrund" @click.self="kategorieWahl = null">
      <div class="wahl card">
        <p class="cap">{{ kategorieWahl.name }}</p>
        <h2>Welches Teil?</h2>
        <div class="pillen">
          <button
            v-for="typ in fehlendeKategorien(kategorieWahl)"
            :key="typ.id"
            type="button"
            class="pille"
            :style="{ '--farbe': typ.color }"
            @click="oeffne(kategorieWahl, typ)"
          >
            {{ typ.emoji }} {{ typ.name }}
          </button>
        </div>
        <button type="button" class="still" @click="kategorieWahl = null">Abbrechen</button>
      </div>
    </div>

    <TeileFenster v-if="offen" :bike="offen.bike" :typ="offen.typ" @close="offen = null" />
  </div>
</template>

<style scoped>
.seite {
  padding-top: 0.8rem;
}

.filter {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-bottom: 1rem;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
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
  border-color: color-mix(in srgb, var(--farbe, var(--violet)) 45%, transparent);
  background: color-mix(in srgb, var(--farbe, var(--violet)) 10%, white);
  color: var(--text);
}

.punkt {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 999px;
  background: var(--farbe);
}

.rad {
  margin-bottom: 1.6rem;
}

.radkopf {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.6rem;
  margin-bottom: 0.6rem;
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

.warnung {
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--amber) 12%, white);
  color: var(--amber);
  font-size: 0.72rem;
  font-weight: 700;
}

.kacheln {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9.6rem, 1fr));
  gap: 0.7rem;
}

.kachel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
  padding: 0.9rem 0.7rem;
  background: white;
  text-align: center;
  cursor: pointer;
}

.kopf {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  width: 100%;
}

.badge {
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  border-radius: 999px;
  font-size: 1rem;
}

.titel {
  min-width: 0;
  text-align: left;
}

h3 {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.2;
}

.zahlen {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
}

.aktuell {
  margin: 0;
  color: var(--muted);
  font-size: 0.78rem;
}

.neu {
  justify-content: center;
  border: 1px dashed var(--line);
  border-radius: 1.1rem;
  background: transparent;
  color: var(--muted);
  font-weight: 600;
  font-size: 0.85rem;
}

.plus {
  font-size: 1.6rem;
  line-height: 1;
}

.hintergrund {
  position: fixed;
  inset: 0;
  z-index: 15;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 1rem;
  background: rgba(16, 20, 28, 0.35);
}

.wahl {
  width: min(30rem, 100%);
  padding: 1.1rem;
  background: white;
}

.pillen {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0.8rem 0;
}

.pille {
  padding: 0.45rem 0.85rem;
  border: 1px solid color-mix(in srgb, var(--farbe) 35%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--farbe) 8%, white);
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
}

.still {
  width: 100%;
  padding: 0.6rem 1rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: white;
  color: var(--muted);
  font-weight: 600;
  cursor: pointer;
}

.leer {
  margin-top: 2rem;
  color: var(--muted);
  text-align: center;
}

@media (min-width: 40rem) {
  .hintergrund {
    align-items: center;
  }
}
</style>
