import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import KategorienWahl from '@/components/KategorienWahl.vue'

const gruppen = [
  { id: 'pasta', emoji: '🍝', label: 'Pasta' },
  { id: 'guenstig', emoji: '💶', label: 'Sehr günstig' },
  { id: 'fleisch', emoji: '🥩', label: 'Mit Fleisch' },
]

function wahl(modelValue: string[], neu: string | null = null) {
  const w = mount(KategorienWahl, {
    props: {
      gruppen,
      modelValue,
      anlegen: async () => neu,
      'onUpdate:modelValue': (v: string[]) => w.setProps({ modelValue: v }),
    },
  })
  return w
}

async function aufklappen(w: ReturnType<typeof wahl>) {
  await w.find('.kopf').trigger('click')
}

function haken(w: ReturnType<typeof wahl>, label: string) {
  return w
    .findAll('label')
    .find((l) => l.text().includes(label))!
    .find('input')
}

describe('KategorienWahl', () => {
  it('zeigt zugeklappt, was gewählt ist', () => {
    const w = wahl(['pasta', 'guenstig'])
    expect(w.find('.kopf').text()).toContain('🍝 Pasta · 💶 Sehr günstig')
    expect(w.find('.liste').exists()).toBe(false)
  })

  it('setzt und nimmt Häkchen und hält die Reihenfolge des Rezeptbuchs', async () => {
    const w = wahl(['fleisch'])
    await aufklappen(w)
    await haken(w, 'Pasta').trigger('change')
    expect(w.props('modelValue')).toEqual(['pasta', 'fleisch'])

    await haken(w, 'Mit Fleisch').trigger('change')
    expect(w.props('modelValue')).toEqual(['pasta'])
  })

  it('lässt die letzte Kategorie nicht abwählen', async () => {
    const w = wahl(['pasta'])
    await aufklappen(w)
    expect(haken(w, 'Pasta').attributes('disabled')).toBeDefined()
    expect(haken(w, 'Sehr günstig').attributes('disabled')).toBeUndefined()
  })

  it('legt eine neue Kategorie an und hakt sie gleich an', async () => {
    const w = wahl(['pasta'], 'neu-id')
    await aufklappen(w)
    await w.find('.neu').trigger('click')
    await new Promise((r) => setTimeout(r))
    expect(w.props('modelValue')).toEqual(['pasta', 'neu-id'])
  })

  it('lässt bei abgebrochenem Anlegen alles, wie es war', async () => {
    const w = wahl(['pasta'], null)
    await aufklappen(w)
    await w.find('.neu').trigger('click')
    await new Promise((r) => setTimeout(r))
    expect(w.props('modelValue')).toEqual(['pasta'])
  })
})
