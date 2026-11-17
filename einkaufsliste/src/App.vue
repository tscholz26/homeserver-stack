<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useEinkaufStore } from '@/composables/useEinkaufStore'
import AppIcon from '@/components/AppIcon.vue'

const store = useEinkaufStore()

// Selbst bestimmt statt über router-link-active: ein aufgeschlagenes Rezept
// (/rezepte/…) gehört weiter zum Rezeptbuch.
const route = useRoute()
const ort = computed(() => (route.path.startsWith('/rezepte') ? 'rezepte' : route.path))
</script>

<template>
  <div class="shell">
    <!-- Eine Zeile, auf jeder Seite gleich: Rückweg zum Homeserver, die drei
         Orte der App und die Verwaltung. Kein Titel – die Zeile selbst sagt,
         wo man ist, und jeder Pixel Höhe geht an die Liste darunter. -->
    <header class="kopf">
      <a class="rand" href="/" title="Homeserver" aria-label="Zurück zum Homeserver">
        <AppIcon name="haus" />
      </a>
      <nav class="menu">
        <RouterLink to="/" class="ort" :class="{ aktiv: ort === '/' }">Einkauf</RouterLink>
        <RouterLink to="/woche" class="ort" :class="{ aktiv: ort === '/woche' }">
          Wochenplan
          <span v-if="store.state.woche.length" class="zahl">{{ store.state.woche.length }}</span>
        </RouterLink>
        <RouterLink to="/rezepte" class="ort" :class="{ aktiv: ort === 'rezepte' }">
          Rezepte
        </RouterLink>
      </nav>
      <RouterLink
        to="/verwaltung"
        class="rand"
        :class="{ aktiv: ort === '/verwaltung' }"
        title="Verwaltung"
        aria-label="Verwaltung"
      >
        <AppIcon name="zahnrad" :groesse="17" />
      </RouterLink>
    </header>

    <p v-if="store.error.value" class="fehler" @click="store.error.value = ''">
      {{ store.error.value }}
    </p>

    <main>
      <RouterView v-if="!store.loading.value" />
      <p v-else class="laedt">Lädt …</p>
    </main>
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

.kopf {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

/* Haus und Zahnrad links und rechts der Orte, gleich groß */
.rand {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 2.3rem;
  height: 2.3rem;
  border: 1px solid var(--line);
  border-radius: 0.8rem;
  background: var(--card);
  color: var(--muted);
}

.rand.aktiv {
  border-color: color-mix(in srgb, var(--violet) 45%, transparent);
  background: color-mix(in srgb, var(--violet) 12%, white);
  color: var(--violet);
}

.menu {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 0.2rem;
  padding: 0.2rem;
  border: 1px solid var(--line);
  border-radius: 0.85rem;
  background: var(--card);
}

.ort {
  padding: 0.45rem 0.2rem;
  border-radius: 0.65rem;
  color: var(--muted);
  font-size: 0.84rem;
  font-weight: 600;
  text-align: center;
  text-decoration: none;
  white-space: nowrap;
}

.zahl {
  display: inline-block;
  min-width: 1.15rem;
  margin-left: 0.2rem;
  padding: 0 0.3rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted) 16%, transparent);
  font-size: 0.72rem;
  line-height: 1.15rem;
  font-variant-numeric: tabular-nums;
}

.ort.aktiv .zahl {
  background: color-mix(in srgb, var(--violet) 18%, transparent);
}

.ort.aktiv {
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
