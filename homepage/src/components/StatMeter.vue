<script setup lang="ts">
import { computed } from 'vue'
import { toneFor } from '@/composables/useSystem'

const props = defineProps<{
  label: string
  value: string
  percent: number | null
  hint?: string
}>()

const tone = computed(() => toneFor(props.percent))

// Bei „61 %“ als Wert wäre die kleine Prozentzahl daneben nur eine Dopplung
const showPercent = computed(() => props.percent !== null && !props.value.includes('%'))
const width = computed(() => `${Math.min(100, Math.max(0, props.percent ?? 0))}%`)
</script>

<template>
  <div class="card meter" :class="tone">
    <p class="label">{{ label }}</p>
    <p class="value">
      {{ value }}
      <span v-if="showPercent" class="percent">{{ percent }} %</span>
    </p>

    <div v-if="percent !== null" class="track">
      <div class="fill" :style="{ width }" />
    </div>

    <p v-if="hint" class="hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.label {
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
  .fill {
    transition: none;
  }
}
</style>
