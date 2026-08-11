<script setup lang="ts">
import type { Item } from '@/composables/useEinkaufStore'

defineProps<{ item: Item }>()
const emit = defineEmits<{ check: [done: boolean]; remove: [] }>()
</script>

<template>
  <li class="zeile" :class="{ erledigt: item.done }">
    <label class="haken">
      <input
        type="checkbox"
        :checked="item.done"
        @change="emit('check', ($event.target as HTMLInputElement).checked)"
      />
      <span class="box" aria-hidden="true"></span>
    </label>

    <span class="text">
      <span class="name">
        {{ item.name }}
        <!-- Nicht im Katalog gefunden: in der Verwaltung nachpflegbar -->
        <span v-if="!item.matched" class="badge" title="Nicht zugeordnet">◌</span>
      </span>
      <span v-if="item.addedBy" class="von">von {{ item.addedBy }}</span>
    </span>

    <span v-if="item.quantity" class="menge">{{ item.quantity }}</span>

    <button type="button" class="weg" title="Artikel entfernen" @click="emit('remove')">×</button>
  </li>
</template>

<style scoped>
.zeile {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.65rem 0.9rem;
  border-top: 1px solid var(--line);
}

.haken {
  display: inline-flex;
  padding: 0.15rem;
  cursor: pointer;
}

.haken input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.box {
  display: block;
  width: 1.4rem;
  height: 1.4rem;
  border: 2px solid color-mix(in srgb, var(--muted) 45%, transparent);
  border-radius: 999px;
  transition: background 0.15s ease;
}

.haken input:checked + .box {
  border-color: var(--green);
  background: var(--green)
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E")
    center / 0.9rem no-repeat;
}

.haken input:focus-visible + .box {
  outline: 2px solid var(--violet);
  outline-offset: 2px;
}

.text {
  flex: 1;
  min-width: 0;
}

.name {
  display: block;
  font-size: 1.02rem;
  overflow-wrap: anywhere;
}

.von {
  display: block;
  margin-top: 0.05rem;
  color: var(--muted);
  font-size: 0.72rem;
}

.badge {
  margin-left: 0.25rem;
  color: var(--amber);
  font-size: 0.9rem;
}

.menge {
  flex-shrink: 0;
  padding: 0.15rem 0.5rem;
  border: 1px solid var(--line);
  border-radius: 0.5rem;
  color: var(--muted);
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
}

.weg {
  flex-shrink: 0;
  width: 1.9rem;
  height: 1.9rem;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: color-mix(in srgb, var(--muted) 60%, transparent);
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
}

.erledigt .name {
  color: var(--muted);
  text-decoration: line-through;
}

.erledigt .menge,
.erledigt .von {
  opacity: 0.6;
}
</style>
