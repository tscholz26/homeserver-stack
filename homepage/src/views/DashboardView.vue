<script setup lang="ts">
import { computed, ref } from 'vue'
import StatMeter from '@/components/StatMeter.vue'
import UptimeChart from '@/components/UptimeChart.vue'
import MetricDialog, { type MetricName } from '@/components/MetricDialog.vue'
import {
  averageOver,
  averageOverBy,
  formatBytes,
  formatBytesPair,
  formatUptime,
  useMetrics,
  useSystem,
  useUptime,
  wattsOf,
  yearlyCost,
  type DiskInfo,
} from '@/composables/useSystem'

const { info, failed, reload } = useSystem()
const { report } = useUptime()
const { history } = useMetrics()

// Beim Klick auf CPU, Speicher oder Strom öffnet sich der Verlauf
const openMetric = ref<MetricName | null>(null)

const percentAverage = (key: 'cpu' | 'mem') => {
  const mean = averageOver(history.value?.points, 60, key)
  return mean === null ? undefined : `${Math.round(mean)} %`
}

const percent = (used: number, total: number) =>
  total > 0 ? Math.round((used / total) * 100) : null

const memory = computed(() => {
  const mem = info.value?.memory
  if (!mem) return null
  const swap =
    mem.swapTotalBytes && mem.swapUsedBytes !== null
      ? `Swap ${formatBytes(mem.swapUsedBytes)} von ${formatBytes(mem.swapTotalBytes)}`
      : 'kein Swap'
  return {
    value: formatBytesPair(mem.usedBytes, mem.totalBytes),
    percent: percent(mem.usedBytes, mem.totalBytes),
    average: percentAverage('mem'),
    hint: `${formatBytes(mem.availableBytes)} verfügbar · ${swap}`,
  }
})

function diskCard(values: DiskInfo | null | undefined, what: string) {
  if (!values) return null
  return {
    value: formatBytesPair(values.usedBytes, values.totalBytes),
    percent: percent(values.usedBytes, values.totalBytes),
    hint: `${formatBytes(values.freeBytes)} frei – ${what}`,
  }
}

const systemDisk = computed(() =>
  diskCard(info.value?.disks.system, 'Systemplatte mit Docker-Images'),
)
const dataDisk = computed(() => diskCard(info.value?.disks.data, 'Datenplatte für Nextcloud'))

const cpu = computed(() => {
  const values = info.value?.cpu
  if (!values) return null
  const load = values.load ? `Last ${values.load.map((value) => value.toFixed(2)).join(' / ')}` : ''
  const temp = values.tempC !== null ? ` · ${values.tempC} °C` : ''
  return {
    value: values.usagePercent === null ? 'messe …' : `${values.usagePercent} %`,
    percent: values.usagePercent,
    average: percentAverage('cpu'),
    hint: `${load}${temp}\n${values.model ?? ''}${values.cores ? ` · ${values.cores} Kerne` : ''}`,
  }
})

// Der CPU-Anteil ist gemessen, der Rest geschätzt – beides steht auf der Karte,
// damit die Zahl nicht genauer wirkt, als sie ist.
const watt = (value: number) =>
  value.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

const power = computed(() => {
  const values = info.value?.power
  if (!values) return null

  const mean = averageOverBy(history.value?.points, 60, (point) => wattsOf(point, values))
  const cpuPart = values.cpuWatts === null ? '–' : watt(values.cpuWatts)

  return {
    value: values.watts === null ? 'messe …' : `≈ ${watt(values.watts)} W`,
    average: mean === null ? undefined : `≈ ${watt(mean)} W`,
    hint:
      `Gemessen: ${cpuPart} W (${values.zones.join(' + ')})\n` +
      `Geschätzt: + ${values.baselineWatts} W für Board, Platten und Lüfter, ` +
      `Netzteil ${Math.round(values.psuEfficiency * 100)} %` +
      (values.watts === null ? '' : `\nEntspricht ${yearlyCost(values.watts, values.pricePerKwh)}`),
  }
})

const updatedAt = computed(() =>
  info.value
    ? new Date(info.value.generatedAt).toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '',
)
</script>

<template>
  <div class="shell">
    <header class="top">
      <div>
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
        <h1>Dashboard</h1>
        <p v-if="info" class="sub">
          {{ info.host.hostname ?? 'Server' }} · {{ info.host.os ?? 'Linux' }} · Kernel
          {{ info.host.kernel ?? '–' }}
        </p>
      </div>

      <button class="refresh" :title="`Aktualisiert ${updatedAt}`" @click="reload()">
        <span class="pulse" />
        Stand {{ updatedAt || '…' }}
      </button>
    </header>

    <p v-if="failed" class="notice">
      Die Systemwerte sind nicht erreichbar. Läuft der Container <code>homepage</code> mit dem
      aktuellen Stand?
    </p>

    <template v-else-if="info">
      <section class="stats">
        <StatMeter
          label="Läuft seit"
          :value="formatUptime(info.host.uptimeSeconds)"
          :percent="null"
          hint="Zeit seit dem letzten Neustart des Servers"
        />
        <StatMeter
          v-if="cpu"
          label="CPU"
          :value="cpu.value"
          :percent="cpu.percent"
          :average="cpu.average"
          :hint="cpu.hint"
          interactive
          @open="openMetric = 'cpu'"
        />
        <StatMeter
          v-if="power"
          label="Stromverbrauch"
          :value="power.value"
          :percent="null"
          :average="power.average"
          :hint="power.hint"
          interactive
          @open="openMetric = 'power'"
        />
        <StatMeter
          v-if="memory"
          label="Arbeitsspeicher"
          :value="memory.value"
          :percent="memory.percent"
          :average="memory.average"
          :hint="memory.hint"
          interactive
          @open="openMetric = 'memory'"
        />
        <StatMeter
          v-if="systemDisk"
          label="Systemplatte"
          :value="systemDisk.value"
          :percent="systemDisk.percent"
          :hint="systemDisk.hint"
        />
        <StatMeter
          v-if="dataDisk"
          label="Datenplatte"
          :value="dataDisk.value"
          :percent="dataDisk.percent"
          :hint="dataDisk.hint"
        />
      </section>

      <UptimeChart :report="report" />

      <section class="card containers">
        <p class="label">
          Docker-Container
          <span v-if="info.containers" class="count">
            {{ info.containers.running }} von {{ info.containers.total }} laufen
          </span>
        </p>

        <p v-if="info.dockerError" class="notice inline">
          Container-Liste nicht abrufbar: {{ info.dockerError }}
        </p>

        <template v-else-if="info.containers">
          <ul>
            <li class="head">
              <span />
              <span>Name</span>
              <span>Image</span>
              <span class="num">RAM</span>
              <span class="num">CPU</span>
              <span class="status">Laufzeit</span>
            </li>
            <li v-for="container in info.containers.list" :key="container.name">
              <span class="dot" :class="container.state" />
              <span class="name">
                {{ container.name }}
                <span v-if="container.health" class="badge" :class="container.health">
                  {{ container.health === 'healthy' ? 'gesund' : container.health }}
                </span>
                <span v-if="container.restarts" class="badge warn">
                  {{ container.restarts }}× neu gestartet
                </span>
              </span>
              <span class="image">{{ container.image }}</span>
              <span class="num">{{
                container.memoryBytes === null ? '–' : formatBytes(container.memoryBytes)
              }}</span>
              <span class="num">{{
                container.cpuPercent === null
                  ? '–'
                  : `${container.cpuPercent.toLocaleString('de-DE', {
                      maximumFractionDigits: 1,
                    })} %`
              }}</span>
              <span class="status">{{ container.status }}</span>
            </li>
          </ul>

          <p class="foot">RAM und CPU pro Container werden jede Minute gemessen.</p>
        </template>
      </section>
    </template>

    <p v-else class="notice">Lade Systemwerte …</p>

    <MetricDialog
      :metric="openMetric"
      :history="history"
      :power="info?.power ?? null"
      @close="openMetric = null"
    />
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

.top {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.back {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
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

h1 {
  margin: 0.4rem 0 0;
  font-size: clamp(2rem, 6vw, 3rem);
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.04em;
}

.sub {
  margin: 0.5rem 0 0;
  font-size: 0.9rem;
  color: var(--muted);
}

.refresh {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--card);
  box-shadow: var(--shadow);
  color: var(--muted);
  padding: 0.45rem 0.8rem;
  font: inherit;
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}

.pulse {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: #16a34a;
  animation: beat 2.4s ease-in-out infinite;
}

@keyframes beat {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.25;
  }
}

/* 17rem, damit die sechs Karten 3+3 stehen statt 4+2 */
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr));
  gap: 1rem;
}

.label {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin: 0 0 0.9rem;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
}

.count {
  color: #15803d;
}

.containers {
  margin-top: 1rem;
}

.containers ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.containers li {
  display: grid;
  grid-template-columns: 0.6rem minmax(7rem, 1.3fr) minmax(0, 1.2fr) 4.5rem 3.5rem 9.5rem;
  align-items: center;
  gap: 0.7rem;
  padding: 0.55rem 0;
  border-bottom: 1px solid var(--line);
  font-size: 0.88rem;
}

.containers li.head {
  padding-top: 0;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
}

.containers li:last-child {
  border-bottom: 0;
}

.dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: #94a3b8;
}

.dot.running {
  background: #16a34a;
}

.dot.exited,
.dot.dead {
  background: #b91c1c;
}

.dot.restarting,
.dot.paused {
  background: #b45309;
}

.name {
  font-weight: 700;
  overflow-wrap: anywhere;
}

.badge {
  display: inline-block;
  margin-left: 0.35rem;
  border-radius: 999px;
  padding: 0.1rem 0.4rem;
  font-size: 0.68rem;
  font-weight: 700;
  white-space: nowrap;
  border: 1px solid color-mix(in srgb, #15803d 35%, transparent);
  background: color-mix(in srgb, #15803d 10%, transparent);
  color: #15803d;
}

.badge.warn,
.badge.unhealthy,
.badge.starting {
  border-color: color-mix(in srgb, #b45309 40%, transparent);
  background: color-mix(in srgb, #b45309 10%, transparent);
  color: #b45309;
}

.image,
.status,
.num {
  color: var(--muted);
  overflow-wrap: anywhere;
}

.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.status {
  text-align: right;
  white-space: nowrap;
}

.foot {
  margin: 0.9rem 0 0;
  font-size: 0.78rem;
  color: var(--muted);
}

.notice {
  margin: 0;
  border: 1px solid color-mix(in srgb, #b45309 40%, transparent);
  border-radius: 1rem;
  background: color-mix(in srgb, #b45309 8%, transparent);
  padding: 0.8rem 1rem;
  font-size: 0.9rem;
}

.notice.inline {
  margin-top: 0.5rem;
}

/* Auf dem Handy passt keine Tabelle – Image und Laufzeit unter den Namen */
@media (max-width: 44rem) {
  .containers li {
    grid-template-columns: 0.6rem 1fr auto auto;
    row-gap: 0.15rem;
  }

  .containers li.head {
    display: none;
  }

  .image {
    grid-column: 2 / -1;
    font-size: 0.8rem;
  }

  .status {
    grid-column: 2 / -1;
    text-align: left;
    font-size: 0.8rem;
    white-space: normal;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pulse {
    animation: none;
  }
}
</style>
