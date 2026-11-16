<script setup lang="ts">
import { HALTBARKEITEN, type Haltbarkeit } from '@/utils/haltbarkeit'

// Zwei Knöpfe statt eines Schalters: „noch nicht festgelegt“ ist ein echter
// Zustand, und ein zweiter Tipp auf den aktiven Knopf führt dorthin zurück.
const wert = defineModel<Haltbarkeit>({ required: true })

function waehle(h: Haltbarkeit) {
  wert.value = wert.value === h ? '' : h
}
</script>

<template>
  <div class="wahl" role="group" aria-label="Frisch oder Vorrat">
    <button
      v-for="h in HALTBARKEITEN"
      :key="h.id"
      type="button"
      :class="{ an: wert === h.id }"
      :aria-pressed="wert === h.id"
      :title="h.lang"
      @click="waehle(h.id)"
    >
      {{ h.emoji }} {{ h.label }}
    </button>
  </div>
</template>

<style scoped>
.wahl {
  display: flex;
  flex-shrink: 0;
  gap: 0.3rem;
}

button {
  padding: 0.4rem 0.65rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--card);
  color: var(--muted);
  font-size: 0.82rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}

button.an {
  border-color: color-mix(in srgb, var(--green) 45%, transparent);
  background: color-mix(in srgb, var(--green) 12%, white);
  color: var(--green);
}
</style>
