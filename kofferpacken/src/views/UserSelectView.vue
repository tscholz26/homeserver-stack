<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
import { usePackStore, type ListSource } from '@/composables/usePackStore'

const store = usePackStore()
const router = useRouter()

const dialog = ref<HTMLDialogElement | null>(null)
const nameInput = ref<HTMLInputElement | null>(null)
const newName = ref('')
const error = ref('')
const creating = ref(false)

// Schritt 1 fragt den Namen, Schritt 2 die Startliste – eine Entscheidung pro
// Ansicht ist auf dem Handy deutlich angenehmer als ein volles Formular.
const step = ref<1 | 2>(1)
const choice = ref<'default' | 'empty' | 'copy'>('default')
const copyFromId = ref<string | null>(null)

const templates = computed(() => store.sortedUsers.value)

function open(userId: string) {
  store.login(userId)
  router.push('/packliste')
}

async function openDialog() {
  newName.value = ''
  error.value = ''
  step.value = 1
  choice.value = 'default'
  copyFromId.value = templates.value[0]?.id ?? null
  dialog.value?.showModal()
  await nextTick()
  nameInput.value?.focus()
}

function toStep2() {
  if (!newName.value.trim()) {
    error.value = 'Bitte einen Namen eingeben.'
    return
  }
  error.value = ''
  step.value = 2
}

async function create() {
  error.value = ''
  creating.value = true
  try {
    const source: ListSource =
      choice.value === 'copy'
        ? { kind: 'copy', userId: copyFromId.value ?? '' }
        : { kind: choice.value }
    await store.addUser(newName.value, source)
    dialog.value?.close()
    // Bei leerer Liste gibt es nichts zu packen – direkt dorthin, wo man
    // Kategorien und Gegenstände anlegt.
    router.push(choice.value === 'empty' ? '/verwaltung' : '/packliste')
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
      <form @submit.prevent="step === 1 ? toStep2() : create()">
        <p class="step-badge">Schritt {{ step }} von 2</p>

        <template v-if="step === 1">
          <h2>Wie heißt du?</h2>
          <p class="modal-hint">Unter diesem Namen erscheint deine Kachel auf der Startseite.</p>
          <input ref="nameInput" v-model="newName" placeholder="Dein Name" maxlength="30" />
        </template>

        <template v-else>
          <h2>Womit soll deine Liste starten?</h2>
          <p class="modal-hint">Alles lässt sich später in der Verwaltung ändern.</p>

          <label class="option" :class="{ active: choice === 'default' }">
            <input v-model="choice" type="radio" value="default" />
            <span>
              <strong>Standardliste</strong>
              <small>Ein vorgefertigter Katalog mit Standard-Kategorien.</small>
            </span>
          </label>

          <label class="option" :class="{ active: choice === 'empty' }">
            <input v-model="choice" type="radio" value="empty" />
            <span>
              <strong>Leere Liste</strong>
              <small>Du legst Kategorien und Gegenstände selbst an.</small>
            </span>
          </label>

          <label v-if="templates.length > 0" class="option" :class="{ active: choice === 'copy' }">
            <input v-model="choice" type="radio" value="copy" />
            <span>
              <strong>Liste von jemand anderem übernehmen</strong>
              <small>Kopiert Kategorien und Gegenstände – die Trips bleiben privat.</small>
              <select v-model="copyFromId" :disabled="choice !== 'copy'" @click.stop>
                <option v-for="user in templates" :key="user.id" :value="user.id">
                  {{ user.name }}
                </option>
              </select>
            </span>
          </label>
        </template>

        <p v-if="error" class="error">{{ error }}</p>

        <div class="modal-actions">
          <button
            type="button"
            class="ghost"
            :disabled="creating"
            @click="step === 1 ? dialog?.close() : (step = 1)"
          >
            {{ step === 1 ? 'Abbrechen' : 'Zurück' }}
          </button>
          <button type="submit" class="primary" :disabled="creating">
            {{ step === 1 ? 'Weiter' : creating ? 'Wird angelegt …' : 'Anlegen' }}
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

/* Feste zwei Spalten: bei einer Handvoll Nutzern dürfen die Kacheln groß und
   breit sein, statt in viele schmale Spalten zu zerfallen. */
.tiles {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.8rem;
  min-height: 11rem;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 1.2rem;
  background: rgba(255, 255, 255, 0.06);
  color: inherit;
  padding: 1.8rem 1rem;
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
  width: 4.6rem;
  height: 4.6rem;
  border-radius: 50%;
  background: #f2c14e;
  color: #23303b;
  font-size: 2.2rem;
  font-weight: 700;
}

.tile-name {
  font-size: 1.15rem;
  font-weight: 700;
  overflow-wrap: anywhere;
  text-align: center;
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
  font-size: 2.8rem;
  line-height: 1;
  padding-bottom: 0.3rem;
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

.modal input[type='text'],
.modal input:not([type]) {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 0.55rem;
  background: rgba(0, 0, 0, 0.25);
  color: inherit;
  padding: 0.55rem 0.7rem;
  font: inherit;
}

.step-badge {
  margin: 0 0 0.5rem;
  font-size: 0.72rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #f2c14e;
}

.option {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 0.7rem;
  padding: 0.7rem 0.8rem;
  margin-bottom: 0.5rem;
  cursor: pointer;
}

.option.active {
  border-color: #f2c14e;
  background: rgba(242, 193, 78, 0.1);
}

.option input[type='radio'] {
  margin-top: 0.15rem;
  width: 1.1rem;
  height: 1.1rem;
  accent-color: #f2c14e;
  flex-shrink: 0;
}

.option span {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.option small {
  font-size: 0.8rem;
  opacity: 0.75;
}

.option select {
  margin-top: 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 0.5rem;
  background: rgba(0, 0, 0, 0.35);
  color: inherit;
  padding: 0.4rem 0.5rem;
  font: inherit;
}

.option select:disabled {
  opacity: 0.5;
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
