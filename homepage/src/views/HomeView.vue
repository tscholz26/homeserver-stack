<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import ServiceTile from '@/components/ServiceTile.vue'
import ServiceIcon from '@/components/ServiceIcon.vue'
import WeatherCard from '@/components/WeatherCard.vue'
import SunCard from '@/components/SunCard.vue'
import StatusCard from '@/components/StatusCard.vue'
import AdguardCard from '@/components/AdguardCard.vue'
import { useClock } from '@/composables/useClock'
import { useWeather } from '@/composables/useWeather'
import { useStatus } from '@/composables/useStatus'
import { useAdguard } from '@/composables/useAdguard'
import { planned, services } from '@/services'

const { now, time, date, greeting } = useClock()
const { weather, failed } = useWeather()
const { statuses, onlineCount, allOnline } = useStatus()
const {
  adguard,
  available: adguardAvailable,
  failed: adguardFailed,
  pending,
  setProtection,
} = useAdguard()

// 1, 2, 3 springen direkt in den jeweiligen Dienst – die Ziffer steht auf der
// Kachel. Nicht, wenn gerade getippt wird oder eine Sondertaste mitläuft.
function onKey(event: KeyboardEvent) {
  if (event.metaKey || event.ctrlKey || event.altKey) return
  if (document.activeElement instanceof HTMLInputElement) return

  const index = Number(event.key) - 1
  const service = services[index]
  if (Number.isInteger(index) && service) window.location.assign(service.href)
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="shell">
    <header class="hero">
      <div class="intro">
        <p class="eyebrow">
          <span class="live" :class="{ ok: allOnline }" />
          Tristans Homeserver
        </p>
        <h1>{{ greeting }}.</h1>
        <p class="lead">Wo möchtest du hin?</p>
      </div>

      <!-- Die Uhr führt raus zum Google-Kalender -->
      <a
        class="card clock"
        href="https://calendar.google.com"
        target="_blank"
        rel="noopener noreferrer"
      >
        <p class="label">
          Kalender
          <svg
            viewBox="0 0 24 24"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            stroke-width="2.4"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M7 17 17 7M9 7h8v8" />
          </svg>
        </p>
        <p class="time">{{ time }}</p>
        <p class="date">{{ date }}</p>
      </a>
    </header>

    <main>
      <section class="tiles" aria-label="Dienste">
        <ServiceTile
          v-for="(service, index) in services"
          :key="service.id"
          :service="service"
          :status="statuses[service.id]"
          :shortcut="index + 1"
        />

        <!-- Geplantes sitzt in derselben Reihe, bleibt aber grau und gestrichelt -->
        <RouterLink v-for="entry in planned" :key="entry.id" class="plan" :to="`/bald/${entry.id}`">
          <span class="plan-icon"><ServiceIcon :id="entry.id" :size="26" /></span>
          <span class="plan-note">geplant</span>
          <span class="plan-text">
            <span class="plan-tagline">{{ entry.tagline }}</span>
            <h2>{{ entry.name }}</h2>
            <p>{{ entry.description }}</p>
          </span>
        </RouterLink>

        <!-- Füllt die Reihe der Dienste auf und ist die Info, die man beim
             Rausgehen sowieso sucht -->
        <WeatherCard :weather="weather" :failed="failed" />
      </section>

      <section class="widgets" aria-label="Übersicht">
        <SunCard :weather="weather" :now="now" />
        <StatusCard :statuses="statuses" :online-count="onlineCount" :all-online="allOnline" />
        <AdguardCard
          v-if="adguardAvailable"
          :adguard="adguard"
          :failed="adguardFailed"
          :pending="pending"
          :now="now"
          @protection="setProtection"
        />
      </section>
    </main>
  </div>
</template>

<style scoped>
.shell {
  max-width: 64rem;
  margin: 0 auto;
  padding: clamp(1rem, 4vw, 3rem) clamp(1rem, 4vw, 2rem);
  padding-left: max(1rem, env(safe-area-inset-left));
  padding-right: max(1rem, env(safe-area-inset-right));
  padding-bottom: max(1.5rem, env(safe-area-inset-bottom));
}

/* Kopf: links die Begrüßung, rechts die Uhr – auf dem Handy untereinander */
.hero {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  justify-content: space-between;
  gap: 1.2rem;
  margin-bottom: 2rem;
  animation: rise 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.intro {
  min-width: min(100%, 18rem);
  flex: 1;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--muted);
}

.live {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: #94a3b8;
}

.live.ok {
  background: #16a34a;
  box-shadow: 0 0 0.5rem rgba(22, 163, 74, 0.6);
}

h1 {
  margin: 0.4rem 0 0;
  font-size: clamp(2.6rem, 9vw, 4.6rem);
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.045em;
  background: linear-gradient(100deg, var(--violet) 0%, var(--cyan) 46%, var(--amber) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.lead {
  margin: 0.9rem 0 0;
  max-width: 26rem;
  font-size: 1.05rem;
  line-height: 1.5;
  color: var(--muted);
}

.clock {
  --accent: var(--violet);
  text-align: right;
  min-width: 12rem;
}

.clock .label {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.25rem;
  margin: 0 0 0.35rem;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--accent);
}

.time {
  margin: 0;
  font-family: ui-monospace, 'Cascadia Mono', 'Menlo', monospace;
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.date {
  margin: 0.25rem 0 0;
  font-size: 0.8rem;
  color: var(--muted);
}

.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  gap: 1rem;
}

.widgets {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  gap: 1rem;
  margin-top: 1rem;
}

/* Geplantes: gleiche Kachelgröße wie die Dienste, aber grau und gestrichelt */
.plan {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto 1fr;
  grid-template-areas:
    'icon note'
    'text text';
  padding: 1.4rem;
  border: 1px dashed color-mix(in srgb, var(--muted) 35%, transparent);
  border-radius: 1.5rem;
  text-decoration: none;
  color: var(--muted);
  transition:
    border-color 0.25s ease,
    color 0.25s ease;
}

.plan:hover,
.plan:focus-visible {
  border-color: color-mix(in srgb, var(--muted) 60%, transparent);
  color: var(--text);
}

.plan-icon {
  grid-area: icon;
  display: grid;
  place-items: center;
  width: 3.2rem;
  height: 3.2rem;
  border-radius: 1rem;
  border: 1px dashed color-mix(in srgb, var(--muted) 35%, transparent);
}

.plan-note {
  grid-area: note;
  justify-self: end;
  align-self: start;
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--line);
  border-radius: 0.4rem;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.plan-text {
  grid-area: text;
  margin-top: 0.9rem;
}

.plan-tagline {
  display: block;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.plan h2 {
  margin: 0;
  font-size: 1.5rem;
  letter-spacing: -0.02em;
  color: color-mix(in srgb, var(--text) 55%, var(--muted));
}

.plan p {
  margin: 0.35rem 0 0;
  font-size: 0.9rem;
  line-height: 1.5;
}

/* Kacheln und Karten laufen leicht versetzt ein */
.tiles > *,
.widgets > * {
  animation: rise 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.tiles > *:nth-child(1) {
  animation-delay: 0.04s;
}

.tiles > *:nth-child(2) {
  animation-delay: 0.08s;
}

.tiles > *:nth-child(3) {
  animation-delay: 0.12s;
}

.tiles > *:nth-child(4) {
  animation-delay: 0.16s;
}

.tiles > *:nth-child(5) {
  animation-delay: 0.2s;
}

.tiles > *:nth-child(6) {
  animation-delay: 0.24s;
}

.widgets > *:nth-child(1) {
  animation-delay: 0.28s;
}

.widgets > *:nth-child(2) {
  animation-delay: 0.32s;
}

.widgets > *:nth-child(3) {
  animation-delay: 0.36s;
}

/* Auf dem Handy fliegt die Uhr raus – der Platz gehört den Kacheln, die alle
   drei ohne Scrollen zu sehen sein sollen. */
@media (max-width: 34rem) {
  .clock {
    display: none;
  }

  .hero {
    margin-bottom: 1.1rem;
  }

  h1 {
    font-size: 2.25rem;
  }

  .lead {
    margin-top: 0.5rem;
    font-size: 1rem;
  }

  .tiles {
    gap: 0.7rem;
  }

  /* Wie die Dienst-Kacheln: auf dem Handy eine flache Zeile */
  .plan {
    grid-template-columns: auto 1fr auto;
    grid-template-rows: auto;
    grid-template-areas: 'icon text note';
    align-items: center;
    gap: 0 0.9rem;
    padding: 1rem 1.1rem;
  }

  .plan-icon {
    width: 2.9rem;
    height: 2.9rem;
    border-radius: 0.9rem;
  }

  .plan-text {
    margin-top: 0;
    min-width: 0;
  }

  .plan h2 {
    font-size: 1.25rem;
  }

  .plan p {
    display: none;
  }

  .widgets {
    margin-top: 0.7rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hero,
  .tiles > *,
  .widgets > * {
    animation: none;
  }
}
</style>
