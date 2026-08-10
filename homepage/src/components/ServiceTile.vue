<script setup lang="ts">
import ServiceIcon from '@/components/ServiceIcon.vue'
import type { Service } from '@/services'
import type { Status } from '@/composables/useStatus'

defineProps<{ service: Service; status: Status; shortcut: number }>()

// Der Lichtschein folgt dem Zeiger – nur Deko, deshalb rein über CSS-Variablen
// und ohne reaktiven State (das würde bei jeder Mausbewegung neu rendern).
function follow(event: MouseEvent) {
  const tile = event.currentTarget as HTMLElement
  const box = tile.getBoundingClientRect()
  tile.style.setProperty('--mx', `${event.clientX - box.left}px`)
  tile.style.setProperty('--my', `${event.clientY - box.top}px`)
}
</script>

<template>
  <a :href="service.href" class="tile" :class="service.id" @mousemove="follow">
    <span class="glow" aria-hidden="true" />

    <span class="head">
      <span class="badge">
        <ServiceIcon :id="service.id" :size="26" />
      </span>
      <span class="meta">
        <span class="dot" :class="status" :title="status === 'online' ? 'läuft' : status" />
        <kbd>{{ shortcut }}</kbd>
      </span>
    </span>

    <span class="tagline">{{ service.tagline }}</span>
    <h2>{{ service.name }}</h2>
    <p>{{ service.description }}</p>

    <span class="go">
      Öffnen
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M5 12h13M13 6l6 6-6 6" />
      </svg>
    </span>
  </a>
</template>

<style scoped>
.tile {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 1.4rem;
  border: 1px solid var(--line);
  border-radius: 1.5rem;
  background: var(--card);
  color: inherit;
  text-decoration: none;
  transition:
    transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1),
    border-color 0.25s ease,
    box-shadow 0.25s ease;
}

.tile.nextcloud {
  --accent: #38bdf8;
}

.tile.donnerskat {
  --accent: #4ade80;
}

.tile.kofferpacken {
  --accent: #fbbf24;
}

/* Farbiger Schein am Zeiger, sichtbar erst beim Überfahren */
.glow {
  position: absolute;
  inset: 0;
  z-index: -1;
  opacity: 0;
  background: radial-gradient(
    16rem circle at var(--mx, 50%) var(--my, 0%),
    color-mix(in srgb, var(--accent) 26%, transparent),
    transparent 70%
  );
  transition: opacity 0.3s ease;
}

.tile:hover,
.tile:focus-visible {
  transform: translateY(-6px);
  border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  box-shadow: 0 1.4rem 3rem -1.5rem color-mix(in srgb, var(--accent) 60%, transparent);
}

.tile:hover .glow,
.tile:focus-visible .glow {
  opacity: 1;
}

.head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  margin-bottom: 0.9rem;
}

.badge {
  display: grid;
  place-items: center;
  width: 3.2rem;
  height: 3.2rem;
  border-radius: 1rem;
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
  transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.tile:hover .badge {
  transform: rotate(-8deg) scale(1.06);
}

.meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: #64748b;
}

.dot.online {
  background: #4ade80;
  box-shadow: 0 0 0 0.25rem rgba(74, 222, 128, 0.16);
}

.dot.offline {
  background: #f87171;
  box-shadow: 0 0 0 0.25rem rgba(248, 113, 113, 0.16);
}

kbd {
  font-family: inherit;
  font-size: 0.7rem;
  font-weight: 700;
  line-height: 1;
  padding: 0.25rem 0.45rem;
  border-radius: 0.4rem;
  border: 1px solid var(--line);
  color: var(--muted);
}

.tagline {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--accent);
}

h2 {
  margin: 0;
  font-size: 1.5rem;
  letter-spacing: -0.02em;
}

p {
  margin: 0.3rem 0 1.2rem;
  font-size: 0.92rem;
  line-height: 1.45;
  color: var(--muted);
}

.go {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: auto;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--accent);
}

.go svg {
  transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.tile:hover .go svg,
.tile:focus-visible .go svg {
  transform: translateX(0.35rem);
}

@media (prefers-reduced-motion: reduce) {
  .tile,
  .badge,
  .go svg {
    transition: none;
  }

  .tile:hover {
    transform: none;
  }
}
</style>
