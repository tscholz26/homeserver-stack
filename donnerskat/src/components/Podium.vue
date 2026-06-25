<script setup>
import { computed } from 'vue'

const BASE_URL = import.meta.env.BASE_URL

const props = defineProps({
  standings: { type: Array, required: true },
})

// Classic podium layout: 2nd left, 1st center, 3rd right
const podiumOrder = computed(() => {
  const top = props.standings.slice(0, 3)
  if (top.length < 3) return []
  return [top[1], top[0], top[2]]
})

function avatarSrc(name) {
  return `${BASE_URL}avatars/${encodeURIComponent(name)}.jpg`
}

function onImgError(e) {
  e.target.style.display = 'none'
}
</script>

<template>
  <div v-if="podiumOrder.length === 3" class="podium-wrap">
    <div class="podium">
      <div
        v-for="entry in podiumOrder"
        :key="entry.rank"
        :class="['slot', `rank-${entry.rank}`]"
      >
        <div :class="['avatar-ring', `ring-${entry.rank}`]">
          <span class="initial">{{ entry.name[0] }}</span>
          <img v-if="entry.dealtHands > 0" :src="avatarSrc(entry.name)" :alt="entry.name" @error="onImgError" />
        </div>
        <div class="player-name">{{ entry.name }}</div>
        <div class="player-avg">Ø {{ entry.avg }}</div>
        <div :class="['platform', `platform-${entry.rank}`]">
          <span class="rank-num">{{ entry.rank }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.podium-wrap {
  display: flex;
  justify-content: center;
  padding: 1.5rem 0 0;
}

.podium {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 4px;
}

/* Each slot stacks: avatar → name → avg → platform */
.slot {
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* ── Avatar ── */
.avatar-ring {
  position: relative;
  width: 86px;
  height: 86px;
  border-radius: 50%;
  overflow: hidden;
  border: 3px solid transparent;
  background: #0e2e21;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 6px;
  flex-shrink: 0;
}

.ring-1 {
  border-color: #cfb26a;
  box-shadow: 0 0 0 3px rgba(207, 178, 106, 0.25), 0 0 18px rgba(207, 178, 106, 0.4);
}
.ring-2 { border-color: #9ab8b0; }
.ring-3 { border-color: #a07850; }

/* Fallback initial letter – sits in normal flow */
.initial {
  font-size: 2rem;
  font-weight: 700;
  color: #cfd9d4;
  user-select: none;
  line-height: 1;
}

/* Photo – absolutely overlays the initial when it loads */
.avatar-ring img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

/* ── Name & stat ── */
.player-name {
  font-weight: 700;
  font-size: 0.88rem;
  color: #f4f6f5;
  text-align: center;
  max-width: 130px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 2px;
}

.player-avg {
  font-size: 0.75rem;
  color: #9ab8a8;
  margin-bottom: 5px;
}

/* ── Platform blocks ── */
.platform {
  width: 134px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px 4px 0 0;
}

.platform-1 {
  height: 90px;
  background: linear-gradient(175deg, #e0c87a 0%, #cfb26a 35%, #a88840 100%);
}
.platform-2 {
  height: 65px;
  background: linear-gradient(175deg, #b0c8c0 0%, #8ca8a0 35%, #6a8880 100%);
}
.platform-3 {
  height: 50px;
  background: linear-gradient(175deg, #b08860 0%, #8c6840 35%, #6a4820 100%);
}

.rank-num {
  font-family: 'Roboto Slab', serif;
  font-size: 2.2rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.8);
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
  line-height: 1;
}

/* ── 1st-place avatar is slightly larger ── */
.rank-1 .avatar-ring {
  width: 96px;
  height: 96px;
}
.rank-1 .initial { font-size: 2.3rem; }

/* ── Responsive ── */
@media (max-width: 480px) {
  .avatar-ring  { width: 68px; height: 68px; }
  .rank-1 .avatar-ring { width: 78px; height: 78px; }
  .platform { width: 100px; }
  .platform-1 { height: 70px; }
  .platform-2 { height: 52px; }
  .platform-3 { height: 40px; }
  .rank-num { font-size: 1.7rem; }
  .player-name { max-width: 100px; }
}

@media (max-width: 340px) {
  .podium { gap: 3px; }
  .avatar-ring { width: 56px; height: 56px; }
  .rank-1 .avatar-ring { width: 64px; height: 64px; }
  .platform { width: 88px; }
  .platform-1 { height: 58px; }
  .platform-2 { height: 42px; }
  .platform-3 { height: 32px; }
  .rank-num { font-size: 1.4rem; }
  .player-name { max-width: 88px; font-size: 0.78rem; }
}
</style>
