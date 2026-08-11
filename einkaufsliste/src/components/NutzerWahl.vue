<script setup lang="ts">
import { useEinkaufStore } from '@/composables/useEinkaufStore'

// Kein Login, nur die Frage „wer tippt hier gerade“ – die Antwort bleibt im
// Browser und taucht danach als „von …“ an den Artikeln auf.
const store = useEinkaufStore()
</script>

<template>
  <div class="overlay">
    <div class="dialog card">
      <span class="cart">🛒</span>
      <h2>Wer bist du?</h2>
      <p>Wird nur einmal gefragt und bleibt auf diesem Gerät gespeichert.</p>
      <div class="buttons">
        <button
          v-for="(name, index) in store.state.settings.users"
          :key="index"
          type="button"
          @click="store.chooseUser(index)"
        >
          {{ name }}
        </button>
      </div>
      <p class="hinweis">Die Namen lassen sich in der Verwaltung ändern.</p>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 1.2rem;
  background: color-mix(in srgb, var(--bg) 82%, transparent);
  backdrop-filter: blur(6px);
}

.dialog {
  width: min(22rem, 100%);
  padding: 1.6rem 1.3rem;
  text-align: center;
}

.cart {
  font-size: 2rem;
}

h2 {
  margin: 0.4rem 0 0.3rem;
  font-size: 1.35rem;
}

p {
  margin: 0;
  color: var(--muted);
  font-size: 0.88rem;
}

.buttons {
  display: grid;
  gap: 0.6rem;
  margin: 1.2rem 0 0.9rem;
}

button {
  padding: 0.85rem 1rem;
  border: 1px solid color-mix(in srgb, var(--violet) 35%, transparent);
  border-radius: 0.9rem;
  background: color-mix(in srgb, var(--violet) 10%, white);
  color: var(--violet);
  font-size: 1.05rem;
  font-weight: 700;
  cursor: pointer;
}

button:active {
  background: color-mix(in srgb, var(--violet) 18%, white);
}

.hinweis {
  font-size: 0.78rem;
}
</style>
