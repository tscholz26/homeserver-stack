<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTracker } from '@/composables/useTracker'
import ProfilTor from '@/components/ProfilTor.vue'

const store = useTracker()
const route = useRoute()
const router = useRouter()

// Rückmeldung des Wahoo-Flows: der Server schickt den Browser mit ?wahoo=…
// zurück. Ausgewertet, gemeldet, und dann aus der Adresse geräumt.
const RUECKMELDUNG: Record<string, string> = {
  ok: 'Wahoo ist verbunden – die Fahrten werden geholt.',
  abgelehnt: 'Die Verbindung zu Wahoo wurde abgebrochen.',
  abgelaufen: 'Der Verbindungsversuch ist abgelaufen – bitte noch einmal.',
  fehler: 'Wahoo hat die Anmeldung abgelehnt.',
}

async function werteWahooAus() {
  const wert = String(route.query.wahoo ?? '')
  if (!wert) return
  if (wert === 'ok') {
    store.hinweis.value = RUECKMELDUNG.ok!
    await store.refresh()
  } else {
    store.error.value = RUECKMELDUNG[wert] ?? 'Die Verbindung zu Wahoo hat nicht geklappt.'
  }
  router.replace({ query: {} })
}

onMounted(werteWahooAus)
watch(() => route.query.wahoo, werteWahooAus)

const ohneWahoo = computed(
  () => store.angemeldet.value && store.wahooConfigured.value && !store.state.me?.hasWahoo,
)

// Zugriff zurückgezogen: die Fahrten stehen still, bis neu verbunden wird
const wahooWegBanner = computed(
  () => store.angemeldet.value && Boolean(store.state.me?.needsReconnect),
)

function initiale(text: string) {
  return text.trim().slice(0, 1).toUpperCase() || '?'
}
</script>

<template>
  <div class="shell">
    <header class="top">
      <!-- Unaufdringlicher Rückweg zur Startseite des Homeservers -->
      <a class="home" href="/">
        <svg
          viewBox="0 0 24 24"
          width="13"
          height="13"
          fill="none"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M19 12H6M11 6l-6 6 6 6" />
        </svg>
        Homeserver
      </a>

      <div class="row">
        <h1>Fahrradtracker</h1>
        <nav class="menu">
          <RouterLink to="/" class="tab-link">Räder</RouterLink>
          <RouterLink to="/verwaltung" class="tab-link" title="Verwaltung">
            <svg
              viewBox="0 0 24 24"
              width="17"
              height="17"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3.2" />
              <path
                d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"
              />
            </svg>
          </RouterLink>
          <!-- Abmelden: löscht die Sitzung auf diesem Gerät, danach fragt der
               Auswahlschirm wieder nach der PIN -->
          <button
            v-if="store.angemeldet.value"
            type="button"
            class="ich"
            title="Abmelden"
            @click="store.abmelden()"
          >
            <span class="punkt" :style="{ background: store.state.me?.color }">
              {{ initiale(store.state.me?.name ?? '') }}
            </span>
            Abmelden
          </button>
        </nav>
      </div>
    </header>

    <p v-if="store.error.value" class="meldung fehler" @click="store.error.value = ''">
      {{ store.error.value }}
    </p>
    <p v-if="store.hinweis.value" class="meldung gut" @click="store.hinweis.value = ''">
      {{ store.hinweis.value }}
    </p>

    <!-- Bleibt stehen, bis die Verbindung nachgeholt ist -->
    <RouterLink v-if="ohneWahoo" to="/verwaltung" class="meldung banner">
      Wahoo noch nicht verbunden – ohne die Fahrten bleiben alle Teile bei 0 km. Verbinden →
    </RouterLink>
    <RouterLink v-else-if="wahooWegBanner" to="/verwaltung" class="meldung banner">
      Wahoo hat den Zugriff beendet – seitdem kommen keine neuen Fahrten an. Neu verbinden →
    </RouterLink>

    <main>
      <RouterView v-if="!store.loading.value && store.angemeldet.value" />
      <p v-else-if="store.loading.value" class="laedt">Lädt …</p>
    </main>

    <ProfilTor v-if="!store.loading.value && !store.angemeldet.value" />
  </div>
</template>

<style scoped>
.shell {
  max-width: 46rem;
  margin: 0 auto;
  padding: 0.7rem 0.8rem 2rem;
  padding-left: max(0.8rem, env(safe-area-inset-left));
  padding-right: max(0.8rem, env(safe-area-inset-right));
}

.home {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
  text-decoration: none;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  margin-top: 0.15rem;
}

h1 {
  margin: 0;
  font-size: 1.45rem;
  letter-spacing: -0.01em;
}

.menu {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.tab-link,
.ich {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.7rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--card);
  color: var(--muted);
  font-size: 0.85rem;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}

.tab-link.router-link-exact-active {
  border-color: color-mix(in srgb, var(--violet) 45%, transparent);
  background: color-mix(in srgb, var(--violet) 12%, white);
  color: var(--violet);
}

.punkt {
  display: grid;
  place-items: center;
  width: 1.3rem;
  height: 1.3rem;
  border-radius: 999px;
  color: white;
  font-size: 0.7rem;
  font-weight: 700;
}

.meldung {
  display: block;
  margin: 0.6rem 0 0;
  padding: 0.5rem 0.75rem;
  border-radius: 0.7rem;
  font-size: 0.85rem;
  text-decoration: none;
}

.fehler {
  border: 1px solid color-mix(in srgb, var(--red) 35%, transparent);
  background: color-mix(in srgb, var(--red) 8%, white);
  color: var(--red);
}

.gut {
  border: 1px solid color-mix(in srgb, var(--green) 35%, transparent);
  background: color-mix(in srgb, var(--green) 8%, white);
  color: var(--green);
}

.banner {
  border: 1px solid color-mix(in srgb, var(--amber) 40%, transparent);
  background: color-mix(in srgb, var(--amber) 10%, white);
  color: var(--amber);
  font-weight: 600;
}

.laedt {
  margin-top: 2rem;
  color: var(--muted);
  text-align: center;
}
</style>
