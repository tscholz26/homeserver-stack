<script setup lang="ts">
import { computed } from 'vue'
import { toneFor } from '@/composables/useSystem'

const props = defineProps<{
  label: string
  value: string
  percent: number | null
  hint?: string
  /** Mittelwert der letzten 60 Minuten, schon fertig formatiert */
  average?: string
  /** Anklickbar für den Verlauf – dann wird die Karte ein Button */
  interactive?: boolean
}>()

const emit = defineEmits<{ open: [] }>()

const tone = computed(() => toneFor(props.percent))

// Bei „61 %“ als Wert wäre die kleine Prozentzahl daneben nur eine Dopplung
const showPercent = computed(() => props.percent !== null && !props.value.includes('%'))
const width = computed(() => `${Math.min(100, Math.max(0, props.percent ?? 0))}%`)
</script>

<template>
  <component
    :is="interactive ? 'button' : 'div'"
    class="card meter"
    :class="[tone, { interactive }]"
    @click="interactive && emit('open')"
  >
    <p class="label">
      {{ label }}
      <span v-if="interactive" class="more">Verlauf ›</span>
    </p>
    <p class="value">
      {{ value }}
      <span v-if="showPercent" class="percent">{{ percent }} %</span>
    </p>

    <div v-if="percent !== null" class="track">
      <div class="fill" :style="{ width }" />
    </div>

    <p v-if="average" class="avg">
      Ø 60 min <strong>{{ average }}</strong>
    </p>

    <p v-if="hint" class="hint">{{ hint }}</p>
  </component>
</template>

<style scoped>
.label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin: 0 0 0.5rem;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
}

.meter {
  display: flex;
  flex-direction: column;
}

/* Als Button darf die Karte nicht wie ein Formularfeld aussehen */
.meter.interactive {
  width: 100%;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.25s ease,
    transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.meter.interactive:hover,
.meter.interactive:focus-visible {
  border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  transform: translateY(-2px);
}

.more {
  font-size: 0.66rem;
  letter-spacing: 0.08em;
  color: var(--accent);
}

.avg {
  margin: 0.7rem 0 0;
  font-size: 0.78rem;
  letter-spacing: 0.02em;
  color: var(--muted);
}

.avg strong {
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.meter.ok {
  --accent: #15803d;
}

.meter.warn {
  --accent: #b45309;
}

.meter.crit {
  --accent: #b91c1c;
}

.meter.unknown {
  --accent: #94a3b8;
}

.value {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  margin: 0 0 0.6rem;
  font-size: 1.2rem;
  white-space: nowrap;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.percent {
  font-size: 0.9rem;
  white-space: nowrap;
  font-weight: 700;
  color: var(--accent);
}

.track {
  height: 0.5rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  overflow: hidden;
}

.fill {
  height: 100%;
  border-radius: 999px;
  background: var(--accent);
  transition: width 0.4s ease;
}

.hint {
  margin: 0.7rem 0 0;
  white-space: pre-line;
  font-size: 0.8rem;
  line-height: 1.4;
  color: var(--muted);
}

@media (prefers-reduced-motion: reduce) {
  .fill,
  .meter.interactive {
    transition: none;
  }

  .meter.interactive:hover {
    transform: none;
  }
}
</style>
