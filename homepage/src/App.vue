<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import ServiceTile from '@/components/ServiceTile.vue'
import WeatherCard from '@/components/WeatherCard.vue'
import SunCard from '@/components/SunCard.vue'
import StatusCard from '@/components/StatusCard.vue'
import { useClock } from '@/composables/useClock'
import { useWeather } from '@/composables/useWeather'
import { useStatus } from '@/composables/useStatus'
import { services } from '@/services'

const { now, time, date, greeting } = useClock()
const { weather, failed } = useWeather()
const { statuses, onlineCount, allOnline } = useStatus()

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

      <div class="card clock">
        <p class="time">{{ time }}</p>
        <p class="date">{{ date }}</p>
      </div>
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
      </section>

      <section class="widgets" aria-label="Auf dem Server">
        <WeatherCard :weather="weather" :failed="failed" />
        <SunCard :weather="weather" :now="now" />
        <StatusCard :statuses="statuses" :online-count="onlineCount" :all-online="allOnline" />
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
  text-align: right;
  min-width: 12rem;
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

.widgets > *:nth-child(1) {
  animation-delay: 0.16s;
}

.widgets > *:nth-child(2) {
  animation-delay: 0.2s;
}

.widgets > *:nth-child(3) {
  animation-delay: 0.24s;
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
