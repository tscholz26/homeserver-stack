<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from 'vue'
import { useTracker } from '@/composables/useTracker'

/**
 * Der Startbildschirm: Wer nutzt gerade? Ohne gültige Sitzung liegt er über
 * allem – die App dahinter ist von außen erreichbar, deshalb hängt vor jedem
 * Profil eine kurze PIN.
 */
const store = useTracker()

type Schritt = 'auswahl' | 'pin' | 'name' | 'neu-pin' | 'strava'

const schritt = ref<Schritt>('auswahl')
const gewaehlt = ref<string>('')
const pin = ref('')
const name = ref('')
const laeuft = ref(false)
const pinFeld = useTemplateRef<HTMLInputElement>('pinFeld')
const nameFeld = useTemplateRef<HTMLInputElement>('nameFeld')

const profil = computed(() => store.profiles.value.find((p) => p.id === gewaehlt.value) ?? null)

function initiale(text: string) {
  return text.trim().slice(0, 1).toUpperCase() || '?'
}

function zurueck() {
  schritt.value = 'auswahl'
  pin.value = ''
  name.value = ''
  store.error.value = ''
}

function waehle(id: string) {
  gewaehlt.value = id
  pin.value = ''
  store.error.value = ''
  schritt.value = 'pin'
  nextTick(() => pinFeld.value?.focus())
}

function neuerNutzer() {
  gewaehlt.value = ''
  name.value = ''
  pin.value = ''
  store.error.value = ''
  schritt.value = 'name'
  nextTick(() => nameFeld.value?.focus())
}

/** Nach dem Anmelden: entweder fertig oder erst noch Strava verbinden. */
function weiterNachAnmeldung() {
  if (!store.state.me?.hasStrava && store.stravaConfigured.value) {
    schritt.value = 'strava'
    return
  }
  zurueck()
}

async function anmelden() {
  if (!profil.value || pin.value.length < 4 || laeuft.value) return
  laeuft.value = true
  const ok = await store.anmelden(profil.value.id, pin.value)
  laeuft.value = false
  pin.value = ''
  if (ok) weiterNachAnmeldung()
  else nextTick(() => pinFeld.value?.focus())
}

function nameWeiter() {
  if (!name.value.trim()) return
  store.error.value = ''
  schritt.value = 'neu-pin'
  nextTick(() => pinFeld.value?.focus())
}

async function anlegen() {
  if (pin.value.length < 4 || laeuft.value) return
  laeuft.value = true
  const ok = await store.profilAnlegen(name.value.trim(), pin.value)
  laeuft.value = false
  pin.value = ''
  if (ok) weiterNachAnmeldung()
}
</script>

<template>
  <div class="tor">
    <div class="box card">
      <!-- Auswahl -->
      <template v-if="schritt === 'auswahl'">
        <p class="cap">Fahrradtracker</p>
        <h1>Wer nutzt gerade?</h1>
        <div class="gitter">
          <button
            v-for="p in store.profiles.value"
            :key="p.id"
            type="button"
            class="profil"
            @click="waehle(p.id)"
          >
            <span class="avatar" :style="{ background: p.color }">{{ initiale(p.name) }}</span>
            <span class="pname">{{ p.name }}</span>
            <span v-if="!p.hasStrava" class="ohne">ohne Strava</span>
          </button>

          <button type="button" class="profil neu" @click="neuerNutzer">
            <span class="avatar leer">+</span>
            <span class="pname">Neuer Nutzer</span>
          </button>
        </div>
      </template>

      <!-- PIN eines bestehenden Profils -->
      <template v-else-if="schritt === 'pin'">
        <p class="cap" :style="{ color: profil?.color }">{{ profil?.name }}</p>
        <h1>PIN eingeben</h1>
        <form @submit.prevent="anmelden">
          <input
            ref="pinFeld"
            v-model="pin"
            class="pin"
            type="password"
            inputmode="numeric"
            autocomplete="off"
            maxlength="6"
            placeholder="••••"
            aria-label="PIN"
            @input="pin = pin.replace(/\D/g, '')"
          />
          <div class="knoepfe">
            <button type="button" class="still" @click="zurueck">Zurück</button>
            <button type="submit" class="primaer" :disabled="pin.length < 4 || laeuft">
              Weiter →
            </button>
          </div>
        </form>
      </template>

      <!-- Neues Profil: Name -->
      <template v-else-if="schritt === 'name'">
        <p class="cap">Schritt 1 von 3</p>
        <h1>Wie heißt du?</h1>
        <form @submit.prevent="nameWeiter">
          <input
            ref="nameFeld"
            v-model="name"
            class="feld"
            maxlength="40"
            placeholder="Name"
            aria-label="Name"
          />
          <div class="knoepfe">
            <button type="button" class="still" @click="zurueck">Zurück</button>
            <button type="submit" class="primaer" :disabled="!name.trim()">Weiter →</button>
          </div>
        </form>
      </template>

      <!-- Neues Profil: PIN vergeben -->
      <template v-else-if="schritt === 'neu-pin'">
        <p class="cap">Schritt 2 von 3</p>
        <h1>PIN vergeben</h1>
        <p class="hinweis">Vier bis sechs Ziffern. Sie schützt dein Profil von außen.</p>
        <form @submit.prevent="anlegen">
          <input
            ref="pinFeld"
            v-model="pin"
            class="pin"
            type="password"
            inputmode="numeric"
            autocomplete="off"
            maxlength="6"
            placeholder="••••"
            aria-label="Neue PIN"
            @input="pin = pin.replace(/\D/g, '')"
          />
          <div class="knoepfe">
            <button type="button" class="still" @click="schritt = 'name'">Zurück</button>
            <button type="submit" class="primaer" :disabled="pin.length < 4 || laeuft">
              Profil anlegen →
            </button>
          </div>
        </form>
      </template>

      <!-- Strava verbinden – geführt, nicht als Häkchen nebenbei -->
      <template v-else>
        <p class="cap">Schritt 3 von 3</p>
        <h1>Mit Strava verbinden</h1>
        <p class="hinweis">
          Die Kilometer deiner Teile kommen aus deinen Strava-Fahrten. Ohne Verbindung bleibt der
          Tracker leer – nachholen kannst du es jederzeit in der Verwaltung.
        </p>
        <div class="knoepfe">
          <button type="button" class="still" @click="zurueck">Später</button>
          <button type="button" class="primaer" @click="store.stravaVerbinden()">
            Zu Strava →
          </button>
        </div>
      </template>

      <p v-if="store.error.value" class="fehler">{{ store.error.value }}</p>
    </div>
  </div>
</template>

<style scoped>
.tor {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: var(--bg);
  overflow-y: auto;
}

.box {
  width: min(30rem, 100%);
  padding: 1.4rem 1.2rem;
}

.cap {
  margin: 0;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--violet);
}

h1 {
  margin: 0.2rem 0 1rem;
  font-size: 1.5rem;
  letter-spacing: -0.01em;
}

.hinweis {
  margin: -0.5rem 0 1rem;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.45;
}

.gitter {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(6.2rem, 1fr));
  gap: 0.8rem;
}

.profil {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  padding: 0.7rem 0.3rem;
  border: 1px solid transparent;
  border-radius: 1.1rem;
  background: transparent;
  cursor: pointer;
}

.profil:hover {
  background: color-mix(in srgb, var(--violet) 6%, transparent);
}

.avatar {
  display: grid;
  place-items: center;
  width: 3.6rem;
  height: 3.6rem;
  border-radius: 999px;
  color: white;
  font-size: 1.5rem;
  font-weight: 700;
}

.avatar.leer {
  border: 2px dashed var(--line);
  background: transparent;
  color: var(--muted);
}

.pname {
  font-size: 0.9rem;
  font-weight: 600;
}

.ohne {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--amber);
}

.feld,
.pin {
  width: 100%;
  padding: 0.75rem 0.9rem;
  border: 1px solid var(--line);
  border-radius: 0.9rem;
  background: white;
}

.pin {
  text-align: center;
  letter-spacing: 0.6em;
  font-size: 1.4rem;
}

.knoepfe {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.9rem;
}

.primaer,
.still {
  flex: 1;
  padding: 0.7rem 1rem;
  border-radius: 999px;
  border: 1px solid var(--line);
  font-weight: 600;
  cursor: pointer;
}

.primaer {
  border-color: color-mix(in srgb, var(--violet) 35%, transparent);
  background: var(--violet);
  color: white;
}

.primaer:disabled {
  opacity: 0.45;
  cursor: default;
}

.still {
  background: white;
  color: var(--muted);
}

.fehler {
  margin: 0.9rem 0 0;
  padding: 0.5rem 0.75rem;
  border: 1px solid color-mix(in srgb, var(--red) 35%, transparent);
  border-radius: 0.7rem;
  background: color-mix(in srgb, var(--red) 8%, white);
  color: var(--red);
  font-size: 0.85rem;
}
</style>
