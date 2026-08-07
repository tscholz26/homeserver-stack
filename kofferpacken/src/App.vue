<script setup lang="ts">
import { watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import { usePackStore } from '@/composables/usePackStore'

const store = usePackStore()
const router = useRouter()

function logout() {
  store.logout()
  router.push('/')
}

// If the stored user was deleted on another device, fall back to the tiles
watchEffect(() => {
  if (!store.loading.value && store.currentUserId.value && !store.currentUser.value) {
    logout()
  }
})
</script>

<template>
  <div class="shell">
    <header class="top">
      <div>
        <p class="brand-sub">
          Reisepackliste<template v-if="store.currentUser.value">
            · {{ store.currentUser.value.name }}</template
          >
        </p>
        <h1>Kofferpacken</h1>
      </div>
      <nav v-if="store.currentUser.value" class="menu">
        <RouterLink to="/packliste">Packliste</RouterLink>
        <RouterLink to="/verwaltung">Verwaltung</RouterLink>
        <button class="logout" @click="logout">Abmelden</button>
      </nav>
    </header>

    <main class="content">
      <RouterView />
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
    radial-gradient(circle at 15% 15%, rgba(242, 193, 78, 0.18) 0%, rgba(242, 193, 78, 0) 45%),
    linear-gradient(170deg, #10222f 0%, #1b3a50 60%, #122534 100%);
}

.shell {
  min-height: 100vh;
  max-width: 52rem;
  margin: 0 auto;
  padding: 1rem;
  padding-left: max(1rem, env(safe-area-inset-left));
  padding-right: max(1rem, env(safe-area-inset-right));
  padding-bottom: max(1rem, env(safe-area-inset-bottom));
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
  background: linear-gradient(120deg, rgba(13, 30, 42, 0.9), rgba(30, 62, 84, 0.9));
}

.brand-sub {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.8rem;
  color: #f2c14e;
}

h1 {
  margin: 0.1rem 0 0;
  font-size: clamp(1.6rem, 3.8vw, 2.3rem);
}

.menu {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.menu a {
  color: #f2f6f9;
  text-decoration: none;
  font-weight: 700;
  border: 1px solid rgba(242, 193, 78, 0.6);
  padding: 0.45rem 0.75rem;
  border-radius: 0.6rem;
}

.menu a.router-link-exact-active {
  background: #f2c14e;
  color: #23303b;
}

.logout {
  color: #f2f6f9;
  font: inherit;
  font-weight: 700;
  border: 1px solid rgba(255, 255, 255, 0.35);
  background: transparent;
  padding: 0.45rem 0.75rem;
  border-radius: 0.6rem;
  cursor: pointer;
}

.content {
  margin-top: 1rem;
}
</style>
