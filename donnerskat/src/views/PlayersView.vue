<script setup>
import { computed, ref } from 'vue'
import { useTournamentStore } from '../composables/useTournamentStore'

const { sortedPlayers, state, addPlayer, removePlayer } = useTournamentStore()

const BASE_URL = import.meta.env.BASE_URL

function avatarSrc(name) {
  return `${BASE_URL}avatars/${encodeURIComponent(name)}.jpg`
}

function onImgError(e) {
  e.target.style.display = 'none'
}

const name = ref('')
const error = ref('')
const removeError = ref('')

const handCountByPlayer = computed(() => {
  const counts = {}
  for (const hand of state.hands) {
    for (const id of hand.players) {
      counts[id] = (counts[id] || 0) + 1
    }
  }
  return counts
})

function onSubmit() {
  try {
    addPlayer(name.value)
    name.value = ''
    error.value = ''
  } catch (err) {
    error.value = err.message
  }
}

function onRemove(playerId) {
  try {
    removePlayer(playerId)
    removeError.value = ''
  } catch (err) {
    removeError.value = err.message
  }
}
</script>

<template>
  <section class="card">
    <h2>Spielerverwaltung</h2>
    <p class="hint">Spieler anlegen. Spieler mit eingetragenen Partien können nicht mehr entfernt werden.</p>

    <form class="row" @submit.prevent="onSubmit">
      <input v-model="name" type="text" placeholder="Spielername" maxlength="40" />
      <button type="submit">Spieler hinzufügen</button>
    </form>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="removeError" class="error">{{ removeError }}</p>

    <ul v-if="sortedPlayers.length > 0" class="players">
      <li v-for="player in sortedPlayers" :key="player.id">
        <div class="player-info">
          <div class="avatar">
            <span class="initial">{{ player.name[0] }}</span>
            <img :src="avatarSrc(player.name)" :alt="player.name" @error="onImgError" />
          </div>
          <span>{{ player.name }}</span>
        </div>
        <button
          v-if="!handCountByPlayer[player.id]"
          type="button"
          class="danger"
          @click="onRemove(player.id)"
        >
          Entfernen
        </button>
        <span v-else class="locked">{{ handCountByPlayer[player.id] }} Partien gespielt</span>
      </li>
    </ul>
    <p v-else class="hint">Noch keine Spieler vorhanden.</p>
  </section>
</template>

<style scoped>
.card {
  max-width: 880px;
  margin: 0 auto;
  background: rgba(9, 35, 26, 0.84);
  border: 1px solid rgba(207, 178, 106, 0.35);
  border-radius: 1rem;
  padding: 1rem;
}

h2 {
  margin-top: 0;
  font-family: 'Roboto Slab', serif;
}

.row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.6rem;
}

input,
button {
  font: inherit;
  border-radius: 0.6rem;
}

input {
  border: 1px solid #5c876f;
  padding: 0.55rem 0.7rem;
  background: #123f2e;
  color: #f4f6f5;
}

button {
  border: none;
  background: #cfb26a;
  color: #21261d;
  font-weight: 700;
  padding: 0.55rem 0.85rem;
  cursor: pointer;
}

.danger {
  background: #8c3b30;
  color: #f8f2f1;
}

.locked {
  font-size: 0.8rem;
  color: #7a9e8c;
  font-style: italic;
}

.players {
  margin: 1rem 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.45rem;
}

.players li {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  align-items: center;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(8, 28, 21, 0.8);
  border-radius: 0.7rem;
  padding: 0.5rem 0.6rem;
}

.player-info {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.avatar {
  position: relative;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  overflow: hidden;
  background: #0e2e21;
  border: 2px solid rgba(207, 178, 106, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.initial {
  font-size: 1rem;
  font-weight: 700;
  color: #cfd9d4;
  user-select: none;
  line-height: 1;
}

.avatar img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

.hint {
  color: #cfd9d4;
}

.error {
  color: #ffb4a8;
  font-weight: 700;
}

@media (max-width: 680px) {
  .row {
    grid-template-columns: 1fr;
  }
}
</style>
