<script setup>
import { computed, ref } from 'vue'
import { computeStandings, useTournamentStore } from '../composables/useTournamentStore'
import { SEASONS } from '../seasons.js'
import Podium from '../components/Podium.vue'

const { state, playersById, removeHand } = useTournamentStore()

const gameTypeLabel = {
  clubs: 'Eichel',
  spades: 'Grün',
  hearts: 'Herz',
  diamonds: 'Schellen',
  grand: 'Grand',
  null: 'Null',
}

// ── Default season ────────────────────────────────────────────────────────────
// To change the default, replace 'sommer_2026' with any SEASONS id or 'all'.
// Season ids are defined in src/seasons.js.
const selectedSeason = ref('sommer_2026')
// ─────────────────────────────────────────────────────────────────────────────

const FRUEHLING_SEASON = { id: 'fruehling_2026', name: 'Frühlingsmeisterschaft (bis 21.06.)' }

const FRUEHLING_STANDINGS = [
  { rank: 1, name: 'Marvin',    avg: 17.47, total: 1013, dealtHands: 58, soloPercent: 36.21 },
  { rank: 2, name: 'Tristan',   avg: 13.26, total:  981, dealtHands: 74, soloPercent: 41.89 },
  { rank: 3, name: 'Paul',      avg:  8.25, total:  668, dealtHands: 81, soloPercent: 33.33 },
  { rank: 4, name: 'Alexander', avg:  7.52, total:  639, dealtHands: 85, soloPercent: 37.65 },
  { rank: 5, name: 'Maxi',      avg:  7.33, total:  286, dealtHands: 39, soloPercent: 25.64 },
  { rank: 6, name: 'Sophie',    avg:  6.94, total:  354, dealtHands: 51, soloPercent: 25.49 },
  { rank: 7, name: 'Erik',      avg:  5.83, total:  134, dealtHands: 23, soloPercent: 26.09 },
  { rank: 8, name: 'Marlon',    avg: -0.50, total:  -20, dealtHands: 40, soloPercent: 27.50 },
  { rank: 9, name: 'Louis',     avg: -5.31, total: -425, dealtHands: 80, soloPercent: 31.25 },
]

const seasonOptions = [{ id: 'all', name: 'Alle Partien' }, FRUEHLING_SEASON, ...SEASONS]

const isLegacySeason = computed(() => selectedSeason.value === 'fruehling_2026')

const podiumStandings = computed(() =>
  isLegacySeason.value ? FRUEHLING_STANDINGS : activeStandings.value,
)

function handDate(hand) {
  return hand.playedOn || hand.createdAt?.slice(0, 10) || ''
}

const filteredHands = computed(() => {
  if (selectedSeason.value === 'all') return state.hands
  const season = SEASONS.find((s) => s.id === selectedSeason.value)
  if (!season) return state.hands
  return state.hands.filter((h) => {
    const d = handDate(h)
    return d >= season.from && d <= season.to
  })
})

const activeStandings = computed(() =>
  computeStandings(state.players, filteredHands.value),
)

const activeHands = computed(() =>
  [...filteredHands.value].sort((a, b) => {
    const dA = handDate(a)
    const dB = handDate(b)
    if (dB !== dA) return dB.localeCompare(dA)
    return b.createdAt.localeCompare(a.createdAt)
  }),
)

function playerName(playerId) {
  return playersById.value[playerId]?.name || 'Unbekannt'
}

function formatScore(hand, playerId) {
  const score = hand.scores.find((s) => s.playerId === playerId)
  if (!score) return '0'
  const delta = Number(score.delta)
  return `${delta > 0 ? '+' : ''}${delta}`
}

function formatDate(hand) {
  const d = handDate(hand)
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${day}.${m}.${y}`
}

function pct(value) {
  return `${value.toFixed(1)} %`
}
</script>

<template>
  <section class="stack">
    <!-- Season selector -->
    <div class="season-bar">
      <button
        v-for="opt in seasonOptions"
        :key="opt.id"
        :class="['season-btn', { active: selectedSeason === opt.id }]"
        type="button"
        @click="selectedSeason = opt.id"
      >
        {{ opt.name }}
      </button>
    </div>

    <Podium :standings="podiumStandings" />

    <article class="card">
      <h2>{{ selectedSeason === 'all' ? 'Gesamtübersicht (seit 21.06.)' : 'Gesamtübersicht' }}</h2>

      <!-- Legacy: Frühlingsmeisterschaft (hardcoded, no individual game records) -->
      <template v-if="isLegacySeason">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Spieler</th>
                <th>Schnitt</th>
                <th>Punkte</th>
                <th>Partien</th>
                <th>% Solos</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in FRUEHLING_STANDINGS" :key="row.name">
                <td>{{ row.rank }}</td>
                <td>{{ row.name }}</td>
                <td>{{ row.avg }}</td>
                <td>{{ row.total }}</td>
                <td>{{ row.dealtHands }}</td>
                <td>{{ pct(row.soloPercent) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <!-- Live seasons -->
      <template v-else>
        <div class="table-wrap">
          <table v-if="activeStandings.length > 0">
            <thead>
              <tr>
                <th>#</th>
                <th>Spieler</th>
                <th>Schnitt</th>
                <th>Punkte</th>
                <th>Partien</th>
                <th>Solos gew.</th>
                <th>Solos verl.</th>
                <th>Gegensp. gew.</th>
                <th>% Solos</th>
                <th>% Grand</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in activeStandings" :key="row.playerId">
                <td>{{ row.rank }}</td>
                <td>{{ row.name }}</td>
                <td>{{ row.avg }}</td>
                <td>{{ row.total }}</td>
                <td>{{ row.dealtHands }}</td>
                <td>{{ row.declarerWon }}</td>
                <td>{{ row.declarerLost }}</td>
                <td>{{ row.defenseWon }}</td>
                <td>{{ row.dealtHands > 0 ? pct(row.soloPercent) : '–' }}</td>
                <td>{{ row.declarerWon + row.declarerLost > 0 ? pct(row.grandPercent) : '–' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="activeStandings.length === 0" class="hint">Noch keine Wertungen vorhanden.</p>
      </template>
    </article>

    <article v-if="!isLegacySeason" class="card">
      <h2>Letzte Partien</h2>
      <ul v-if="activeHands.length > 0" class="hands">
        <li v-for="hand in activeHands" :key="hand.id">
          <div>
            <p class="headline">
              {{ gameTypeLabel[hand.gameType] }} | {{ hand.outcome === 'won' ? 'gewonnen' : 'verloren' }}
              <span class="date">{{ formatDate(hand) }}</span>
            </p>
            <p>{{ hand.players.map((id) => playerName(id)).join(' – ') }}</p>
            <p>Alleinspieler: {{ playerName(hand.declarerId) }}</p>
            <p>Wert: {{ hand.gameValue }} ({{ hand.valueExpression }})</p>
            <p>
              <span v-for="(playerId, i) in hand.players" :key="playerId">
                {{ playerName(playerId) }}: {{ formatScore(hand, playerId) }}
                <span v-if="i < hand.players.length - 1"> | </span>
              </span>
            </p>
          </div>
          <button type="button" class="danger" @click="removeHand(hand.id)">Löschen</button>
        </li>
      </ul>
      <p v-else class="hint">
        {{ selectedSeason === 'all' ? 'Es wurden noch keine Partien eingetragen.' : 'Keine Partien in diesem Zeitraum.' }}
      </p>
    </article>
  </section>
</template>

<style scoped>
.stack {
  max-width: 1100px;
  margin: 0 auto;
  display: grid;
  gap: 0.9rem;
}

.season-bar {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.season-btn {
  background: transparent;
  border: 1px solid rgba(207, 178, 106, 0.45);
  color: #f9f5e5;
  font: inherit;
  font-weight: 600;
  border-radius: 999px;
  padding: 0.4rem 0.85rem;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.season-btn.active {
  background: #cfb26a;
  color: #1d271f;
  border-color: #cfb26a;
}

.card {
  background: rgba(9, 35, 26, 0.84);
  border: 1px solid rgba(207, 178, 106, 0.35);
  border-radius: 1rem;
  padding: 1rem;
}

h2 {
  margin-top: 0;
  font-family: 'Roboto Slab', serif;
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  min-width: 650px;
}

th,
td {
  border-bottom: 1px solid rgba(255, 255, 255, 0.18);
  padding: 0.45rem 0.5rem;
  text-align: left;
  white-space: nowrap;
}

.hands {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.5rem;
}

.hands li {
  display: flex;
  justify-content: space-between;
  gap: 0.6rem;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 0.7rem;
  padding: 0.65rem;
  background: rgba(8, 28, 21, 0.8);
}

.hands p {
  margin: 0.2rem 0;
}

.headline {
  color: #cfb26a;
  font-weight: 700;
  display: flex;
  gap: 0.8rem;
  align-items: baseline;
  flex-wrap: wrap;
}

.date {
  font-size: 0.85em;
  font-weight: 400;
  color: #9ab8a8;
}

button.danger {
  border: none;
  border-radius: 0.55rem;
  padding: 0.5rem 0.65rem;
  background: #8c3b30;
  color: #f8f2f1;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  align-self: flex-start;
}

.hint {
  color: #cfd9d4;
}

@media (max-width: 800px) {
  .hands li {
    flex-direction: column;
  }
}
</style>
