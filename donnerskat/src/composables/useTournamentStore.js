import { computed, reactive, ref } from 'vue'

const BASE_VALUES = {
  clubs: 12,
  spades: 11,
  hearts: 10,
  diamonds: 9,
  grand: 24,
}

const NULL_VALUES = {
  normal: 23,
  hand: 35,
  ouvert: 46,
  hand_ouvert: 59,
}

let singleton

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function calculateSkatHand(payload) {
  const isNullGame = payload.gameType === 'null'
  const isRamschGame = payload.gameType === 'ramsch'
  const matadors = Number(payload.matadors)

  if (payload.players.length !== 3) {
    throw new Error('Eine Skatpartie benötigt genau drei Spielende.')
  }
  if (!payload.players.includes(payload.declarerId)) {
    throw new Error('Der Alleinspieler muss aus den drei gewählten Spielern kommen.')
  }

  // ── Ramsch ────────────────────────────────────────────────────────────────
  if (isRamschGame) {
    const points = Number(payload.ramschPoints ?? 0)
    const isWin = points >= 120
    const baseDelta = isWin ? 120 : -points
    const declarerDelta = !isWin && payload.jungfrau ? baseDelta * 2 : baseDelta
    return {
      gameValue: points,
      declarerDelta,
      defenderDelta: 0,
      valueExpression: isWin
        ? 'Durchmarsch (120 Punkte)'
        : `Ramsch: ${points} Punkte${payload.jungfrau ? ', Jungfrau' : ''}`,
    }
  }

  // ── Kontra / Re multiplier ────────────────────────────────────────────────
  const kontraMultiplier = payload.re ? 4 : payload.kontra ? 2 : 1

  // ── Null ──────────────────────────────────────────────────────────────────
  if (isNullGame) {
    const isHand = Boolean(payload.levels?.hand)
    const isOuvert = Boolean(payload.levels?.ouvert)
    let mode = 'normal'
    if (isHand && isOuvert) mode = 'hand_ouvert'
    else if (isHand) mode = 'hand'
    else if (isOuvert) mode = 'ouvert'

    const baseValue = NULL_VALUES[mode]
    const gameValue = baseValue * kontraMultiplier
    const declarerDelta = payload.outcome === 'won' ? 50 + gameValue : -(50 + gameValue * 2)
    const defenderDelta = payload.outcome === 'lost' ? 40 : 0

    const parts = ['Null']
    if (isOuvert) parts.push('Ouvert')
    if (isHand) parts.push('Hand')
    const kontraSuffix = payload.re ? ', Re' : payload.kontra ? ', Kontra' : ''

    return {
      gameValue,
      declarerDelta,
      defenderDelta,
      valueExpression: `${parts.join(' ')} = ${baseValue}${kontraMultiplier > 1 ? ` × ${kontraMultiplier}` : ''}${kontraSuffix}`,
    }
  }

  // ── Suit / Grand ──────────────────────────────────────────────────────────
  if (!BASE_VALUES[payload.gameType]) {
    throw new Error('Ungültige Spielart für die Berechnung.')
  }
  if (!Number.isInteger(matadors) || matadors < 1 || matadors > 11) {
    throw new Error('Bitte gültige Spitzenzahl (1–11) angeben.')
  }
  if (payload.gameType === 'grand' && matadors > 4) {
    throw new Error('Bei Grand sind maximal 4 Spitzen möglich (nur die vier Buben).')
  }

  const lvl = payload.levels || {}
  const gameLevel =
    1 +
    (lvl.hand ? 1 : 0) +
    (lvl.schneider ? 1 : 0) +
    (lvl.schneider_announced ? 1 : 0) +
    (lvl.schwarz ? 1 : 0) +
    (lvl.schwarz_announced ? 1 : 0) +
    (lvl.ouvert ? 1 : 0)

  const multiplier = matadors + gameLevel
  const baseValue = BASE_VALUES[payload.gameType] * multiplier
  const gameValue = baseValue * kontraMultiplier
  const declarerDelta = payload.outcome === 'won' ? 50 + gameValue : -(50 + gameValue * 2)
  const defenderDelta = payload.outcome === 'lost' ? 40 : 0

  const kontraSuffix = payload.re ? ', Re' : payload.kontra ? ', Kontra' : ''

  return {
    gameValue,
    declarerDelta,
    defenderDelta,
    valueExpression: `${matadors} Spitzen, Stufe ${gameLevel}, ${multiplier} × ${BASE_VALUES[payload.gameType]}${kontraMultiplier > 1 ? ` × ${kontraMultiplier}` : ''}${kontraSuffix}`,
  }
}

export function computeStandings(players, hands) {
  const rows = players.map((player) => ({
    playerId: player.id,
    name: player.name,
    total: 0,
    dealtHands: 0,
    declarerWon: 0,
    declarerLost: 0,
    defenseWon: 0,
    grandGames: 0,
  }))

  const indexByPlayerId = Object.fromEntries(rows.map((row, i) => [row.playerId, i]))

  for (const hand of hands) {
    for (const score of hand.scores) {
      const idx = indexByPlayerId[score.playerId]
      if (idx === undefined) continue
      rows[idx].total += Number(score.delta)
      rows[idx].dealtHands += 1
    }

    const declarerIdx = indexByPlayerId[hand.declarerId]
    if (declarerIdx !== undefined && hand.gameType !== 'ramsch') {
      if (hand.outcome === 'won') rows[declarerIdx].declarerWon += 1
      else rows[declarerIdx].declarerLost += 1
      if (hand.gameType === 'grand') rows[declarerIdx].grandGames += 1
    }

    if (hand.outcome === 'lost') {
      for (const playerId of hand.players) {
        if (playerId === hand.declarerId) continue
        const idx = indexByPlayerId[playerId]
        if (idx !== undefined) rows[idx].defenseWon += 1
      }
    }
  }

  rows.sort((a, b) => {
    const avgA = a.dealtHands > 0 ? a.total / a.dealtHands : -Infinity
    const avgB = b.dealtHands > 0 ? b.total / b.dealtHands : -Infinity
    if (Math.abs(avgB - avgA) > 0.0001) return avgB - avgA
    if (b.total !== a.total) return b.total - a.total
    return a.name.localeCompare(b.name, 'de')
  })

  return rows.map((row, i) => {
    const soloCount = row.declarerWon + row.declarerLost
    return {
      ...row,
      rank: i + 1,
      avg: row.dealtHands > 0 ? Math.round((row.total / row.dealtHands) * 10) / 10 : 0,
      soloPercent: row.dealtHands > 0 ? Math.round((soloCount / row.dealtHands) * 1000) / 10 : 0,
      grandPercent: soloCount > 0 ? Math.round((row.grandGames / soloCount) * 1000) / 10 : 0,
    }
  })
}

function createStore() {
  const loading = ref(true)
  const state = reactive({ players: [], hands: [] })

  const API_URL = `${import.meta.env.BASE_URL}api/state`

  fetch(API_URL)
    .then((r) => r.json())
    .then((data) => {
      if (Array.isArray(data.players)) state.players = data.players
      if (Array.isArray(data.hands)) state.hands = data.hands
    })
    .catch(() => {})
    .finally(() => {
      loading.value = false
    })

  function saveState() {
    fetch(API_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ players: state.players, hands: state.hands }),
    }).catch((err) => console.error('[donnerskat] save failed:', err))
  }

  const playersById = computed(() =>
    Object.fromEntries(state.players.map((p) => [p.id, p])),
  )

  const sortedPlayers = computed(() =>
    [...state.players].sort((a, b) => a.name.localeCompare(b.name, 'de')),
  )

  const recentHands = computed(() =>
    [...state.hands].sort((a, b) => {
      const dA = a.playedOn || a.createdAt.slice(0, 10)
      const dB = b.playedOn || b.createdAt.slice(0, 10)
      if (dB !== dA) return dB.localeCompare(dA)
      return b.createdAt.localeCompare(a.createdAt)
    }),
  )

  const standings = computed(() => computeStandings(state.players, state.hands))

  function addPlayer(name) {
    const clean = name.trim()
    if (!clean) throw new Error('Spielername darf nicht leer sein.')
    if (state.players.some((p) => p.name.toLowerCase() === clean.toLowerCase())) {
      throw new Error('Dieser Spieler ist bereits vorhanden.')
    }
    state.players.push({ id: createId(), name: clean, createdAt: new Date().toISOString() })
    saveState()
  }

  function removePlayer(playerId) {
    if (state.hands.some((h) => h.players.includes(playerId))) {
      throw new Error('Dieser Spieler kann nicht entfernt werden, da bereits Partien eingetragen wurden.')
    }
    state.players = state.players.filter((p) => p.id !== playerId)
    saveState()
  }

  function addHand(payload) {
    if (new Set(payload.players).size !== 3) {
      throw new Error('Bitte drei unterschiedliche Spielende auswählen.')
    }

    const scoring = calculateSkatHand(payload)
    const scores = payload.players.map((playerId) => ({
      playerId,
      delta: playerId === payload.declarerId ? scoring.declarerDelta : scoring.defenderDelta,
    }))

    const lvl = payload.levels || {}
    state.hands.push({
      id: createId(),
      playedOn: payload.playedOn || new Date().toISOString().slice(0, 10),
      players: [...payload.players],
      declarerId: payload.declarerId,
      gameType: payload.gameType,
      matadors: Number(payload.matadors || 0),
      levels: {
        hand: Boolean(lvl.hand),
        schneider: Boolean(lvl.schneider),
        schneider_announced: Boolean(lvl.schneider_announced),
        schwarz: Boolean(lvl.schwarz),
        schwarz_announced: Boolean(lvl.schwarz_announced),
        ouvert: Boolean(lvl.ouvert),
      },
      kontra: Boolean(payload.kontra),
      re: Boolean(payload.re),
      outcome: payload.outcome,
      gameValue: scoring.gameValue,
      valueExpression: scoring.valueExpression,
      scores,
      createdAt: new Date().toISOString(),
    })

    saveState()
    return scoring
  }

  function removeHand(handId) {
    const hand = state.hands.find((h) => h.id === handId)
    if (hand) hand.deleted = true
    saveState()
  }

  return {
    state,
    loading,
    playersById,
    sortedPlayers,
    recentHands,
    standings,
    addPlayer,
    removePlayer,
    addHand,
    removeHand,
  }
}

export function useTournamentStore() {
  if (!singleton) singleton = createStore()
  return singleton
}
