<script setup>
import { computed } from 'vue'

const BASE_URL = import.meta.env.BASE_URL

const props = defineProps({
  players: { type: Array, required: true },
  hands:   { type: Array, required: true },
})

// Colour palette — vivid enough for dark green background
const COLORS = [
  '#cfb26a', '#5dd4bc', '#f07878', '#6aaee8',
  '#c87ae8', '#f0d060', '#68d888', '#f07ab8',
  '#60c8f0', '#f0a860', '#a8d95f', '#8f8ff0',
]

// SVG viewport geometry — mobile first: narrow, and as tall as the field needs
const VBW = 360
const ML  = 24   // left  (rank labels)
const MT  = 16   // top
const MR  = 44   // right (avatar column)
const MB  = 26   // bottom (x-axis labels)
const CW  = VBW - ML - MR   // 292 — chart width
const AV_CX = VBW - 20      // avatar circle centre-x
const AV_R  = 13

// Max number of x-points; beyond that, evenings get merged into blocks
const MAX_POINTS = 12

function handDate(h) {
  return h.playedOn || h.createdAt?.slice(0, 10) || ''
}

function shortDate(iso) {
  const [, m, d] = iso.split('-')
  return d && m ? `${d}.${m}.` : iso
}

function avatarSrc(name) {
  return `${BASE_URL}avatars/${encodeURIComponent(name)}.jpg`
}

// Sort hands oldest → newest
const chronoHands = computed(() =>
  [...props.hands].sort((a, b) => {
    const da = handDate(a), db = handDate(b)
    return da !== db ? da.localeCompare(db) : a.createdAt.localeCompare(b.createdAt)
  })
)

// Hands grouped per game night
const evenings = computed(() => {
  const out = []
  for (const h of chronoHands.value) {
    const key = handDate(h)
    const last = out.at(-1)
    if (last && last.key === key) last.hands.push(h)
    else out.push({ key, hands: [h] })
  }
  return out
})

/*
 * One x-point per game night instead of per single hand — far fewer, far more
 * meaningful steps. Only two evenings so far → fall back to blocks of hands so
 * the chart still shows a development. Many evenings → merge them into blocks.
 */
const segments = computed(() => {
  const evs = evenings.value
  const hands = chronoHands.value

  if (evs.length >= 3) {
    const perBlock = Math.ceil(evs.length / MAX_POINTS)
    if (perBlock === 1) {
      return evs.map(e => ({ hands: e.hands, label: shortDate(e.key) }))
    }
    const out = []
    for (let i = 0; i < evs.length; i += perBlock) {
      const block = evs.slice(i, i + perBlock)
      out.push({
        hands: block.flatMap(e => e.hands),
        label: shortDate(block.at(-1).key),
      })
    }
    return out
  }

  // Fallback: equal blocks of hands, labelled with the number of games played
  const n = Math.min(MAX_POINTS, hands.length)
  const out = []
  let from = 0
  for (let i = 0; i < n; i++) {
    const to = Math.round(((i + 1) * hands.length) / n)
    out.push({ hands: hands.slice(from, to), label: String(to) })
    from = to
  }
  return out
})

const byEvening = computed(() => evenings.value.length >= 3)

// Incremental standing after each segment: rankHistory[i][playerId] = rank
const rankHistory = computed(() => {
  const totals = {}
  for (const p of props.players) totals[p.id] = { total: 0, n: 0, name: p.name }

  return segments.value.map(seg => {
    for (const hand of seg.hands) {
      for (const s of (hand.scores ?? [])) {
        if (totals[s.playerId]) {
          totals[s.playerId].total += Number(s.delta)
          totals[s.playerId].n += 1
        }
      }
    }
    const ranked = Object.entries(totals)
      .filter(([, d]) => d.n > 0)
      .sort(([, a], [, b]) => {
        const da = a.total / a.n, db = b.total / b.n
        if (Math.abs(db - da) > 0.0001) return db - da
        if (b.total !== a.total) return b.total - a.total
        return a.name.localeCompare(b.name, 'de')
      })
    const r = {}
    ranked.forEach(([id], i) => { r[id] = i + 1 })
    return r
  })
})

// Only players who've participated at least once
const activePlayers = computed(() => {
  const seen = new Set(chronoHands.value.flatMap(h => h.players))
  return props.players
    .filter(p => seen.has(p.id))
    .map((p, i) => ({ ...p, color: COLORS[i % COLORS.length] }))
})

const maxRank    = computed(() => activePlayers.value.length)
const totalSteps = computed(() => segments.value.length)
const show       = computed(() => totalSteps.value >= 2 && maxRank.value >= 2)

// Row height: few players → spread out, many players → keep the card sane
const rowH = computed(() =>
  maxRank.value <= 4 ? 46 : maxRank.value <= 7 ? 36 : 30
)
const CH  = computed(() => Math.max(1, maxRank.value - 1) * rowH.value)
const VBH = computed(() => MT + CH.value + MB)

// Coordinate helpers
function rx(i) {
  return ML + (totalSteps.value <= 1 ? CW : (i / (totalSteps.value - 1)) * CW)
}
function ry(rank) {
  return MT + (maxRank.value <= 1 ? CH.value / 2 : (rank - 1) * rowH.value)
}
function f(n) { return n.toFixed(1) }

const playerLines = computed(() =>
  activePlayers.value.map(player => {
    const pts = []
    for (let i = 0; i < rankHistory.value.length; i++) {
      const rank = rankHistory.value[i][player.id]
      if (rank !== undefined) pts.push({ x: rx(i), y: ry(rank), rank })
    }
    return {
      player,
      points: pts,
      path: pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${f(p.x)} ${f(p.y)}`).join(' '),
      hasLine: pts.length >= 2,
      end: pts.at(-1) ?? null,
    }
  })
)

// Legend below the chart, ordered like the current standings
const legend = computed(() =>
  playerLines.value
    .filter(l => l.end)
    .map(l => ({ id: l.player.id, name: l.player.name, color: l.player.color, rank: l.end.rank }))
    .sort((a, b) => a.rank - b.rank)
)

const yTicks = computed(() =>
  Array.from({ length: maxRank.value }, (_, i) => ({ rank: i + 1, y: ry(i + 1) }))
)

// Keep at most 6 x-labels so they never collide on a phone
const xTicks = computed(() => {
  const n = totalSteps.value
  const step = Math.ceil(n / 6)
  return segments.value.map((seg, i) => ({
    key: i,
    x: rx(i),
    label: seg.label,
    showLabel: i === n - 1 || (n - 1 - i) % step === 0,
  }))
})

const subtitle = computed(() => {
  const games = chronoHands.value.length
  const evs = evenings.value.length
  return `${evs} ${evs === 1 ? 'Spielabend' : 'Spielabende'} · ${games} ${games === 1 ? 'Partie' : 'Partien'}`
})
</script>

<template>
  <div v-if="show" class="chart-card">
    <div class="chart-head">
      <h3>Platzierungsverlauf</h3>
      <span class="chart-sub">{{ subtitle }}</span>
    </div>

    <div class="chart-outer">
      <svg
        :viewBox="`0 0 ${VBW} ${VBH}`"
        preserveAspectRatio="xMidYMid meet"
        class="chart-svg"
        aria-hidden="true"
      >
        <!-- Clip paths for circular avatar crops -->
        <defs>
          <template v-for="line in playerLines" :key="line.player.id">
            <clipPath v-if="line.end" :id="`cp-${line.player.id}`">
              <circle :cx="AV_CX" :cy="line.end.y" :r="AV_R" />
            </clipPath>
          </template>
        </defs>

        <!-- Alternating rank bands -->
        <rect
          v-for="t in yTicks.filter(t => t.rank % 2 === 1)" :key="`b${t.rank}`"
          :x="ML" :y="t.y - rowH / 2" :width="CW" :height="rowH"
          fill="rgba(255,255,255,0.035)"
        />

        <!-- Vertical grid line per step -->
        <line
          v-for="t in xTicks" :key="`v${t.key}`"
          :x1="t.x" :y1="MT - 8" :x2="t.x" :y2="MT + CH + 8"
          stroke="rgba(255,255,255,0.07)" stroke-width="1"
        />

        <!-- Y-axis rank labels -->
        <text
          v-for="t in yTicks" :key="`y${t.rank}`"
          :x="ML - 7" :y="t.y + 4"
          text-anchor="end" fill="rgba(255,255,255,0.5)" font-size="11"
        >{{ t.rank }}</text>

        <!-- X-axis labels -->
        <template v-for="t in xTicks" :key="`x${t.key}`">
          <text
            v-if="t.showLabel"
            :x="t.x" :y="VBH - 8"
            text-anchor="middle" fill="rgba(255,255,255,0.5)" font-size="11"
          >{{ t.label }}</text>
        </template>

        <!-- Player lines + avatars (drawn back-to-front so top rank is on top) -->
        <g v-for="line in [...playerLines].reverse()" :key="line.player.id">
          <path
            v-if="line.hasLine"
            :d="line.path"
            :stroke="line.player.color"
            stroke-width="2.6"
            fill="none"
            stroke-linecap="round"
            stroke-linejoin="round"
          />

          <!-- Marker per step -->
          <circle
            v-for="(p, i) in line.points" :key="i"
            :cx="p.x" :cy="p.y" r="3.4"
            :fill="line.player.color"
            stroke="#0d2a20" stroke-width="1.2"
          />

          <g v-if="line.end">
            <!-- Dashed connector to avatar -->
            <line
              :x1="line.end.x + 5" :y1="line.end.y"
              :x2="AV_CX - AV_R - 3" :y2="line.end.y"
              :stroke="line.player.color"
              stroke-width="1" stroke-dasharray="3 3" opacity="0.45"
            />
            <!-- Avatar background circle -->
            <circle
              :cx="AV_CX" :cy="line.end.y" :r="AV_R + 1.5"
              :fill="`${line.player.color}22`"
              :stroke="line.player.color" stroke-width="1.5"
            />
            <!-- Fallback initial (shows if photo is absent) -->
            <text
              :x="AV_CX" :y="line.end.y + 4"
              text-anchor="middle"
              :fill="line.player.color"
              font-size="11" font-weight="700"
            >{{ line.player.name[0] }}</text>
            <!-- Profile photo (overlays initial when it loads) -->
            <image
              :href="avatarSrc(line.player.name)"
              :x="AV_CX - AV_R" :y="line.end.y - AV_R"
              :width="AV_R * 2" :height="AV_R * 2"
              :clip-path="`url(#cp-${line.player.id})`"
              preserveAspectRatio="xMidYMid slice"
            />
          </g>
        </g>
      </svg>
    </div>

    <ul class="legend">
      <li v-for="entry in legend" :key="entry.id">
        <span class="swatch" :style="{ background: entry.color }" />
        <span class="rank">{{ entry.rank }}.</span>
        <span class="name">{{ entry.name }}</span>
      </li>
    </ul>

    <p class="chart-hint">
      X: {{ byEvening ? 'Spielabend' : 'gespielte Partien' }} &nbsp;·&nbsp; Y: Platzierung
    </p>
  </div>
</template>

<style scoped>
.chart-card {
  background: rgba(9, 35, 26, 0.84);
  border: 1px solid rgba(207, 178, 106, 0.35);
  border-radius: 1rem;
  padding: 1.2rem 1rem 0.9rem;
}

.chart-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.3rem 0.8rem;
  margin-bottom: 0.6rem;
}

h3 {
  margin: 0;
  font-family: 'Roboto Slab', serif;
  font-size: 1.05rem;
}

.chart-sub {
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.45);
}

.chart-outer {
  width: 100%;
  padding: 0.25rem 0 0.5rem;
}

.chart-svg {
  display: block;
  width: 100%;
  max-width: 560px;
  height: auto;
  margin: 0 auto;
}

.legend {
  list-style: none;
  margin: 0.4rem 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.5rem;
  justify-content: center;
}

.legend li {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 999px;
  padding: 0.2rem 0.55rem;
  font-size: 0.8rem;
}

.swatch {
  width: 0.62rem;
  height: 0.62rem;
  border-radius: 50%;
  flex: none;
}

.legend .rank {
  color: rgba(255, 255, 255, 0.45);
}

.chart-hint {
  margin: 0.6rem 0 0;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.28);
  text-align: center;
}
</style>
