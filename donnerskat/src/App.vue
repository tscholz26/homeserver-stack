<template>
  <div class="shell">
    <header class="top">
      <div>
        <p class="brand-sub">Skatturnier Verwaltungssoftware</p>
        <h1>Donnerskat</h1>
      </div>
      <nav class="menu">
        <RouterLink to="/eintragung">Eintragung</RouterLink>
        <RouterLink to="/uebersicht">Ergebnisse</RouterLink>
        <RouterLink to="/spieler">Spielerverwaltung</RouterLink>
      </nav>
    </header>

    <main class="content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Roboto+Slab:wght@500;700&family=Source+Sans+3:wght@400;600;700&display=swap');

:global(body) {
  margin: 0;
  color: #f5f8f6;
  font-family: 'Source Sans 3', 'Segoe UI', sans-serif;
  background:
    radial-gradient(circle at 15% 15%, rgba(86, 25, 21, 0.5) 0%, rgba(86, 25, 21, 0) 45%),
    radial-gradient(circle at 80% 0%, rgba(173, 128, 42, 0.24) 0%, rgba(173, 128, 42, 0) 40%),
    linear-gradient(170deg, #053222 0%, #0a4b33 60%, #0b2d21 100%);
}

.shell {
  min-height: 100vh;
  padding: 1rem;
}

.top {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 1rem;
  align-items: end;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 1rem;
  padding: 1rem 1.2rem;
  background: linear-gradient(120deg, rgba(8, 38, 29, 0.9), rgba(20, 72, 53, 0.9));
}

.brand-sub {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.8rem;
  color: #cfb26a;
}

h1 {
  margin: 0.1rem 0 0;
  font-family: 'Roboto Slab', serif;
  font-size: clamp(1.6rem, 3.8vw, 2.3rem);
}

.menu {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.menu a {
  color: #f9f5e5;
  text-decoration: none;
  font-weight: 700;
  border: 1px solid rgba(207, 178, 106, 0.6);
  padding: 0.45rem 0.75rem;
  border-radius: 999px;
  transition: all 0.2s ease;
}

.menu a.router-link-active {
  background: #cfb26a;
  color: #1d271f;
}

.content {
  margin-top: 1rem;
  animation: fade-in 0.4s ease;
}

@media (max-width: 640px) {
  .top {
    align-items: flex-start;
  }
}

@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
