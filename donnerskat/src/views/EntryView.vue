<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { calculateSkatHand, useTournamentStore } from '../composables/useTournamentStore'

const { sortedPlayers, playersById, addHand } = useTournamentStore()

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

const draft = reactive({
  seat1: '',
  seat2: '',
  seat3: '',
  declarerId: '',
  gameType: '',
  matadors: 1,
  outcome: '',
  playedOn: todayISO(),
  levels: {
    hand: false,
    schneider: false,
    schneider_announced: false,
    schwarz: false,
    schwarz_announced: false,
    ouvert: false,
  },
})

const error = ref('')
const success = ref('')

// German date display (TT.MM.JJJJ) ↔ internal ISO YYYY-MM-DD
const dateText = ref(isoToDE(draft.playedOn))

function isoToDE(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

function onDateInput(event) {
  const val = event.target.value
  dateText.value = val
  const match = val.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (match) {
    draft.playedOn = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
  }
}

// Keep text in sync when draft.playedOn is reset after save
watch(
  () => draft.playedOn,
  (iso) => {
    const de = isoToDE(iso)
    if (de !== dateText.value) dateText.value = de
  },
)

const selectedPlayers = computed(() =>
  [draft.seat1, draft.seat2, draft.seat3].filter(Boolean),
)

const isNullGame = computed(() => draft.gameType === 'null')

const maxMatadors = computed(() => (draft.gameType === 'grand' ? 4 : 11))

const canPreview = computed(
  () =>
    selectedPlayers.value.length === 3 &&
    new Set(selectedPlayers.value).size === 3 &&
    draft.declarerId &&
    draft.gameType &&
    draft.outcome,
)

const preview = computed(() => {
  if (!canPreview.value) return null
  try {
    return calculateSkatHand({
      players: selectedPlayers.value,
      declarerId: draft.declarerId,
      gameType: draft.gameType,
      without: draft.without,
      matadors: Number(draft.matadors),
      levels: draft.levels,
      outcome: draft.outcome,
    })
  } catch {
    return null
  }
})

const declarerName = computed(() => playersById.value[draft.declarerId]?.name || '')

// Clear declarerId if the chosen player is no longer among the selected seats
watch(selectedPlayers, (players) => {
  if (draft.declarerId && !players.includes(draft.declarerId)) {
    draft.declarerId = ''
  }
})

// Grand only has 4 Jacks, so cap matadors
watch(
  () => draft.gameType,
  () => {
    if (draft.gameType === 'grand' && draft.matadors > 4) {
      draft.matadors = 4
    }
  },
)

// Null game: Schneider/Schwarz/announced levels don't exist for Null
watch(isNullGame, (nullGame) => {
  if (nullGame) {
    draft.levels.schneider = false
    draft.levels.schneider_announced = false
    draft.levels.schwarz = false
    draft.levels.schwarz_announced = false
  }
})

// Schneider off → clear everything that depends on it
watch(
  () => draft.levels.schneider,
  (val) => {
    if (!val) {
      draft.levels.schneider_announced = false
      draft.levels.schwarz = false
      draft.levels.schwarz_announced = false
      draft.levels.ouvert = false
    }
  },
)

// Schwarz implies Schneider; Schwarz off → clear Schwarz_ann and Ouvert
watch(
  () => draft.levels.schwarz,
  (val) => {
    if (val) {
      draft.levels.schneider = true
    } else {
      draft.levels.schwarz_announced = false
      draft.levels.ouvert = false
    }
  },
)

// Schneider_announced implies Schneider; off → clear downstream
watch(
  () => draft.levels.schneider_announced,
  (val) => {
    if (val) {
      draft.levels.schneider = true
    } else {
      draft.levels.schwarz_announced = false
      draft.levels.ouvert = false
    }
  },
)

// Schwarz_announced implies Schwarz + Schneider + Schneider_ann; off → clear Ouvert
watch(
  () => draft.levels.schwarz_announced,
  (val) => {
    if (val) {
      draft.levels.schwarz = true
      draft.levels.schneider = true
      draft.levels.schneider_announced = true
    } else {
      draft.levels.ouvert = false
    }
  },
)

// Ouvert (for suit/Grand) implies Hand + full announcement chain
watch(
  () => draft.levels.ouvert,
  (val) => {
    if (val && !isNullGame.value) {
      draft.levels.hand = true
      draft.levels.schwarz_announced = true
      draft.levels.schwarz = true
      draft.levels.schneider_announced = true
      draft.levels.schneider = true
    }
  },
)


function saveHand() {
  try {
    if (selectedPlayers.value.length !== 3 || new Set(selectedPlayers.value).size !== 3) {
      throw new Error('Bitte drei unterschiedliche Spieler eintragen.')
    }
    if (!draft.declarerId) {
      throw new Error('Bitte einen Alleinspieler auswählen.')
    }
    if (!draft.gameType) {
      throw new Error('Bitte eine Spielart auswählen.')
    }
    if (!draft.outcome) {
      throw new Error('Bitte ein Ergebnis auswählen.')
    }

    addHand({
      players: selectedPlayers.value,
      declarerId: draft.declarerId,
      gameType: draft.gameType,
      matadors: Number(draft.matadors),
      levels: { ...draft.levels },
      outcome: draft.outcome,
      playedOn: draft.playedOn,
    })

    // Keep Spieler 1–3; reset all game-specific fields
    draft.declarerId = ''
    draft.gameType = ''
    draft.matadors = 1
    draft.outcome = ''
    draft.playedOn = todayISO()
    draft.levels.hand = false
    draft.levels.schneider = false
    draft.levels.schneider_announced = false
    draft.levels.schwarz = false
    draft.levels.schwarz_announced = false
    draft.levels.ouvert = false

    error.value = ''
    success.value = 'Partie wurde gespeichert.'
  } catch (err) {
    error.value = err.message
    success.value = ''
  }
}
</script>

<template>
  <section class="card">
    <h2>Eintragung</h2>
    <p class="hint">Trage jede gespielte Partie mit genau drei Spielern ein. Die Seeger-Fabian-Punkte werden automatisch verbucht.</p>

    <div v-if="sortedPlayers.length < 3" class="warning">
      Bitte zuerst mindestens drei Spieler in der Spielerverwaltung anlegen.
    </div>

    <form class="grid" @submit.prevent="saveHand">
      <label>
        Spieler 1
        <select v-model="draft.seat1">
          <option value="">Auswählen</option>
          <option v-for="player in sortedPlayers" :key="`s1-${player.id}`" :value="player.id">
            {{ player.name }}
          </option>
        </select>
      </label>

      <label>
        Spieler 2
        <select v-model="draft.seat2">
          <option value="">Auswählen</option>
          <option v-for="player in sortedPlayers" :key="`s2-${player.id}`" :value="player.id">
            {{ player.name }}
          </option>
        </select>
      </label>

      <label>
        Spieler 3
        <select v-model="draft.seat3">
          <option value="">Auswählen</option>
          <option v-for="player in sortedPlayers" :key="`s3-${player.id}`" :value="player.id">
            {{ player.name }}
          </option>
        </select>
      </label>

      <label>
        Alleinspieler
        <select v-model="draft.declarerId" :disabled="selectedPlayers.length < 3">
          <option value="">Auswählen</option>
          <option v-for="playerId in selectedPlayers" :key="`d-${playerId}`" :value="playerId">
            {{ playersById[playerId]?.name || 'Unbekannt' }}
          </option>
        </select>
      </label>

      <label>
        Spielart
        <select v-model="draft.gameType">
          <option value="">Spielart wählen</option>
          <option value="clubs">Eichel</option>
          <option value="spades">Grün</option>
          <option value="hearts">Herz</option>
          <option value="diamonds">Schellen</option>
          <option value="grand">Grand</option>
          <option value="null">Null</option>
        </select>
      </label>

      <label>
        Ergebnis
        <select v-model="draft.outcome">
          <option value="">Ergebnis wählen</option>
          <option value="won">Gewonnen</option>
          <option value="lost">Verloren</option>
        </select>
      </label>

      <label v-if="!isNullGame && draft.gameType">
        Mit / Ohne
        <input v-model.number="draft.matadors" type="number" min="1" :max="maxMatadors" />
      </label>

      <label>
        Datum
        <input
          type="text"
          :value="dateText"
          placeholder="TT.MM.JJJJ"
          maxlength="10"
          @input="onDateInput"
        />
      </label>

      <fieldset class="levels">
        <legend>Gewinnstufen</legend>

        <label class="inline-toggle">
          <input v-model="draft.levels.hand" type="checkbox" />
          Hand
        </label>

        <!-- Null game: only Hand and Ouvert apply -->
        <label v-if="isNullGame" class="inline-toggle">
          <input v-model="draft.levels.ouvert" type="checkbox" />
          Ouvert
        </label>

        <!-- Suit / Grand game levels -->
        <template v-if="!isNullGame">
          <label class="inline-toggle">
            <input v-model="draft.levels.schneider" type="checkbox" />
            Schneider
          </label>
          <label v-if="draft.levels.hand" class="inline-toggle">
            <input v-model="draft.levels.schneider_announced" type="checkbox" />
            Schneider ang.
          </label>
          <label class="inline-toggle" :class="{ disabled: !draft.levels.schneider }">
            <input v-model="draft.levels.schwarz" type="checkbox" :disabled="!draft.levels.schneider" />
            Schwarz
          </label>
          <label v-if="draft.levels.hand" class="inline-toggle">
            <input v-model="draft.levels.schwarz_announced" type="checkbox" />
            Schwarz ang.
          </label>
          <label v-if="draft.levels.hand" class="inline-toggle">
            <input v-model="draft.levels.ouvert" type="checkbox" />
            Ouvert
          </label>
        </template>
      </fieldset>

      <button type="submit">Partie eintragen</button>
    </form>

    <div v-if="preview" class="preview">
      <h3>Vorschau Seeger-Fabian</h3>
      <p>Spielwert: <strong>{{ preview.gameValue }}</strong> ({{ preview.valueExpression }})</p>
      <p>{{ declarerName }}: <strong>{{ preview.declarerDelta > 0 ? '+' : '' }}{{ preview.declarerDelta }}</strong></p>
      <p>Jeder Gegenspieler: <strong>{{ preview.defenderDelta > 0 ? '+' : '' }}{{ preview.defenderDelta }}</strong></p>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="success" class="success">{{ success }}</p>
  </section>
</template>

<style scoped>
.card {
  max-width: 980px;
  margin: 0 auto;
  background: rgba(9, 35, 26, 0.84);
  border: 1px solid rgba(207, 178, 106, 0.35);
  border-radius: 1rem;
  padding: 1rem;
}

h2,
h3,
legend {
  font-family: 'Roboto Slab', serif;
}

.grid {
  margin-top: 0.9rem;
  display: grid;
  gap: 0.65rem;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
}

label,
fieldset {
  display: grid;
  gap: 0.35rem;
}

select,
input,
textarea,
button {
  font: inherit;
}

select,
input {
  border: 1px solid #5c876f;
  border-radius: 0.55rem;
  padding: 0.5rem 0.65rem;
  background: #123f2e;
  color: #f4f6f5;
}

button {
  border: none;
  background: #cfb26a;
  color: #21261d;
  font-weight: 700;
  border-radius: 0.55rem;
  padding: 0.6rem 0.8rem;
  cursor: pointer;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.inline-toggle {
  align-items: center;
  grid-auto-flow: column;
  justify-content: start;
  gap: 0.45rem;
}

.levels {
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 0.55rem;
  padding: 0.55rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
}

.levels legend {
  padding: 0 0.3rem;
}

.preview {
  margin-top: 1rem;
  background: rgba(10, 26, 20, 0.75);
  border: 1px solid rgba(207, 178, 106, 0.28);
  border-radius: 0.7rem;
  padding: 0.7rem;
}

.preview p {
  margin: 0.25rem 0;
}

.hint {
  color: #cfd9d4;
  margin: 0;
}

.warning {
  margin-top: 0.7rem;
  color: #f9d8a6;
  font-weight: 700;
}

.error {
  color: #ffb4a8;
  font-weight: 700;
}

.success {
  color: #bce8c4;
  font-weight: 700;
}

.disabled {
  opacity: 0.6;
}
</style>
