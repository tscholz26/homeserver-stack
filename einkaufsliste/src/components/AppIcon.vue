<script setup lang="ts">
// Linien-Icons statt Emoji: ✎ und 🗑 sahen je nach Handy anders aus und
// standen mal bunt, mal grau in der Liste. Pfade nach Lucide (ISC-Lizenz).
withDefaults(defineProps<{ name: 'stift' | 'muell' | 'mehr' | 'griff'; groesse?: number }>(), {
  groesse: 18,
})
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
