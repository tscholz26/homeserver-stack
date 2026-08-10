<script setup lang="ts">
import { computed } from 'vue'
import { services } from '@/services'
import type { UptimeReport } from '@/composables/useSystem'

const props = defineProps<{ report: UptimeReport | null }>()

const nameOf = (id: string) => services.find((service) => service.id === id)?.name ?? id

const rows = computed(() =>
  (props.report?.services ?? []).map((service) => ({
    ...service,
    name: nameOf(service.id),
    text:
      service.availability === null
        ? '–'
        : `${service.availability.toLocaleString('de-DE', {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })} %`,
  })),
)

// Ehrlich bleiben: die Aufzeichnung beginnt erst mit dem ersten Start dieser
// Version, vorher gibt es nichts. Kurz nach dem Start ist der Balken fast leer.
const since = computed(() => {
  if (!props.report) return ''
  const started = new Date(props.report.recordedSince)
  const minutes = Math.round((Date.now() - started.getTime()) / 60_000)
  if (minutes < 60) return `seit ${minutes} min`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `seit ${hours} Std` : `seit ${Math.floor(hours / 24)} Tagen`
})
</script>

<template>
  <section class="card uptime">
    <p class="label">
      Verfügbarkeit
      <span v-if="report" class="window">
        letzte {{ report.windowHours }} Std · {{ report.sampleCount }} Messungen
        {{ since }}
      </span>
    </p>

    <p v-if="!report" class="hint">Lade Verlauf …</p>

    <template v-else>
      <div v-for="row in rows" :key="row.id" class="row">
        <span class="name">{{ row.name }}</span>
        <span class="bar">
          <span v-for="(state, index) in row.states" :key="index" class="tick" :class="state" />
        </span>
        <span class="share" :class="{ perfect: row.availability === 100 }">{{ row.text }}</span>
      </div>

      <p class="legend">
        <span class="key"><span class="tick up" /> läuft</span>
        <span class="key"><span class="tick partial" /> teilweise</span>
        <span class="key"><span class="tick down" /> weg</span>
        <span class="key"><span class="tick none" /> keine Messung</span>
        <span class="spacer" />
        <span>alle {{ report.intervalSeconds }} s geprüft, über Caddy wie ein Besucher</span>
      </p>
    </template>
  </section>
</template>

<style scoped>
.uptime {
  margin-top: 1rem;
}

.label {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin: 0 0 1rem;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
}

.window {
  letter-spacing: 0.06em;
  text-transform: none;
  font-weight: 600;
}

.row {
  display: grid;
  grid-template-columns: minmax(6rem, 8rem) 1fr auto;
  align-items: center;
  gap: 0.8rem;
  margin-bottom: 0.7rem;
}

.name {
  font-size: 0.9rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}

/* Ein Abschnitt pro Zeitfenster, gleichmäßig über die Breite verteilt */
.bar {
  display: flex;
  gap: 1px;
  height: 1.6rem;
}

.tick {
  flex: 1;
  min-width: 1px;
  border-radius: 1px;
  background: var(--tick, #e2e5ea);
}

.tick.up {
  --tick: #16a34a;
}

.tick.partial {
  --tick: #d97706;
}

.tick.down {
  --tick: #dc2626;
}

.tick.none {
  --tick: rgba(24, 28, 36, 0.09);
}

.share {
  font-size: 0.9rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}

.share.perfect {
  color: #15803d;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin: 1rem 0 0;
  padding-top: 0.8rem;
  border-top: 1px solid var(--line);
  font-size: 0.78rem;
  color: var(--muted);
}

.key {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.key .tick {
  flex: none;
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 2px;
}

.spacer {
  flex: 1;
}

@media (max-width: 34rem) {
  .row {
    grid-template-columns: 1fr auto;
    row-gap: 0.25rem;
  }

  .bar {
    grid-column: 1 / -1;
    height: 1.3rem;
  }
}
</style>
