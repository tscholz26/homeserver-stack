<script setup lang="ts">
import { useEinkaufStore } from '@/composables/useEinkaufStore'
import NutzerWahl from '@/components/NutzerWahl.vue'

const store = useEinkaufStore()
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
        <h1>Einkaufsliste</h1>
        <nav class="menu">
          <RouterLink to="/" class="tab-link" title="Einkaufen">Einkauf</RouterLink>
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
        </nav>
      </div>
    </header>

    <p v-if="store.error.value" class="fehler" @click="store.error.value = ''">
      {{ store.error.value }}
    </p>

    <main>
      <RouterView v-if="!store.loading.value" />
      <p v-else class="laedt">Lädt …</p>
    </main>

    <!-- Einmalige Frage beim ersten Öffnen; danach steht der Name im Browser -->
    <NutzerWahl v-if="!store.loading.value && store.userIndex.value === null" />
  </div>
</template>

<style scoped>
.shell {
  max-width: 34rem;
  margin: 0 auto;
  padding: 0.7rem 0.8rem 0;
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

.tab-link {
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
}

.tab-link.router-link-exact-active {
  border-color: color-mix(in srgb, var(--violet) 45%, transparent);
  background: color-mix(in srgb, var(--violet) 12%, white);
  color: var(--violet);
}

.fehler {
  margin: 0.6rem 0 0;
  padding: 0.5rem 0.75rem;
  border: 1px solid color-mix(in srgb, var(--red) 35%, transparent);
  border-radius: 0.7rem;
  background: color-mix(in srgb, var(--red) 8%, white);
  color: var(--red);
  font-size: 0.85rem;
}

.laedt {
  margin-top: 2rem;
  color: var(--muted);
  text-align: center;
}
</style>
