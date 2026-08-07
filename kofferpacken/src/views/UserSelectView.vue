<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
import { usePackStore } from '@/composables/usePackStore'

const store = usePackStore()
const router = useRouter()

const dialog = ref<HTMLDialogElement | null>(null)
const nameInput = ref<HTMLInputElement | null>(null)
const newName = ref('')
const error = ref('')
const creating = ref(false)

function open(userId: string) {
  store.login(userId)
  router.push('/packliste')
}

async function openDialog() {
  newName.value = ''
  error.value = ''
  dialog.value?.showModal()
  await nextTick()
  nameInput.value?.focus()
}

async function create() {
  error.value = ''
  creating.value = true
  try {
    await store.addUser(newName.value)
    dialog.value?.close()
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
      </button>

      <button class="tile add" @click="openDialog">
        <span class="avatar plus">+</span>
        <span class="tile-name">Neuer Nutzer</span>
      </button>
    </div>

    <!-- Klick auf die Fläche außerhalb des Formulars schließt; das Formular
         selbst hat das Padding, damit .self nur beim Backdrop greift. -->
    <dialog ref="dialog" class="modal" @click.self="dialog?.close()">
      <form @submit.prevent="create">
        <h2>Neuen Nutzer anlegen</h2>
        <p class="modal-hint">
          Du bekommst eine eigene Packliste, die du danach frei anpassen kannst.
        </p>
        <input
          ref="nameInput"
          v-model="newName"
          placeholder="Dein Name"
          :disabled="creating"
          maxlength="30"
        />
        <p v-if="error" class="error">{{ error }}</p>
        <div class="modal-actions">
          <button type="button" class="ghost" :disabled="creating" @click="dialog?.close()">
            Abbrechen
          </button>
          <button type="submit" class="primary" :disabled="creating">
            {{ creating ? 'Wird angelegt …' : 'Anlegen' }}
          </button>
        </div>
      </form>
    </dialog>
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
}

.tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.55rem;
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

/* Die Kachel zum Anlegen bleibt sichtbar zurückhaltender als echte Nutzer */
.tile.add {
  border-style: dashed;
  background: transparent;
}

.avatar.plus {
  background: transparent;
  border: 2px dashed rgba(242, 193, 78, 0.75);
  color: #f2c14e;
  font-size: 1.9rem;
  line-height: 1;
  padding-bottom: 0.2rem;
}

.tile.add .tile-name {
  font-weight: 600;
  opacity: 0.85;
}

/* Dialog */
.modal {
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 1rem;
  background: #16303f;
  color: #f2f6f9;
  padding: 0;
  width: min(22rem, calc(100vw - 2rem));
}

.modal::backdrop {
  background: rgba(5, 15, 22, 0.65);
  backdrop-filter: blur(2px);
}

.modal form {
  padding: 1.2rem;
}

.modal h2 {
  margin: 0 0 0.3rem;
  font-size: 1.15rem;
}

.modal-hint {
  margin: 0 0 0.9rem;
  font-size: 0.85rem;
  opacity: 0.75;
}

.modal input {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 0.55rem;
  background: rgba(0, 0, 0, 0.25);
  color: inherit;
  padding: 0.55rem 0.7rem;
  font: inherit;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1rem;
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

button.ghost {
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 0.55rem;
  background: transparent;
  color: inherit;
  padding: 0.5rem 0.9rem;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

button:disabled {
  opacity: 0.6;
  cursor: default;
}

.error {
  margin: 0.7rem 0 0;
  border: 1px solid rgba(255, 120, 120, 0.7);
  border-radius: 0.6rem;
  background: rgba(160, 40, 40, 0.35);
  padding: 0.5rem 0.7rem;
  font-size: 0.9rem;
}

@media (pointer: coarse) {
  button.primary,
  button.ghost {
    padding: 0.6rem 1rem;
  }
}
</style>
