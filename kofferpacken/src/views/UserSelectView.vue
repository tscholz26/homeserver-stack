<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { usePackStore } from '@/composables/usePackStore'

const store = usePackStore()
const router = useRouter()

const newName = ref('')
const error = ref('')
const creating = ref(false)

function open(userId: string) {
  store.login(userId)
  router.push('/packliste')
}

async function create() {
  error.value = ''
  creating.value = true
  try {
    await store.addUser(newName.value)
    newName.value = ''
    router.push('/packliste')
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <p class="intro">Wer packt gerade?</p>

  <p v-if="store.loading.value" class="hint">Lade Daten …</p>

  <template v-else>
    <div class="tiles">
      <button
        v-for="user in store.sortedUsers.value"
        :key="user.id"
        class="tile"
        @click="open(user.id)"
      >
        <span class="avatar">{{ user.name.slice(0, 1).toUpperCase() }}</span>
        <span class="tile-name">{{ user.name }}</span>
        <span class="tile-meta">
          {{ user.trips.length }} {{ user.trips.length === 1 ? 'Trip' : 'Trips' }}
        </span>
      </button>
    </div>

    <p v-if="store.sortedUsers.value.length === 0" class="hint">
      Noch keine Nutzer – leg unten den ersten an.
    </p>

    <form class="create-form" @submit.prevent="create">
      <input v-model="newName" placeholder="Dein Name" :disabled="creating" />
      <button type="submit" class="primary" :disabled="creating">
        {{ creating ? 'Wird angelegt …' : 'Neuen Nutzer anlegen' }}
      </button>
    </form>
    <p v-if="error" class="error">{{ error }}</p>
  </template>
</template>

<style scoped>
.intro {
  text-align: center;
  font-size: 1.15rem;
  font-weight: 600;
  margin: 0.5rem 0 1.2rem;
}

.hint {
  text-align: center;
  opacity: 0.85;
}

.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
  gap: 0.8rem;
  margin-bottom: 1.5rem;
}

.tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.06);
  color: inherit;
  padding: 1.1rem 0.8rem;
  cursor: pointer;
  font: inherit;
  transition:
    transform 0.12s ease,
    border-color 0.12s ease;
}

.tile:hover,
.tile:focus-visible {
  border-color: rgba(242, 193, 78, 0.7);
  transform: translateY(-2px);
}

.avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3.2rem;
  height: 3.2rem;
  border-radius: 50%;
  background: #f2c14e;
  color: #23303b;
  font-size: 1.5rem;
  font-weight: 700;
}

.tile-name {
  font-weight: 700;
  overflow-wrap: anywhere;
}

.tile-meta {
  font-size: 0.8rem;
  opacity: 0.7;
}

.create-form {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-content: center;
}

.create-form input {
  flex: 1;
  min-width: 10rem;
  max-width: 18rem;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 0.55rem;
  background: rgba(0, 0, 0, 0.25);
  color: inherit;
  padding: 0.5rem 0.65rem;
  font: inherit;
}

button.primary {
  border: 1px solid #f2c14e;
  border-radius: 0.55rem;
  background: #f2c14e;
  color: #23303b;
  padding: 0.5rem 0.9rem;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

button.primary:disabled {
  opacity: 0.6;
  cursor: default;
}

.error {
  text-align: center;
  border: 1px solid rgba(255, 120, 120, 0.7);
  border-radius: 0.6rem;
  background: rgba(160, 40, 40, 0.35);
  padding: 0.6rem 0.8rem;
}
</style>
