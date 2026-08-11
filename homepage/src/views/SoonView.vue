<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import ServiceIcon from '@/components/ServiceIcon.vue'
import { planned } from '@/services'

const route = useRoute()

// Kommt aus dem Pfad (/bald/einkaufsliste); ohne Treffer wird alles Geplante
// aufgelistet, damit die Seite auch direkt aufgerufen etwas zeigt.
const service = computed(() => planned.find((entry) => entry.id === route.params.id))
</script>

<template>
  <div class="shell">
    <RouterLink to="/" class="back">
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        stroke-width="2.4"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M19 12H6M11 6l-6 6 6 6" />
      </svg>
      Startseite
    </RouterLink>

    <section class="card sheet">
      <span class="badge">Geplant</span>

      <template v-if="service">
        <span class="icon"><ServiceIcon :id="service.id" :size="34" /></span>
        <h1>{{ service.name }}</h1>
        <p class="lead">Diese Seite gibt es noch nicht.</p>
        <p class="plan">{{ service.description }}</p>
      </template>

      <template v-else>
        <h1>Noch nicht gebaut</h1>
        <p class="lead">Diese Seite gibt es noch nicht. Geplant ist:</p>
        <ul class="list">
          <li v-for="entry in planned" :key="entry.id">
            <strong>{{ entry.name }}</strong> – {{ entry.description }}
          </li>
        </ul>
      </template>

      <RouterLink to="/" class="home">Zurück zur Startseite</RouterLink>
    </section>
  </div>
</template>

<style scoped>
.shell {
  max-width: 40rem;
  margin: 0 auto;
  padding: clamp(1rem, 4vw, 3rem) clamp(1rem, 4vw, 2rem);
  padding-left: max(1rem, env(safe-area-inset-left));
  padding-right: max(1rem, env(safe-area-inset-right));
}

.back {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-bottom: 1.2rem;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--violet);
  text-decoration: none;
}

.back:hover {
  text-decoration: underline;
}

.sheet {
  --accent: var(--violet);
  padding: 1.6rem;
}

.badge {
  display: inline-block;
  border: 1px dashed color-mix(in srgb, var(--accent) 50%, transparent);
  border-radius: 999px;
  padding: 0.15rem 0.6rem;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--accent);
}

.icon {
  display: grid;
  place-items: center;
  width: 4rem;
  height: 4rem;
  margin: 1.1rem 0 0.9rem;
  border-radius: 1.2rem;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
}

h1 {
  margin: 0.6rem 0 0;
  font-size: clamp(1.8rem, 6vw, 2.4rem);
  font-weight: 800;
  letter-spacing: -0.03em;
}

.lead {
  margin: 0.6rem 0 0;
  font-size: 1.05rem;
  font-weight: 600;
}

.plan {
  margin: 0.5rem 0 0;
  color: var(--muted);
  line-height: 1.5;
}

.list {
  margin: 0.8rem 0 0;
  padding-left: 1.1rem;
  color: var(--muted);
  line-height: 1.6;
}

.list strong {
  color: var(--text);
}

.home {
  display: inline-block;
  margin-top: 1.4rem;
  font-weight: 700;
  color: var(--accent);
}
</style>
