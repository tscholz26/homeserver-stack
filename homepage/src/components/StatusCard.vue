<script setup lang="ts">
import { services, type ServiceId } from '@/services'
import type { Status } from '@/composables/useStatus'

defineProps<{
  statuses: Record<ServiceId, Status>
  onlineCount: number
  allOnline: boolean
}>()

const LABELS: Record<Status, string> = {
  checking: 'prüfe …',
  online: 'läuft',
  offline: 'weg',
}
</script>

<template>
  <div class="card status" :class="{ ok: allOnline }">
    <p class="label">Status</p>

    <p class="headline">
      <span class="beacon" :class="{ ok: allOnline }" />
      {{ allOnline ? 'Alles läuft' : `${onlineCount} von ${services.length} online` }}
    </p>

    <ul>
      <li v-for="service in services" :key="service.id">
        <span class="name">{{ service.name }}</span>
        <span class="value" :class="statuses[service.id]">{{ LABELS[statuses[service.id]] }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.label {
  margin: 0 0 0.7rem;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
}

.status {
  --accent: #15803d;
}

.headline {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin: 0 0 0.9rem;
  font-size: 1.25rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.beacon {
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  background: #94a3b8;
  flex-shrink: 0;
}

.beacon.ok {
  background: var(--accent);
  animation: pulse 2.4s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 55%, transparent);
  }

  50% {
    box-shadow: 0 0 0 0.45rem color-mix(in srgb, var(--accent) 0%, transparent);
  }
}

ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.35rem;
}

li {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.85rem;
  padding-bottom: 0.35rem;
  border-bottom: 1px solid var(--line);
}

li:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.name {
  color: var(--muted);
}

.value {
  font-weight: 700;
}

.value.online {
  color: #15803d;
}

.value.offline {
  color: #b91c1c;
}

.value.checking {
  color: var(--muted);
}

@media (prefers-reduced-motion: reduce) {
  .beacon.ok {
    animation: none;
  }
}
</style>
