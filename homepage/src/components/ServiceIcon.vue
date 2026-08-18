<script setup lang="ts">
import type { PlannedId, ServiceId } from '@/services'

// Auch der noch geplante Dienst hat schon ein Zeichen
defineProps<{ id: ServiceId | PlannedId; size?: number }>()
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    :width="size ?? 28"
    :height="size ?? 28"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <!-- Wolke -->
    <path v-if="id === 'nextcloud'" d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />

    <!-- Pik -->
    <template v-else-if="id === 'donnerskat'">
      <path
        d="M12 3.6c-2.9 3.4-6.6 5.4-6.6 8.6 0 2.1 1.7 3.5 3.5 3.5 1.2 0 2.3-.7 3.1-1.9.8 1.2 1.9 1.9 3.1 1.9 1.8 0 3.5-1.4 3.5-3.5 0-3.2-3.7-5.2-6.6-8.6z"
      />
      <path d="M12 14.4V19" />
      <path d="M9.6 20.3h4.8" />
    </template>

    <!-- Einkaufswagen -->
    <template v-else-if="id === 'einkaufsliste'">
      <path d="M3 4h2l2.4 10.4a2 2 0 0 0 2 1.6h7.2a2 2 0 0 0 2-1.6L20 7H6" />
      <circle cx="10" cy="20" r="1.4" />
      <circle cx="17" cy="20" r="1.4" />
    </template>

    <!-- Zahnkranz -->
    <template v-else-if="id === 'fahrradtracker'">
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.4" />
      <path
        d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"
      />
    </template>

    <!-- Koffer -->
    <template v-else>
      <rect x="2" y="7" width="20" height="14" rx="2.5" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M2 13h20" />
    </template>
  </svg>
</template>
