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
  '#60c8f0', '#f0a860',
]

// SVG viewport geometry
const VBW = 720
const VBH = 300
const ML  = 28   // left  (rank labels)
const MT  = 18   // top
const MR  = 80   // right (avatar column)
const MB  = 28   // bottom (game-number labels)
const CW  = VBW - ML - MR   // 612 — chart width
const CH  = VBH - MT - MB   // 254 — chart height
const AV_CX = ML + CW + 40  // avatar circle centre-x

function handDate(h) {
  return h.playedOn || h.createdAt?.slice(0, 10) || ''
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

// Incremental standing after each game: rankHistory[i][playerId] = rank
const rankHistory = computed(() => {
  const totals = {}
  for (const p of props.players) totals[p.id] = { total: 0, n: 0, name: p.name }

  return chronoHands.value.map(hand => {
    for (const s of (hand.scores ?? [])) {
      if (totals[s.playerId]) {
        totals[s.playerId].total += Number(s.delta)
        totals[s.playerId].n += 1
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
const totalGames = computed(() => rankHistory.value.length)
const show       = computed(() => totalGames.value >= 2 && maxRank.value >= 2)

// Coordinate helpers
function rx(i) {
  return ML + (totalGames.value <= 1 ? CW : (i / (totalGames.value - 1)) * CW)
}
function ry(rank) {
  return MT + (maxRank.value <= 1 ? CH / 2 : ((rank - 1) / (maxRank.value - 1)) * CH)
}
function f(n) { return n.toFixed(1) }

// Smooth cubic-bezier path (horizontal control points → no vertical overswing)
function buildPath(pts) {
  if (!pts.length) return ''
  if (pts.length === 1) return `M ${f(pts[0].x)} ${f(pts[0].y)}`
  let d = `M ${f(pts[0].x)} ${f(pts[0].y)}`
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1], p1 = pts[i]
    const cx = (p0.x + p1.x) / 2
    d += ` C ${f(cx)} ${f(p0.y)}, ${f(cx)} ${f(p1.y)}, ${f(p1.x)} ${f(p1.y)}`
  }
  return d
}

const playerLines = computed(() =>
  activePlayers.value.map(player => {
    const pts = []
    for (let i = 0; i < rankHistory.value.length; i++) {
      const rank = rankHistory.value[i][player.id]
      if (rank !== undefined) pts.push({ x: rx(i), y: ry(rank) })
    }
    return {
      player,
      path: buildPath(pts),
      hasLine: pts.length >= 2,
      end: pts.at(-1) ?? null,
    }
  })
)

const yTicks = computed(() =>
  Array.from({ length: maxRank.value }, (_, i) => ({ rank: i + 1, y: ry(i + 1) }))
)

const xTicks = computed(() => {
  const n = totalGames.value
  if (n < 2) return []
  const step = n <= 10 ? 2 : n <= 30 ? 5 : n <= 80 ? 10 : n <= 200 ? 25 : 50
  const ticks = []
  for (let g = step; g < n; g += step) {
    ticks.push({ label: String(g), x: rx(g - 1) })
  }
  ticks.push({ label: String(n), x: ML + CW })
  return ticks
})
</script>

<template>
  <div v-if="show" class="chart-card">
    <h3>Platzierungsverlauf</h3>
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
              <circle :cx="AV_CX" :cy="line.end.y" r="18" />
            </clipPath>
          </template>
        </defs>

        <!-- Horizontal grid lines at each rank -->
        <line
          v-for="t in yTicks" :key="t.rank"
          :x1="ML" :y1="t.y" :x2="ML + CW" :y2="t.y"
          stroke="rgba(255,255,255,0.08)" stroke-width="1"
        />

        <!-- Y-axis rank labels -->
        <text
          v-for="t in yTicks" :key="t.rank"
          :x="ML - 6" :y="t.y + 4"
          text-anchor="end" fill="rgba(255,255,255,0.38)" font-size="11"
        >{{ t.rank }}</text>

        <!-- X-axis game-number labels -->
        <text
          v-for="t in xTicks" :key="t.label"
          :x="t.x" :y="VBH - 6"
          text-anchor="middle" fill="rgba(255,255,255,0.38)" font-size="11"
        >{{ t.label }}</text>

        <!-- Player lines + avatars (drawn back-to-front so top rank is on top) -->
        <g v-for="line in [...playerLines].reverse()" :key="line.player.id">
          <path
            v-if="line.hasLine"
            :d="line.path"
            :stroke="line.player.color"
            stroke-width="2.5"
            fill="none"
            stroke-linecap="round"
            stroke-linejoin="round"
          />

          <g v-if="line.end">
            <!-- Dot at line end -->
            <circle :cx="line.end.x" :cy="line.end.y" r="3.5" :fill="line.player.color" />
            <!-- Dashed connector to avatar -->
            <line
              :x1="line.end.x + 5" :y1="line.end.y"
              :x2="AV_CX - 22"    :y2="line.end.y"
              :stroke="line.player.color"
              stroke-width="1" stroke-dasharray="3 3" opacity="0.4"
            />
            <!-- Avatar background circle -->
            <circle
              :cx="AV_CX" :cy="line.end.y" r="20"
              :fill="`${line.player.color}20`"
              :stroke="line.player.color" stroke-width="1.5"
            />
            <!-- Fallback initial (shows if photo is absent) -->
            <text
              :x="AV_CX" :y="line.end.y + 5"
              text-anchor="middle"
              :fill="line.player.color"
              font-size="13" font-weight="700"
            >{{ line.player.name[0] }}</text>
            <!-- Profile photo (overlays initial when it loads) -->
            <image
              :href="avatarSrc(line.player.name)"
              :x="AV_CX - 18" :y="line.end.y - 18"
              width="36" height="36"
              :clip-path="`url(#cp-${line.player.id})`"
              preserveAspectRatio="xMidYMid slice"
            />
          </g>
        </g>
      </svg>
    </div>
    <p class="chart-hint">X: Anzahl gespielte Partien &nbsp;·&nbsp; Y: Platzierung</p>
  </div>
</template>

<style scoped>
.chart-card {
  background: rgba(9, 35, 26, 0.84);
  border: 1px solid rgba(207, 178, 106, 0.35);
  border-radius: 1rem;
  padding: 1.2rem 1.2rem 0.9rem;
}

h3 {
  margin: 0 0 1rem;
  font-family: 'Roboto Slab', serif;
  font-size: 1.05rem;
}

.chart-outer {
  width: 100%;
  padding: 0.25rem 0 0.5rem;
}

.chart-svg {
  width: 100%;
  height: auto;
  display: block;
}

.chart-hint {
  margin: 0.5rem 0 0;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.28);
  text-align: center;
}
</style>
