<script setup lang="ts">
// Linien-Icons statt Emoji: ✎ und 🗑 sahen je nach Handy anders aus und
// standen mal bunt, mal grau in der Liste. Pfade nach Lucide (ISC-Lizenz).
withDefaults(
  defineProps<{
    name: 'stift' | 'muell' | 'mehr' | 'griff' | 'plus' | 'minus' | 'kreuz' | 'haus' | 'zahnrad'
    groesse?: number
  }>(),
  {
    groesse: 18,
  },
)
</script>

<template>
  <svg
    :width="groesse"
    :height="groesse"
    viewBox="0 0 24 24"
    :fill="name === 'mehr' || name === 'griff' ? 'currentColor' : 'none'"
    stroke="currentColor"
    :stroke-width="name === 'mehr' || name === 'griff' ? 0 : 2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    class="icon"
  >
    <template v-if="name === 'stift'">
      <path
        d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"
      />
      <path d="m15 5 4 4" />
    </template>
    <template v-else-if="name === 'muell'">
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </template>
    <template v-else-if="name === 'mehr'">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </template>
    <template v-else-if="name === 'plus'">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </template>
    <template v-else-if="name === 'minus'">
      <path d="M5 12h14" />
    </template>
    <template v-else-if="name === 'kreuz'">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </template>
    <template v-else-if="name === 'haus'">
      <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
      <path
        d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
      />
    </template>
    <template v-else-if="name === 'zahnrad'">
      <circle cx="12" cy="12" r="3.2" />
      <path
        d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"
      />
    </template>
    <template v-else>
      <circle cx="9" cy="5" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="9" cy="19" r="1.6" />
      <circle cx="15" cy="5" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="15" cy="19" r="1.6" />
    </template>
  </svg>
</template>

<style scoped>
.icon {
  display: block;
  flex-shrink: 0;
}
</style>
