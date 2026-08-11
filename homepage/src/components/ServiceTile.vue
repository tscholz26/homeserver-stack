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

    <span class="badge">
      <ServiceIcon :id="service.id" :size="26" />
    </span>

    <span class="meta">
      <span class="dot" :class="status" :title="status === 'online' ? 'läuft' : status" />
      <kbd>{{ shortcut }}</kbd>
    </span>

    <span class="text">
      <span class="tagline">{{ service.tagline }}</span>
      <h2>{{ service.name }}</h2>
      <p>{{ service.description }}</p>
    </span>

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
  /* Bereiche statt Reihenfolge: auf dem Handy wird daraus eine Zeile, ohne
     dass sich am Markup etwas ändert. */
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    'badge meta'
    'text  text'
    'go    go';
  padding: 1.4rem;
  border: 1px solid var(--line);
  border-radius: 1.5rem;
  background: var(--card);
  box-shadow: var(--shadow);
  color: inherit;
  text-decoration: none;
  transition:
    transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1),
    border-color 0.25s ease,
    box-shadow 0.25s ease;
}

.tile.nextcloud {
  --accent: #0369a1;
}

.tile.donnerskat {
  --accent: #15803d;
}

.tile.kofferpacken {
  --accent: #b45309;
}

.tile.einkaufsliste {
  --accent: #7c3aed;
}

/* Farbiger Schein am Zeiger, sichtbar erst beim Überfahren */
.glow {
  position: absolute;
  inset: 0;
  z-index: -1;
  opacity: 0;
  background: radial-gradient(
    16rem circle at var(--mx, 50%) var(--my, 0%),
    color-mix(in srgb, var(--accent) 14%, transparent),
    transparent 70%
  );
  transition: opacity 0.3s ease;
}

.tile:hover,
.tile:focus-visible {
  transform: translateY(-6px);
  border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  box-shadow:
    var(--shadow),
    0 1.2rem 2.6rem -1.4rem color-mix(in srgb, var(--accent) 70%, transparent);
}

.tile:hover .glow,
.tile:focus-visible .glow {
  opacity: 1;
}

.text {
  grid-area: text;
  display: block;
  margin-top: 0.9rem;
}

.badge {
  grid-area: badge;
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
  grid-area: meta;
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: #94a3b8;
}

.dot.online {
  background: #16a34a;
  box-shadow: 0 0 0 0.25rem rgba(22, 163, 74, 0.18);
}

.dot.offline {
  background: #dc2626;
  box-shadow: 0 0 0 0.25rem rgba(220, 38, 38, 0.18);
}

kbd {
  font-family: inherit;
  font-size: 0.7rem;
  font-weight: 700;
  line-height: 1;
  padding: 0.25rem 0.45rem;
  border-radius: 0.4rem;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.7);
  color: var(--muted);
}

.tagline {
  display: block;
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
  margin: 0.3rem 0 0.9rem;
  font-size: 0.92rem;
  line-height: 1.45;
  color: var(--muted);
}

.go {
  grid-area: go;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
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

/* Auf dem Handy wird die Kachel eine flache Zeile: Icon, Text, Status. So
   sind alle drei Dienste ohne Scrollen zu sehen. */
@media (max-width: 34rem) {
  .tile {
    grid-template-columns: auto 1fr auto;
    grid-template-rows: auto;
    grid-template-areas: 'badge text meta';
    align-items: center;
    gap: 0 0.9rem;
    padding: 1rem 1.1rem;
  }

  .badge {
    width: 2.9rem;
    height: 2.9rem;
    border-radius: 0.9rem;
  }

  .text {
    margin-top: 0;
    min-width: 0;
  }

  h2 {
    font-size: 1.25rem;
  }

  p {
    margin: 0.15rem 0 0;
    font-size: 0.85rem;
  }

  .go {
    display: none;
  }
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
