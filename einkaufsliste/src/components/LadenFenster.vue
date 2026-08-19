<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from 'vue'
import { useEinkaufStore, type List } from '@/composables/useEinkaufStore'

const props = defineProps<{ list: List }>()
const emit = defineEmits<{ close: [] }>()

const store = useEinkaufStore()

const maerkte = computed(() => store.profilesFor(props.list))
// Der Laden vom letzten Mal steht oben mit dabei – meistens ist es wieder derselbe
const zuletzt = computed(() => props.list.storeProfileId)

const neuOffen = ref(false)
const neuerName = ref('')
const namensfeld = useTemplateRef<HTMLInputElement>('namensfeld')

function oeffneNeu() {
  neuOffen.value = true
  nextTick(() => namensfeld.value?.focus())
}

function starten(profileId: string | null) {
  store.startShopping(props.list, profileId)
  emit('close')
}

/**
 * Ein Laden, den es noch nicht gibt: er bekommt die Standard-Reihenfolge und
 * wird direkt zum Einkauf gewählt. Umsortiert wird er unterwegs.
 */
async function anlegenUndStarten() {
  const name = neuerName.value.trim()
  if (!name) return
  const id = await store.addStoreProfile(props.list, name)
  if (!id) return
  starten(id)
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="fenster card" role="dialog" aria-modal="true" aria-label="Laden wählen">
      <header>
        <h2>Wo kaufst du ein?</h2>
        <button type="button" class="zu" aria-label="Schließen" @click="emit('close')">✕</button>
      </header>

      <div class="inhalt">
        <button v-for="m in maerkte" :key="m.id" type="button" class="laden" @click="starten(m.id)">
          <span class="name">🏬 {{ m.name }}</span>
          <span v-if="m.id === zuletzt" class="marke">zuletzt</span>
        </button>

        <button type="button" class="laden schlicht" @click="starten(null)">
          <span class="name">🧭 Woanders</span>
          <span class="marke">Standard-Reihenfolge</span>
        </button>

        <form v-if="neuOffen" class="neuer-laden" @submit.prevent="anlegenUndStarten">
          <input
            ref="namensfeld"
            v-model="neuerName"
            placeholder="z. B. Rewe Felsenkeller"
            aria-label="Name des Marktes"
            enterkeyhint="go"
          />
          <button type="submit" class="primaer" :disabled="!neuerName.trim()">Los</button>
        </form>

        <button v-else type="button" class="anlegen" @click="oeffneNeu">
          ＋ Anderer Supermarkt …
        </button>

        <p class="fuss">
          Ein neuer Markt startet mit der Standard-Reihenfolge. Die Regale lassen sich beim
          Einkaufen umsortieren.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0.6rem;
  padding-bottom: max(0.6rem, env(safe-area-inset-bottom));
  background: color-mix(in srgb, var(--text) 35%, transparent);
  backdrop-filter: blur(3px);
}

.fenster {
  display: flex;
  flex-direction: column;
  width: min(34rem, 100%);
  max-height: 86vh;
  overflow: hidden;
}

header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.7rem 0.8rem;
  border-bottom: 1px solid var(--line);
}

h2 {
  flex: 1;
  margin: 0;
  font-size: 1.05rem;
}

.zu {
  flex-shrink: 0;
  padding: 0.3rem 0.5rem;
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 1.1rem;
  cursor: pointer;
}

.inhalt {
  display: grid;
  gap: 0.4rem;
  flex: 1;
  overflow-y: auto;
  padding: 0.8rem;
}

/* Ein Tipp genügt: der Laden wird gewählt und der Einkauf läuft */
.laden {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.85rem 0.9rem;
  border: 1px solid color-mix(in srgb, var(--violet) 30%, transparent);
  border-radius: 0.9rem;
  background: color-mix(in srgb, var(--violet) 8%, white);
  color: var(--text);
  text-align: left;
  cursor: pointer;
}

.laden.schlicht {
  border-color: var(--line);
  background: var(--card);
}

.name {
  flex: 1;
  min-width: 0;
  font-weight: 600;
}

.marke {
  flex-shrink: 0;
  color: var(--muted);
  font-size: 0.78rem;
}

.anlegen {
  padding: 0.6rem;
  border: 1px dashed color-mix(in srgb, var(--cyan) 40%, transparent);
  border-radius: 0.9rem;
  background: transparent;
  color: var(--cyan);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.neuer-laden {
  display: flex;
  gap: 0.4rem;
}

.neuer-laden input {
  flex: 1;
  min-width: 0;
  padding: 0.7rem 0.8rem;
  border: 1px solid var(--line);
  border-radius: 0.8rem;
  background: white;
}

.primaer {
  flex-shrink: 0;
  padding: 0.5rem 1.1rem;
  border: none;
  border-radius: 0.8rem;
  background: var(--violet);
  color: white;
  font-weight: 700;
  cursor: pointer;
}

.primaer:disabled {
  background: color-mix(in srgb, var(--muted) 25%, white);
  color: var(--muted);
  cursor: default;
}

.fuss {
  margin: 0.2rem 0 0;
  color: var(--muted);
  font-size: 0.8rem;
}
</style>
