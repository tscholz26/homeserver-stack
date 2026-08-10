<script setup lang="ts">
// Die Kacheln führen aus dieser Seite heraus zu den anderen Diensten hinter
// demselben Proxy – deshalb echte Links und kein Router.
const services = [
  {
    id: 'nextcloud',
    name: 'Nextcloud',
    // Unter / liegt jetzt diese Startseite; /index.php ist Nextclouds Einstieg
    // und leitet wie bisher auf Login bzw. Dashboard weiter.
    href: '/index.php',
    description: 'Dateien, Fotos, Kalender und Kontakte',
  },
  {
    id: 'donnerskat',
    name: 'Donnerskat',
    href: '/skat/',
    description: 'Skatrunden eintragen und Ergebnisse ansehen',
  },
  {
    id: 'kofferpacken',
    name: 'Kofferpacken',
    href: '/koffer/',
    description: 'Packlisten für die nächste Reise abhaken',
  },
]
</script>

<template>
  <div class="shell">
    <header class="top">
      <p class="brand-sub">Tristans Homeserver</p>
      <h1>Willkommen!</h1>
      <p class="lead">Wo möchtest du hin?</p>
    </header>

    <main class="tiles">
      <a
        v-for="service in services"
        :key="service.id"
        class="tile"
        :class="service.id"
        :href="service.href"
      >
        <span class="icon" aria-hidden="true">
          <svg
            v-if="service.id === 'nextcloud'"
            viewBox="0 0 24 24"
            width="30"
            height="30"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
          </svg>

          <svg
            v-else-if="service.id === 'donnerskat'"
            viewBox="0 0 24 24"
            width="30"
            height="30"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="M12 3.6c-2.9 3.4-6.6 5.4-6.6 8.6 0 2.1 1.7 3.5 3.5 3.5 1.2 0 2.3-.7 3.1-1.9.8 1.2 1.9 1.9 3.1 1.9 1.8 0 3.5-1.4 3.5-3.5 0-3.2-3.7-5.2-6.6-8.6z"
            />
            <path d="M12 14.4V19" />
            <path d="M9.6 20.3h4.8" />
          </svg>

          <svg
            v-else
            viewBox="0 0 24 24"
            width="30"
            height="30"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect x="2" y="7" width="20" height="14" rx="2" />
            <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <path d="M2 13h20" />
          </svg>
        </span>

        <span class="tile-name">{{ service.name }}</span>
        <span class="tile-text">{{ service.description }}</span>
      </a>
    </main>
  </div>
</template>

<style scoped>
:global(*, *::before, *::after) {
  box-sizing: border-box;
}

:global(body) {
  margin: 0;
  -webkit-tap-highlight-color: transparent;
  color: #f2f6f9;
  font-family: 'Segoe UI', 'Source Sans 3', sans-serif;
  background:
    radial-gradient(circle at 15% 12%, rgba(242, 193, 78, 0.16) 0%, rgba(242, 193, 78, 0) 45%),
    radial-gradient(circle at 85% 5%, rgba(74, 168, 224, 0.18) 0%, rgba(74, 168, 224, 0) 42%),
    linear-gradient(170deg, #101a24 0%, #1b2c3d 60%, #0e1620 100%);
}

/* min-height statt height: bei viel Platz sitzt alles mittig, auf dem Handy
   wächst die Seite mit dem Inhalt und scrollt normal. */
.shell {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 100vh;
  max-width: 52rem;
  margin: 0 auto;
  padding: 1rem;
  padding-left: max(1rem, env(safe-area-inset-left));
  padding-right: max(1rem, env(safe-area-inset-right));
  padding-bottom: max(1rem, env(safe-area-inset-bottom));
}

.top {
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 1rem;
  padding: 1.6rem 1.2rem;
  text-align: center;
  background: linear-gradient(120deg, rgba(13, 26, 38, 0.9), rgba(30, 56, 78, 0.9));
}

.brand-sub {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.8rem;
  color: #f2c14e;
}

h1 {
  margin: 0.2rem 0 0;
  font-size: clamp(1.8rem, 5vw, 2.6rem);
}

.lead {
  margin: 0.6rem 0 0;
  font-size: 1.05rem;
  opacity: 0.85;
}

/* Eine Spalte auf dem Handy, sonst so viele Kacheln nebeneinander wie passen –
   damit spätere Dienste einfach dazukommen können. */
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  gap: 1rem;
  margin-top: 1rem;
}

.tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  min-height: 13rem;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 1.2rem;
  background: rgba(255, 255, 255, 0.06);
  color: inherit;
  text-decoration: none;
  padding: 1.8rem 1.2rem;
  text-align: center;
  transition:
    transform 0.12s ease,
    border-color 0.12s ease,
    background-color 0.12s ease;
}

.tile:hover,
.tile:focus-visible {
  border-color: var(--accent);
  background: rgba(255, 255, 255, 0.1);
  transform: translateY(-3px);
}

.tile.nextcloud {
  --accent: #4aa8e0;
}

.tile.donnerskat {
  --accent: #6bbf8a;
}

.tile.kofferpacken {
  --accent: #f2c14e;
}

.icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 4.4rem;
  height: 4.4rem;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--accent);
}

.tile-name {
  font-size: 1.3rem;
  font-weight: 700;
}

.tile-text {
  font-size: 0.92rem;
  line-height: 1.35;
  opacity: 0.8;
  text-wrap: balance;
}
</style>
