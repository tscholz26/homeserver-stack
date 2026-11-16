<script setup lang="ts">
import { computed } from 'vue'
import { textMitLinks } from '@/utils/rezept'

// Notizen sind Freitext. Zeilenumbrüche bleiben stehen, und ein eingefügter
// Link zum Originalrezept lässt sich antippen.
const props = defineProps<{ text: string }>()
const teile = computed(() => textMitLinks(props.text))
</script>

<template>
  <p class="notizen">
    <template v-for="(t, index) in teile" :key="index">
      <a v-if="t.url" :href="t.url" target="_blank" rel="noopener noreferrer">{{ t.text }}</a>
      <template v-else>{{ t.text }}</template>
    </template>
  </p>
</template>

<style scoped>
.notizen {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.5;
  /* pre-line statt pre-wrap: die Umbrüche aus dem Text zählen, der Leerraum aus
     dem Template nicht */
  white-space: pre-line;
  overflow-wrap: anywhere;
}

a {
  color: var(--violet);
}
</style>
