<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useEinkaufStore } from '@/composables/useEinkaufStore'
import RezeptFenster from '@/components/RezeptFenster.vue'

// Dasselbe Rezeptbuch wie im Fenster beim Einkauf, nur als eigene Seite: hier
// wird nachgeschlagen und gepflegt, dort wird ausgewählt.
const store = useEinkaufStore()
const route = useRoute()
const router = useRouter()

// Welches Rezept aufgeschlagen ist, steht in der Adresse. So führt die
// Zurück-Geste des Handys vom Rezept zur Übersicht und nicht aus der App.
const rezeptId = computed(() => {
  const id = route.params.id
  return typeof id === 'string' && id ? id : null
})

function zeige(id: string | null) {
  if (id) router.push(`/rezepte/${id}`)
  // Schon in der Übersicht: nichts zu tun
  else if (!rezeptId.value) return
  // Kam man aus der Übersicht oder aus „Diese Woche“, geht es dorthin zurück
  // statt einen Schritt weiter
  else if (['/rezepte', '/woche'].includes(window.history.state?.back)) router.back()
  else router.replace('/rezepte')
}
</script>

<template>
  <RezeptFenster
    eingebettet
    :list="store.einkaufsListe.value"
    :rezept-id="rezeptId"
    @zeige="zeige"
  />
</template>
